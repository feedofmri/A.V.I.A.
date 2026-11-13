# A.V.I.A. feature reference

This release implements the agreed software-only challenge demonstration. All observations are entered through forms, imported from CSV, or explicitly simulated. Existing model weights are retained. No sensor, wearable, BLE connection, new model training, or fine-tuning is required.

The application is an educational prototype, not a validated clinical system. Fusion architecture reconstruction, manual-feature approximations, and experimental extrapolation remain disclosed limitations. Guidance is based on cited educational resources; clinical review is not established. Static anatomical values are marked illustrative.

## Start and sign in

Run `npm run docker:up` from the repository with Docker Desktop running. First installation downloads dependencies and container images. Open Cockpit at http://localhost:8080 and Pulse at http://localhost:8081. Seed completion can be checked with `docker compose logs seed`; startup is ready when the log says `seed complete`.

Local demo accounts are enabled explicitly by `DEMO_MODE=true` in the default Compose configuration:

| Account                    | Password           | Access                                                                                                         |
| -------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------- |
| operator                   | avia-demo-operator | Crew dashboard, assessments, schedules, configuration, audit history, and journals explicitly shared by owners |
| okafor, brandt, sato, diaz | avia-demo-crew     | Only the signed-in crew member's readings, symptoms, tasks, and journal                                        |

Ports bind to localhost. Default credentials and encryption keys are for the local demonstration. Before shared deployment, configure `DEMO_MODE=false`, an `AUTH_USERS` JSON mapping, a random `INTERNAL_API_TOKEN`, and a separate random `JOURNAL_KEY` in `.env`. Put TLS in front of the application and set `COOKIE_SECURE=true`. Session cookies are HttpOnly/SameSite; sessions expire after eight hours or a BFF restart. Reauthentication preserves queued submissions.

Keep `JOURNAL_KEY` with your protected backup material. Changing it makes existing encrypted entries unreadable; this release does not silently rotate journal keys. Do not put private configuration, backups, or raw journal content in Git.

## Completion of the 24 items

| Item                           | Delivered behavior                                                                                                                                                          | Verification                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1 Software inputs              | Validated forms, scenario presets, historical CSV import and example download                                                                                               | Server validation, CSV unit tests, import browser test                                |
| 2 Status consistency           | Critical guardrails override lower model tiers; skeletal Critical status retained                                                                                           | ML and API severity regressions                                                       |
| 3 Historical ordering          | Per-crew event locks, event IDs, payload-conflict detection, deterministic timestamp ties; only current events alter active model alerts                                    | Backfill, duplicate, and concurrent-ingestion regressions                             |
| 4 Freshness/provenance         | Input origin, UTC times, filled-field counts, baseline versions, pending/stale/unknown assessment states                                                                    | State/API regressions; UI status and timestamp checks                                 |
| 5 Analytics                    | Timestamped missing buckets, correct directional colors, accessible table; separately labeled 12-hour experimental extrapolation                                            | Analytics API and browser checks                                                      |
| 6 Measurement instructions     | Units, entry context, quality limitations, interpretation guidance                                                                                                          | Mission tools guide and browser check                                                 |
| 7 Spaceflight context          | NASA hazard explanations and explicit unsupported assessments                                                                                                               | Sourced guide; no external runtime request check                                      |
| 8 Alert explanations           | Triggers, baseline deviations, model/rule explanation, severity, and next-step educational guidance                                                                         | Existing inference examples and alert UI workflow                                     |
| 9 Guidance library             | Versioned educational review workflow and primary-source links; unsupported medication/exercise prescriptions are not displayed                                             | Guide review and interface checks                                                     |
| 10 Alert management            | Acknowledge, resolve, archive view, actor/action history, and Pulse polling of stored alert states                                                                          | API alert transition and browser workflow tests                                       |
| 11 Task scheduling             | Crew-specific assignments, UTC due dates, completion actor/time and completion history                                                                                      | Assignment, permissions, due-date/history regressions                                 |
| 12 Browser synchronization     | Server-backed symptoms/tasks, periodic hydration, server acknowledgment, accurate delivery copy                                                                             | Cross-application workflow test                                                       |
| 13 Offline durability          | IndexedDB outbox scoped to user, app-shell service worker, persisted pending/failed entries, replay and explicit discard                                                    | Offline reload/reconnect and invalid-import browser tests                             |
| 14 Inference recovery          | Readings commit before inference; 202 accepted/pending, durable retry worker, bounded retry delay, no resubmission needed                                                   | Actual inference-container stop/restart test                                          |
| 15 Digital twin                | Suit output mapped into body regions, refresh on telemetry changes, explicit illustration/heuristic labels, unavailable projection message                                  | Suit API tests and repeated twin navigation browser test                              |
| 16 Finished/disabled features  | Encrypted text journal with consent/revocation/deletion; voice disabled; static sentiment chart removed from rendering; fake pairing/battery claims removed                 | Journal privacy API/browser tests; source review                                      |
| 17 Configuration               | Consistent day/BMD boundaries, versioned baselines/mission, atomic baseline+mission save, stale assessment invalidation and recovery                                        | Boundary, atomic-save, and recovery regressions                                       |
| 18 Existing-model verification | Locked weights/CSV/code checksums, frozen preprocessing with checksum, deterministic output fixture                                                                         | Artifact tamper and numerical repeatability tests                                     |
| 19 Honest prediction claims    | Experimental extrapolation labels, uncalibrated certainty identified, no claimed measured accuracy                                                                          | ML output contract and accessible chart checks                                        |
| 20 Access control/privacy      | Operator/crew permissions, internal API token, local-only service ports, encrypted journals, consent filtering, no-store responses, login throttling                        | Unauthorized/forged/cross-crew/origin/logout/journal regressions                      |
| 21 Deployment                  | One-command Compose startup, pinned build base images, local fonts/system fallbacks, liveness checks, request deadlines, resumable seeding, backup and offline export tools | Builds, health probes, backup/restore and offline package checks                      |
| 22 Interface quality           | Unknown/error states, keyboard-selectable alerts, modal focus management, responsive navigation, lazy-loaded twin and controller cleanup                                    | Browser checks and screenshot inspection                                              |
| 23 Tests/CI                    | Server, CSV, integration, regression, ML and browser suites, isolated test project, dependency upgrades, GitHub Actions                                                     | `npm run test:platform`; CI configuration is supplied but no hosted CI run is claimed |
| 24 Demonstration/docs          | Fictional seeded crew, scenario presets, seed-only reset, source attribution, model scope, test instructions and walkthrough                                                | This document, model card and test report                                             |

