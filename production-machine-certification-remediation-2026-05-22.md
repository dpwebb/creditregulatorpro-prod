# Production Machine Certification Remediation - 2026-05-22

## Result

`CERTIFYING:false` remains correct.

The repo now has non-interactive, sanitized, machine-attested evidence gates for the production-at-scale blockers that previously depended on human-observed proof. The gates fail closed and do not mark simulated, stale, missing, manual, or sensitive evidence as production proof.

Production promotion recommendation: **do not promote production**.

## Current Open Blockers

| Blocker | Status | Machine attested | Simulated only | Remaining machine input |
| --- | --- | --- | --- | --- |
| L10-P1-001 Production promotion pack | Open | Yes | No | All required machine proofs must certify |
| L10-P1-002 Disaster recovery restore | Open | Yes | No | `CRP_RESTORE_MACHINE_ATTESTATION_JSON` |
| L10-P1-003 Production ingest runtime | Open | Yes | No | `CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON` |
| L10-P1-004 Historical raw report bytes | Open | Yes | No | `CRP_RAW_REPORT_MACHINE_INVENTORY_ATTESTATION_JSON`, `CRP_RAW_REPORT_MACHINE_REMEDIATION_ATTESTATION_JSON` |
| L10-P1-005 Observability/alerting | Open | Yes | No | `CRP_ALERTING_MACHINE_ATTESTATION_JSON` |
| L10-P1-006 Migration governance | Open | Yes | No | Resolve 12 release-blocking temporary allowlist residuals |
| Retention archive/restore | Open | Yes | No | `CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON` |

No blocker was closed by assertion or fabricated evidence.

## What Changed

- Added a shared machine evidence schema, sanitizer, and validator.
- Added fail-closed machine proof commands for restore, production worker runtime, raw report inventory/remediation, alerting, migration governance, and retention archive/restore.
- Integrated the machine proof gates into `production-scale:certify`, `production-scale:evidence`, and `production-scale:promotion-pack`.
- Updated the promotion pack to classify converted blockers as `machine proof required`, not human proof required.
- Kept staging auth smokes labeled as staging proof, not production runtime proof.
- Preserved promotion refusal when the latest promotion pack is not `CERTIFYING:true`.

## Evidence Generated

- `docs/production-scale/evidence/latest-restore-machine-proof.json`
- `docs/production-scale/evidence/latest-production-worker-machine-proof.json`
- `docs/production-scale/evidence/latest-storage-raw-report-machine-inventory.json`
- `docs/production-scale/evidence/latest-storage-raw-report-machine-proof.json`
- `docs/production-scale/evidence/latest-alerting-machine-proof.json`
- `docs/production-scale/evidence/latest-migration-machine-proof.json`
- `docs/production-scale/evidence/latest-retention-archive-restore-machine-proof.json`
- `docs/production-scale/evidence/latest-production-scale-evidence.json`
- `docs/production-scale/evidence/latest-production-scale-certification.json`
- `docs/production-scale/evidence/latest-production-promotion-pack.json`

All new machine proof artifacts are sanitized fail-closed evidence in this environment because required machine inputs or migration ledger closure are not present.

## Verification

Passed:

- `git diff --check`
- `pnpm install --frozen-lockfile`
- `pnpm run typecheck`
- `pnpm run build`
- `pnpm run check`
- `pnpm exec vitest run --config vitest.config.ts tests/unit/machine-evidence-schema.spec.ts tests/unit/machine-proof-scripts.spec.ts tests/unit/production-promotion-pack.spec.ts tests/unit/production-scale-certification.spec.ts`
- `pnpm run production-scale:evidence`
- `pnpm run production-scale:promotion-pack`
- `pnpm run production:readiness -- --json`

Accurate fail-closed:

- `pnpm run production-scale:certify`
- `pnpm run restore:machine-proof`
- `pnpm run production-worker:machine-proof`
- `pnpm run storage:raw-report-machine-inventory`
- `pnpm run storage:raw-report-machine-remediation-proof`
- `pnpm run alerting:machine-proof`
- `pnpm run migrations:machine-proof`
- `pnpm run retention:archive-restore-machine-proof`

Not clean:

- `pnpm exec vitest run --config vitest.config.ts`

The full Vitest command was attempted. One run had a response queue test failure that passed in isolation; another run passed test files but reported an intermittent Vitest worker process error. The repo's canonical `pnpm run check` passed.

## Files Changed

- `package.json`
- `scripts/lib/productionEvidenceSchema.mjs`
- `scripts/lib/sanitizeProductionEvidence.mjs`
- `scripts/lib/validateMachineEvidence.mjs`
- `scripts/lib/machineProofScript.mjs`
- `scripts/restore-machine-proof.mjs`
- `scripts/production-worker-machine-proof.mjs`
- `scripts/storage-raw-report-machine-inventory.mjs`
- `scripts/storage-raw-report-machine-remediation-proof.mjs`
- `scripts/alerting-machine-proof.mjs`
- `scripts/migration-machine-proof.mjs`
- `scripts/retention-archive-restore-machine-proof.mjs`
- `scripts/production-promotion-pack.mjs`
- `scripts/production-scale-certification.mjs`
- `scripts/production-scale-evidence.mjs`
- `tests/unit/machine-evidence-schema.spec.ts`
- `tests/unit/machine-proof-scripts.spec.ts`
- `tests/unit/production-promotion-pack.spec.ts`
- `tests/unit/production-scale-certification.spec.ts`
- `tests/unit/production-worker-runtime-proof.spec.ts`
- `tests/unit/restore-evidence-acceptance.spec.ts`

## Recommendation

Keep production promotion blocked. Provide the missing machine attestation JSON inputs from safe non-interactive proof systems and resolve the migration allowlist residuals, then rerun `pnpm run production-scale:certify` and `pnpm run production-scale:promotion-pack`.
