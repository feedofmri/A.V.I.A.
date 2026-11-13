"""
A.V.I.A. — Module D: NASA Spaceflight Biological Context Encoder (OSD-569 Human + OSD-919 Tissue)
Produces the 32-dimensional Spaceflight Context Embedding (z_context) for Intermediate Fusion:
  • Dimensions 0–15  (16 dims): Human Astronaut Hematological & Immune Shifts (Inspiration4 OSD-569 CBC)
  • Dimensions 16–31 (16 dims): Validated Organ Bone Uncoupling & Inflammatory Shifts (OSD-919)
"""
import numpy as np
import pandas as pd
import torch
import torch.nn as nn

class AVIANASAContextEncoder(nn.Module):
    def __init__(self, cbc_csv_path: str, osd919_stats_csv_path: str):
        super().__init__()
        self.cbc_df = pd.read_csv(cbc_csv_path)
        self.cbc_df.columns = [c.strip().replace("\ufeff", "") for c in self.cbc_df.columns]
        self.cbc_df["Crew_ID"] = self.cbc_df["Sample Name"].apply(lambda x: x.split("_")[0])
        self.cbc_df["Timepoint"] = self.cbc_df["Sample Name"].apply(lambda x: x.split("_")[2])

        self.osd919_df = pd.read_csv(osd919_stats_csv_path)

        # 15 core human CBC analytes + Neutrophil-to-Lymphocyte Ratio (NLR) = 16 Human dimensions
        self.cbc_cols = [
            "white_blood_cell_count_value_thousand_per_microliter",
            "red_blood_cell_count_value_million_per_microliter",
            "hemoglobin_value_percent",
            "hematocrit_value_percent",
            "platelet_count_value_thousand_per_microliter",
            "absolute_neutrophils_value_cells_per_microliter",
            "absolute_lymphocytes_value_cells_per_microliter",
            "absolute_monocytes_value_cells_per_microliter",
            "absolute_eosinophils_value_cells_per_microliter",
            "absolute_basophils_value_cells_per_microliter",
            "mcv_value_femtoliter",
            "mch_value_picogram",
            "mchc_value_grams_per_deciliter",
            "rdw_value_percent",
            "mpv_value_femtoliter"
        ]

        # Precompute OSD-919 16-dim tissue vector (8 key organs x [bone_uncoupling_delta, inflammatory_delta])
        key_organs = ["Bone", "Skeletal_Stem_Cells", "Aorta", "Heart_Atria", "Blood", "Spleen", "Kidney", "Skin"]
        sub_919 = self.osd919_df.set_index("tissue").reindex(key_organs).fillna(0.0)
        self.osd919_16d = np.concatenate([
            sub_919["uncoupling_delta"].values,
            sub_919["inflammatory_delta"].values
        ]).astype(np.float32)

    def get_context_embedding(self, crew_id: str = "C001", mission_timepoint: str = "R+1") -> dict:
        """
        Computes the 16-dim human CBC relative shift for `crew_id` at `mission_timepoint` vs their L-3 baseline,
        and concatenates it with the 16-dim OSD-919 organ vulnerability vector -> 32-dim z_context.
        """
        subj_df = self.cbc_df[self.cbc_df["Crew_ID"] == crew_id]
        base_row = subj_df[subj_df["Timepoint"] == "L-3"]
        curr_row = subj_df[subj_df["Timepoint"] == mission_timepoint]

        if base_row.empty or curr_row.empty:
            base_row = self.cbc_df[self.cbc_df["Timepoint"] == "L-3"].mean(numeric_only=True)
            curr_row = self.cbc_df[self.cbc_df["Timepoint"] == "R+1"].mean(numeric_only=True)
        else:
            base_row = base_row.iloc[0]
            curr_row = curr_row.iloc[0]

        cbc_shifts_15d = []
        for c in self.cbc_cols:
            b_val = float(base_row[c])
            c_val = float(curr_row[c])
            rel_shift = (c_val - b_val) / (abs(b_val) + 1e-5)
            cbc_shifts_15d.append(rel_shift)

        # 16th human feature: Neutrophil-to-Lymphocyte Ratio (NLR) shift (immune stress marker)
        base_nlr = float(base_row["absolute_neutrophils_value_cells_per_microliter"]) / max(1.0, float(base_row["absolute_lymphocytes_value_cells_per_microliter"]))
        curr_nlr = float(curr_row["absolute_neutrophils_value_cells_per_microliter"]) / max(1.0, float(curr_row["absolute_lymphocytes_value_cells_per_microliter"]))
        nlr_shift = (curr_nlr - base_nlr) / (base_nlr + 1e-5)

        human_16d = np.array(cbc_shifts_15d + [nlr_shift], dtype=np.float32)
        z_context_32d = np.concatenate([human_16d, self.osd919_16d]) # Exact 32-dim vector!

        return {
            "z_context": z_context_32d,                          # Shape: (32,)
            "crew_id": crew_id,
            "mission_timepoint": mission_timepoint,
            "human_nlr_shift_pct": round(float(nlr_shift * 100.0), 2),
            "human_wbc_shift_pct": round(float(cbc_shifts_15d[0] * 100.0), 2)
        }