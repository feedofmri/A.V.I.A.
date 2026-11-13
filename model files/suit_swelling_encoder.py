import os
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.preprocessing import RobustScaler

SUIT_FEATURE_COLS = [
    "suit_p_left_arm_psi", "suit_p_right_arm_psi", "suit_p_legs_psi", "suit_p_torso_psi",
    "bioimp_left_arm_ohm", "bioimp_right_arm_ohm", "bioimp_legs_ohm",
    "left_arm_swelling_pct", "right_arm_swelling_pct", "legs_swelling_pct",
    "ppg_pulse_amp_ratio", "sbp_mmhg", "dbp_mmhg",
    "hr_bpm", "spo2_pct", "resp_rate_bpm", "eda_tonic_us",
    "hr_personal_delta", "spo2_personal_delta", "sbp_personal_delta"
]

ZONE_LABELS = {
    0: "Nominal (All Suit Zones Intact)",
    1: "Left Forearm Breach & Tissue Swelling",
    2: "Right Forearm Breach & Tissue Swelling",
    3: "Lower Body / Femoral LBNP Fluid Pooling & Swelling",
    4: "Torso / Cabin Hypobaric Decompression & Hypoxia"
}

class AVIASuitSwellingEncoder(nn.Module):
    def __init__(self, input_dim: int = 20, embed_dim: int = 32, num_zones: int = 5):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.BatchNorm1d(64),
            nn.SiLU(),
            nn.Dropout(0.15),
            nn.Linear(64, embed_dim),
            nn.BatchNorm1d(embed_dim),
            nn.SiLU()
        )
        self.zone_head = nn.Linear(embed_dim, num_zones)

    def forward(self, x):
        emb = self.encoder(x)              # Shape: (B, 32)
        logits = self.zone_head(emb)       # Shape: (B, 5)
        return logits, emb


