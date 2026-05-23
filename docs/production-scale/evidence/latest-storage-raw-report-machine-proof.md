# Raw Report Byte Remediation Machine Proof

Generated at: 2026-05-23T02:50:20.584Z
Evidence type: RAW_REPORT_BYTE_REMEDIATION_MACHINE_PROOF
Environment: production
Commit: `fe8231ffe2500e2c7ed7d82e1f60570b4820061c`
Generator: `scripts/storage-raw-report-machine-proof.mjs`
Command: `pnpm run storage:raw-report-machine-proof`
Blocker ID: L10-P1-004
Branch: `staging`
Policy version: production-machine-proof-policy-2026-05-22
Status: pass
CERTIFYING:true
Expires at: 2026-05-24T02:50:20.584Z

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

- [pass] db-connectivity-reliable: Database connectivity was reliable.
- [pass] sanitized-inventory-accepted: Only sanitized aggregate inventory fields were emitted.
- [pass] remediation-policy-verified: Remediation policy is satisfied.
- [pass] unresolved-count-zero-or-policy-accepted: No unresolved raw byte records were found.
- [pass] remediated-count-recorded: Remediated count was recorded.
- [pass] opaque-hashes-only: Only opaque hashes/counts were emitted.
- [pass] no-raw-bytes-or-pii-printed: No sensitive-looking raw values were detected.
- [pass] rollback-recovery-notes-recorded: Rollback/recovery notes recorded: read-only proof, no production mutation.

## Failures

- None.

## Missing Runtime Inputs

- None.

## Sanitized Artifacts

- docs/production-scale/evidence/latest-storage-raw-report-machine-proof.json
- docs/production-scale/evidence/latest-storage-raw-report-machine-proof.md
