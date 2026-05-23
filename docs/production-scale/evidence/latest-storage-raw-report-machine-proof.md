# Raw Report Byte Remediation Machine Proof

Generated at: 2026-05-23T01:24:39.891Z
Evidence type: RAW_REPORT_BYTE_REMEDIATION_MACHINE_PROOF
Environment: production
Commit: `d2fed22eb7e1c25d2304aee918336994aacd31cc`
Generator: `scripts/storage-raw-report-machine-proof.mjs`
Command: `pnpm run storage:raw-report-machine-proof`
Blocker ID: L10-P1-004
Branch: `staging`
Policy version: production-machine-proof-policy-2026-05-22
Status: pass
CERTIFYING:true
Expires at: 2026-05-24T01:24:39.891Z

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
