# Raw Report Byte Remediation Machine Proof

Generated at: 2026-05-23T01:55:56.467Z
Evidence type: RAW_REPORT_BYTE_REMEDIATION_MACHINE_PROOF
Environment: production
Commit: `c086dd1e846598870719cbd16be08bf2bb68050d`
Generator: `scripts/storage-raw-report-machine-proof.mjs`
Command: `pnpm run storage:raw-report-machine-proof`
Blocker ID: L10-P1-004
Branch: `staging`
Policy version: production-machine-proof-policy-2026-05-22
Status: pass
CERTIFYING:true
Expires at: 2026-05-24T01:55:56.467Z

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

- [pass] db-connectivity-reliable: Machine attestation check passed.
- [pass] sanitized-inventory-accepted: Machine attestation check passed.
- [pass] remediation-policy-verified: Machine attestation check passed.
- [pass] unresolved-count-zero-or-policy-accepted: Machine attestation check passed.
- [pass] remediated-count-recorded: Machine attestation check passed.
- [pass] opaque-hashes-only: Machine attestation check passed.
- [pass] no-raw-bytes-or-pii-printed: Machine attestation check passed.
- [pass] rollback-recovery-notes-recorded: Machine attestation check passed.

## Failures

- None.

## Missing Runtime Inputs

- None.

## Sanitized Artifacts

- docs/production-scale/evidence/latest-storage-raw-report-machine-proof.json
