"""
End-to-end inference for one crew reading (AIVI_model_to_UI.docx §2, Forntend_Backend_intrigation_direction.docx §2):

  Stage 1/2  supplied Realtime*Inference adapters -> e_cardiac, e_stress, e_sleep (32-d each) + NASA z_context (32-d)
  Stage 3    MultimodalFusionModule -> 128-d fused state per step (missing-modality mask honoured)
  Stage 4    2-layer GRU over a 6-step (72 h) window -> anomaly / recovery / stress trajectories
  Explain    exact Shapley values over the 4 modality blocks (absent block = personal-baseline embedding)
  Forecast   GRU rollout over the extrapolated 128-d fused-state slope, mapped onto each vital's baseline deviation
"""
from __future__ import annotations

import itertools
import math
import time
from dataclasses import dataclass
from functools import lru_cache

import numpy as np
import torch

from ..api.schemas import CBC_TIMEPOINTS, InferRequest, PersonalBaseline, Telemetry, TwinRequest
from .fusion import MODALITIES
from .registry import Registry

WINDOW_STEPS = 6  # 6 x 12 h = 72 h, as trained
FORECAST_STEPS = 7
FORECAST_DAMPING = 0.5

# Status tiers (AIVI §4): < 0.40 Nominal, 0.40-0.69 Warning, >= 0.70 Critical.
WARN_AT, CRIT_AT = 0.40, 0.70
Z_ALERT = 2.0

EEG_KEYS = ("eeg_delta_rel", "eeg_theta_rel", "eeg_sigma_rel", "eeg_beta_rel", "eog_std_uv")
NOMINAL_SCR_PEAKS = 10.0  # Forntend_Backend doc §3.1 nominal value

# Vital -> GRU head whose trajectory drives its forecast, and whether a *higher* head value means "worse".
FORECAST_MAP = {
    "hr_bpm": ("anomaly", True),
    "spo2_pct": ("anomaly", True),
    "eda_tonic_us": ("stress", True),
    "hrv_rmssd_ms": ("stress", True),
    "sleep_duration_hr": ("recovery", False),
}
VITAL_BOUNDS = {
    "hr_bpm": (40.0, 180.0),
    "spo2_pct": (70.0, 100.0),
    "eda_tonic_us": (0.05, 40.0),
    "hrv_rmssd_ms": (5.0, 150.0),
    "sleep_duration_hr": (0.0, 12.0),
}
BASELINE_KEY = {
    "hr_bpm": "hr_bpm",
    "spo2_pct": "spo2_pct",
    "eda_tonic_us": "eda_us",
    "hrv_rmssd_ms": "rmssd_ms",
    "sleep_duration_hr": "sleep_hr",
}

# Skeletal heuristic bridge (no DEXA data in any training set; AIVI §1.2 row 5). Base monthly BMD loss in
# microgravity without countermeasures, modulated by the OSD-919 skeletal uncoupling delta and adherence.
BMD_LOSS_PER_MONTH = {"femoral": 0.0135, "lumbar": 0.0100}
BMD_THRESHOLDS = {"femoral": (0.92, 0.87), "lumbar": (1.08, 1.02)}  # (warning, critical) as in the Cockpit twin


def tier(score: float) -> str:
    if score >= CRIT_AT:
        return "Critical"
    if score >= WARN_AT:
        return "Warning"
    return "Nominal"


def resolve_timepoint(t: Telemetry) -> str:
    for v in (t.mission_timepoint, t.mission_day):
        if isinstance(v, str) and v in CBC_TIMEPOINTS:
            return v
    # Integer mission days (1-300) are in flight; R+1 is the OSD-569 flight-stress timepoint the docs map them to.
    return "R+1"


@dataclass
class Step:
    v: dict
    timepoint: str
    imputed: list


