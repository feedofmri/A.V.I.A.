# Platform verification — 12 November 2026

The original platform and ten-role agent extension passed the final isolated platform run: **139 tests, with zero failures or skips**, on Windows with Node 24.18.0, Docker Desktop and Chromium. This establishes the tested software behavior; it does not establish clinical safety, model accuracy or mission readiness.

The original implementation mapping is in [SOFTWARE-DELIVERY.md](SOFTWARE-DELIVERY.md); the combined 27-item plan is mapped in [AGENT-DELIVERY.md](AGENT-DELIVERY.md). Existing supplied model weights were retained; no new model was trained. External clinical, licensing and event confirmations remain explicitly unverified.

## Automated results

Command: `npm run test:platform`

| Suite | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Telemetry, agent, privacy and provider unit tests | 40 | 0 | 0 |
| CSV parsing/validation unit tests | 4 | 0 | 0 |
| Existing integration tests through BFF and real inference | 13 | 0 | 0 |
| Reliability, privacy and authorization regressions | 19 | 0 | 0 |
| ML contracts, artifacts, preprocessing and guardrails | 20 | 0 | 0 |
| Assistant integration and action/consent regressions | 21 | 0 | 0 |
| Chromium browser workflows | 22 | 0 | 0 |
| **Total** | **139** | **0** | **0** |

Production TypeScript/Vite builds passed for the server, BFF, Cockpit and Pulse. Docker images built successfully. PostgreSQL backup and restoration to a separate verification database passed. The final run used `node scripts/platform-test.mjs --keep` to retain its disposable stack for the demonstration recording. Only disposable test/verification projects are cleaned afterward; normal application data is preserved.

The regression suite exercised a real inference-container outage and recovery, historical and concurrent telemetry, replay/conflicting event identifiers, baseline changes, atomic configuration validation, UTC task scheduling/history, alert transitions, journal consent/revocation/deletion, invalid authentication, cross-crew access, request origin checks and session revocation.

Browser coverage exercised login, guide/source visibility, analytics and accessible data, CSV imports, persisted failed imports, offline submission across reload and reconnect, journal privacy controls, crew restrictions, repeated twin navigation, responsive keyboard navigation, and a complete operator-to-crew task/assessment/alert workflow across both clients. It also checked for unintended external runtime requests. Screenshots of Cockpit, alerts and Pulse were inspected. The UI revision adds four browser checks for dedicated navigation, mobile bounds and drawer behavior, dark/light text contrast, and readable scenario comparisons. Production desktop/mobile screens and all six mission-tool tabs were inspected; see [UI-DELIVERY.md](UI-DELIVERY.md). Test fixtures now explicitly establish processing preferences when resuming a disposable run.

Assistant checks additionally covered ten-role registration/routing, extraction grounding, ambiguous or incomplete text readings, factual local summaries, request leases longer than the provider deadline, rejected numeric/treatment claims, stale/Critical contradictions, invalid citations, encrypted-history tampering, account-scoped history, consent revocation, journal processing restrictions, confirmed/deletable observations, duplicate action confirmation, real twin/suit scenarios, and a confirmed intake reaching the existing inference service with Critical status preserved.

## Real Meta and model evaluation

Six fictional live-provider scenarios returned structured output accepted by the guards. Two separate authenticated workflows through the deployed BFF/core completed with `provider=meta` and `muse-spark-1.3`: a normal explanation and an owner-consented fictional journal review with an explicit journal citation. The smoke scripts restored prior processing preferences and deleted their temporary assessments/journal entry. These eight checks are separate from the 139 deterministic platform tests. They establish provider connectivity and selected regression behavior, not clinical quality.

Live verification caught an unsupported `uniqueItems` provider-schema keyword and incomplete responses under the initial reasoning/token settings. The adapter now translates the provider schema while retaining independent server validation, requests low reasoning with a bounded output budget, and has tested failure handling. No fallback was counted as a successful live Meta response.

