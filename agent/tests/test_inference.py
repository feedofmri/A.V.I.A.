"""Runs the real supplied weights + calibration CSVs (AVIA_MODEL_DIR, default ../model files).
Reference cases: AIVI_model_to_UI.docx §11.1."""
import math
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("AVIA_MODEL_DIR", str(Path(__file__).resolve().parents[2] / "model files"))

from src.api.main import app  # noqa: E402

# Seeded personal baselines (server/src/db/seed-data.ts) for the crew in the reference cases.
BASELINES = {
    "brandt": dict(hr_bpm=60, hr_sd=4.5, rmssd_ms=62, rmssd_sd=8, eda_us=1.9, eda_sd=0.6, sleep_hr=7.5, sleep_sd=0.6, resp_bpm=14),
    "sato": dict(hr_bpm=66, hr_sd=5, rmssd_ms=52, rmssd_sd=8, eda_us=2.1, eda_sd=0.7, sleep_hr=7.4, sleep_sd=0.653, resp_bpm=14.5),
    "diaz": dict(hr_bpm=70, hr_sd=6, rmssd_ms=48, rmssd_sd=7.5, eda_us=2.1, eda_sd=0.826, sleep_hr=7.2, sleep_sd=0.7, resp_bpm=15),
}
# Sleep-EDF stage medians (what the Pulse drawer's sleep profiles now send).
DEEP = dict(eeg_delta_rel=0.9302, eeg_theta_rel=0.0516, eeg_sigma_rel=0.0047, eeg_beta_rel=0.0013, eog_std_uv=18.17)
LIGHT = dict(eeg_delta_rel=0.6339, eeg_theta_rel=0.2364, eeg_sigma_rel=0.0201, eeg_beta_rel=0.0318, eog_std_uv=19.66)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def infer(client, crew, code, **telemetry):
    r = client.post("/api/v1/infer", json={"crew_id": crew, "crew_code": code, "baseline": BASELINES[crew], "steps": [telemetry]})
    assert r.status_code == 200, r.text
    return r.json()


def test_health_reports_all_models(client):
    h = client.get("/api/v1/health").json()
    assert h["status"] == "online" and h["models_loaded"] is True, h
    assert all(h["models"][k] for k in ("cardiac_encoder", "stress_encoder", "sleep_encoder", "nasa_context_encoder", "temporal_fusion_engine"))


def test_case1_nominal_brandt(client):
    r = infer(client, "brandt", "C002", hr_bpm=61, spo2_pct=98, eda_tonic_us=1.9, hrv_rmssd_ms=62, sleep_duration_hr=7.5,
              mission_timepoint="L-3", **DEEP)
    assert r["fusion_outputs"]["anomaly_score"] < 0.40
    assert r["crew_status_badge"] == "Nominal"
    assert r["active_alerts"] == [] and r["top_flag_summary"] == "No open flags."


def _case2(client):
    # The Pulse "Sleep debt & fatigue" preset: light-sleep profile with the documented eeg_delta_rel 0.55.
    return infer(client, "sato", "C003", hr_bpm=68, spo2_pct=98, eda_tonic_us=2.1, hrv_rmssd_ms=46, sleep_duration_hr=4.9,
                 mission_timepoint="R+1", **{**LIGHT, "eeg_delta_rel": 0.55})


def test_case2_sleep_debt_sato(client):
    r = _case2(client)
    assert r["personal_z_scores"]["Sleep_z"] == pytest.approx(-3.83, abs=0.01)
    assert r["crew_status_badge"] == "Warning"
    assert "sleep" in {a["kind"] for a in r["active_alerts"]}


def test_case2_documented_recovery_threshold(client):
    # "Sleep debt" is a multi-night state, and the GRU was trained on 72 h windows. As the core API sends it (one step
    # per 12 h, seed-data.ts: 5.1 h the night before, 4.9 h last night) the documented recovery_score < 0.45 holds.
    # A lone reading is a cold start: 5 of 6 steps are padded with the personal baseline, so recovery stays ~0.46.
    debt = lambda h: dict(hr_bpm=68, spo2_pct=98, eda_tonic_us=2.1, hrv_rmssd_ms=46, sleep_duration_hr=h,
                          mission_timepoint="R+1", **{**LIGHT, "eeg_delta_rel": 0.55})
    normal = dict(hr_bpm=66, spo2_pct=98, eda_tonic_us=2.1, hrv_rmssd_ms=52, sleep_duration_hr=7.4, mission_timepoint="R+1", **DEEP)
    steps = [normal, normal, debt(5.1), debt(5.1), debt(4.9), debt(4.9)]
    r = client.post("/api/v1/infer", json={"crew_id": "sato", "crew_code": "C003", "baseline": BASELINES["sato"], "steps": steps})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["fusion_outputs"]["recovery_score"] < 0.45
    assert out["crew_status_badge"] == "Warning" and out["window"]["padded_with_baseline"] == 0
    assert out["fusion_outputs"]["recovery_score"] < _case2(client)["fusion_outputs"]["recovery_score"]


