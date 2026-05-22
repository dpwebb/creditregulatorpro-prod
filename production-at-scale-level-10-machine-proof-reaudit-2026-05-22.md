# Production At Scale Level 10 Machine-Proof Re-Audit - 2026-05-22

## Executive Summary

Overall status: FAIL.

Human-observed/manual production evidence is no longer an accepted certification dependency in the production-at-scale path. The current system now requires non-interactive, machine-attested, sanitized proof gates. That is the correct direction, but the evidence does not support production promotion.

Production promotion is NOT SAFE because `pnpm run production-scale:certify` exits `CERTIFYING:false`, `pnpm run production-scale:promotion-pack` writes `CERTIFYING:false`, and the latest machine proof summary has `allMachineProofsCertifying:false`.

Staging promotion remains SAFE WITH LIMITATIONS for bounded validation because the canonical repo check, build, typecheck, golden path, deterministic ingestion report, and staging-safe auth smokes passed. The raw all-at-once Vitest command still fails queue tests under concurrent execution, while the canonical `pnpm run check` path passes by isolating those suites.

## Status

- Machine proof architecture: INCOMPLETE
- Human interaction required: NO
- CERTIFYING: FALSE
- Production promotion: NOT SAFE
- Staging promotion: SAFE WITH LIMITATIONS
- Audited commit: `b0c8de12b0d85ef47789ad35c7182ff1b6db4ca7`
- Source audit: `production-at-scale-level-10-audit-2026-05-22.md`
- JSON source audit: `production-at-scale-level-10-audit-2026-05-22.json`

## Counts

Original Level 10 audit counts:

- P0: 0
- P1: 6
- P2: 9
- P3: 3

Current re-audit counts:

- P0: 0
- P1: 5
- P2: 10
- P3: 3

The P1 migration governance blocker is now certifying through machine proof. The current P2 count includes the missing `storage:raw-report-machine-proof` package alias and the raw all-at-once Vitest queue isolation failure.

## Machine Proof Results

| Area | Blocker | Certifying | Result |
| --- | --- | --- | --- |
| Restore / disaster recovery | L10-P1-002 | false | Missing restore machine attestation, backup source, isolated target, and safe fixture inputs |
| Production ingest worker runtime | L10-P1-003 | false | Missing worker attestation, queue access, liveness access, canary job access, and stop/rollback access |
| Raw report byte remediation | L10-P1-004 | false | Missing remediation attestation; requested `storage:raw-report-machine-proof` script is not defined |
| Alerting and observability | L10-P1-005 | false | Missing alerting machine attestation |
| Migration governance | L10-P1-006 | true | Machine proof certifies |
| Retention archive/restore | retention-archive-restore | false | Missing retention machine attestation, archive access, isolated target, and safe candidate inputs |
| Promotion pack guard | L10-P1-001 | false | Promotion pack remains non-certifying because required machine proofs are not certifying |

## Missing Non-Interactive Inputs

- `CRP_RESTORE_MACHINE_ATTESTATION_JSON`
- `CRP_RESTORE_MACHINE_BACKUP_SOURCE`
- `CRP_RESTORE_MACHINE_ISOLATED_TARGET`
- `CRP_RESTORE_MACHINE_SAFE_FIXTURE`
- `CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON`
- `CRP_PRODUCTION_WORKER_QUEUE_ACCESS`
- `CRP_PRODUCTION_WORKER_LIVENESS_ACCESS`
- `CRP_PRODUCTION_WORKER_CANARY_JOB_ACCESS`
- `CRP_PRODUCTION_WORKER_STOP_ROLLBACK_ACCESS`
- `CRP_RAW_REPORT_MACHINE_REMEDIATION_ATTESTATION_JSON`
- `CRP_ALERTING_MACHINE_ATTESTATION_JSON`
- `CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON`
- `CRP_RETENTION_ARCHIVE_RESTORE_ARCHIVE_ACCESS`
- `CRP_RETENTION_ARCHIVE_RESTORE_ISOLATED_TARGET`
- `CRP_RETENTION_ARCHIVE_RESTORE_SAFE_CANDIDATE`

No blocker should be converted back to human-observed evidence. These are machine runtime inputs only.

## Commands Run