## Demonstration walkthrough

1. Sign in to Cockpit as operator. Review crew status and open Mission tools → guide.
2. Open Mission tools → import, choose Brandt, download the example CSV, and import a historical row. Imported historical readings do not clear newer alerts.
3. Open Pulse in a separate browser profile/private context and sign in as Brandt. Open telemetry input and send the low-oxygen scenario or manually enter an oxygen value used by the prototype's Critical guardrail. Verify the Critical alert and crew badge agree.
4. In Cockpit, open Alerts, select Brandt's alert, and acknowledge it. Pulse's Stored alerts section reflects the saved acknowledgment.
5. In Mission tools → tasks, schedule a review action for Brandt with a UTC due date. In Pulse's tasks view, complete it. Check Cockpit completion history.
6. Disconnect browser networking, record a symptom, and reload Pulse. The queued entry survives. Reconnect and retry pending entries; only server-acknowledged operations leave the queue.
7. As Brandt, save a private journal entry. Operator cannot read it until Brandt shares it. Revoke sharing and verify the operator's journal list no longer includes it.
8. Open the digital twin and change suit scenarios. Region colors and the result table update; physiological illustration, rule-derived tiers, and experimental model output remain labeled.

The accounts should use separate browser contexts when demonstrating multiple identities concurrently: session cookies are shared between localhost ports in the same browser context.

## Verification commands

Install Node dependencies with `npm ci` and `npm run install:all`, then install the test browser using `npx playwright install chromium`. Run `npm run test:platform`.

The runner builds the platform and uses the fixed `avia-platform-test` Compose project on ports 23000/24000/28000/28080/28081, with separate database/cache volumes and generated test secrets. It exercises a real inference outage and creates test journals/tasks. It never stops the normal `avia` project's inference service. A successful default run removes its disposable test volumes; failed runs retain the environment for diagnosis. Use `node scripts/platform-test.mjs --keep` to retain a successful environment for inspection.

Logs, the machine-readable summary, browser traces, screenshots and HTML report are in `state/`. That directory is Git-ignored because it also contains generated secrets and backups. No skip should occur in the full isolated run. The source tests live in the repository and CI uploads only selected logs/reports, not the test environment secrets.

## Backup, reset and offline distribution

- `npm run backup` writes a PostgreSQL custom-format dump to `state/backups/`. Treat it as sensitive. The full platform suite verifies restoring a test dump to a separate verification database and checks the restored crew/telemetry tables.
- `node scripts/demo-reset.mjs --confirm-demo` regenerates only seed-generated telemetry/alerts and keeps user entries/journals. Use this for a deliberate demo reset; it is not a deletion tool for private data.
- `npm run offline:export` packages the built normal-project images, model artifacts, Compose file, and environment example into `state/offline/`. On another Docker-equipped machine, load `avia-images.tar` and start with `docker compose up -d --no-build --pull never`. This supports installed operation without internet; browser links to educational sources open only when explicitly selected.
- Database journal encryption requires the original `JOURNAL_KEY` on restoration. The database dump does not include environment secrets.

## Data and model attribution

