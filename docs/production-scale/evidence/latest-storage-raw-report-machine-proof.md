# Raw Report Byte Remediation Machine Proof

Generated at: 2026-05-22T05:46:49.479Z
Evidence type: RAW_REPORT_BYTE_REMEDIATION_MACHINE_PROOF
Environment: production
Commit: `2026701883302c9a80851158313669e015a3465f`
Generator: `scripts/storage-raw-report-machine-remediation-proof.mjs`
Command: `pnpm run storage:raw-report-machine-remediation-proof`
Status: fail
CERTIFYING:false
Expires at: 2026-05-23T05:46:49.479Z

## Safety

- Non-interactive: yes
- Machine-attested: yes
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
