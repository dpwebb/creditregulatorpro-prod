# Machine Proof Runtime Input Contract

Generated from:

- `production-machine-certification-remediation-2026-05-22.json`
- `docs/production-scale/evidence/latest-*-machine-proof.json`

This contract documents the non-interactive runtime inputs required by the machine proof gates. These inputs are not human-observed proof, do not require operator acknowledgement, and must not contain secrets, PII, raw report text, raw report bytes, signed URLs, account numbers, service credentials, or database URLs.

If an input is missing, the proof must fail closed with:

- `status: fail`
- `certifying: false`
- `CERTIFYING: false`
- `humanInteractionRequired: false`
- `missingRuntimeInputs: [...]`

## Inputs

| Input | Proof command | Secret | Supply method | Safety scope | Mutation permitted |
| --- | --- | --- | --- | --- | --- |
| `CRP_RESTORE_MACHINE_ATTESTATION_JSON` | `pnpm run restore:machine-proof` | No | Env var containing an attestation file path, or `--attestation <path>` | production-read-only | No |
| `CRP_RESTORE_MACHINE_BACKUP_SOURCE` | `pnpm run restore:machine-proof` | No | Sanitized machine attestation field for the latest configured backup | production-read-only | No |
| `CRP_RESTORE_MACHINE_ISOLATED_TARGET` | `pnpm run restore:machine-proof` | No | Sanitized machine attestation field for the isolated restore target | production-read-only | No |
| `CRP_RESTORE_MACHINE_SAFE_FIXTURE` | `pnpm run restore:machine-proof` | No | Sanitized machine attestation field for synthetic credentials and packet/PDF canary fixture | production-read-only | No |
| `CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON` | `pnpm run production-worker:machine-proof` | No | Env var containing an attestation file path, or `--attestation <path>` | production-canary | Yes, synthetic canary cleaned up only |
| `CRP_PRODUCTION_WORKER_QUEUE_ACCESS` | `pnpm run production-worker:machine-proof` | No | Sanitized machine attestation field for queue depth and aggregate counts | production-canary | Yes, synthetic canary cleaned up only |
| `CRP_PRODUCTION_WORKER_LIVENESS_ACCESS` | `pnpm run production-worker:machine-proof` | No | Sanitized machine attestation field for worker service or heartbeat status | production-read-only | No |
| `CRP_PRODUCTION_WORKER_CANARY_JOB_ACCESS` | `pnpm run production-worker:machine-proof` | No | Sanitized machine attestation field for bounded synthetic/canary ingest processing | production-canary | Yes, synthetic canary cleaned up only |
| `CRP_PRODUCTION_WORKER_STOP_ROLLBACK_ACCESS` | `pnpm run production-worker:machine-proof` | No | Sanitized machine attestation field for stop/rollback verification | production-read-only | No |
| `CRP_RAW_REPORT_MACHINE_INVENTORY_ATTESTATION_JSON` | `pnpm run storage:raw-report-machine-inventory` | No | Env var containing an attestation file path, or `--attestation <path>` | production-read-only | No |
| `CRP_RAW_REPORT_MACHINE_REMEDIATION_ATTESTATION_JSON` | `pnpm run storage:raw-report-machine-remediation-proof` | No | Env var containing an attestation file path, or `--attestation <path>` | production-read-only | No by the proof script; attested remediation policy may describe approved bounded remediation |
| `CRP_ALERTING_MACHINE_ATTESTATION_JSON` | `pnpm run alerting:machine-proof` | No | Env var containing an attestation file path, or `--attestation <path>` | production-canary | No production data mutation |
| `CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON` | `pnpm run retention:archive-restore-machine-proof` | No | Env var containing an attestation file path, or `--attestation <path>` | production-canary | Yes, synthetic canary cleaned up only |

## Safety Constraints

Every attestation input must be sanitized JSON and must include `nonInteractive:true`, `machineAttested:true`, production-safe status fields, passing checks, and no sensitive values. Generated-manual, simulated-only production proof, stale evidence, failed checks, missing commit hash, missing generator, and sensitive-looking values are rejected.

`CRP_RESTORE_MACHINE_ATTESTATION_JSON` must prove isolated restore target creation, latest backup selection, measured RPO/RTO, post-restore auth/session, packet PDF retrieval, response queue state, cleanup/lifecycle, rollback/stop verification, and isolated target destruction.

`CRP_RESTORE_MACHINE_BACKUP_SOURCE`, `CRP_RESTORE_MACHINE_ISOLATED_TARGET`, and `CRP_RESTORE_MACHINE_SAFE_FIXTURE` are not separate secrets. They name required sanitized fields inside the restore machine attestation. If any field is unavailable, the restore proof fails closed with that exact missing runtime input and `humanInteractionRequired:false`.

`CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON` must prove bounded synthetic/canary queue processing with queue depth before/after, worker liveness, processed/failed/dead-letter/stale counts, stop/rollback verification, and canary cleanup.

`CRP_PRODUCTION_WORKER_QUEUE_ACCESS`, `CRP_PRODUCTION_WORKER_LIVENESS_ACCESS`, `CRP_PRODUCTION_WORKER_CANARY_JOB_ACCESS`, and `CRP_PRODUCTION_WORKER_STOP_ROLLBACK_ACCESS` are required sanitized fields inside the worker machine attestation. Missing fields keep `CERTIFYING:false`; dry-run-only, default-off, deferred activation, human-observed, or manual approval evidence is rejected.

`CRP_RAW_REPORT_MACHINE_INVENTORY_ATTESTATION_JSON` must prove reliable DB connectivity using sanitized aggregate counts, opaque IDs or hashes, unresolved counts, remediation candidate counts, and no raw bytes or PII.

`CRP_RAW_REPORT_MACHINE_REMEDIATION_ATTESTATION_JSON` must prove reliable inventory acceptance, remediation policy verification, unresolved/remediated counts, opaque hash-only evidence, rollback/recovery notes, and no raw bytes or PII. The proof script itself must not apply remediation.

`CRP_ALERTING_MACHINE_ATTESTATION_JSON` must prove live synthetic alert delivery or a repo-policy-approved certifying formal exclusion. Any acknowledgement must be machine-verifiable; operator acknowledgement is not required. Webhook URLs and tokens must not appear.

`CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON` must prove safe archive candidate selection or creation, isolated restore target, integrity verification, lifecycle cleanup, rollback/recovery notes, and target destruction.

## Repo Config Requirement

Migration governance does not currently have a missing runtime input env var. It requires the repo migration governance ledger to have no active temporary allowlist residuals, no expired allowlist entries, and no release-blocking findings. Until then, `pnpm run migrations:machine-proof` must produce `status: fail`, `certifying:false`, and `humanInteractionRequired:false`.
