"""
A.V.I.A. — Module B: Autonomic Stress Encoder (WESAD)
Maps 17 autonomic features (or 6 manual UI vitals) -> 32-dim embedding (e_stress).
"""
import os
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.preprocessing import RobustScaler

WESAD_FEATURE_COLS = [
    "mean_hr", "rmssd", "sdnn", "pnn50",
    "eda_tonic_mean", "eda_phasic_mean", "scr_peaks",
    "resp_rate_clean", "temp_mean", "temp_std_clean",
    "mean_hr_personal_delta", "rmssd_personal_delta", "sdnn_personal_delta",
    "pnn50_personal_delta", "eda_tonic_mean_personal_delta",
    "eda_phasic_mean_personal_delta", "temp_mean_personal_delta"
]

class AVIAStressEncoder(nn.Module):
    def __init__(self, input_dim: int = 17, embed_dim: int = 32):
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
        self.classifier = nn.Linear(embed_dim, 1)

    def forward(self, x):
        emb = self.encoder(x)                                    # Shape: (B, 32)
        prob = torch.sigmoid(self.classifier(emb)).squeeze(-1)   # Stress pattern probability
        return prob, emb


class RealtimeStressInference:
    """Bridges Manual UI Sliders OR WESAD Feature Rows -> 32-dim e_stress."""
    def __init__(self, csv_path: str, model_weights_path: str = None):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        df = pd.read_csv(csv_path)
        self.medians = df[WESAD_FEATURE_COLS].median().to_dict()
        
        self.scaler = RobustScaler()
        self.scaler.fit(df[WESAD_FEATURE_COLS].values)
        
        self.model = AVIAStressEncoder(len(WESAD_FEATURE_COLS), 32).to(self.device)
        if model_weights_path and os.path.exists(model_weights_path):
            self.model.load_state_dict(torch.load(model_weights_path, map_location=self.device))
        self.model.eval()

    def encode_from_manual_ui(
        self,
        eda_tonic_us: float = 3.0,
        eda_phasic_us: float = 0.0001,
        scr_peaks_per_min: float = 15.0,
        skin_temp_c: float = 33.9,
        hr_bpm: float = 72.0,
        rmssd_ms: float = 44.0,
        sdnn_ms: float = 64.0,
        resp_rate_bpm: float = 16.0,
        baseline_eda_tonic: float = 3.0,
        baseline_temp_c: float = 33.9,
        baseline_hr: float = 71.5,
        baseline_rmssd: float = 44.0,
        baseline_sdnn: float = 64.5
    ) -> dict:
        feat = self.medians.copy()
        pnn50_est = max(0.0, min(80.0, (rmssd_ms - 12.0) * 0.55))
        base_pnn50 = max(0.0, min(80.0, (baseline_rmssd - 12.0) * 0.55))

        feat["mean_hr"]         = hr_bpm
        feat["rmssd"]           = rmssd_ms
        feat["sdnn"]            = sdnn_ms
        feat["pnn50"]           = pnn50_est
        feat["eda_tonic_mean"]  = eda_tonic_us
        feat["eda_phasic_mean"] = eda_phasic_us
        feat["scr_peaks"]       = scr_peaks_per_min
        feat["resp_rate_clean"] = np.clip(resp_rate_bpm, 6.0, 45.0)
        feat["temp_mean"]       = skin_temp_c

        # Personal baseline deviations
        feat["mean_hr_personal_delta"]         = hr_bpm - baseline_hr
        feat["rmssd_personal_delta"]           = rmssd_ms - baseline_rmssd
        feat["sdnn_personal_delta"]            = sdnn_ms - baseline_sdnn
        feat["pnn50_personal_delta"]           = pnn50_est - base_pnn50
        feat["eda_tonic_mean_personal_delta"]  = eda_tonic_us - baseline_eda_tonic
        feat["eda_phasic_mean_personal_delta"] = eda_phasic_us
        feat["temp_mean_personal_delta"]       = skin_temp_c - baseline_temp_c

        x_vec = np.array([[feat[c] for c in WESAD_FEATURE_COLS]], dtype=np.float32)
        x_scaled = self.scaler.transform(x_vec)

        with torch.no_grad():
            x_t = torch.tensor(x_scaled, dtype=torch.float32, device=self.device)
            stress_prob, emb_32d = self.model(x_t)

        quality_ok = int((0.05 <= eda_tonic_us <= 40.0) and (25.0 <= skin_temp_c <= 41.0))
        return {
            "e_stress": emb_32d.cpu().numpy().flatten(),         # Shape: (32,)
            "stress_probability": float(stress_prob.cpu().item()),
            "data_quality_ok": quality_ok
        }