# Proposed A.V.I.A. agent layer

Implementation is now documented in [AGENT-DELIVERY.md](AGENT-DELIVERY.md). This file preserves the design specification.

Planning specification, 12 November 2026. These agents are proposed and have not been implemented by this document. The existing software platform and five supplied trained checkpoints remain the foundation. No new hardware or model training is proposed.

## Evidence and integration

The challenge asks for a visual health-indicator tool that supports astronaut self-assessment and guidance. Its optional ideas include different mission environments, periodic measurements/actions, gamification, dynamic charts, color coding and understandable explanations. The supplied challenge text provides the full objectives; the challenge page's indexed description was also checked. It does not mandate multi-agent architecture or every example indicator.

Sources:
- https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/
- https://dev.meta.ai/docs/models

The provider integration uses Meta via `https://api.meta.ai/v1/responses`, `MODEL_API_KEY` and `META_MODEL`, a strict JSON-schema request, `store:false`, bounded retries and deadlines. Provider configuration alone is not evidence of current connectivity or medical effectiveness. `store:false` is a request setting, not proof of zero provider retention.

Use that HTTP provider pattern behind an A.V.I.A.-specific server adapter. Configure `META_MODEL=muse-spark-1.3` initially, subject to the account's enabled model catalog. Independently validate every returned object on the server; JSON parsing alone is insufficient. Keep credentials on the server.

## Ten logical agent roles

Implement these within one backend orchestration service, using shared typed tools and permissions. They do not require ten model deployments, ten containers, or ten API calls for every request. Invoke only the roles needed by the workflow.

| # | Role | Responsibility and challenge connection | Existing models / data | Muse responsibility |
| --- | --- | --- | --- | --- |
| 1 | Coordinator | Route requests, choose permitted tools, track bounded workflows and return a coherent answer | Authenticated identity, crew context, workflow state | Interpret intent and select allowed specialist operations |
| 2 | Intake and measurement assistant | Convert text/CSV into proposed entries; ask for missing units, dates or context; explain how to enter a measurement | Existing forms, validation, CSV import and event IDs | Extract structured fields and ask focused clarification; user confirms before saving |
| 3 | Health assessment assistant | Explain current status, personal deviations, missing inputs and historical changes | Cardiac, stress, sleep and temporal fusion outputs plus NASA reference context | Explain supplied outputs; never invent scores, causal diagnoses or certainty |
| 4 | Space-health knowledge assistant | Answer what indicators mean and how mission hazards relate to health, using cited material | Bundled versioned NASA/medical guidance and reference metadata | Answer from retrieved passages with verifiable citations; report evidence gaps |
| 5 | Action and escalation assistant | Connect alerts to an approved review/recheck workflow and proposed tasks | Stored alerts, deterministic severity rules and approved action library | Explain next steps and draft tasks; changes require explicit approval |
| 6 | Routine and prevention assistant | Suggest check-ins, reminders and permitted sleep/activity/nutrition/hydration routines | Mission schedule, due tasks, adherence and user-entered routine logs | Personalize wording and timing proposals within approved constraints; no invented dosage or nutrition targets |
| 7 | Wellbeing and sleep assistant | Offer mood check-ins, explain sleep/stress patterns and support isolation-related self-reflection | Existing stress/sleep results, explicit mood inputs, only specifically consented journal excerpts | Supportive conversation and cautious summaries; physiological stress is not a psychiatric diagnosis |
| 8 | Digital-twin scenario assistant | Explain body regions and compare software scenarios with explicit assumptions | Existing twin endpoint, skeletal heuristic and trained suit-swelling model | Convert a question into bounded scenario parameters and explain returned differences; simulation is not a measured outcome |
| 9 | Briefing and handover assistant | Produce daily crew briefs and review/export summaries containing changes, alerts, tasks and provenance | Authorized telemetry, actual timestamps, trends, alert/task history | Summarize facts without adding measurements; prepare an export, without automatically transmitting it |
| 10 | Safety, evidence and privacy supervisor | Enforce evidence consistency, permissions, consent and permitted actions before tool calls and output | Server checks, model/protocol versions, source IDs, freshness, risk rules | Optional second-pass critique; deterministic checks remain authoritative |

## Model ownership and limits

The cardiac/respiratory, stress, sleep, suit-swelling and temporal-fusion checkpoints stay unchanged. NASA context comes from reference tables, not live laboratory results. Skeletal change uses a heuristic; future vital curves use experimental extrapolation. No agent may relabel these as validated predictions or independently measured physiology. Fusion architecture reconstruction remains disclosed.

Manual blood pressure, glucose, body temperature, mood, food and hydration logs can be added as typed observations if selected for the demonstration. Their storage schemas, forms and validated educational protocols are ordinary implementation work. Do not inject unsupported observations into a trained model's feature contract or claim new predictive coverage. Skin temperature is distinct from core body temperature. The challenge does not require every example measurement.

## Execution rules

- User identity and crew scope come from the authenticated server session, never model-selected identifiers.
- Structured tools cover authorized reads, retrieval, inference, bounded scenario evaluation and proposed actions. Validate permissions and parameters on every execution.
- Local model outputs and deterministic safety rules establish status. Muse may explain them but cannot downgrade a Critical alert or delay its display.
- Retrieve from a bundled, versioned document set. Use lexical retrieval initially; add a pretrained embedding model only if evaluation shows a benefit. No training is needed.
- Consent for operator journal sharing does not authorize sending that journal to a cloud model. Require separate, explicit cloud-processing consent and minimize payloads. Keep journal text out of routine logs and reports.
- Offline/API-failure mode retains local inference, alerts, durable input, approved guidance and template-based summaries. Cloud conversation is labeled unavailable; it is not represented as onboard intelligence.
- Proposals and confirmed database writes are separate states. Confirm consequential changes, use idempotency keys, and audit actual execution. Do not automatically resolve medical alerts or send a ground-support message.
- Treat journal text, retrieved documents and tool responses as untrusted data. No arbitrary shell, SQL or unrestricted web tool is exposed to the model.
- Bound tool loops, token usage, request time and retries. Persist workflow status, prevent duplicate writes and record model/source/protocol versions without raw private text.

## Build order and acceptance

First deliver the provider adapter, typed tools, coordinator, safety checks, intake, assessment, knowledge and action flows. Then add routine/briefing workflows. Add wellbeing and twin conversation once evidence and consent behavior pass. Gamification is optional deterministic product logic, not another necessary agent.

New acceptance tests must cover structured-output validation, invalid units, contradictory symptoms, stale/missing data, incorrect citations, altered model scores, Critical-alert bypass attempts, cross-crew tool calls, prompt injection, revoked/cloud journal consent, API timeout/429/5xx, provider outage fallback, bounded loops, duplicate task writes, real versus simulated data and unsupported medical requests. Use mocked provider responses for deterministic CI, plus a separately enabled live Meta smoke test. Medical quality requires reviewed scenario cases; a successful API call does not validate clinical advice.

Demo acceptance scenario: user reports poor sleep and feeling unwell; intake proposes a confirmed entry; the existing models score supported inputs; the assessment explains actual evidence; knowledge cites the relevant source; the action assistant proposes an approved follow-up; the user confirms a task; the briefing includes the saved result. Repeat offline and with a Critical scenario to demonstrate independent local safeguards.

This agent list is an application design recommendation, not a NASA-required agent count, medical certification, or claim that adding agents alone makes the platform clinically complete.
