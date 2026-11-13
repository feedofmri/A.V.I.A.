# Release notes — 13 November 2026

## Included features

A.V.I.A. includes Cockpit, Pulse, the core API, BFF, local inference, model/reference artifacts, database migrations, offline synchronization, the health assistant, behavioral health tools, responsive themes, and grouped navigation.

## Configuration and artifacts

Model artifacts have a SHA-256 integrity manifest. Local environment files, dependencies, build output, generated state, database backups, and credentials are excluded from the release. Replace the documented demo credentials and development defaults before shared use.

Five supplied pretrained checkpoints are described in the [model card](../agent/MODEL-CARD.md), including attribution, dataset derivation, licensing, and clinical-validation limitations.

## Recorded verification

The [12 November test report](TEST-REPORT-2026-11-12.md) records 139 passing tests, including 22 browser workflows, production builds, and backup/restore verification. A subsequent navigation update passed four focused browser checks and a production build.

On 13 November 2026, clean dependency installation for all five npm packages, all four production builds, 40 server unit tests, and 4 CSV unit tests passed. Dependency installation reported zero known npm vulnerabilities at that time. The full platform suite and hosted CI were not rerun for that snapshot.
