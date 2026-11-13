"""
Step 3 + Step 4 of the A.V.I.A. pipeline: MultimodalFusionModule and TemporalBaselineEngine.

The ML hand-off did not ship these class definitions (only avia_temporal_fusion_engine.pt), so they are
reconstructed here from the checkpoint's state_dict and the documentation:

    fusion.modality_gates            (4,)        learnable softmax attention gates
    fusion.fusion_mlp.{0,4}          Linear(128, 128)
    fusion.fusion_mlp.{1,5}          LayerNorm(128)
    fusion.fusion_mlp.{2,3,6,7}      SiLU / Dropout(0.15)  (parameter-free, inferred from the docs)
    gru                              GRU(128, 64, num_layers=2)
    {anomaly,recovery,stress}_head   Linear(64, 32) -> activation -> Linear(32, 1) -> Sigmoid

Every parameter tensor is loaded with strict=True, so any shape/name mismatch fails at startup.
Parameter-free details (gate scaling, residual, head activation) cannot be read from a state_dict; they are
selected by `FusionVariant` and validated against the reference test cases in the docs (see tests/).
"""
from __future__ import annotations

from dataclasses import dataclass

import torch
import torch.nn as nn

MODALITIES = ("Cardiac", "Stress", "Sleep", "NASA Context")
EMBED_DIM = 32
FUSED_DIM = EMBED_DIM * len(MODALITIES)  # 128
HIDDEN_DIM = 64


@dataclass(frozen=True)
class FusionVariant:
    """Defaults chosen by evaluating all 16 combinations on the docs' reference cases (AIVI §11.1): every
    combination reproduces the three documented outcomes (Brandt Nominal, Sato recovery < 0.45, Diaz stress > 0.80);
    the Tanh head is the only family close to the documented Brandt anomaly of ~0.11 (0.16 vs >= 0.26)."""

    # Multiply softmax gate weights by the number of modalities so an evenly-gated block keeps unit scale.
    gate_scale_by_n: bool = False
    # out = x + mlp(x)  (doc: "2-layer residual MLP")
    residual: bool = True
    head_activation: str = "tanh"


_ACTIVATIONS = {"silu": nn.SiLU, "relu": nn.ReLU, "gelu": nn.GELU, "tanh": nn.Tanh}


class MultimodalFusionModule(nn.Module):
    def __init__(self, variant: FusionVariant, dropout: float = 0.15):
        super().__init__()
        self.variant = variant
        self.modality_gates = nn.Parameter(torch.ones(len(MODALITIES)))
        self.fusion_mlp = nn.Sequential(
            nn.Linear(FUSED_DIM, FUSED_DIM),
            nn.LayerNorm(FUSED_DIM),
            nn.SiLU(),
            nn.Dropout(dropout),
            nn.Linear(FUSED_DIM, FUSED_DIM),
            nn.LayerNorm(FUSED_DIM),
            nn.SiLU(),
            nn.Dropout(dropout),
        )

    def gate_weights(self) -> torch.Tensor:
        w = torch.softmax(self.modality_gates, dim=0)
        return w * len(MODALITIES) if self.variant.gate_scale_by_n else w

    def forward(self, blocks: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
        """blocks: (..., 4, 32) modality embeddings; mask: (..., 4) 1 = present, 0 = missing."""
        gated = blocks * (self.gate_weights() * mask).unsqueeze(-1)
        x = gated.flatten(-2)  # (..., 128)
        out = self.fusion_mlp(x)
        return x + out if self.variant.residual else out


def _head(activation: str) -> nn.Sequential:
    return nn.Sequential(nn.Linear(HIDDEN_DIM, 32), _ACTIVATIONS[activation](), nn.Linear(32, 1))


class TemporalBaselineEngine(nn.Module):
    def __init__(self, variant: FusionVariant = FusionVariant()):
        super().__init__()
        self.fusion = MultimodalFusionModule(variant)
        self.gru = nn.GRU(FUSED_DIM, HIDDEN_DIM, num_layers=2, batch_first=True)
        self.anomaly_head = _head(variant.head_activation)
        self.recovery_head = _head(variant.head_activation)
        self.stress_head = _head(variant.head_activation)

    def fuse(self, blocks: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
        """(B, T, 4, 32), (B, T, 4) -> (B, T, 128)"""
        return self.fusion(blocks, mask)

    def run_gru(self, fused: torch.Tensor) -> dict[str, torch.Tensor]:
        """(B, T, 128) -> per-step bounded scores, each (B, T)."""
        h, _ = self.gru(fused)
        return {
            "anomaly": torch.sigmoid(self.anomaly_head(h)).squeeze(-1),
            "recovery": torch.sigmoid(self.recovery_head(h)).squeeze(-1),
            "stress": torch.sigmoid(self.stress_head(h)).squeeze(-1),
        }

    def forward(self, blocks: torch.Tensor, mask: torch.Tensor) -> dict[str, torch.Tensor]:
        return self.run_gru(self.fuse(blocks, mask))
