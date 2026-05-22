# Machine Proof Runtime Input Remediation

Generated: 2026-05-22T19:18:00.000Z

Commit at report generation: `9806da4014e26ea9ab3c6311e692287a398f8f37`

## Outcome

- `storage:raw-report-machine-proof` alias: added.
- Raw report machine proof: certifying true.
- Machine proofs overall: certifying false.
- Production-scale certification: certifying false.
- Promotion pack: certifying false.
- Human interaction required: no.
- Production promotion: not safe.

## Raw Report Proof

The raw-report proof now runs through `pnpm run storage:raw-report-machine-proof` and resolves read-only DB access from the existing `FLOOT_DATABASE_URL` source name without printing or storing the value.

- DB connectivity: reliable.
- Records inspected: 231.
- Unresolved raw byte count: 0.
- Remediated count: 5.
- Production mutation: none.
- Sensitive output printed: no.

## Runtime Inputs

Auto-resolved:

- `CRP_RAW_REPORT_DATABASE_ACCESS` from the existing `FLOOT_DATABASE_URL` env source name only. The value was not printed or stored.

Still missing:

- `CRP_RESTORE_MACHINE_ATTESTATION_JSON`
- `CRP_RESTORE_MACHINE_BACKUP_SOURCE`
- `CRP_RESTORE_MACHINE_ISOLATED_TARGET`
- `CRP_RESTORE_MACHINE_SAFE_FIXTURE`
- `CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON`
- `CRP_PRODUCTION_WORKER_QUEUE_ACCESS`
- `CRP_PRODUCTION_WORKER_LIVENESS_ACCESS`
- `CRP_PRODUCTION_WORKER_CANARY_JOB_ACCESS`
- `CRP_PRODUCTION_WORKER_STOP_ROLLBACK_ACCESS`
- `CRP_ALERTING_MACHINE_ATTESTATION_JSON`
- `CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON`
- `CRP_RETENTION_ARCHIVE_RESTORE_ARCHIVE_ACCESS`
- `CRP_RETENTION_ARCHIVE_RESTORE_ISOLATED_TARGET`
- `CRP_RETENTION_ARCHIVE_RESTORE_SAFE_CANDIDATE`

## Commands

Passed:

- `git diff --check`
- `pnpm install --frozen-lockfile`
- `pnpm run typecheck`
- `pnpm run build`
- `pnpm run check`
- `pnpm run storage:raw-report-machine-proof`
- `pnpm run storage:raw-report-machine-proof:validate`
- `pnpm run production-scale:evidence`
- `pnpm run production-scale:promotion-pack` (generated non-certifying pack)
- `pnpm run production:readiness -- --json` (review required)

Failed as expected fail-closed production blockers:

- `pnpm run production:machine-proofs`
- `pnpm run production-scale:certify`

Failed due existing full-suite concurrency issue:

- `pnpm exec vitest run --config vitest.config.ts`
  - `tests/api/response-processing-queue.spec.ts`: expected retry failure but received idle.
  - `tests/api/response-worker-orchestration.spec.ts`: expected dry-run preview but received idle.
  - `pnpm run check` isolates these queue suites and passed.

## Recommendation

Do not promote production. Add the remaining non-interactive restore, worker, alerting, and retention machine inputs, then rerun the Level 10 command set.
