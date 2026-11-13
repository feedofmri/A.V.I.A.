# Health assistant reference

The health assistant uses ten logical roles within one bounded orchestration service. Each request runs the coordinator, the relevant specialist, and deterministic supervision. These roles use the existing model checkpoints; they are not independently trained language models.

## Capabilities and implementation

| Capability                 | Implementation / reference                                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Coordinator              | Explicit/automatic role routing, scoped context tools, persisted run IDs and one bounded provider operation                                                                      |
| 2 Intake                   | Structured extraction, clarification, explicit value/unit/time grounding, validated additional observations and a model-supported telemetry form; proposals require confirmation |
| 3 Assessment               | Authoritative existing-model results, personal deviations, currentness, timestamps, imputation and provenance in separate evidence panels                                        |
| 4 Knowledge                | Versioned local educational library, lexical retrieval and allowed source IDs linked to NASA/medical resources                                                                   |
| 5 Action/escalation        | Deterministic review/recheck templates, urgent local guidance, confirmed tasks and replay-safe writes                                                                            |
| 6 Routine                  | Due-task review, mission-routine and check-in proposals with UTC dates; existing task interface supports scheduling/completion                                                   |
| 7 Wellbeing/sleep          | Mood and symptom observations, supportive cloud explanation, sleep/stress evidence and explicitly selected journal processing                                                    |
| 8 Twin                     | Bounded adherence/horizon comparisons and nominal/left-arm suit scenarios using existing endpoints; assumptions and raw results exposed                                          |
| 9 Briefing/handover        | Actual reading/task/history context, summaries and downloadable JSON review with timestamps/source/model versions; no automatic external transmission                            |
| 10 Supervisor              | Schema checks, allowed evidence IDs, numeric/treatment-claim screening, owner/crew scope, explicit confirmation, extraction grounding and local fallback                         |
| 11 Meta                    | Official Responses endpoint, `muse-spark-1.3`, Standard mode, `store:false`, provider-compatible schema, independent validation, bounded output, retries and deadlines           |
| 12 Models                  | Existing five checkpoints retained unchanged; no new training; supplied-row evaluation and model contract regressions                                                            |
| 13 Complete workflow       | Intake → confirmed observation → local inference → explanation → proposed task → confirmed task → task progress/briefing                                                         |
| 14 NASA traceability       | Hazard/risk references, source IDs and explicit reference-data versus measurement distinctions                                                                                   |
| 15 Guidance                | Versioned educational templates and supported next-step workflow; clinical review remains external, unestablished                                                                |
| 16 Model evaluation        | `agent/evaluate.py` and `evaluation/model-reference-results.json`; no independently held-out accuracy claim                                                                      |
| 17 Agent evaluation        | Provider/schema/supervisor unit tests, privacy/action API regressions and six real Meta fictional-scenario cases                                                                 |
| 18 Regression testing      | Existing suites extended with assistant unit, integration and browser workflows; see current test report                                                                         |
| 19 Offline/failure         | Existing local inference/outbox/alerts remain independent; assistant falls back to bundled evidence/templates on no consent, no key, provider failure or rejected output         |
| 20 Privacy/action controls | Per-actor/crew cloud consent, separate owner journal consent, encrypted histories/observations, scoped reads, deletion, replay protection and mutation audit metadata            |
| 21 Visual experience       | Assistant in both clients, responsive forms, current evidence, source links, urgent guidance before a cloud reply and explicit confirmation results                              |
| 22 Personalization         | Stored baselines, mission, readings and due tasks supply context; no invented measurement or dietary target                                                                      |
| 23 Engagement              | Actual completion counts, due counts and ten engagement points per stored completed task, explicitly not a health score                                                          |
| 24 Project story           | `submission/PROJECT.md`, addressing the value of understandable evidence and confirmed action during connectivity loss                                                           |
| 25 Demonstration           | Repeatable captioned browser recording in `scripts/record-demo.mjs`, walkthrough and pitch in `submission/PITCH-AND-DEMO.md`                                                     |
| 26 Submission package      | Project text, architecture/model/test references, evidence files, pitch, recording and readiness checklist prepared locally                                                      |
| 27 Rules/readiness         | Public criteria checked; rescheduling recorded; actual revised event metadata, eligibility and rights remain external confirmations in `submission/READINESS.md`                 |

## Use the assistant

Open Cockpit or Pulse, sign in and select **Health assistant** in the navigation. **Mission tools** contains the guide, imports, tasks, journal, queue and activity. Operator accounts select a crew record; crew accounts are restricted to their own. Default Docker addresses are Cockpit `http://localhost:8080` and Pulse `http://localhost:8081`. Set `COCKPIT_PORT` or `PULSE_PORT` to use different ports. See the [interface guide](SOFTWARE-DELIVERY.md#interface-guide) for navigation and responsive layouts.

Local mode works without API credentials. Enable cloud processing only after reading its scope and saving preferences. The server uses `MODEL_API_KEY` and `META_MODEL`; never put them in a frontend environment. The provider adapter uses structured requests, output validation, bounded retries and deadlines. Keep credentials in local environment configuration; exclude them from version control and offline packages.

To process a journal excerpt, sign in as its owner, enable cloud processing and the separate journal option, save preferences and select the specific entry. Operator-sharing consent does not grant cloud consent. Revocation prevents subsequent cloud use; it cannot undo a request already sent. Encrypted local assessment history remains until deleted. Provider retention is governed by provider terms, not established by `store:false` alone.

Observations are proposed first. Review every value, unit and UTC time, then explicitly confirm. Additional blood pressure/glucose/body-temperature/mood/nutrition/hydration/symptom entries are stored separately and do not silently become features of unsupported trained models. Skin and body temperature remain distinct. The model-supported telemetry form uses the existing validated ingestion/inference path. A failed inference can still accept a reading as pending and recover using the existing worker.

Briefings include authorized factual context and may be downloaded locally for review. Task proposals use the versioned template library; they do not prescribe medication, fluid quantities or exercise doses. Clinical protocol approval has not been established. Scenario outputs stay labeled simulations, not measured outcomes or a prescription to change a suit.

## Validation and reproducibility

- `npm run test:platform` runs the isolated deterministic platform suite without needing a Meta key. Real inference outage testing is limited to its disposable project.
- `node --env-file=.env scripts/evaluate-assistant.mjs --live` explicitly enables six paid live-provider checks with fictional inputs. Results are written to ignored `state/`; the checked-in report contains only fictional test text and aggregate metadata.
- `node scripts/live-platform-smoke.mjs --live` and `node scripts/live-journal-smoke.mjs --live` verify authenticated Meta calls through the deployed demo application, including owner-only journal processing and explicit journal evidence. Temporary records and processing preferences are cleaned up/restored.
- `docker exec avia-agent-1 python evaluate.py` evaluates the unchanged encoders on supplied reference rows. These are not an established independent holdout; raw-feature reproduction is not manual-input or clinical accuracy.
- `node scripts/platform-test.mjs --keep` then `node scripts/record-demo.mjs` records a real captioned, silent browser walkthrough on the disposable stack.

## Remaining external boundaries

Software tests and source checks are not a clinical safety proof. The supervisor screens specific failure classes; it cannot establish that every generated sentence is medically correct. Independent clinical evaluation, clinician review, model/dataset rights, team registration, revised deadlines and organizer eligibility cannot be completed through local code. No submission, public deployment, organizer message or licensing approval is claimed. Hosted CI is configured but has not been run here.