def complete(t: Telemetry, b: PersonalBaseline, profiles: dict) -> Step:
    v = t.model_dump()
    v["eeg_alpha_rel"] = None  # not part of the UI contract; the encoder's own default is used
    imputed = []
    if v["hrv_sdnn_ms"] is None:
        v["hrv_sdnn_ms"] = v["hrv_rmssd_ms"] * 1.15
        imputed.append("hrv_sdnn_ms")
    if any(v[k] is None for k in EEG_KEYS):
        # Interpolate between the Sleep-EDF N1 (light, fragmented) and N3 (deep) stage medians by how much of the
        # personal sleep baseline was achieved (<= 3 h -> N1 profile, >= baseline -> N3 profile).
        deep, light = profiles["deep"], profiles["light"]
        f = min(1.0, max(0.0, (v["sleep_duration_hr"] - 3.0) / max(b.sleep_hr - 3.0, 0.5)))
        for k in (*EEG_KEYS, "eeg_alpha_rel"):
            if v[k] is None:
                v[k] = light[k] + f * (deep[k] - light[k])
                if k != "eeg_alpha_rel":
                    imputed.append(k)
    return Step(v=v, timepoint=resolve_timepoint(t), imputed=imputed)


def baseline_step(b: PersonalBaseline, profiles: dict) -> Step:
    v = {
        "hr_bpm": b.hr_bpm,
        "spo2_pct": b.spo2_pct,
        "eda_tonic_us": b.eda_us,
        "hrv_rmssd_ms": b.rmssd_ms,
        "hrv_sdnn_ms": b.sdnn_ms or b.rmssd_ms * 1.15,
        "resp_rate_bpm": b.resp_bpm,
        "scr_peaks_min": NOMINAL_SCR_PEAKS,
        "skin_temp_c": b.skin_temp_c,
        "sleep_duration_hr": b.sleep_hr,
        **profiles["deep"],
    }
    return Step(v=v, timepoint="L-3", imputed=[])