| Command | Result |
| --- | --- |
| `git status --short --branch` | Passed; clean before evidence refresh, then dirty with refreshed evidence |
| `git diff --check` | Passed |
| `pnpm install --frozen-lockfile` | Passed |
| `pnpm run typecheck` | Passed |
| `pnpm run build` | Passed |
| `pnpm run check` | Passed |
| `pnpm exec vitest run --config vitest.config.ts` | Failed; three queue tests fail when run in one concurrent full-suite invocation |
| `pnpm run test:golden-path` | Passed |
| `pnpm run test:deterministic-ingestion-report` | Passed |
| `pnpm run production:machine-proofs` | Failed closed; `allMachineProofsCertifying:false` |
| `pnpm run restore:machine-proof` | Failed closed; missing restore runtime inputs |
| `pnpm run production-worker:machine-proof` | Failed closed; missing worker runtime inputs |
| `pnpm run storage:raw-report-machine-proof` | Failed; package script missing |
| `pnpm run alerts:machine-proof` | Failed closed; missing alerting runtime input |
| `pnpm run migrations:machine-proof` | Passed; `CERTIFYING:true` |
| `pnpm run retention:archive-restore-machine-proof` | Failed closed; missing retention runtime inputs |
| `pnpm run production-scale:evidence` | Passed |
| `pnpm run production-scale:certify` | Failed closed; `CERTIFYING:false` |
| `pnpm run production-scale:promotion-pack` | Passed command execution; generated pack is `CERTIFYING:false` |
| `pnpm run production:readiness -- --json` | Passed; status `review_required` |

## Evidence Files Generated Or Refreshed

- `docs/production-scale/evidence/latest-machine-proof-summary.json`
- `docs/production-scale/evidence/latest-machine-proof-summary.md`
- `docs/production-scale/evidence/latest-restore-machine-proof.json`
- `docs/production-scale/evidence/latest-restore-machine-proof.md`
- `docs/production-scale/evidence/latest-production-worker-machine-proof.json`
- `docs/production-scale/evidence/latest-production-worker-machine-proof.md`
- `docs/production-scale/evidence/latest-storage-raw-report-machine-proof.json`
- `docs/production-scale/evidence/latest-storage-raw-report-machine-proof.md`
- `docs/production-scale/evidence/latest-alerting-machine-proof.json`
- `docs/production-scale/evidence/latest-alerting-machine-proof.md`
- `docs/production-scale/evidence/latest-migration-machine-proof.json`
- `docs/production-scale/evidence/latest-migration-machine-proof.md`
- `docs/production-scale/evidence/latest-retention-archive-restore-machine-proof.json`
- `docs/production-scale/evidence/latest-retention-archive-restore-machine-proof.md`
- `docs/production-scale/evidence/latest-production-scale-evidence.json`
- `docs/production-scale/evidence/latest-production-scale-evidence.md`
- `docs/production-scale/evidence/latest-production-scale-certification.json`
- `docs/production-scale/evidence/latest-production-scale-certification.md`
- `docs/production-scale/evidence/latest-certification-harness-fix.json`
- `docs/production-scale/evidence/latest-certification-harness-fix.md`
- `docs/production-scale/evidence/latest-production-promotion-pack.json`
- `docs/production-scale/evidence/latest-production-promotion-pack.md`

## Remaining Blockers

- L10-P1-001: Production promotion pack remains non-certifying.
- L10-P1-002: Disaster recovery / restore machine proof is non-certifying because runtime inputs are missing.
- L10-P1-003: Production ingest worker runtime machine proof is non-certifying because runtime inputs are missing.
- L10-P1-004: Raw report byte remediation machine proof is non-certifying because runtime attestation is missing; requested `storage:raw-report-machine-proof` package alias is also missing.
- L10-P1-005: Alerting and observability machine proof is non-certifying because runtime attestation is missing.
- retention-archive-restore: Retention archive/restore proof is non-certifying because runtime inputs are missing.
- P2: Raw full-suite `pnpm exec vitest run --config vitest.config.ts` fails when queue suites run concurrently, although `pnpm run check` passes via isolated queue suites.

## Recommendation

Do not promote production.

Next action: provide the missing non-interactive machine runtime inputs, add the missing `storage:raw-report-machine-proof` package alias or rename the command contract, then rerun the full Level 10 command set. Production remains blocked until both `pnpm run production-scale:certify` and `pnpm run production-scale:promotion-pack` are certifying true.