Unchanged-checkpoint evaluation covered all complete finite labeled rows in four supplied feature files: 2,408 cardiac, 3,101 stress, 767 sleep and 1,575 suit rows. Detailed confusion matrices and carefully scoped metrics are in [evaluation/README.md](evaluation/README.md). These rows are not an established independent holdout; no clinical or manual-input accuracy is inferred from their reproduction scores. Temporal-fusion accuracy remains unestablished without labeled sequences.

## Deployment and distribution checks

- Normal API health reported `api`, `db`, `ml` and `redis` all `ok`.
- Both production clients and both Vite clients returned HTTP 200. Production `/bff/health` checks passed through each client's nginx proxy.
- All five npm workspaces (root, server, BFF, Cockpit, Pulse) reported zero known vulnerabilities in `npm audit`. The running Python environment passed `pip check`. These checks do not constitute a penetration test or a Python vulnerability audit.
- The offline exporter created `state/offline/avia-images.tar` (approximately 608 MiB), model files, explicit image-based Compose configuration, database initialization files and an environment template. All nine images are checked with `docker image load`; the original cold-start evidence is recorded in `state/offline-verification.json`. The UI revision refreshes the client images and archive; its separate export/hash/load evidence is recorded in `state/offline-ui-export.json`. A second fresh-database cold start was not repeated for this presentation-only revision.
- The packaged files started under a separate `avia-offline-check` project using `--no-build --pull never`, with a fresh database. Migration and seed containers exited successfully; login returned 200, both clients returned 200, and all health checks passed. This verifies operation without build/download steps on this Docker-equipped host. Network isolation and installation on another operating system were not tested. The verification project's volumes were removed afterward.

On this workstation the running clients are Cockpit at http://localhost:8080 and Pulse at http://localhost:8082. Another project's container already owns port 8081, so the ignored local `.env` sets `PULSE_PORT=8082` and includes that origin. Development clients remain at http://localhost:5173 and http://localhost:5174. The repository's default Pulse port remains 8081 for clean installations.

## Evidence and reproduction

Run `npm ci`, `npm run install:all`, `npx playwright install chromium`, then `npm run test:platform`. Docker Desktop must be running. This uses separate test ports and volumes and deliberately interrupts only the test inference container.

Generated evidence is Git-ignored under `state/`: `platform-validation.json`, per-suite logs, Playwright reports/traces, screenshots, `final-dependency-audit.json`, `offline-verification.json`, `live-agent-evaluation.json`, `live-platform-smoke.json` and `live-journal-smoke.json`. The captioned silent walkthrough is `state/demo/avia-walkthrough.webm`. Backup dumps, offline images and generated test secrets also reside there and should be handled accordingly. Checked-in evaluation files contain aggregate results or fictional test cases only. Hosted GitHub Actions has been configured; no hosted run is claimed.

## Remaining limits

The supplied fusion architecture was reconstructed, manual inputs approximate some original sensor-derived features, certainty is uncalibrated, and future chart values are experimental extrapolation. Neither independent predictive accuracy nor clinical validation has been established. The guide documents unsupported assessments and uses educational source material. Dataset and model redistribution rights require confirmation before public distribution.

The builds emit a nonblocking size warning for the lazily loaded 3D twin chunk. Tests emit a Starlette/httpx deprecation warning; fresh seeding also emits a PostgreSQL client concurrency deprecation warning. These did not fail verification, but dependency migrations should address them before their announced breaking releases. Browser automation ran on Chromium; Firefox, Safari, assistive-technology certification, large-scale load and external security testing were outside this run.


The full run now includes the light-mode twin rendered-pixel regression and four Behavioral Health workflows. Coverage verifies confirmed/persisted/deletable mood reports, actual owner/operator journal sharing and revocation, local wellbeing guidance, and mobile layouts in both themes. See [BEHAVIORAL-DELIVERY.md](BEHAVIORAL-DELIVERY.md). All 139 tests, production builds and backup/restore verification passed after these changes.

