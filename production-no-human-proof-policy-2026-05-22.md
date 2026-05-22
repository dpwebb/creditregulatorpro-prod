# Production No-Human-Proof Policy

Generated at: 2026-05-22T13:50:25.031Z

## Result

- `CERTIFYING`: false
- `canPromoteProductionAtScale`: false
- Human interaction required: false
- Human-observed evidence accepted for production certification: false
- Manual approval or operator acknowledgement accepted for production certification: false
- Checklist-only proof accepted for production certification: false

Production promotion remains blocked, but not because of a human-proof requirement. It is blocked because required non-interactive machine proof inputs are missing or a machine proof remains non-certifying.

## Policy Implemented

Production certification now requires evidence that is:

- machine-attested
- non-interactive
- sanitized
- fresh
- reproducible
- tied to commit, branch, generator script, command, blocker ID, and policy version

The shared policy/schema files are:

- `scripts/lib/productionMachineProofPolicy.mjs`
- `scripts/lib/productionMachineProofSchema.mjs`
- `scripts/lib/productionMachineProofSanitizer.mjs`
- `scripts/lib/productionMachineProofValidator.mjs`

The validators reject stale evidence, missing commit hash, missing generator script, `humanObserved:true`, `manualApprovalRequired:true`, simulated-only production proof, dry-run-only production runtime proof, secret-like strings, signed URLs, raw report byte markers, raw credit-report text, obvious PII, non-pass status, and `certifying:false`.

## Converted Active Gates

- `scripts/production-promotion-pack.mjs`: blocker classifications now require machine proof and report no `humanRequiredProof` entries.
- `scripts/production-promotion-guard.mjs`: fails closed if a certifying-looking pack contains human proof classifications, `humanInteractionRequired`, or human proof entries.
- `scripts/production-scale-evidence.mjs`: blocker summaries convert residual human-proof registry state to machine proof requirements.
- `scripts/production-scale-certification.mjs`: certification evidence reports machine proof inputs and no manual testing requirement.
- `scripts/restore-evidence-acceptance.mjs` and `scripts/staging-backup-restore-checklist.mjs`: legacy human restore evidence is rejected or non-certifying.
- `scripts/production-worker-runtime-proof.mjs`, `scripts/production-worker-readiness-evidence.mjs`, and `scripts/production-worker-activation-evidence.mjs`: operator acknowledgement was replaced with machine attestation fields.
- `scripts/response-ops-readiness-evidence.mjs`: alert live proof and formal exclusion validation now require machine-attested, non-interactive proof.
- `scripts/storage-raw-report-remediation-plan.mjs`: raw report remediation acceptance now requires machine-attested bounded remediation proof.
- `docs/production-scale/blocker-registry.json`: active blocker proof requirements now reference machine proof rather than human proof.

## Human-Proof Dependency Classification

| Dependency | Classification | Resolution |
| --- | --- | --- |
| Human-observed restore evidence | Active gate converted | Restore and retention blockers require machine proof; legacy human evidence is rejected/ignored. |
| Operator acknowledgement for worker runtime proof | Active validator converted | Worker proof requires `nonInteractive` and `machineAttested`; legacy acknowledgement fields are rejected. |
| Operator/manual alert exclusion proof | Active validator converted | Alert exclusion requires machine policy authority fields and machine attestation. |
| Operator-applied raw report remediation | Active validator converted | Remediation completion requires machine-attested bounded remediation evidence. |
| `requires-human-proof` / `humanProofRequired` registry residuals | Promotion gate converted | Residuals map to `machine proof required`; promotion pack has zero human proof entries. |
| `HUMAN_REQUIRED` dashboard wording | Report wording converted | Replaced with `MACHINE_REQUIRED`. |
| `scripts/leftover-blocker-closure-audit.mjs` | Historical audit helper only | Not wired into certification or promotion. |
| `tests/fixtures/human-restore-drill-evidence.*.md` | Test fixture | Fixtures prove legacy human evidence is rejected or non-certifying. |
| `production-at-scale-level-10-audit-2026-05-22.*` | Historical audit text only | Preserved as source audit history. |

## Still Open

| Blocker | Status | Missing machine input |
| --- | --- | --- |
| L10-P1-002 Disaster recovery | machine proof required | `CRP_RESTORE_MACHINE_ATTESTATION_JSON` |
| L10-P1-003 Production ingest runtime | machine proof required | `CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON` |
| L10-P1-004 Historical raw report bytes | machine proof required | `CRP_RAW_REPORT_MACHINE_REMEDIATION_ATTESTATION_JSON` |
| L10-P1-005 Observability/alerting | machine proof required | `CRP_ALERTING_MACHINE_ATTESTATION_JSON` |
| L10-P1-006 Migration governance | machine proof required | No runtime env input; migration machine proof is non-certifying because migration gate findings remain release-blocking. |
| Retention archive/restore proof | machine proof required | `CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON` |

## Evidence Updated

- `docs/production-scale/evidence/latest-production-scale-certification.json`
- `docs/production-scale/evidence/latest-production-scale-certification.md`
- `docs/production-scale/evidence/latest-certification-harness-fix.json`
- `docs/production-scale/evidence/latest-certification-harness-fix.md`
- `docs/production-scale/evidence/latest-production-promotion-pack.json`
- `docs/production-scale/evidence/latest-production-promotion-pack.md`
- Latest machine proof evidence files for restore, worker, raw report, alerting, migration, and retention.

## Commands Run

- `git status --short --branch`: passed
- `git diff --check`: passed
- `pnpm run typecheck`: passed
- `pnpm run build`: passed
- Focused production/machine/evidence unit slice: passed, 15 files and 197 tests
- `pnpm exec vitest run --config vitest.config.ts`: failed in unrelated all-at-once API queue job-claim tests; `pnpm run check` later passed because the repo runs those suites isolated.
- `pnpm run check`: passed
- `pnpm run production-scale:certify`: failed closed with `CERTIFYING:false`
- `pnpm run production-scale:promotion-pack`: passed and generated `CERTIFYING:false`

## Recommendation

Do not promote production. The current result is correct: production promotion remains blocked until every required machine proof certifies true and the migration machine proof becomes certifying.
