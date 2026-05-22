# Raw Report Byte Machine Inventory

Generated at: 2026-05-22T05:07:27.838Z
Evidence type: RAW_REPORT_BYTE_MACHINE_INVENTORY
Environment: production
Commit: `2026701883302c9a80851158313669e015a3465f`
Generator: `scripts/storage-raw-report-machine-inventory.mjs`
Command: `pnpm run storage:raw-report-machine-inventory`
Status: fail
CERTIFYING:false
Expires at: 2026-05-23T05:07:27.838Z

## Safety

- Non-interactive: yes
- Machine-attested: yes
- Production mutation: none
- Secrets printed: no
- PII printed: no
- Raw report bytes printed: no
- Signed URLs printed: no

## Checks

- [fail] db-connectivity-reliable: Machine attestation check missing or failed.
- [fail] read-only-aggregate-counts-collected: Machine attestation check missing or failed.
- [fail] opaque-hashes-only: Machine attestation check missing or failed.
- [fail] unresolved-count-recorded: Machine attestation check missing or failed.
- [fail] remediation-candidate-count-recorded: Machine attestation check missing or failed.
- [fail] no-raw-bytes-or-pii-printed: Machine attestation check missing or failed.

## Failures

- attestation-unavailable: machine attestation path was not provided.

## Missing Runtime Inputs

- CRP_RAW_REPORT_MACHINE_INVENTORY_ATTESTATION_JSON

## Sanitized Artifacts

- None.
