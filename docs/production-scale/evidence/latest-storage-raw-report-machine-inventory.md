# Raw Report Byte Machine Inventory

Generated at: 2026-05-22T11:50:33.456Z
Evidence type: RAW_REPORT_BYTE_MACHINE_INVENTORY
Environment: production
Commit: `79af5282d400136dd75aa3d9d952799a37b92d32`
Generator: `scripts/storage-raw-report-machine-inventory.mjs`
Command: `pnpm run storage:raw-report-machine-inventory`
Status: fail
CERTIFYING:false
Expires at: 2026-05-23T11:50:33.456Z

## Safety

- Non-interactive: yes
- Machine-attested: yes
- Human interaction required: no
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