The application consumes the supplied model artifacts and processed BIDMC, WESAD, Sleep-EDF, NASA OSD-569 CBC and OSD-919 reference files. Their origins are described in `agent/README.md` and the original handoff documents. Names and mission in the demo are fictional. NASA references provide biological context, not current measurements of the fictional crew.

Educational sources: [NASA five hazards](https://www.nasa.gov/hrp/hazards/), [NASA human research risks](https://www.nasa.gov/hrp/risks/), [MedlinePlus vital signs](https://medlineplus.gov/vitalsigns.html), and [FDA pulse oximeter limitations](https://www.fda.gov/medical-devices/products-and-medical-procedures/pulse-oximeters). The guide links to these resources without fetching them at runtime.

Dataset/model redistribution rights are not established by possessing these files. Review the respective dataset terms and obtain the artifact owners' licensing information before public distribution. No NASA endorsement, independent model accuracy percentage, medical certification, original-fusion equivalence, or clinician approval is claimed.

## Interface guide

Cockpit and Pulse provide dedicated **Health assistant** and **Mission tools** navigation alongside the crew overview.

The assistant includes a question composer, common review actions, an enter/review/confirm observation flow, readable responses with citations, confirmed action cards, a health snapshot, routine progress, review history and collapsible processing preferences. Twin scenarios show baseline/changed comparisons and suit-region results instead of JSON payloads. Guide, imports, tasks, journal, queue and activity use consistent cards and form controls.

Layouts adapt to narrow screens; the mobile drawer closes after navigation. Dark and light themes have explicit surface, text, input and focus styles. Closed mobile navigation is hidden from keyboard and accessibility navigation. Both clients use the same workspace presentation.

Browser verification covers dedicated navigation, mobile bounds and drawer visibility, measured text contrast in both themes, human-readable scenario results, confirmed observations, privacy preferences and the existing platform workflows. Production screens were inspected on desktop and 390-pixel mobile viewports, including both clients, with no JavaScript page errors.

The redesign also fixed a stale observation context after confirmation and a misleading assessment indicator while saving processing preferences. Model weights and API contracts are unchanged.

Open Cockpit at http://localhost:8080 or Pulse at http://localhost:8081 using the default Docker configuration. In Cockpit choose **Health assistant** or **Mission tools** in the sidebar; Pulse provides the same destinations above its dashboard. Development servers remain at ports 5173 and 5174.

Screenshots are generated under `state/ui-review/production-*.png`. Full platform results are documented in [TEST-REPORT-2026-11-12.md](TEST-REPORT-2026-11-12.md).

The light-mode Digital Twin receives theme changes in its Three.js controller and switches from additive glow to normal compositing with darker anatomy/status colors. Rendered-pixel browser coverage verifies dermal, skeletal and cardiovascular visibility on initial light-mode mounting and after live theme changes.

## Behavioral health

The Behavioral Health workspace supports mood check-ins, trend review, private journals, and wellbeing guidance. Operators open Behavioral in the sidebar and choose a crew record. Crew accounts open Behavioral health above their Cockpit health workspace; their account remains restricted to their own crew record.

- Mood check-ins use the existing validated observation and confirmation APIs. Input is an explicitly reported integer from 1–5 with a UTC timestamp. Review, edit, confirmation, retry, persistence and deletion are supported. Timed-out review retries reuse the same request identifier.
- The trend and accessible data table use the account's saved mood reports, rather than fabricated sentiment data. The chart uses actual timestamps, shows gaps without inventing reports, and displays an empty state until reports exist. The backend returns the latest thirty observations across all kinds; this is a recent view, not a complete lifetime mood history.
- Sleep and experimental stress cards use stored telemetry/model output with the observation timestamp. Up to fourteen actual sleep readings from the last seven days are listed without treating repeated readings as separate nights. Model stress output is not labeled a mood score or diagnosis.
- Crew members can write, share, revoke and delete encrypted journal entries in this page. Operators can read explicitly shared entries; they cannot create entries for someone else or change owner consent. Refresh record reloads the current access-filtered data. Journal sharing does not enable cloud processing.
- The integrated wellbeing assistant opens in wellbeing mode and uses the existing local evidence/guidance and confirmed-action controls. Optional Meta processing retains the existing separate cloud/journal consent and explicit entry selection. No additional model training or hardware is required.
- Support guidance links to the existing NASA hazards resource. The software does not infer isolation or diagnose mental health conditions from journal text or mood values.

Four browser tests cover confirmed/persisted/deletable mood reports, actual operator/crew journal sharing and revocation, local wellbeing output, and mobile layouts in both themes. Assistant and platform suites provide additional regression coverage. Screenshots are generated under `state/screenshots/behavioral-*` and `state/ui-review/behavioral-*`.

The [12 November 2026 test report](TEST-REPORT-2026-11-12.md) records 139 passing tests, including 22 browser workflows, production builds, and PostgreSQL backup/restore verification. Both production client proxies reported healthy API, database, ML, and Redis services during that run.
