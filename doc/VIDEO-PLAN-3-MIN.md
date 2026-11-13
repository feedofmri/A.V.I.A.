# A.V.I.A. — three-minute project demonstration

Prepared 13 November 2026. Record the real local application at 1920 × 1080, dark theme, 100% browser zoom. Target 180 seconds including opening and closing. Use actual browser footage throughout; add short captions and a voiceover afterward so loading and typing can be trimmed.

## Recording addresses

- Cockpit: http://localhost:8080 — `operator` / `avia-demo-operator`.
- Pulse: http://localhost:8081 — `sato` / `avia-demo-crew`, in a separate browser profile or private window. Cookies are shared across localhost ports, so separate tabs alone do not isolate identities.
- Leave both applications signed in before recording. Do not film passwords.
- Select Sato throughout the central story: an example of short sleep, evidence review and a confirmed follow-up task.

## Timed shot list

| Time | Real screen and action | Point to communicate |
| --- | --- | --- |
| 0:00–0:15 | Cockpit Overview; title overlay “A.V.I.A. — Autonomous Vital Intelligence Agent” | Crew-health support during missions; software prototype with fictional demo data. |
| 0:15–0:35 | Four crew cards, then Alerts; open Sato's sleep alert | Personal baselines, timestamped observations, and explanations for attention flags. |
| 0:35–1:10 | Health assistant; select Sato; Prepare an observation → telemetry; review values and UTC time → Confirm observation | A real input passes through storage and the local inference service. Use the rehearsal values below. Cut most typing. |
| 1:10–1:40 | Select Action assistant / Next steps; Ask assistant; show evidence and sources; Confirm task; show server acknowledgment and Care tasks | Explanation leads to a human-confirmed, persisted follow-up. Show local guidance explicitly. |
| 1:40–2:05 | Digital Twin; switch anatomy layers; select left-arm pressure-loss preset; show region result | Anatomical visualization plus a clearly labeled software suit scenario. |
| 2:05–2:25 | Analytics; show recorded history and the experimental extrapolation label | Review changes over time; distinguish stored evidence from experimental projections. |
| 2:25–2:45 | Switch to Sato's Pulse session; show updated vitals and crew-specific workspace; cut to Cockpit Behavioral | A compact crew interface plus mood, sleep history, and owner-controlled journal sharing. |
| 2:45–3:00 | Return to Overview; closing overlay “Observe → Understand → Confirm → Follow up” | Actual local models and an end-to-end software workflow; educational prototype, clinical validation not established. |

The cuts above total exactly 180 seconds. Do not demonstrate every tool in three minutes. CSV import, sync queue, activity, mission setup and detailed privacy settings can appear in supplementary footage.

## Narration draft

**0:00–0:15:** “Meet A.V.I.A., our Autonomous Vital Intelligence Agent. We built this software prototype to help a mission team understand crew-health observations and follow up when attention is needed, even when cloud connectivity is unavailable.”

**0:15–0:35:** “The Cockpit brings four crew records into one view. Readings are timestamped and compared with personal baselines. Here, Sato's short sleep is flagged for review. An alert explains the observation and the evidence behind it, so the operator can inspect the reason.”

**0:35–1:10:** “Let's follow the actual workflow. We select Sato and enter a fictional telemetry observation: heart rate, oxygen saturation, stress-related inputs and sleep duration. Before anything is saved, the interface asks us to review the values, units and time. After confirmation, the record goes through our API and local inference service. The health snapshot then updates from stored results.”

**1:10–1:40:** “The health assistant uses that record to explain the available evidence and suggest a follow-up. In this demonstration, it is using local guidance with linked sources. A proposed action becomes a stored task only when we confirm it. The acknowledgment shows that the server received it, and the task can be reviewed in Mission tools.”

**1:40–2:05:** “The Digital Twin adds an anatomical view. We can switch layers and explore a labeled suit-pressure scenario. Changing the left-arm example updates the affected region and scenario output. These are experimental simulations, with assumptions shown in the interface.”

**2:05–2:25:** “Analytics provides the timeline behind a single reading. Operators can inspect recorded observations and compare changes over time. The application labels experimental extrapolations separately, keeping the distinction between historical evidence and projections visible.”

**2:25–2:45:** “Pulse gives crew members a compact view of their own record. The same backend supports both interfaces. Behavioral health adds mood check-ins, sleep history and journal sharing controlled by the entry's owner.”

**2:45–3:00:** “A.V.I.A. connects observations, understandable evidence and confirmed follow-up in one working system. This demonstration uses fictional data. It is an educational prototype, with clinical validation still to be established.”

## Rehearsal values and sequence

In Health assistant, choose Sato and prepare a telemetry observation. Enter HR 68 bpm, oxygen saturation 98%, EDA 2.1 µS, HRV 46 ms and sleep 4.9 hours. Use the actual current UTC observation time and keep other fields visibly as provided or missing; do not describe filled fields as measurements. Review and confirm. Choose Action assistant, ask for next steps, confirm one appropriate proposed task, then show its stored acknowledgment. Rehearse this before the take and avoid double-confirming repeated proposals.

Use the 4.9-hour sleep example throughout; do not imply that pressing a button improves the crew member's health. Any follow-up reading is another fictional demonstration input.

## Readiness evidence

The Docker services were already running. BFF reports API, database, Redis and ML healthy; inference reports its encoders, fusion engine and suit model loaded. The seed job completed.

Nine targeted Playwright checks passed on the running stack: overview and local guidance; analytics; dedicated navigation; mobile assistant; twin rendering across themes; twin pressure scenario; wellbeing guidance; behavioral mobile layouts; and crew access restrictions.

A separate 1920 × 1080 browser sweep checks eight Cockpit destinations, six Mission tools tabs and three Pulse destinations, with screenshots and JavaScript/network error collection. Local evidence is saved in `state/recording-readiness/` and its `report.json`.

The first visual check found saved observations older than the 24-hour current-assessment threshold. Four fresh fictional scenario readings were appended through the normal ingestion endpoint, without resetting the database or deleting history. All returned HTTP 201 with current inference: Brandt Nominal; Okafor, Sato and Diaz Warning. These are demonstration outputs, not clinical conclusions.

Local assistant guidance and twin scenarios were exercised. A live cloud-provider request and an offline/reconnection demonstration were not part of this readiness check. Keep cloud processing out of this take unless separately verified. The existing `scripts/record-demo.mjs` produces a silent walkthrough of a different duration and does not implement this exact three-minute shot list.

## Before pressing Record

1. Open Cockpit and Pulse in separate profiles; dismiss unrelated notifications and keep personal material out of frame.
2. Wait for crew values and the Pulse “Local models available” indicator to load; confirm the data timestamp is current.
3. Rehearse the observation and task flow once; leave the twin on its nominal preset before the take.
4. Capture actual application footage with a screen recorder. Record narration separately, remove loading pauses and trim each scene to the timing above.
5. Export 1080p, 30 fps MP4, exactly 3:00. Keep captions clear of confirmation buttons and status messages.

This document is the recording plan and readiness check. A final three-minute video has not yet been recorded or exported.
