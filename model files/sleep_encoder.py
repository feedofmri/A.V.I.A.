"""
A.V.I.A. — Module C: Sleep & Recovery Encoder (Sleep-EDF)
Maps 23 EEG/EOG spectral epoch features (or 5 manual UI sleep band sliders) -> 32-dim embedding (e_sleep).
"""
import os
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.preprocessing import RobustScaler

SLEEP_FEATURE_COLS = [
    "fpz_std", "fpz_kurtosis", "fpz_mobility",
    "fpz_delta_rel", "fpz_theta_rel", "fpz_alpha_rel", "fpz_sigma_rel", "fpz_beta_rel",
    "fpz_delta_beta_ratio",
    "pzoz_std", "pzoz_kurtosis", "pzoz_mobility",
    "pzoz_delta_rel", "pzoz_theta_rel", "pzoz_alpha_rel", "pzoz_sigma_rel", "pzoz_beta_rel",
    "pzoz_delta_beta_ratio",
    "eog_std", "eog_max_abs",
    "fpz_delta_rolling5", "fpz_sigma_rolling5", "eog_std_rolling5"
]

STAGE_NAMES = {0: "Wake (W)", 1: "N1 (Light)", 2: "N2 (Intermediate)", 3: "N3 (Deep SWS)", 4: "REM"}

class AVIASleepEncoder(nn.Module):
    def __init__(self, input_dim: int = 23, embed_dim: int = 32, n_classes: int = 5):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.BatchNorm1d(64),
            nn.SiLU(),
            nn.Dropout(0.2),
            nn.Linear(64, embed_dim),
            nn.BatchNorm1d(embed_dim),
            nn.SiLU()
        )
        self.stage_head = nn.Linear(embed_dim, n_classes)

    def forward(self, x):
        emb = self.encoder(x)                  # Shape: (B, 32)
        logits = self.stage_head(emb)          # Shape: (B, 5)
        return logits, emb


class RealtimeSleepInference:
    """Bridges Manual UI Sleep Band Sliders OR Sleep-EDF Epoch Rows -> 32-dim e_sleep."""
    def __init__(self, csv_path: str, model_weights_path: str = None):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        df = pd.read_csv(csv_path)
        self.medians = df[SLEEP_FEATURE_COLS].median().to_dict()
        
        self.scaler = RobustScaler()
        self.scaler.fit(df[SLEEP_FEATURE_COLS].values)
        
        self.model = AVIASleepEncoder(len(SLEEP_FEATURE_COLS), 32, 5).to(self.device)
        if model_weights_path and os.path.exists(model_weights_path):
            self.model.load_state_dict(torch.load(model_weights_path, map_location=self.device))
        self.model.eval()

    def encode_from_manual_ui(
        self,
        delta_rel: float = 0.85,
        theta_rel: float = 0.09,
        alpha_rel: float = 0.02,
        sigma_rel: float = 0.02,
        beta_rel: float = 0.01,
        eog_std_uv: float = 15.0
    ) -> dict:
        feat = self.medians.copy()
        db_ratio = delta_rel / (beta_rel + 1e-5)

        feat["fpz_delta_rel"]  = delta_rel
        feat["fpz_theta_rel"]  = theta_rel
        feat["fpz_alpha_rel"]  = alpha_rel
        feat["fpz_sigma_rel"]  = sigma_rel
        feat["fpz_beta_rel"]   = beta_rel
        feat["fpz_delta_beta_ratio"] = db_ratio

        feat["pzoz_delta_rel"] = delta_rel * 0.95
        feat["pzoz_theta_rel"] = theta_rel * 1.05
        feat["pzoz_alpha_rel"] = alpha_rel * 1.10
        feat["pzoz_sigma_rel"] = sigma_rel
        feat["pzoz_beta_rel"]  = beta_rel
        feat["pzoz_delta_beta_ratio"] = db_ratio * 0.95

        feat["eog_std"]            = eog_std_uv
        feat["eog_max_abs"]        = eog_std_uv * 2.8
        feat["fpz_delta_rolling5"] = delta_rel
        feat["fpz_sigma_rolling5"] = sigma_rel
        feat["eog_std_rolling5"]   = eog_std_uv

        x_vec = np.array([[feat[c] for c in SLEEP_FEATURE_COLS]], dtype=np.float32)
        x_scaled = self.scaler.transform(x_vec)

        with torch.no_grad():
            x_t = torch.tensor(x_scaled, dtype=torch.float32, device=self.device)
            logits, emb_32d = self.model(x_t)
            probs = torch.softmax(logits, dim=1).cpu().numpy().flatten()
            pred_id = int(np.argmax(probs))

        # Recovery score indicator: weighted toward Deep N3 (id=3) and REM (id=4), penalized by Wake (id=0)
        recovery_score = float(np.clip(0.50 * probs[3] + 0.30 * probs[4] + 0.20 * probs[2] - 0.30 * probs[0] + 0.30, 0.0, 1.0))

        return {
            "e_sleep": emb_32d.cpu().numpy().flatten(),          # Shape: (32,)
            "predicted_stage_id": pred_id,
            "predicted_stage_name": STAGE_NAMES[pred_id],
            "stage_confidence": float(probs[pred_id]),
            "recovery_index": round(recovery_score, 4),
            "data_quality_ok": int(eog_std_uv < 150.0)
        }