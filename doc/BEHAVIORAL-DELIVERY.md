# Behavioral Health delivery — 12 November 2026

The Behavioral Health placeholder page is now a working workspace. Operators open Behavioral in the sidebar and choose a crew record. Crew accounts open Behavioral health above their Cockpit health workspace; their account remains restricted to their own crew record.

- Mood check-ins use the existing validated observation and confirmation APIs. Input is an explicitly reported integer from 1–5 with a UTC timestamp. Review, edit, confirmation, retry, persistence and deletion are supported. Timed-out review retries reuse the same request identifier.
- The trend and accessible data table use the account's saved mood reports, rather than fabricated sentiment data. The chart uses actual timestamps, shows gaps without inventing reports, and displays an empty state until reports exist. The backend returns the latest thirty observations across all kinds; this is a recent view, not a complete lifetime mood history.
- Sleep and experimental stress cards use stored telemetry/model output with the observation timestamp. Up to fourteen actual sleep readings from the last seven days are listed without treating repeated readings as separate nights. Model stress output is not labeled a mood score or diagnosis.
- Crew members can write, share, revoke and delete encrypted journal entries in this page. Operators can read explicitly shared entries; they cannot create entries for someone else or change owner consent. Refresh record reloads the current access-filtered data. Journal sharing does not enable cloud processing.
- The integrated wellbeing assistant opens in wellbeing mode and uses the existing local evidence/guidance and confirmed-action controls. Optional Meta processing retains the existing separate cloud/journal consent and explicit entry selection. No additional model training or hardware is required.
- Support guidance links to the existing NASA hazards resource. The software does not infer isolation or diagnose mental health conditions from journal text or mood values.

The four new browser tests cover confirmed/persisted/deletable mood reports, actual operator/crew journal sharing and revocation, local wellbeing output, and mobile layouts in both themes. Existing assistant and platform tests are also rerun for this delivery. Screenshots are generated under `state/screenshots/behavioral-*` and `state/ui-review/behavioral-*`.

Final validation: all 139 tests passed, including 22 browser workflows, with zero failures or skips. All production builds and the PostgreSQL backup/restore check passed. Both production client proxies reported healthy API, database, ML and Redis services.