def test_case3_eva_stress_diaz(client):
    r = infer(client, "diaz", "C004", hr_bpm=96, spo2_pct=97, eda_tonic_us=5.1, scr_peaks_min=35, hrv_rmssd_ms=31,
              sleep_duration_hr=7.2, mission_timepoint="R+1", **DEEP)
    assert r["personal_z_scores"]["EDA_z"] == pytest.approx(3.63, abs=0.01)
    assert r["fusion_outputs"]["stress_score"] > 0.80
    assert r["crew_status_badge"] == "Warning"
    assert "stress" in {a["kind"] for a in r["active_alerts"]}
    assert max(r["modality_attributions_pct"], key=r["modality_attributions_pct"].get) == "Stress"


def test_outputs_are_finite_for_every_crew_and_timepoint(client):
    for crew, code in (("brandt", "C001"), ("brandt", "C002"), ("brandt", "C003"), ("brandt", "C004")):
        for tp in ("L-3", "R+1", "R+45"):
            r = infer(client, crew, code, hr_bpm=64, spo2_pct=98, eda_tonic_us=2.1, hrv_rmssd_ms=58, sleep_duration_hr=7.4, mission_timepoint=tp)
            for v in r["fusion_outputs"].values():
                assert math.isfinite(v), (code, tp, r["fusion_outputs"])
            assert sum(r["modality_attributions_pct"].values()) == pytest.approx(100.0, abs=0.05)


def test_forecast_shape(client):
    r = infer(client, "brandt", "C002", hr_bpm=75, spo2_pct=97, eda_tonic_us=2.5, hrv_rmssd_ms=50, sleep_duration_hr=6.5)
    for vital in ("hr_bpm", "spo2_pct", "eda_tonic_us", "hrv_rmssd_ms", "sleep_duration_hr"):
        f = r["analytics_forecast_7step"][vital]
        assert len(f["values"]) == 7 and f["forecast_end"] == f["values"][-1]
    assert len(r["trajectory"]["anomaly"]) == 6 and r["window"]["padded_with_baseline"] == 5


def test_missing_modality_is_masked_not_crashing(client):
    # eog_std >= 150 fails the sleep encoder's quality check -> Sleep block masked out of the fusion.
    r = infer(client, "brandt", "C002", hr_bpm=61, spo2_pct=98, eda_tonic_us=1.9, hrv_rmssd_ms=62, sleep_duration_hr=7.5,
              **{**DEEP, "eog_std_uv": 200})
    assert r["modality_mask"]["Sleep"] == 0 and r["data_quality_pct"] == 75.0


def test_out_of_range_input_is_422(client):
    r = client.post("/api/v1/infer", json={"crew_id": "diaz", "crew_code": "C004", "steps": [
        {"hr_bpm": 260, "spo2_pct": 98, "eda_tonic_us": 2, "hrv_rmssd_ms": 40, "sleep_duration_hr": 7}]})
    assert r.status_code == 422


def test_twin_projection(client):
    r = client.post("/api/v1/twin/projection", json={"crew_id": "okafor", "adherence_pct": 70, "femoral_bmd": 0.939, "lumbar_bmd": 1.12}).json()
    s = r["skeletal_risk_projection"]
    assert s["method"] == "heuristic_bridge" and s["uncoupling_delta"] == pytest.approx(0.15238)
    low = client.post("/api/v1/twin/projection", json={"crew_id": "okafor", "adherence_pct": 20, "femoral_bmd": 0.939, "lumbar_bmd": 1.12}).json()
    assert low["skeletal_risk_projection"]["warning_in_days"] < s["warning_in_days"]


def test_suit_model_loads_from_lbnp_calibration(client):
    h = client.get("/api/v1/health").json()
    assert h["models"]["suit_swelling_encoder"] is True, h["suit_unavailable_reason"]
    assert h["artifacts"]["suit_calibration"] == "lbnp_harespod_digital_twin_features.csv"


def test_suit_nominal_and_breach_zones(client):
    nominal = client.post("/api/v1/suit/evaluate", json={})
    assert nominal.status_code == 200, nominal.text
    n = nominal.json()
    assert n["predicted_zone_id"] == 0 and set(n["digital_twin_body_map"].values()) == {"Nominal"}

    breach = client.post("/api/v1/suit/evaluate", json={"suit_p_left_arm_psi": 3.0, "bioimp_left_arm_ohm": 265}).json()
    assert breach["predicted_zone_id"] == 1 and breach["digital_twin_body_map"]["left_forearm"] == "Critical"
    assert breach["swelling_pct_by_region"]["left_forearm"] == pytest.approx(13.1, abs=0.1)

    legs = client.post("/api/v1/suit/evaluate", json={"suit_p_legs_psi": 3.5, "bioimp_legs_ohm": 215}).json()
    assert legs["predicted_zone_id"] == 3 and legs["digital_twin_body_map"]["lower_body_femoral"] == "Critical"


def test_suit_out_of_range_input_is_422(client):
    assert client.post("/api/v1/suit/evaluate", json={"suit_p_torso_psi": 9}).status_code == 422
