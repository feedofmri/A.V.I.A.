# A.V.I.A. — Autonomous Vital Intelligence Agent

A.V.I.A. is a crew health monitoring prototype with a desktop control center, a compact crew interface, and local model inference. It supports health observations, CSV imports, personal baseline comparisons, alerts, and follow-up tasks. Labeled scenarios let users explore the workflow without connected hardware.

See the [architecture](doc/architecture.md), [feature reference](doc/SOFTWARE-DELIVERY.md), [model limitations](agent/MODEL-CARD.md), and [verification guide](doc/SOFTWARE-DELIVERY.md#verification-commands).

Local demo login: **operator / avia-demo-operator**. Crew accounts: **okafor**, **brandt**, **sato**, **diaz**, password **avia-demo-crew**. Use separate browser contexts for multiple identities. Demo credentials and keys must be replaced before shared use.

## Repository layout

| Folder | What | Stack |
| --- | --- | --- |
| [client-cockpit/](client-cockpit/) | Desktop control center: dashboard + 3D digital twin | React, Vite, Three.js |
| [client-pulse/](client-pulse/) | Compact crew software interface | React, Vite |
| [bff/](bff/) | Backend-for-Frontend: the only API the clients call. Aggregates and caches. | Fastify, Node.js, Redis |
| [server/](server/) | Core API: owns the data, enforces Row Level Security | Fastify, Node.js, PostgreSQL |
| [ml/](ml/) | Earlier experimental scaffolding; not the active inference service | Python |
| [agent/](agent/) | On-board inference service: runs the trained encoders + fusion GRU from `model files/` | FastAPI, PyTorch |
| [docker/](docker/) | Container config (Postgres app role) | Docker |
| [model files/](model%20files/) | Trained weights, encoder code, calibration CSVs (read-only) | — |
| [doc/](doc/) | Architecture and project docs | — |

```
client-cockpit ─┐                            ┌──► PostgreSQL (RLS)
                ├─► bff (Fastify) ──► server ─┤
client-pulse  ──┘        │                    └──► agent (FastAPI + PyTorch)
                         └──► Redis (cache)
```

See [doc/architecture.md](doc/architecture.md) for details.

## Quick start: everything in Docker

```bash
cp .env.example .env      # optional, all values have dev defaults
docker compose up -d --build
```

Startup order is automatic: `postgres` → `migrate` (applies `server/migrations`) → `server`; `agent` loads the models;
`seed` (idempotent) waits for healthy models and fills the demo data through the real inference pipeline (~30 s on a
fresh database), then exits. Re-running `up` never duplicates data.

| Service | URL |
| --- | --- |
| Cockpit | http://localhost:8080 |
| Pulse | http://localhost:8081 |
| BFF | http://localhost:4000/health |
| Core API | http://localhost:3000/health |
| Inference | http://localhost:8000/api/v1/health |

## Local development: hot reload

Run Postgres and Redis in Docker, and the apps on your machine:

```bash
npm run infra:up          # postgres + redis only
npm run install:all
pip install -r agent/requirements-dev.txt

npm run dev:agent         # :8000  inference service (reads ./model files)
npm run db:migrate        # apply schema
npm run db:seed           # demo data (needs the agent running); `npm run db:reseed` regenerates seed telemetry only
npm run dev:server        # :3000
npm run dev:bff           # :4000
npm run dev:cockpit       # :5173
npm run dev:pulse         # :5174
```

The Vite dev servers proxy `/bff/*` (and `/api/*` for Pulse) to `localhost:4000`.

## Tests

Choose **Health assistant** in either client to review observations and proposed follow-up actions. **Mission tools** contains the guide, imports, tasks, journal, sync queue and activity. Local mode works without cloud credentials; optional Meta calls require saved consent. See the [assistant reference](doc/AGENT-DELIVERY.md), [interface guide](doc/UI-DELIVERY.md), and [evaluation reports](doc/evaluation/README.md).

Cockpit's **Behavioral** page includes confirmed mood check-ins, recorded mood/sleep history, owner-controlled journal sharing and the wellbeing assistant. Crew accounts can open **Behavioral health** above their own health workspace. See the [behavioral health guide](doc/BEHAVIORAL-DELIVERY.md) for behavior and privacy details.

Run the isolated platform verification with `npm run test:platform` after installing Chromium using `npx playwright install chromium`. See the [verification guide](doc/SOFTWARE-DELIVERY.md) and [dated test report](doc/TEST-REPORT-2026-11-12.md) for coverage and recorded results.

```bash
npm run test:server       # core API unit tests
npm run test:agent        # inference tests on the real weights + CSVs (incl. the docs' reference cases)
npm run test:e2e          # end-to-end through the BFF against a running, seeded stack (BFF_URL, default :4000)
```

## Resetting the database

Schema changes are migrations (`npm run db:migrate`, also run by the `migrate` service on every `up`).
To start from an empty database (**deletes all data**):

```bash
docker compose down -v && docker compose up -d --build
```