class RealtimeSuitSwellingInference:
    """Bridges Digital Twin Suit Pressure & Bioimpedance Inputs -> 3D Body Map Status & 32-dim e_suit."""
    def __init__(self, csv_path: str, model_weights_path: str = None):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        df = pd.read_csv(csv_path)
        self.medians = df[SUIT_FEATURE_COLS].median().to_dict()

        self.scaler = RobustScaler()
        self.scaler.fit(df[SUIT_FEATURE_COLS].values)

        self.model = AVIASuitSwellingEncoder(len(SUIT_FEATURE_COLS), 32, 5).to(self.device)
        if model_weights_path and os.path.exists(model_weights_path):
            self.model.load_state_dict(torch.load(model_weights_path, map_location=self.device))
        else:
            self._quick_fit(df)
            if model_weights_path:
                os.makedirs(os.path.dirname(model_weights_path), exist_ok=True)
                torch.save(self.model.state_dict(), model_weights_path)
        self.model.eval()

    def _quick_fit(self, df: pd.DataFrame):
        X = torch.tensor(self.scaler.transform(df[SUIT_FEATURE_COLS].values), dtype=torch.float32, device=self.device)
        y = torch.tensor(df["target_zone_id"].values, dtype=torch.long, device=self.device)
        opt = torch.optim.AdamW(self.model.parameters(), lr=3e-3, weight_decay=1e-4)
        crit = nn.CrossEntropyLoss()
        self.model.train()
        for _ in range(35):
            opt.zero_grad()
            logits, _ = self.model(X)
            loss = crit(logits, y)
            loss.backward()
            opt.step()

    def encode_from_manual_ui(
        self,
        suit_p_left_arm_psi: float = 4.30,
        suit_p_right_arm_psi: float = 4.30,
        suit_p_legs_psi: float = 4.30,
        suit_p_torso_psi: float = 4.30,
        bioimp_left_arm_ohm: float = 305.0,
        bioimp_right_arm_ohm: float = 305.0,
        bioimp_legs_ohm: float = 258.0,
        sbp_mmhg: float = 120.0,
        dbp_mmhg: float = 70.0,
        hr_bpm: float = 68.0,
        spo2_pct: float = 98.0,
        resp_rate_bpm: float = 15.0,
        eda_tonic_us: float = 2.2,
        base_arm_ohm: float = 305.0,
        base_legs_ohm: float = 258.0,
        base_hr: float = 66.0,
        base_spo2: float = 98.5,
        base_sbp: float = 120.0
    ) -> dict:
        feat = self.medians.copy()

        l_swell = max(0.0, (base_arm_ohm - bioimp_left_arm_ohm) / base_arm_ohm * 100.0)
        r_swell = max(0.0, (base_arm_ohm - bioimp_right_arm_ohm) / base_arm_ohm * 100.0)
        leg_swell = max(0.0, (base_legs_ohm - bioimp_legs_ohm) / base_legs_ohm * 100.0)
        max_swell = max(l_swell, r_swell, leg_swell)

        feat["suit_p_left_arm_psi"]  = suit_p_left_arm_psi
        feat["suit_p_right_arm_psi"] = suit_p_right_arm_psi
        feat["suit_p_legs_psi"]      = suit_p_legs_psi
        feat["suit_p_torso_psi"]     = suit_p_torso_psi
        feat["bioimp_left_arm_ohm"]  = bioimp_left_arm_ohm
        feat["bioimp_right_arm_ohm"] = bioimp_right_arm_ohm
        feat["bioimp_legs_ohm"]      = bioimp_legs_ohm
        feat["left_arm_swelling_pct"]  = l_swell
        feat["right_arm_swelling_pct"] = r_swell
        feat["legs_swelling_pct"]      = leg_swell
        feat["ppg_pulse_amp_ratio"]    = max(0.3, 1.0 - max_swell * 0.02)
        feat["sbp_mmhg"]             = sbp_mmhg
        feat["dbp_mmhg"]             = dbp_mmhg
        feat["hr_bpm"]               = hr_bpm
        feat["spo2_pct"]             = spo2_pct
        feat["resp_rate_bpm"]        = resp_rate_bpm
        feat["eda_tonic_us"]         = eda_tonic_us
        feat["hr_personal_delta"]    = hr_bpm - base_hr
        feat["spo2_personal_delta"]  = spo2_pct - base_spo2
        feat["sbp_personal_delta"]   = sbp_mmhg - base_sbp

        x_vec = np.array([[feat[c] for c in SUIT_FEATURE_COLS]], dtype=np.float32)
        x_scaled = self.scaler.transform(x_vec)

        with torch.no_grad():
            x_t = torch.tensor(x_scaled, dtype=torch.float32, device=self.device)
            logits, emb_32d = self.model(x_t)
            probs = torch.softmax(logits, dim=1).cpu().numpy().flatten()
            pred_zone_id = int(np.argmax(probs))

        def zone_tier(p_psi, swell_pct):
            if p_psi < 3.2 or swell_pct >= 12.0:
                return "Critical"
            elif p_psi < 3.9 or swell_pct >= 6.0:
                return "Warning"
            return "Nominal"

        return {
            "e_suit": emb_32d.cpu().numpy().flatten(),
            "predicted_zone_id": pred_zone_id,
            "predicted_zone_label": ZONE_LABELS[pred_zone_id],
            "zone_confidence": round(float(probs[pred_zone_id]), 4),
            "depressurization_prob": round(float(1.0 - probs[0]), 4),
            "swelling_pct_by_region": {
                "left_forearm": round(l_swell, 1),
                "right_forearm": round(r_swell, 1),
                "lower_body_legs": round(leg_swell, 1)
            },
            "digital_twin_body_map": {
                "left_forearm": zone_tier(suit_p_left_arm_psi, l_swell),
                "right_forearm": zone_tier(suit_p_right_arm_psi, r_swell),
                "lower_body_femoral": zone_tier(suit_p_legs_psi, leg_swell),
                "torso_cardiopulmonary": "Critical" if (suit_p_torso_psi < 3.2 or spo2_pct < 90.0) else (
                    "Warning" if (suit_p_torso_psi < 3.9 or spo2_pct < 94.0) else "Nominal"
                )
            }
        }