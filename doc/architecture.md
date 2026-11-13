# Architecture and API boundaries

The [project README](../README.md) contains the system, database, assistant and ML diagrams. This document describes the runtime contracts behind them.

## Client and service boundaries

| Layer       | Responsibility                                                                               | Implementation       |
| ----------- | -------------------------------------------------------------------------------------------- | -------------------- |
| Cockpit     | Operator overview, alerts, analytics, 3D twin, behavioral health and workspaces              | `client-cockpit/`    |
| Pulse       | Crew dashboard, manual telemetry and shared health workspaces                                | `client-pulse/`      |
| BFF         | Session authentication, operator/crew authorization, response shaping and Redis caching      | `bff/`               |
| Core API    | Validated writes, database scoping, inference orchestration, recovery, assistant and history | `server/`            |
| Inference   | Supplied encoders, reconstructed temporal fusion and experimental scenarios                  | `agent/`             |
| Persistence | PostgreSQL with crew-scoped transactions and RLS where configured                            | `server/migrations/` |

Clients call the BFF through same-origin nginx or Vite proxies. `/bff/*` strips its prefix; Pulse also proxies `/api/*`. Clients do not call the core or inference service directly. Browser submission queues store pending operations in IndexedDB; Redis is a best-effort response cache, not the durable source of health records.

## Ingestion, inference and recovery

1. The BFF validates identity and access to the requested crew, then forwards an internal-token-protected request.
2. The core validates fields, units, event identity and timestamp, and completes missing supported telemetry using documented historical/baseline rules.
3. The reading commits before inference. Stable event IDs prevent duplicate ingestion and detect conflicting replay payloads.
4. The core builds the historical window and calls local inference. The inference registry verifies supplied artifact hashes and restores frozen preprocessing.
5. A successful assessment is persisted with its model/baseline versions. Only events eligible to represent the current state change active model alerts; historical backfills cannot clear newer alerts.
6. If inference is unavailable, the input remains stored as pending and the API can return HTTP 202. The recovery worker retries assessment without asking the client to resubmit the reading.

Database writes use scoped transactions and per-crew/event coordination. The external inference request is not a single atomic transaction encompassing initial telemetry commit and final assessment. Currentness also depends on matching input/baseline versions and the observation age; a healthy model service does not make old data current.

## Principal BFF routes

Paths below are relative to the BFF. Browser clients usually access them with the `/bff` prefix; Pulse's `/api` proxy preserves the versioned contract.

| Area                  | Routes                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------- |
| Authentication        | `/auth/login`, `/auth/session`, `/auth/logout`                                            |
| Health                | `/health`, `/api/v1/health`                                                               |
| Crew overview         | `/cockpit/crew`, `/cockpit/crew/:id/state`, `/cockpit/crew/:id/overview`                  |
| Analytics and twin    | `/cockpit/crew/:id/analytics`, `/cockpit/crew/:id/twin`                                   |
| Telemetry             | `/cockpit/crew/:id/telemetry`, `/api/v1/pulse/ingest`, `/api/v1/pulse/crew/:id/state`     |
| Alerts and symptoms   | `/cockpit/alerts`, `/cockpit/crew/:id/alerts/:alertId`, `/api/v1/pulse/crew/:id/symptoms` |
| Suit scenarios        | `/api/v1/suit/evaluate`                                                                   |
| Baseline and mission  | `/cockpit/crew/:id/baseline`, `/cockpit/mission`                                          |
| Shared tasks          | `/cockpit/countermeasures`, `/software/crew/:id/tasks`, `/software/crew/:id/task-history` |
| Journals and activity | `/software/crew/:id/journal`, `/software/activity`                                        |
| Assistant             | `/software/crew/:id/assistant` and its consent, run and confirmation subroutes            |

Exact HTTP methods and validation schemas are defined in [BFF routes](../bff/src/routes/) and [core routes](../server/src/routes/). Examples are not an exhaustive OpenAPI contract. Crew identifiers resolve from configured slugs or UUIDs; validation failures use HTTP 422 where specified.

## Database and access control

Schema changes are versioned [migrations](../server/migrations/), tracked in `schema_migrations`. The core connects through a non-superuser application role. `withCrew` in [pool.ts](../server/src/db/pool.ts) sets `app.crew_id` for the transaction, and crew-scoped RLS policies use that value. `crew_roster()` exposes limited roster fields for the operator view.

Mission configuration and countermeasures are controlled by application authorization; not every table has a crew RLS policy. Crew users cannot choose another identity by changing a URL parameter. Sessions are expiring HttpOnly cookies; the BFF forwards identity to the core with an internal token. Runtime ports bind to localhost in the demo configuration.

Journals, additional observations and assistant-run content are encrypted using AES-256-GCM. Journal ownership, operator sharing and cloud processing are distinct permissions. Sharing an entry with an operator does not authorize sending it to a cloud provider.

## Assistant and local fallback

One orchestration service coordinates ten logical roles. It reads authorized observations, tasks, baseline/mission context and existing assessments; it does not replace the local model outputs with language-model guesses. Optional Meta requests require configuration and saved consent. The supervisor validates structured output and allowed evidence references; rejected or failed provider output falls back to local evidence and templates.

Proposals and writes are separate. Users confirm observations and tasks explicitly, and replay protection prevents duplicate action writes. Details are in the [assistant reference](AGENT-DELIVERY.md).

## Port map

| Service    | Container | Default Docker host | Development           |
| ---------- | --------- | ------------------- | --------------------- |
| Core API   | 3000      | 3000                | 3000                  |
| BFF        | 4000      | 4000                | 4000                  |
| Inference  | 8000      | 8000                | 8000                  |
| Cockpit    | 80        | 8080                | 5173                  |
| Pulse      | 80        | 8081                | 5174                  |
| PostgreSQL | 5432      | 5432                | Docker infrastructure |
| Redis      | 6379      | 6379                | Docker infrastructure |

Host ports can be changed through `.env`. The isolated verification runner uses its own project, ports and volumes; see the [verification guide](SOFTWARE-DELIVERY.md#verification-commands).

## Interpretation boundaries

Manual and imported observations, filled model features, NASA reference context, model outputs, deterministic rules and illustrations remain distinct. Pulse's watch is a browser simulation. Mood history comes from reported observations, not a journal sentiment model. Skeletal projection is heuristic; vital extrapolation is experimental; anatomical values may be illustrative. See the [model card](../agent/MODEL-CARD.md) before interpreting results.
