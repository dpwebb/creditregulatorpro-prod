# Migration Governance Machine Proof

Generated at: 2026-05-22T16:04:47.474Z
Evidence type: MIGRATION_GOVERNANCE_MACHINE_PROOF
Environment: production
Commit: `23e393bf7d93fa843bae16f311b19dddf635ebb1`
Generator: `scripts/migration-machine-proof.mjs`
Command: `pnpm run migrations:machine-proof`
Blocker ID: L10-P1-006
Branch: `staging`
Policy version: production-machine-proof-policy-2026-05-22
Status: fail
CERTIFYING:false
Expires at: 2026-05-23T16:04:47.474Z

## Safety

- Non-interactive: yes
- Machine-attested: yes
- Human interaction required: no
- Human observed: no
- Manual approval required: no
- Dry-run only: no
- Production mutation: none
- Secrets printed: no
- PII printed: no
- Raw report bytes printed: no
- Signed URLs printed: no

## Checks

- [fail] migration-gate-certifying: Migration release gate is CERTIFYING:true and accepted.
- [fail] no-temporary-unresolved-allowlist: No active temporary runtime ensure allowlist residuals remain.
- [pass] no-expired-allowlist: No expired temporary allowlist residuals are present.
- [fail] no-release-blocking-findings: No release-blocking migration governance findings remain.
- [pass] non-mutating-gate: Migration proof is static, non-mutating, and does not require database access.

## Failures

- migration-gate-certifying: Migration release gate is CERTIFYING:true and accepted.
- no-temporary-unresolved-allowlist: No active temporary runtime ensure allowlist residuals remain.
- no-release-blocking-findings: No release-blocking migration governance findings remain.

## Missing Runtime Inputs

- None.

## Sanitized Artifacts

- docs/production-scale/evidence/latest-migration-gate.json
