# Machine Proof Runtime Input Contract

Generated from the latest machine-proof remediation and evidence files on 2026-05-22.

Human-observed proof, manual approval, operator acknowledgement, and checklist-only evidence are not accepted production certification dependencies. If a machine input is unavailable, the owning proof must fail closed with `status: fail`, `certifying: false`, `missingRuntimeInputs`, and `humanInteractionRequired: false`.

## Runtime Inputs

| Input | Required by | Blocker | Secret | Source | Auto-resolved | Resolved | Mutation | Production certification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `CRP_RESTORE_MACHINE_ATTESTATION_JSON` | `pnpm run restore:machine-proof` | L10-P1-002 | No | file/env path | No | No | No | Yes, when certifying |
| `CRP_RESTORE_MACHINE_BACKUP_SOURCE` | `pnpm run restore:machine-proof` | L10-P1-002 | No | file field | No | No | No | Yes, when certifying |
| `CRP_RESTORE_MACHINE_ISOLATED_TARGET` | `pnpm run restore:machine-proof` | L10-P1-002 | No | file field | No | No | No | Yes, when certifying |
| `CRP_RESTORE_MACHINE_SAFE_FIXTURE` | `pnpm run restore:machine-proof` | L10-P1-002 | No | file field | No | No | No | Yes, when certifying |
| `CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON` | `pnpm run production-worker:machine-proof` | L10-P1-003 | No | file/env path | No | No | Synthetic canary only | Yes, when certifying |
| `CRP_PRODUCTION_WORKER_QUEUE_ACCESS` | `pnpm run production-worker:machine-proof` | L10-P1-003 | No | file field | No | No | Synthetic canary only | Yes, when certifying |
| `CRP_PRODUCTION_WORKER_LIVENESS_ACCESS` | `pnpm run production-worker:machine-proof` | L10-P1-003 | No | file field | No | No | No | Yes, when certifying |
| `CRP_PRODUCTION_WORKER_CANARY_JOB_ACCESS` | `pnpm run production-worker:machine-proof` | L10-P1-003 | No | file field | No | No | Synthetic canary only; cleanup required | Yes, when certifying |
| `CRP_PRODUCTION_WORKER_STOP_ROLLBACK_ACCESS` | `pnpm run production-worker:machine-proof` | L10-P1-003 | No | file field | No | No | No | Yes, when certifying |
| `CRP_RAW_REPORT_DATABASE_ACCESS` | `pnpm run storage:raw-report-machine-proof` | L10-P1-004 | Yes | env | Yes | Yes, from existing `FLOOT_DATABASE_URL` source name only | No | Yes, only with reliable sanitized inventory |
| `CRP_RAW_REPORT_MACHINE_INVENTORY_ATTESTATION_JSON` | `pnpm run storage:raw-report-machine-inventory` | L10-P1-004 | No | file/env path | No | No | No | Yes, when certifying |
| `CRP_RAW_REPORT_MACHINE_REMEDIATION_ATTESTATION_JSON` | `pnpm run storage:raw-report-machine-proof` | L10-P1-004 | No | file/env path | No | No | No | Yes, when certifying |
| `CRP_ALERTING_MACHINE_ATTESTATION_JSON` | `pnpm run alerts:machine-proof` | L10-P1-005 | No | file/env path | No | No | No | Yes, with live proof or machine-valid policy exclusion |
| `CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON` | `pnpm run retention:archive-restore-machine-proof` | Retention archive/restore | No | file/env path | No | No | Synthetic canary only; cleanup required | Yes, when certifying |
| `CRP_RETENTION_ARCHIVE_RESTORE_ARCHIVE_ACCESS` | `pnpm run retention:archive-restore-machine-proof` | Retention archive/restore | No | file field | No | No | Synthetic canary only; cleanup required | Yes, when certifying |
| `CRP_RETENTION_ARCHIVE_RESTORE_ISOLATED_TARGET` | `pnpm run retention:archive-restore-machine-proof` | Retention archive/restore | No | file field | No | No | Synthetic canary only; cleanup required | Yes, when certifying |
| `CRP_RETENTION_ARCHIVE_RESTORE_SAFE_CANDIDATE` | `pnpm run retention:archive-restore-machine-proof` | Retention archive/restore | No | file field | No | No | Synthetic canary only; cleanup required | Yes, when certifying |

## Raw Report DB Resolution

`pnpm run storage:raw-report-machine-proof` attempts to resolve read-only DB connectivity from existing non-interactive repo/runtime conventions only:

- `FLOOT_DATABASE_URL`
- `DATABASE_URL`
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `CRP_DATABASE_URL`
- `VITE_DATABASE_URL`
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

The proof must never print those values. If DB connectivity is missing or unreliable and no sanitized attestation path is supplied, the proof writes non-certifying evidence with:

- `status: fail`
- `certifying: false`
- `missingRuntimeInputs: ["CRP_RAW_REPORT_DATABASE_ACCESS", "CRP_RAW_REPORT_MACHINE_REMEDIATION_ATTESTATION_JSON"]`
- `humanInteractionRequired: false`

## Safety Constraints

- Staging-safe proof cannot substitute for production proof unless the owning policy explicitly permits it.
- Production mutation is allowed only for scripts that create, verify, and clean up bounded synthetic/canary records.
- Secrets, DB URLs, service credentials, webhook URLs, signed URLs, raw credit report text, raw report bytes, full account numbers, and PII must not appear in evidence.
- Simulated-only, dry-run-only, checklist-only, human-observed, manual approval, or operator-acknowledged evidence cannot certify production-at-scale.
