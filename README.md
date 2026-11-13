# A.V.I.A. — Autonomous Vital Intelligence Agent

Software-only crew health monitoring demonstration for NASA Space Apps 2026. Forms, CSV uploads, and labeled scenarios feed the existing local model weights. No hardware connection or model training is required.

Final submission repository: [feedofmri/A.V.I.A.](https://github.com/feedofmri/A.V.I.A.), branch `codex/submission-final`. See [submission release notes](doc/SUBMISSION-RELEASE.md) for the release contents and validation scope.

See [software delivery and all 24 completed items](doc/SOFTWARE-DELIVERY.md), [model limitations](agent/MODEL-CARD.md), and [platform test instructions](doc/SOFTWARE-DELIVERY.md#verification-commands). The earlier [audit](doc/AUDIT-2026-11-12.md) describes the pre-implementation state.

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

The ten-role assistant and the combined 27-item delivery are documented in [Agent delivery](doc/AGENT-DELIVERY.md). Choose **Health assistant** in either client; **Mission tools** contains the guide, imports, tasks, journal, queue and activity. See [UI delivery](doc/UI-DELIVERY.md) for the responsive interface update. Local mode works without cloud credentials; optional Meta calls require saved consent. Evaluation and submission materials are in [doc/evaluation](doc/evaluation/README.md) and [doc/submission](doc/submission/PROJECT.md).

Cockpit's **Behavioral** page includes confirmed mood check-ins, recorded mood/sleep history, owner-controlled journal sharing and the wellbeing assistant. Crew accounts can open **Behavioral health** above their own health workspace. See [Behavioral Health delivery](doc/BEHAVIORAL-DELIVERY.md) for behavior and privacy details.

Run the complete isolated platform verification with `npm run test:platform` after installing Chromium using `npx playwright install chromium`. See the [24-item delivery checklist](doc/SOFTWARE-DELIVERY.md) and [verified test results](doc/TEST-REPORT-2026-11-12.md).

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
