# Migration Governance Machine Proof

Generated at: 2026-05-22T05:46:51.235Z
Evidence type: MIGRATION_GOVERNANCE_MACHINE_PROOF
Environment: production
Commit: `2026701883302c9a80851158313669e015a3465f`
Generator: `scripts/migration-machine-proof.mjs`
Command: `pnpm run migrations:machine-proof`
Status: fail
CERTIFYING:false
Expires at: 2026-05-23T05:46:51.235Z

## Safety

- Non-interactive: yes
- Machine-attested: yes
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
