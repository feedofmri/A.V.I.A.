# Architecture

## Request flow

```
Cockpit (React) ──┐                          ┌──► Redis       (response cache, best-effort)
                  ├── /bff/*, /api/v1/* ──► BFF ──► Core API ──┬──► PostgreSQL (RLS)
Pulse (React) ────┘   (nginx/Vite proxy)                       └──► agent (FastAPI + PyTorch inference)
```

- **Clients never call the core API or the inference service directly.** In Docker each client's nginx proxies
  `/bff/*` (and `/api/*` for Pulse) to the BFF; in dev, Vite does.
- **BFF (`bff/`)** shapes responses per client and caches Cockpit views in Redis; every write invalidates them.
  - Pulse contract (from the integration docs): `GET /api/v1/health`, `POST /api/v1/pulse/ingest`,
    `GET /api/v1/pulse/crew/:id/state`, `POST /api/v1/pulse/crew/:id/symptoms`, `POST /api/v1/suit/evaluate`
  - Cockpit: `GET /cockpit/crew`, `GET /cockpit/alerts`, `GET /cockpit/crew/:id/{state,overview,analytics,twin,baseline}`,
    `POST /cockpit/crew/:id/telemetry`, `PUT /cockpit/crew/:id/baseline`, `PATCH /cockpit/crew/:id/alerts/:alertId`,
    `GET|PUT /cockpit/mission`, `GET|POST /cockpit/countermeasures`, `PATCH /cockpit/countermeasures/:id`
- **Core API (`server/`)** owns persistence, validation and the ingest orchestration:
  - `POST /crew/:id/telemetry` — fill missing fields (carry-forward → baseline → documented defaults), build the
    6-step / 72 h history window, call the inference service, then store reading + inference + alerts in one
    RLS-scoped transaction. If the models are down the reading is still stored and the call returns 503.
  - `GET /crew`, `GET /crew/:id`, `GET /crew/:id/{state,vitals,analytics,twin,alerts,baseline}`, `PUT /crew/:id/baseline`,
    `POST /crew/:id/vitals` (raw, no inference), `POST /crew/:id/logs`, `PATCH /crew/:id/alerts/:alertId`,
    `GET /alerts`, `GET|PUT /mission`, `GET|POST /countermeasures`, `PATCH /countermeasures/:id`, `GET /health`, `GET /ml/health`
  - `:id` is the crew slug (`okafor`, `brandt`, `sato`, `diaz`) or the uuid. Validation errors return 422.
- **agent (`agent/`)** runs the supplied encoders + fusion GRU. See [agent/README.md](../agent/README.md).

### Why the core API (not the BFF) calls the inference service
Model outputs are persisted data (alerts, strain markers, forecasts are all read back later), so the reading, its
inference and the alert lifecycle are written in one transaction next to the database. The seeder reuses the same code path.

## Alerts

Model alerts follow the docs' rules (sleep: recovery_index < 0.50 or Sleep_z < −2; stress: stress_probability > 0.65
or EDA_z ≥ 2; cardiac: cardiac_anomaly_prob > 0.60 or |HR_z| ≥ 2 or HRV_z ≤ −2; hypoxia: SpO₂ < 94 %; bone: skeletal
projection crosses warning within 60 d). One active alert per crew member and condition; it refreshes while the
condition holds and resolves automatically when it clears. Manual logs (symptom, device, dermal scan) are separate,
non-model entries.

## Database & Row Level Security

Schema lives in [server/migrations/](../server/migrations/) (`npm run db:migrate`, tracked in `schema_migrations`).
The API connects as `avia_app` (not superuser, not owner), so RLS applies. Every crew-scoped query runs inside
`withCrew(crewId, fn)` ([server/src/db/pool.ts](../server/src/db/pool.ts)), which sets `app.crew_id` for the
transaction. `crew_baselines`, `vitals`, `inferences` and `alerts` only expose that crew member's rows; the roster is
read through the `crew_roster()` SECURITY DEFINER function. `mission` and `countermeasures` are mission-wide.

The BFF requires an expiring HttpOnly session, checks operator/crew permissions, and forwards identity through an internal-token-protected core API. Crew access is constrained to the authenticated crew slug. Journal creation and consent changes are owner-only; operator reads require per-entry consent. Runtime services bind to localhost in the local demonstration.

Telemetry commits with a stable event ID before inference. Pending work is retried by the recovery worker. Historical events cannot alter current alerts. Baseline versions invalidate stale results. See [software delivery](SOFTWARE-DELIVERY.md) for current contracts and test coverage.

## Ports

| Service | Container | Host (Docker) | Dev |
| --- | --- | --- | --- |
| server | 3000 | 3000 | 3000 |
| bff | 4000 | 4000 | 4000 |
| agent | 8000 | 8000 | 8000 |
| cockpit | 80 | 8080 | 5173 |
| pulse | 80 | 8081 | 5174 |
| postgres | 5432 | 5432 | — |
| redis | 6379 | 6379 | — |

## Not model-derived (by design, per the ML docs)

Dermal scan (flagged "Mock"), journal sentiment chart, the Isolation strain marker, urinary calcium / other non-BMD
twin metrics, and the Pulse watch's "simulate an event" buttons. The Pulse ↔ Cockpit `/__avia` relay exists only in the
Vite dev server.
