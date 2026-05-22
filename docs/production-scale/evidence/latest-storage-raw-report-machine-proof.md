# Raw Report Byte Remediation Machine Proof

Generated at: 2026-05-22T15:46:41.401Z
Evidence type: RAW_REPORT_BYTE_REMEDIATION_MACHINE_PROOF
Environment: production
Commit: `99b97e37f9326916b48161da4ac79ac762d7a026`
Generator: `scripts/storage-raw-report-machine-remediation-proof.mjs`
Command: `pnpm run storage:raw-report-machine-remediation-proof`
Blocker ID: L10-P1-004
Branch: `staging`
Policy version: production-machine-proof-policy-2026-05-22
Status: fail
CERTIFYING:false
Expires at: 2026-05-23T15:46:41.401Z

## Safety

- Non-interactive: yes
- Machine-attested: yes
- Human interaction required: no
- Human observed: no
- Manual approval required: no
- Dry-run only: no
- Production mutation: approved-bounded
- Secrets printed: no
- PII printed: no
- Raw report bytes printed: no
- Signed URLs printed: no

## Checks

- [fail] db-connectivity-reliable: Machine attestation check missing or failed.
- [fail] sanitized-inventory-accepted: Machine attestation check missing or failed.
- [fail] remediation-policy-verified: Machine attestation check missing or failed.
- [fail] unresolved-count-zero-or-policy-accepted: Machine attestation check missing or failed.
- [fail] remediated-count-recorded: Machine attestation check missing or failed.
- [fail] opaque-hashes-only: Machine attestation check missing or failed.
- [fail] no-raw-bytes-or-pii-printed: Machine attestation check missing or failed.
- [fail] rollback-recovery-notes-recorded: Machine attestation check missing or failed.

## Failures

- attestation-unavailable: machine attestation path was not provided.

## Missing Runtime Inputs

- CRP_RAW_REPORT_MACHINE_REMEDIATION_ATTESTATION_JSON

## Sanitized Artifacts

- None.