class Pipeline:
    def __init__(self, reg: Registry):
        self.reg = reg
        self._context = lru_cache(maxsize=64)(self._context_uncached)

    # ---------------------------------------------------------------- encoders
    def _context_uncached(self, crew_code: str, timepoint: str) -> tuple:
        out = self.reg.context.get_context_embedding(crew_id=crew_code, mission_timepoint=timepoint)
        z = np.asarray(out["z_context"], dtype=np.float32)
        # Any analyte still missing after the CBC repair counts as "no shift from L-3", the same convention the
        # encoder uses for organs absent from OSD-919 (fillna(0.0)).
        return (np.nan_to_num(z, nan=0.0, posinf=0.0, neginf=0.0), out["human_nlr_shift_pct"], out["human_wbc_shift_pct"])

    def encode(self, s: Step, b: PersonalBaseline, crew_code: str) -> dict:
        v = s.v
        base_sdnn = b.sdnn_ms or b.rmssd_ms * 1.15
        cardiac = self.reg.cardiac.encode_from_manual_ui(
            hr_bpm=v["hr_bpm"], rmssd_ms=v["hrv_rmssd_ms"], sdnn_ms=v["hrv_sdnn_ms"],
            resp_rate_bpm=v["resp_rate_bpm"], spo2_pct=v["spo2_pct"],
            baseline_hr=b.hr_bpm, baseline_rmssd=b.rmssd_ms, baseline_sdnn=base_sdnn, baseline_resp=b.resp_bpm,
        )
        stress = self.reg.stress.encode_from_manual_ui(
            eda_tonic_us=v["eda_tonic_us"], scr_peaks_per_min=v["scr_peaks_min"], skin_temp_c=v["skin_temp_c"],
            hr_bpm=v["hr_bpm"], rmssd_ms=v["hrv_rmssd_ms"], sdnn_ms=v["hrv_sdnn_ms"], resp_rate_bpm=v["resp_rate_bpm"],
            baseline_eda_tonic=b.eda_us, baseline_temp_c=b.skin_temp_c, baseline_hr=b.hr_bpm,
            baseline_rmssd=b.rmssd_ms, baseline_sdnn=base_sdnn,
        )
        alpha = {} if v.get("eeg_alpha_rel") is None else {"alpha_rel": v["eeg_alpha_rel"]}
        sleep = self.reg.sleep.encode_from_manual_ui(
            delta_rel=v["eeg_delta_rel"], theta_rel=v["eeg_theta_rel"], sigma_rel=v["eeg_sigma_rel"],
            beta_rel=v["eeg_beta_rel"], eog_std_uv=v["eog_std_uv"], **alpha,
        )
        z_context, nlr, wbc = self._context(crew_code, s.timepoint)
        return {
            "blocks": np.stack([cardiac["e_cardiac"], stress["e_stress"], sleep["e_sleep"], z_context]).astype(np.float32),
            "mask": np.array([cardiac["data_quality_ok"], stress["data_quality_ok"], sleep["data_quality_ok"], 1], dtype=np.float32),
            "cardiac": cardiac,
            "stress": stress,
            "sleep": sleep,
            "context": {"mission_timepoint": s.timepoint, "human_nlr_shift_pct": nlr, "human_wbc_shift_pct": wbc},
        }

    # ---------------------------------------------------------------- main entry
    @torch.no_grad()
    def infer(self, req: InferRequest) -> dict:
        t0 = time.perf_counter()
        b = req.baseline
        engine = self.reg.engine

        profiles = self.reg.eeg_profiles
        steps = [complete(t, b, profiles) for t in req.steps][-WINDOW_STEPS:]
        current = steps[-1]
        base = baseline_step(b, profiles)
        base_enc = self.encode(base, b, req.crew_code)
        encs = [self.encode(s, b, req.crew_code) for s in steps]
        padded = [base_enc] * (WINDOW_STEPS - len(encs)) + encs
        cur = encs[-1]

        blocks = torch.from_numpy(np.stack([e["blocks"] for e in padded]))[None]  # (1, T, 4, 32)
        mask = torch.from_numpy(np.stack([e["mask"] for e in padded]))[None]  # (1, T, 4)

        fused = engine.fuse(blocks, mask)
        traj = {k: v[0].tolist() for k, v in engine.run_gru(fused).items()}
        scores = {k: v[-1] for k, v in traj.items()}

        shapley = self._shapley(blocks, mask, torch.from_numpy(base_enc["blocks"]))
        future = self._rollout(fused)

        cur_v = current.v
        z = {
            "HR_z": (cur_v["hr_bpm"] - b.hr_bpm) / b.hr_sd,
            "HRV_z": (cur_v["hrv_rmssd_ms"] - b.rmssd_ms) / b.rmssd_sd,
            "Sleep_z": (cur_v["sleep_duration_hr"] - b.sleep_hr) / b.sleep_sd,
            "EDA_z": (cur_v["eda_tonic_us"] - b.eda_us) / b.eda_sd,
        }
        z = {k: round(v, 2) for k, v in z.items()}

        enc_out = {
            "cardiac_anomaly_prob": round(cur["cardiac"]["cardiac_anomaly_prob"], 4),
            "estimated_rr_bpm": round(cur["cardiac"]["estimated_rr_bpm"], 2),
            "stress_probability": round(cur["stress"]["stress_probability"], 4),
            "predicted_sleep_stage": cur["sleep"]["predicted_stage_name"],
            "stage_confidence": round(cur["sleep"]["stage_confidence"], 4),
            "recovery_index": cur["sleep"]["recovery_index"],
            "nasa_context": cur["context"],
        }
        mask_now = {m: int(x) for m, x in zip(MODALITIES, cur["mask"])}
        data_quality = 100.0 * sum(mask_now.values()) / len(mask_now)
        certainty = np.mean([
            abs(2 * scores["anomaly"] - 1),
            abs(2 * enc_out["cardiac_anomaly_prob"] - 1),
            abs(2 * enc_out["stress_probability"] - 1),
            enc_out["stage_confidence"],
        ])

        alerts = self._alerts(cur_v, scores, enc_out, z, shapley, mask_now)
        badge = tier(scores["anomaly"])
        if any(a["status"] == "critical" for a in alerts):
            badge = "Critical"
        elif badge == "Nominal" and alerts:
            badge = "Warning"
        explanation = self._explain(scores, shapley, z, enc_out, mask_now)
        for a in alerts:
            a["explanation"] = f"{a['rule']}. {explanation}"

        return {
            "crew_id": req.crew_id,
            "crew_status_badge": badge,
            "fusion_outputs": {
                "anomaly_score": round(scores["anomaly"], 4),
                "recovery_score": round(scores["recovery"], 4),
                "stress_score": round(scores["stress"], 4),
            },
            "encoder_outputs": enc_out,
            "personal_z_scores": z,
            "modality_attributions_pct": shapley["pct"],
            "modality_shapley": shapley["phi"],
            "modality_mask": mask_now,
            "modality_gates": {m: round(float(w), 4) for m, w in zip(MODALITIES, engine.fusion.gate_weights())},
            "why_explanation": explanation,
            "trajectory": {k: [round(x, 4) for x in v] for k, v in traj.items()},
            "forecast_scores": {k: [round(x, 4) for x in v] for k, v in future.items()},
            "analytics_forecast_7step": self._vital_forecast(cur_v, b, scores, future),
            "active_alerts": alerts,
            "top_flag_summary": alerts[0]["title"] if alerts else "No open flags.",
            "confidence_pct": None,
            "output_certainty_pct": round(float(certainty) * data_quality, 1),
            "confidence_note": "Output certainty is not calibrated accuracy or clinical confidence",
            "provenance": {"fusion": "reconstructed_architecture_existing_weights", "forecast": "experimental_extrapolation", "context": "NASA_reference_subject", "sleep_without_EEG": "synthetic_profile"},
            "data_quality_pct": round(data_quality, 1),
            "imputed_fields": current.imputed,
            "window": {"steps": WINDOW_STEPS, "observed": len(steps), "padded_with_baseline": WINDOW_STEPS - len(steps)},
            "inference_ms": round((time.perf_counter() - t0) * 1000, 1),
        }

    # ---------------------------------------------------------------- explainability
    def _shapley(self, blocks: torch.Tensor, mask: torch.Tensor, base_blocks: torch.Tensor) -> dict:
        """Exact Shapley values of the current anomaly score over the 4 modality blocks of the last step.
        A modality outside the coalition is reset to its personal-baseline embedding (counterfactual)."""
        n = len(MODALITIES)
        coalitions = list(itertools.product([0, 1], repeat=n))
        batch = blocks.repeat(len(coalitions), 1, 1, 1).clone()
        for i, coal in enumerate(coalitions):
            for m, keep in enumerate(coal):
                if not keep:
                    batch[i, -1, m] = base_blocks[m]
        anomaly = self.reg.engine(batch, mask.repeat(len(coalitions), 1, 1))["anomaly"][:, -1].tolist()
        value = dict(zip(coalitions, anomaly))

        phi = []
        for m in range(n):
            total = 0.0
            for coal in coalitions:
                if coal[m]:
                    continue
                size = sum(coal)
                weight = math.factorial(size) * math.factorial(n - size - 1) / math.factorial(n)
                with_m = tuple(1 if j == m else c for j, c in enumerate(coal))
                total += weight * (value[with_m] - value[coal])
            phi.append(total)

        mags = [abs(p) for p in phi]
        s = sum(mags)
        pct = [100.0 * x / s for x in mags] if s > 1e-9 else [100.0 / n] * n
        pct = [round(p, 1) for p in pct]
        pct[int(np.argmax(pct))] += round(100.0 - sum(pct), 1)  # keep the sum at exactly 100.0
        return {
            "phi": {m: round(p, 5) for m, p in zip(MODALITIES, phi)},
            "pct": {m: round(p, 1) for m, p in zip(MODALITIES, pct)},
            "baseline_anomaly": round(value[(0,) * n], 4),
        }

    # ---------------------------------------------------------------- forecast
    def _rollout(self, fused: torch.Tensor) -> dict[str, list[float]]:
        """Continue the GRU for 7 steps along the damped slope of the 128-d fused state."""
        slope = fused[:, -1] - fused[:, -2]
        last = fused[:, -1]
        future, acc = [], torch.zeros_like(last)
        for k in range(1, FORECAST_STEPS + 1):
            acc = acc + slope * (FORECAST_DAMPING ** k)
            future.append(last + acc)
        seq = torch.cat([fused, torch.stack(future, dim=1)], dim=1)
        out = self.reg.engine.run_gru(seq)
        return {k: v[0, -FORECAST_STEPS:].tolist() for k, v in out.items()}

    @staticmethod
    def _vital_forecast(cur: dict, b: PersonalBaseline, now: dict, future: dict) -> dict:
        """Each vital keeps its current deviation from the personal baseline, scaled by how the driving GRU head is
        projected to move (worsening head -> deviation grows, improving -> it shrinks)."""
        out = {}
        for vital, (head, higher_worse) in FORECAST_MAP.items():
            badness_now = now[head] if higher_worse else 1 - now[head]
            base = getattr(b, BASELINE_KEY[vital])
            lo, hi = VITAL_BOUNDS[vital]
            values = []
            for s in future[head]:
                badness = s if higher_worse else 1 - s
                factor = min(2.0, max(0.25, 1 + (badness - badness_now) / max(badness_now, 0.15)))
                values.append(round(min(hi, max(lo, base + (cur[vital] - base) * factor)), 2))
            out[vital] = {
                "values": values,
                "min": min(values),
                "mean": round(sum(values) / len(values), 2),
                "max": max(values),
                "forecast_end": values[-1],
                "driver": f"gru.{head}_head",
                "method": "experimental_extrapolation",
                "step_hours": 12,
            }
        return out

    # ---------------------------------------------------------------- alerts & text
    @staticmethod
    def _contributions(shapley: dict) -> list[dict]:
        return sorted(({"label": k, "pct": v} for k, v in shapley["pct"].items()), key=lambda c: -c["pct"])

    def _alerts(self, v: dict, scores: dict, enc: dict, z: dict, shapley: dict, mask: dict) -> list[dict]:
        """Rules from Forntend_Backend doc §4 (Screen 3) and AIVI §5 (Needs attention)."""
        out = []
        crit = scores["anomaly"] >= CRIT_AT

        def add(kind, source, title, detail, value, rule, status=None):
            out.append({
                "kind": kind, "source": source, "title": title, "detail": detail, "value": value, "rule": rule,
                "status": status or ("critical" if crit else "warning"),
                "model_derived": True, "contributions": self._contributions(shapley),
            })

        sleep_h = v["sleep_duration_hr"]
        if (mask["Sleep"] and enc["recovery_index"] < 0.50) or z["Sleep_z"] < -Z_ALERT:
            add("sleep", "PULSE SLEEP", f"Sleep {sleep_h:.1f} h, below warning",
                f"Sleep {sleep_h:.1f} h ({z['Sleep_z']:+.2f} SD vs personal baseline), recovery index {enc['recovery_index']:.2f}, "
                f"stage {enc['predicted_sleep_stage']}",
                f"{sleep_h:.1f} h", "Sleep & Recovery encoder: recovery_index < 0.50 or Sleep_z < -2.0")
        if (mask["Stress"] and enc["stress_probability"] > 0.65) or z["EDA_z"] >= Z_ALERT:
            add("stress", "PULSE VITALS", f"EDA spike {v['eda_tonic_us']:.1f} µS",
                f"EDA {v['eda_tonic_us']:.1f} µS ({z['EDA_z']:+.2f} SD), stress probability {enc['stress_probability']:.2f}",
                f"{v['eda_tonic_us']:.1f} µS", "Autonomic Stress encoder: stress_probability > 0.65 or EDA_z >= 2.0")
        if (mask["Cardiac"] and enc["cardiac_anomaly_prob"] > 0.60) or abs(z["HR_z"]) >= Z_ALERT or z["HRV_z"] <= -Z_ALERT:
            add("cardiac", "PULSE VITALS", f"Cardio drift: HR {v['hr_bpm']:.0f} bpm, HRV {v['hrv_rmssd_ms']:.0f} ms",
                f"HR {z['HR_z']:+.2f} SD, HRV {z['HRV_z']:+.2f} SD, cardio-respiratory anomaly probability {enc['cardiac_anomaly_prob']:.2f}",
                f"{v['hr_bpm']:.0f} bpm", "Cardiac encoder: cardiac_anomaly_prob > 0.60 or |HR_z| >= 2.0 or HRV_z <= -2.0")
        if v["spo2_pct"] < 94.0:
            add("hypoxia", "PULSE VITALS", f"SpO₂ {v['spo2_pct']:.0f} %, below 94 %",
                f"Peripheral oxygen saturation {v['spo2_pct']:.1f} %", f"{v['spo2_pct']:.0f} %",
                "Input guardrail: SpO2 < 94 % (hypoxia flag)",
                status="critical" if v["spo2_pct"] < 90.0 or crit else "warning")
        if not out and scores["anomaly"] >= WARN_AT:
            add("anomaly", "PULSE VITALS", f"Multimodal anomaly score {scores['anomaly']:.2f}",
                f"GRU fusion anomaly score {scores['anomaly']:.2f} (warning at {WARN_AT:.2f})",
                f"{scores['anomaly']:.2f}", "Temporal fusion engine: anomaly_score >= 0.40")
        return out

    @staticmethod
    def _explain(scores: dict, shapley: dict, z: dict, enc: dict, mask: dict) -> str:
        names = {"Cardiac": "Cardiac", "Stress": "Autonomic Stress", "Sleep": "Sleep & Recovery", "NASA Context": "NASA Context"}
        parts = ", ".join(f"{names[k]} {v:.1f}%" for k, v in sorted(shapley["pct"].items(), key=lambda kv: -kv[1]))
        devs = [f"{k} {v:+.2f} SD" for k, v in sorted(z.items(), key=lambda kv: -abs(kv[1])) if abs(v) >= 1.0]
        dev_text = "Personal baseline deviations: " + ", ".join(devs) if devs else "All tracked vitals within ±1 SD of personal baseline"
        missing = [k for k, ok in mask.items() if not ok]
        miss_text = f" Masked (failed quality check): {', '.join(missing)}." if missing else ""
        ctx = enc["nasa_context"]
        return (
            f"On-board Multimodal GRU Fusion: anomaly {scores['anomaly']:.2f}, recovery {scores['recovery']:.2f}, "
            f"stress {scores['stress']:.2f}. Contributions: {parts}. {dev_text}. "
            f"NASA context {ctx['mission_timepoint']}: NLR {ctx['human_nlr_shift_pct']:+.1f}%, WBC {ctx['human_wbc_shift_pct']:+.1f}%."
            f"{miss_text}"
        )

    # ---------------------------------------------------------------- digital twin
    def twin(self, req: TwinRequest) -> dict:
        osd = self.reg.osd919

        def delta(tissue: str, col: str) -> float:
            return float(osd.loc[tissue, col]) if tissue in osd.index else 0.0

        uncoupling = delta("Skeletal_Stem_Cells", "uncoupling_delta")
        adherence_factor = 1 + ((70.0 - req.adherence_pct) / 100.0) * 1.2
        regions = {}
        for name, today in (("femoral", req.femoral_bmd), ("lumbar", req.lumbar_bmd)):
            warn, crit = BMD_THRESHOLDS[name]
            rate = today * BMD_LOSS_PER_MONTH[name] / 30.0 * (1 + uncoupling) * adherence_factor
            proj = today - rate * req.horizon_days

            def eta(threshold: float) -> int | None:
                if today <= threshold:
                    return 0
                return math.ceil((today - threshold) / rate) if rate > 0 else None

            def status(x: float) -> str:
                return "Critical" if x <= crit else "Warning" if x <= warn else "Nominal"

            regions[name] = {
                "today_bmd": round(today, 3),
                "projected_bmd": round(proj, 3),
                "rate_per_day": round(rate, 6),
                "status_today": status(today),
                "status_projected": status(proj),
                "warning_in_days": eta(warn),
                "critical_in_days": eta(crit),
                "thresholds": {"warning": warn, "critical": crit},
            }
        etas = [r["warning_in_days"] for r in regions.values() if r["warning_in_days"] is not None]
        warning_in = min(etas) if etas else None
        status_now = max((r["status_today"] for r in regions.values()), key={"Nominal":0,"Warning":1,"Critical":2}.get)

        cardio_prob = req.cardiac_anomaly_prob
        return {
            "crew_id": req.crew_id,
            "skeletal_risk_projection": {
                "method": "heuristic_bridge",
                "note": "Not an ML regression: no training set contains DEXA BMD. Base microgravity loss rate scaled by "
                        "OSD-919 Skeletal_Stem_Cells uncoupling_delta and countermeasure adherence.",
                "status": status_now,
                "warning_in_days": warning_in,
                "projected_bmd": regions["lumbar"]["projected_bmd"],
                "adherence_pct": req.adherence_pct,
                "adherence_factor": round(adherence_factor, 4),
                "horizon_days": req.horizon_days,
                "uncoupling_delta": round(uncoupling, 5),
                "regions": regions,
            },
            "cardiovascular": {
                "status": tier(cardio_prob) if cardio_prob is not None else None,
                "cardiac_anomaly_prob": cardio_prob,
                "heart_atria_inflammatory_delta": round(delta("Heart_Atria", "inflammatory_delta"), 5),
                "aorta_inflammatory_delta": round(delta("Aorta", "inflammatory_delta"), 5),
            },
            "dermal": {
                "model_derived": False,
                "skin_inflammatory_delta": round(delta("Skin", "inflammatory_delta"), 5),
                "note": "No computer-vision lesion model; static OSD-919 Skin prior only.",
            },
        }

    def suit(self, payload: dict) -> dict:
        out = self.reg.suit.encode_from_manual_ui(**payload)
        out.pop("e_suit", None)
        return out
