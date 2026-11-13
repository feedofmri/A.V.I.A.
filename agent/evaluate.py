"""Evaluate unchanged checkpoints against supplied reference/calibration rows.

These rows are not an independently established holdout and may overlap training.
Scores measure reproduction on supplied features, not manual-input or clinical accuracy.
"""
import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import accuracy_score, balanced_accuracy_score, confusion_matrix

from src.engine.fusion import FusionVariant
from src.engine.registry import Registry

torch.set_num_threads(2)
root = Path(os.environ.get("AVIA_MODEL_DIR", "/models"))
reg = Registry(model_dir=root)
reg.load(FusionVariant())
if not reg.ready:
    raise RuntimeError(reg.error)

specs = {
    "cardiac": ("bidmc_features_sanitized_personal_baseline.csv", "BIDMC_FEATURE_COLS", "cardio_resp_anomaly"),
    "stress": ("wesad_features_sanitized_personal_baseline.csv", "WESAD_FEATURE_COLS", "binary_stress"),
    "sleep": ("sleep_edf_sc4001_epochs_features.csv", "SLEEP_FEATURE_COLS", "sleep_stage_id"),
    "suit": ("lbnp_harespod_digital_twin_features.csv", "SUIT_FEATURE_COLS", "target_zone_id"),
}
report = {
    "scope": "supplied_reference_rows_not_independent_holdout",
    "training_performed": False,
    "clinical_validation": "not_established",
    "manual_input_accuracy": "not_established",
    "limitations": ["Possible training/calibration overlap", "Existing preprocessing uses these reference distributions", "Raw features differ from manually approximated features", "No labeled temporal-fusion holdout supplied"],
    "models": {},
}
for name, (file, feature_name, target) in specs.items():
    adapter = getattr(reg, name)
    if adapter is None:
        report["models"][name] = {"unavailable": True}
        continue
    columns = getattr(sys.modules[adapter.__class__.__module__], feature_name)
    raw = pd.read_csv(root / file)
    required = columns + [target]
    data = raw[required].replace([np.inf, -np.inf], np.nan).dropna()
    truth = data[target].to_numpy(dtype=int)
    predictions, respiratory = [], []
    for start in range(0, len(data), 1024):
        values = adapter.scaler.transform(data.iloc[start:start + 1024][columns].to_numpy())
        with torch.no_grad():
            out = adapter.model(torch.tensor(values, dtype=torch.float32, device=adapter.device))
        scores = out[0].cpu().numpy()
        if not np.isfinite(scores).all():
            raise ValueError(f"Nonfinite {name} output")
        predictions.extend((scores >= 0.5).astype(int).tolist() if name in ("cardiac", "stress") else scores.argmax(axis=1).tolist())
        if name == "cardiac":
            respiratory.extend(out[1].cpu().numpy().tolist())
    result = {
        "rows": len(data), "excluded_missing_or_nonfinite": len(raw) - len(data),
        "accuracy_on_supplied_rows": round(float(accuracy_score(truth, predictions)), 6),
        "balanced_accuracy_on_supplied_rows": round(float(balanced_accuracy_score(truth, predictions)), 6),
        "labels": sorted(set(truth.tolist()) | set(predictions)),
        "confusion_matrix": confusion_matrix(truth, predictions).tolist(),
        "data_file": file,
    }
    if name == "cardiac" and "target_resp" in raw:
        rr_truth = raw.loc[data.index, "target_resp"].to_numpy()
        valid = np.isfinite(rr_truth) & np.isfinite(respiratory)
        result["respiratory_mae_bpm_on_supplied_rows"] = round(float(np.abs(np.asarray(respiratory)[valid] - rr_truth[valid]).mean()), 6)
    report["models"][name] = result
report["models"]["temporal_fusion"] = {"accuracy": None, "reason": "No independently labeled temporal sequences supplied; reference cases are covered by automated tests"}
print(json.dumps(report, indent=2))
