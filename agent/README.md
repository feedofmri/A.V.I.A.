# agent/ — on-board inference service

FastAPI + PyTorch service that runs the ML team's trained A.V.I.A. models. Only the core API (`server/`) calls it.

The software release retains the supplied weights without training. See [model card](MODEL-CARD.md) for frozen preprocessing, artifact integrity, reconstructed fusion limitations, and the distinction between experimental extrapolation and validated prediction. API `confidence_pct` is null; output certainty is not accuracy. Run all ML checks through `npm run test:platform` using the isolated Docker test stage.

| Endpoint | Purpose |
| --- | --- |
| `GET  /api/v1/health` | `models_loaded`, per-model status, artifact names, data repairs, suit availability |
| `POST /api/v1/infer` | 4 encoders → fusion → 2-layer GRU over a 6-step (72 h) window → scores, Shapley attribution, 7-step forecast, z-scores, alerts |
| `POST /api/v1/twin/projection` | Skeletal heuristic bridge (OSD-919 uncoupling × adherence) + cardiovascular / dermal priors |
| `POST /api/v1/suit/evaluate` | Suit swelling encoder → zone, depressurization probability, per-region swelling, 3D body-map tiers |

## Artifacts

Everything is read, untouched, from `../model files/` (mounted read-only at `/models` in Docker; override with `AVIA_MODEL_DIR`):

- Weights: `avia_{cardiac_resp,stress,sleep,suit_swelling}_encoder.pt.zip`, `avia_temporal_fusion_engine.pt.zip`
  (standard torch zip checkpoints; the `.zip` suffix is accepted as-is). All load with `strict=True`.
- Encoder code: `cardiac_encoder.py`, `stress_encoder.py`, `sleep_encoder.py`, `nasa_context_encoder.py`,
  `suit_swelling_encoder.py` — imported directly, so preprocessing (medians, RobustScaler fitted on the CSVs,
  personal-baseline deltas, feature order) is exactly the ML team's code.
- Calibration: `bidmc_features_sanitized_personal_baseline.csv`, `wesad_features_sanitized_personal_baseline.csv`,
  `sleep_edf_sc4001_epochs_features.csv`, `LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv`, `osd919_29_tissues_validated_stats.csv`,
  `lbnp_harespod_digital_twin_features.csv` (suit; optional — without it only `/suit/evaluate` returns 503).

Models are loaded once at startup (FastAPI lifespan); a reading takes ~20–30 ms on CPU.

## Decisions and known gaps

- **Fusion class reconstruction.** `MultimodalFusionModule` / `TemporalBaselineEngine` were not delivered as code, so
  [src/engine/fusion.py](src/engine/fusion.py) rebuilds them from the checkpoint's state_dict + the docs. Parameter-free
  details (gate scaling, residual, head activation) were chosen by testing all 16 combinations on the docs' reference
  cases: all reproduce the documented outcomes; the Tanh head is closest to the documented Brandt anomaly (~0.11).
- **CBC gaps.** The CBC CSV leaves 7 red-cell indices blank (e.g. MCHC for C002 at L-3/R+1), which made Brandt's
  context embedding NaN. They are filled in memory from MCHC = Hgb/Hct×100, MCV = Hct/RBC×10, MCH = Hgb/RBC×10
  (these reproduce the reported values on complete rows within lab rounding). Listed in `/api/v1/health → data_repairs`.
- **EEG auto-fill.** When a reading omits EEG bands, they are interpolated between the Sleep-EDF N1 and N3 stage
  medians by sleep achieved vs. personal baseline (the docs give no formula).
- **Forecast.** The GRU has score heads only, so the 7-step vital forecast rolls the GRU forward along the damped slope
  of the 128-d fused state and scales each vital's deviation from its personal baseline by its driving head.
- **Suit model.** Calibrated on `lbnp_harespod_digital_twin_features.csv` (the 20 raw `SUIT_FEATURE_COLS` +
  `target_zone_id`; `AVIA_SUIT_CSV` overrides). Verified as the weights' training set: all 1,575 rows classify to their
  `target_zone_id`, and the embeddings reproduce `suit_twin_32dim_embeddings.csv` (mean |Δ| 0.01). The core API fills
  `base_hr` / `base_spo2` from the crew's personal baseline.
- **Sleep-debt reference case.** The documented Sato `recovery_score < 0.45` holds for the 72 h window the core API
  sends (two short nights: 0.414). A lone reading is a cold start — 5 of 6 GRU steps are padded with the personal
  baseline — and gives 0.463. The model is not tuned to the single-reading number.

## Run / test

```bash
pip install -r requirements-dev.txt          # CPU torch from the PyTorch index
uvicorn src.api.main:app --port 8000
python -m pytest -q tests                    # runs the real weights + CSVs
```
