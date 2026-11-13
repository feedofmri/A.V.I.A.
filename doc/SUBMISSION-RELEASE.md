# Final submission snapshot

Prepared for submission on 13 November 2026 (Asia/Dhaka) in `feedofmri/A.V.I.A.`, branch `codex/submission-final`.

This branch contains the current A.V.I.A. software: Cockpit, Pulse, core API, BFF, local inference, supplied model/reference artifacts, database migrations, offline queue, assistant roles, Behavioral Health, responsive themes, grouped navigation, automated tests and submission documentation. Required YouTube and NASA project-page links remain for the team to provide.

The release files were verified with SHA-256 checksums before release documentation updates. Local environment files, dependencies, build output, private generated state, database backups and credentials are excluded. Demo credentials and development defaults are documented examples, not production secrets.

The earlier full platform run passed 139 tests, including 22 browser workflows, builds and backup/restore verification. The subsequent menu reordering passed four focused browser checks and a production build. These records retain their actual dates; they are not represented as new runs on this release date. New-checkout validation is recorded separately below when completed.

Five supplied pretrained checkpoints and existing work remain attributed in the model card and submission documentation. Dataset derivation, licensing and clinical-validation limits remain disclosed. This snapshot does not assert that all code or models were created during an event window. Git commit dates are generated normally, and the repository's existing history is preserved.

New-checkout verification completed on 13 November 2026: clean dependency installation for all five npm packages, all four production builds, 40 server unit tests and 4 CSV unit tests passed. The dependency installations reported zero known npm vulnerabilities. No fresh full-platform or hosted CI result is claimed for this snapshot.
