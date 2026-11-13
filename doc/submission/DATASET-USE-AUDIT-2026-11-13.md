# Dataset-use verification — 13 November 2026

Verified against the source implementation. A fresh live-container verification was not possible during this audit because localhost:8000 refused the connection; no service was restarted for this read-only audit.

| Supplied file | Actual use in implementation |
| --- | --- |
| bidmc_features_sanitized_personal_baseline.csv | Read by cardiac adapter initialization; frozen preprocessing replaces runtime-fitted scaler/medians. Used by the encoder evaluation script. |
| wesad_features_sanitized_personal_baseline.csv | Read by stress adapter initialization; frozen preprocessing replaces runtime-fitted scaler/medians. Used by the encoder evaluation script. |
| sleep_edf_sc4001_epochs_features.csv | Read by sleep adapter initialization and used to build EEG/EOG reference profiles; frozen scaler/medians restored. Also evaluated. |
| LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv | Read by NASA context encoder; baseline-relative CBC values contribute to the inference context embedding. |
| osd919_29_tissues_validated_stats.csv | Read by the context encoder and registry; supplied summary values contribute to context and the skeletal heuristic. Upstream derivation is not independently verified. |
| lbnp_harespod_digital_twin_features.csv | Read by suit adapter initialization, followed by frozen preprocessing restoration; used for reference-row suit evaluation. |
| suit_twin_32dim_embeddings.csv | Included in the integrity manifest and checked for matching bytes; not loaded as a production inference feature table. Do not claim the app consumes precomputed embeddings from this file. |

Code evidence: agent/src/engine/registry.py (CALIBRATION, SUIT_CALIBRATION, load and _load_suit), model files/nasa_context_encoder.py, agent/src/engine/pipeline.py (context and twin projection), and agent/evaluate.py.

NASA HRP hazards/risks pages, MedlinePlus and FDA are educational references used by server/src/services/knowledge.ts, not model datasets. Meta Muse is a runtime API; Codex is a development tool. Fictional seed/test records are application demonstration data, not research observations. Five checkpoint files are pretrained model artifacts, not datasets.

The project uses supplied derived feature/reference CSVs. Code verifies their use and integrity; it does not by itself verify their full derivation from upstream BIDMC, WESAD, Sleep-EDF or NASA studies, or prove the original training history of the supplied weights. Submission language must preserve that distinction.
