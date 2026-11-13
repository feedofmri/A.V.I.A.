# Evaluation scope

The model evaluation runs the retained weights against all complete, finite labeled rows of the supplied feature files using the frozen preprocessing. No model weights are trained or fitted. The original adapters initialize from reference files before the registry restores the frozen preprocessing values.

| Encoder | Supplied rows | Accuracy on those rows | Balanced accuracy |
| --- | ---: | ---: | ---: |
| Cardiac anomaly | 2,408 | 89.33% | 88.97% |
| Stress | 3,101 | 99.74% | 99.82% |
| Sleep stage | 767 | 81.75% | 76.12% |
| Suit zone | 1,575 | 100.00% | 100.00% |

Cardiac respiratory estimation MAE on supplied target rows: 1.54 breaths/minute. Confusion matrices are in `model-reference-results.json`.

**These are reference-row reproduction metrics, not independent predictive or clinical accuracy.** The rows may overlap training and were used in original preprocessing/calibration. Suit training overlap was previously identified. Sleep class imbalance explains the lower balanced metric. No labeled temporal-fusion holdout was supplied. Manual input relies on approximations to raw features, so these raw-feature results cannot be transferred to manual-entry performance.

`meta-live-results.json` contains six fictional requests successfully answered by the actual Meta provider and accepted by output guards. It checks connectivity, structured output and selected behavior; it does not measure clinical quality or constitute an independent adversarial benchmark. Cases cover assessment, hazard explanation, follow-up, wellbeing, an injection-style request and missing evidence. Prompts and guards were developed together; describe this as a regression evaluation.

The automated suite additionally checks rejection of unsupported source IDs, invented numeric prose, treatment claims, secret requests, unknown fields, invalid units/times, ungrounded extraction, cross-crew access, missing consent and duplicate actions. Qualified clinical review and permitted held-out evaluation are still needed before claims beyond the prototype scope.
