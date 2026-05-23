# Migration Governance Machine Proof

Generated at: 2026-05-23T03:55:01.249Z
Evidence type: MIGRATION_GOVERNANCE_MACHINE_PROOF
Environment: production
Commit: `40fd438dd95a1afeee4b6d3a471b5769a44db513`
Generator: `scripts/migration-machine-proof.mjs`
Command: `pnpm run migrations:machine-proof`
Blocker ID: L10-P1-006
Branch: `staging`
Policy version: production-machine-proof-policy-2026-05-22
Status: pass
CERTIFYING:true
Expires at: 2026-05-24T03:55:01.249Z

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

- [pass] migration-gate-certifying: Migration release gate is CERTIFYING:true and accepted.
- [pass] no-temporary-unresolved-allowlist: No active temporary runtime ensure allowlist residuals remain.
- [pass] no-expired-allowlist: No expired temporary allowlist residuals are present.
- [pass] no-temporary-allowlist-certification-basis: Migration gate does not use accepted-temporary-allowlist as a certification basis.
- [pass] residual-statuses-classified: Every migration residual has an exact machine-governed classification.
- [pass] migration-ledger-status-present: Every certifying migration residual has ledger status and ledger entry evidence.
- [pass] no-release-blocking-findings: No release-blocking migration governance findings remain.
- [pass] non-mutating-gate: Migration proof is static, non-mutating, and does not require database access.

## Failures

- None.

## Missing Runtime Inputs

- None.

## Sanitized Artifacts

- docs/production-scale/evidence/latest-migration-gate.json
