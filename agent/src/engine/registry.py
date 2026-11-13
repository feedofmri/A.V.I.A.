"""
Loads the supplied A.V.I.A. artifacts once, at service startup.

The encoder classes and their real-time feature adapters (RealtimeCardiacInference, etc.) are imported directly
from the ML team's .py files in the model directory, so preprocessing (training-set medians, RobustScaler fitted on
the calibration CSVs, personal-baseline deltas, feature order) is exactly the ML team's code, not a re-implementation.
"""
from __future__ import annotations

import importlib.util
import json
import hashlib
import logging
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from types import ModuleType

import pandas as pd
import torch

from .fusion import FusionVariant, TemporalBaselineEngine

log = logging.getLogger("avia.registry")

# Filenames exactly as delivered by the ML team. Weights are standard torch zip checkpoints; the ".zip" suffix is
# accepted as-is (torch.load reads the zip container regardless of extension).
WEIGHTS = {
    "cardiac": "avia_cardiac_resp_encoder",
    "stress": "avia_stress_encoder",
    "sleep": "avia_sleep_encoder",
    "suit": "avia_suit_swelling_encoder",
    "fusion": "avia_temporal_fusion_engine",
}
CALIBRATION = {
    "cardiac": "bidmc_features_sanitized_personal_baseline.csv",
    "stress": "wesad_features_sanitized_personal_baseline.csv",
    "sleep": "sleep_edf_sc4001_epochs_features.csv",
    "cbc": "LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv",
    "osd919": "osd919_29_tissues_validated_stats.csv",
}
# Optional: the suit adapter's training set (20 raw SUIT_FEATURE_COLS + target_zone_id). Kept out of CALIBRATION so a
# missing suit CSV only disables /suit/evaluate instead of the core pipeline.
SUIT_CALIBRATION = "lbnp_harespod_digital_twin_features.csv"
MODULES = {
    "cardiac": "cardiac_encoder.py",
    "stress": "stress_encoder.py",
    "sleep": "sleep_encoder.py",
    "context": "nasa_context_encoder.py",
    "suit": "suit_swelling_encoder.py",
}


class ArtifactError(RuntimeError):
    pass


def _find_weights(model_dir: Path, stem: str) -> Path:
    for name in (f"{stem}.pt", f"{stem}.pt.zip", f"{stem}.pth"):
        p = model_dir / name
        if p.is_file():
            return p
    raise ArtifactError(f"weights not found: {model_dir / (stem + '.pt[.zip]')}")


def _require(path: Path) -> Path:
    if not path.is_file():
        raise ArtifactError(f"file not found: {path}")
    return path


