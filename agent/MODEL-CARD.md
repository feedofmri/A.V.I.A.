# Existing A.V.I.A. model bundle

This software release executes the supplied cardiac, stress, sleep, suit and fusion weights without training or fine-tuning them. NASA context is constructed from reference tables. `artifacts/manifest.json` records SHA-256 checksums of source adapters, weights, and CSVs; `preprocessing.json` freezes the reference preprocessing values and has a separate checksum. Startup fails closed on a mismatch.

The fusion class was reconstructed from checkpoint tensor names/shapes and handoff documentation. Non-parameter choices cannot be proved from a state dictionary. Reference-output tests establish repeatability of this implementation, not equivalence to unavailable original training code.

The score heads produce anomaly/recovery/stress values. Vital extrapolations are an added experimental formula, not independently validated vital-regression predictions. The skeletal view uses a heuristic bridge; most anatomical values are illustrative. Suit swelling percentages and body-map tiers include arithmetic and threshold rules. Modality contributions explain changes to the anomaly head under a baseline counterfactual; they are not causal explanations of disease.

The API's `confidence_pct` is null. `output_certainty_pct` describes output sharpness/completeness and is explicitly not calibrated accuracy. Missing/rejected modality outputs do not independently generate physiological alerts. Numeric mission days map to the declared R+1 reference context; only supplied C001–C004 reference subjects are accepted. These subjects do not constitute live blood tests for the demo crew.

Validation includes reference scenarios, critical-status consistency, invalid-channel handling, unknown-context rejection, finite outputs, deterministic numerical output, artifact tampering, forecast contract, and suit cases. There is no independent held-out accuracy, calibration or clinical evaluation in this release. Adding those claims requires a separate evaluation with permitted held-out data; no new model training is needed to run this demonstration.

Keep the manifest immutable for a release. Investigate a failed checksum rather than regenerating the manifest to suppress it. Record a new release version and rerun numerical fixtures if the artifact owner supplies a replacement bundle.
