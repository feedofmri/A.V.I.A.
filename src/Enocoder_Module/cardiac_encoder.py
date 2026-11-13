import os
import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.preprocessing import RobustScaler

BIDMC_FEATURE_COLS = [
    "ppg_mean", "ppg_std", "ppg_skew", "ppg_kurt",
    "ppg_pulse_rate", "prv_sdnn", "prv_rmssd", "ppg_amp_cv",
    "ecg_hr", "hrv_sdnn", "hrv_rmssd", "hrv_pnn50",
    "ppg_resp_band_power", "ppg_card_band_power", "ppg_resp_card_ratio",
    "resp_dom_freq_bpm", "resp_rate_wave", "resp_ibi_std",
    "ppg_pulse_rate_personal_delta", "prv_rmssd_personal_delta",
    "ecg_hr_personal_delta", "hrv_rmssd_personal_delta",
    "hrv_sdnn_personal_delta", "resp_rate_wave_personal_delta",
    "ppg_resp_card_ratio_personal_delta"
]

class AVIACardiacRespEncoder(nn.Module):
    def __init__(self, input_dim: int = 25, embed_dim: int = 32):
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
        self.anom_head = nn.Linear(embed_dim, 1)
        self.rr_head   = nn.Linear(embed_dim, 1)

    def forward(self, x):
        emb = self.encoder(x)                                    # Shape: (B, 32)
        anom_prob = torch.sigmoid(self.anom_head(emb)).squeeze(-1)
        rr_est    = self.rr_head(emb).squeeze(-1)
        return anom_prob, rr_est, emb


class RealtimeCardiacInference:
    """Bridges Manual UI Sliders OR Raw BIDMC Feature Rows -> 32-dim e_cardiac."""
    def __init__(self, csv_path: str, model_weights_path: str = None):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        df = pd.read_csv(csv_path)
        self.medians = df[BIDMC_FEATURE_COLS].median().to_dict()
        
        self.scaler = RobustScaler()
        self.scaler.fit(df[BIDMC_FEATURE_COLS].values)
        
        self.model = AVIACardiacRespEncoder(len(BIDMC_FEATURE_COLS), 32).to(self.device)
        if model_weights_path and os.path.exists(model_weights_path):
            self.model.load_state_dict(torch.load(model_weights_path, map_location=self.device))
        self.model.eval()

    def encode_from_manual_ui(
        self,
        hr_bpm: float = 74.0,
        rmssd_ms: float = 65.0,
        sdnn_ms: float = 60.0,
        resp_rate_bpm: float = 16.0,
        spo2_pct: float = 98.0,
        baseline_hr: float = 70.0,
        baseline_rmssd: float = 70.0,
        baseline_sdnn: float = 65.0,
        baseline_resp: float = 15.0
    ) -> dict:
        # Start with training-set medians for secondary waveform morphology features
        feat = self.medians.copy()
        
        # Populate primary vitals from UI sliders
        feat["ecg_hr"]          = hr_bpm
        feat["ppg_pulse_rate"]  = hr_bpm
        feat["hrv_rmssd"]       = rmssd_ms
        feat["prv_rmssd"]       = rmssd_ms
        feat["hrv_sdnn"]        = sdnn_ms
        feat["prv_sdnn"]        = sdnn_ms
        feat["hrv_pnn50"]       = max(0.0, min(100.0, (rmssd_ms - 15.0) * 0.6))
        feat["resp_rate_wave"]  = resp_rate_bpm
        feat["resp_dom_freq_bpm"] = resp_rate_bpm
        
        # Personal baseline deviations (A.V.I.A. Personal Baseline Engine)
        feat["ecg_hr_personal_delta"]         = hr_bpm - baseline_hr
        feat["ppg_pulse_rate_personal_delta"] = hr_bpm - baseline_hr
        feat["hrv_rmssd_personal_delta"]      = rmssd_ms - baseline_rmssd
        feat["prv_rmssd_personal_delta"]      = rmssd_ms - baseline_rmssd
        feat["hrv_sdnn_personal_delta"]       = sdnn_ms - baseline_sdnn
        feat["resp_rate_wave_personal_delta"] = resp_rate_bpm - baseline_resp

        x_vec = np.array([[feat[c] for c in BIDMC_FEATURE_COLS]], dtype=np.float32)
        x_scaled = self.scaler.transform(x_vec)

        with torch.no_grad():
            x_t = torch.tensor(x_scaled, dtype=torch.float32, device=self.device)
            anom_prob, rr_est, emb_32d = self.model(x_t)

        quality_ok = int((35 <= hr_bpm <= 200) and (5 <= resp_rate_bpm <= 45) and (70 <= spo2_pct <= 100))
        return {
            "e_cardiac": emb_32d.cpu().numpy().flatten(),          # Shape: (32,)
            "cardiac_anomaly_prob": float(anom_prob.cpu().item()),
            "estimated_rr_bpm": float(rr_est.cpu().item()),
            "spo2_pct": float(spo2_pct),
            "data_quality_ok": quality_ok
        }