def _import(model_dir: Path, filename: str) -> ModuleType:
    path = _require(model_dir / filename)
    name = f"avia_artifacts.{path.stem}"
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ArtifactError(f"cannot import {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def _load_state_dict(path: Path) -> dict:
    return torch.load(path, map_location="cpu", weights_only=True)


def _repair_cbc_indices(df: pd.DataFrame) -> list[str]:
    """The supplied CBC CSV leaves some red-cell indices blank (e.g. MCHC for C002 at L-3 and R+1), which the context
    encoder turns into NaN embeddings. Fill them from their definitions using the same draw's Hgb/Hct/RBC; on the
    complete rows these identities reproduce the reported values to within lab rounding."""
    hgb = df["hemoglobin_value_percent"]
    hct = df["hematocrit_value_percent"]
    rbc = df["red_blood_cell_count_value_million_per_microliter"]
    identities = {
        "mchc_value_grams_per_deciliter": hgb / hct * 100.0,
        "mcv_value_femtoliter": hct / rbc * 10.0,
        "mch_value_picogram": hgb / rbc * 10.0,
    }
    filled = []
    for col, derived in identities.items():
        missing = df[col].isna() & derived.notna()
        for idx in df.index[missing]:
            df.at[idx, col] = round(float(derived[idx]), 2)
            filled.append(f"{df.at[idx, 'Sample Name']}:{col}")
    return filled


EEG_COLUMNS = {
    "eeg_delta_rel": "fpz_delta_rel",
    "eeg_theta_rel": "fpz_theta_rel",
    "eeg_alpha_rel": "fpz_alpha_rel",
    "eeg_sigma_rel": "fpz_sigma_rel",
    "eeg_beta_rel": "fpz_beta_rel",
    "eog_std_uv": "eog_std",
}


def _eeg_profiles(sleep_csv: Path) -> dict[str, dict[str, float]]:
    """Per-stage median EEG/EOG bands from the Sleep-EDF calibration set: the encoder's own training distribution.
    Used when a reading omits the EEG sub-panel (the docs only say the bands are derived from sleep duration)."""
    df = pd.read_csv(sleep_csv, usecols=[*EEG_COLUMNS.values(), "sleep_stage_name"])
    med = df.groupby("sleep_stage_name")[list(EEG_COLUMNS.values())].median()
    pick = {"deep": "N3_Deep", "light": "N1", "restless": "W"}
    return {
        name: {k: round(float(med.loc[stage, col]), 4) for k, col in EEG_COLUMNS.items()}
        for name, stage in pick.items()
    }


def _find_suit_calibration(model_dir: Path, feature_cols: list[str]) -> tuple[Path | None, str]:
    """The suit adapter fits its scaler on a CSV with the 20 raw suit features + target_zone_id."""
    override = os.environ.get("AVIA_SUIT_CSV")
    if override:
        candidates = [Path(override)]
    else:
        named = model_dir / SUIT_CALIBRATION
        candidates = ([named] if named.is_file() else []) + sorted(model_dir.glob("*suit*.csv"))
    problems = []
    for p in candidates:
        if not p.is_file():
            problems.append(f"{p}: not found")
            continue
        cols = set(pd.read_csv(p, nrows=0).columns)
        missing = [c for c in feature_cols + ["target_zone_id"] if c not in cols]
        if not missing:
            return p, ""
        problems.append(f"{p.name}: missing {len(missing)} required columns (e.g. {', '.join(missing[:4])})")
    if not candidates:
        problems.append(f"neither {SUIT_CALIBRATION} nor any *suit*.csv in {model_dir}")
    return None, "; ".join(problems)


@dataclass
class Registry:
    model_dir: Path
    device: torch.device = field(default_factory=lambda: torch.device("cpu"))
    cardiac: object = None
    stress: object = None
    sleep: object = None
    context: object = None
    engine: TemporalBaselineEngine | None = None
    suit: object = None
    suit_error: str = ""
    osd919: pd.DataFrame | None = None
    stage_names: dict = field(default_factory=dict)
    cbc_repairs: list = field(default_factory=list)
    eeg_profiles: dict = field(default_factory=dict)
    load_ms: float = 0.0
    error: str = ""
    artifacts: dict = field(default_factory=dict)

    @property
    def ready(self) -> bool:
        return all(x is not None for x in (self.cardiac, self.stress, self.sleep, self.context, self.engine))

    def load(self, variant: FusionVariant) -> None:
        t0 = time.perf_counter()
        d = self.model_dir
        try:
            if not d.is_dir():
                raise ArtifactError(f"model directory not found: {d}")

            bundle = Path(__file__).resolve().parents[2] / "artifacts"
            manifest = json.loads((bundle / "manifest.json").read_text())
            for filename, expected in manifest["files"].items():
                path = d / filename
                if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
                    raise ArtifactError(f"Artifact checksum mismatch: {filename}")
            if hashlib.sha256((bundle / "preprocessing.json").read_bytes()).hexdigest() != manifest["preprocessing_sha256"]:
                raise ArtifactError("Frozen preprocessing checksum mismatch")
            frozen = json.loads((bundle / "preprocessing.json").read_text())
            self.artifacts["manifest_version"] = manifest["version"]
            cardiac_mod = _import(d, MODULES["cardiac"])
            stress_mod = _import(d, MODULES["stress"])
            sleep_mod = _import(d, MODULES["sleep"])
            context_mod = _import(d, MODULES["context"])

            paths = {k: _find_weights(d, WEIGHTS[k]) for k in ("cardiac", "stress", "sleep", "fusion")}
            csvs = {k: _require(d / v) for k, v in CALIBRATION.items()}

            # The Realtime* adapters silently fall back to random weights when the path does not exist, so the
            # paths above are verified first; load_state_dict inside them is strict.
            self.cardiac = cardiac_mod.RealtimeCardiacInference(str(csvs["cardiac"]), str(paths["cardiac"]))
            self.stress = stress_mod.RealtimeStressInference(str(csvs["stress"]), str(paths["stress"]))
            self.sleep = sleep_mod.RealtimeSleepInference(str(csvs["sleep"]), str(paths["sleep"]))
            self.context = context_mod.AVIANASAContextEncoder(str(csvs["cbc"]), str(csvs["osd919"]))
            self.cbc_repairs = _repair_cbc_indices(self.context.cbc_df)
            if self.cbc_repairs:
                log.warning("filled %d blank CBC red-cell indices from Hgb/Hct/RBC: %s", len(self.cbc_repairs), self.cbc_repairs)
            self.stage_names = dict(sleep_mod.STAGE_NAMES)
            self.eeg_profiles = _eeg_profiles(csvs["sleep"])
            import numpy as np
            for name, adapter in (("cardiac",self.cardiac),("stress",self.stress),("sleep",self.sleep)):
                spec = frozen[name]
                adapter.medians = spec["medians"]
                adapter.scaler.center_ = np.array(spec["center"], dtype=np.float64)
                adapter.scaler.scale_ = np.array(spec["scale"], dtype=np.float64)
            self.osd919 = pd.read_csv(csvs["osd919"]).drop_duplicates("tissue").set_index("tissue")

            engine = TemporalBaselineEngine(variant)
            engine.load_state_dict(_load_state_dict(paths["fusion"]), strict=True)
            engine.eval()
            self.engine = engine

            self.artifacts = {
                "manifest_version":manifest["version"],
                **{f"{k}_weights": p.name for k, p in paths.items()},
                **{f"{k}_calibration": p.name for k, p in csvs.items()},
            }
            self._load_suit(d)
        except Exception as exc:  # surfaced through /api/v1/health, never replaced by fake outputs
            log.exception("model loading failed")
            self.error = f"{type(exc).__name__}: {exc}"
            self.cardiac = self.stress = self.sleep = self.context = self.engine = None
        self.load_ms = round((time.perf_counter() - t0) * 1000, 1)

    def _load_suit(self, d: Path) -> None:
        try:
            suit_mod = _import(d, MODULES["suit"])
            weights = _find_weights(d, WEIGHTS["suit"])
            # Validate the weights against the architecture even when calibration is unavailable.
            probe = suit_mod.AVIASuitSwellingEncoder(len(suit_mod.SUIT_FEATURE_COLS), 32, 5)
            probe.load_state_dict(_load_state_dict(weights), strict=True)
            self.artifacts["suit_weights"] = weights.name

            csv, problem = _find_suit_calibration(d, list(suit_mod.SUIT_FEATURE_COLS))
            if csv is None:
                self.suit_error = (
                    "Suit swelling weights load, but no calibration CSV with the 20 raw suit input features "
                    f"(SUIT_FEATURE_COLS) + target_zone_id was found, so inputs cannot be scaled. {problem}"
                )
                return
            # Weights exist (checked above), so the adapter will load them instead of quick-fitting.
            self.suit = suit_mod.RealtimeSuitSwellingInference(str(csv), str(weights))
            frozen = json.loads((Path(__file__).resolve().parents[2] / "artifacts" / "preprocessing.json").read_text())["suit"]
            import numpy as np
            self.suit.medians = frozen["medians"]
            self.suit.scaler.center_ = np.array(frozen["center"], dtype=np.float64)
            self.suit.scaler.scale_ = np.array(frozen["scale"], dtype=np.float64)
            self.artifacts["suit_calibration"] = csv.name
        except Exception as exc:
            log.exception("suit model loading failed")
            self.suit_error = f"{type(exc).__name__}: {exc}"
