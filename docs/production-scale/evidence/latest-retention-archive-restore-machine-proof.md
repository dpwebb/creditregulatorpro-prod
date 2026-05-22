# Retention Archive Restore Machine Proof

Generated at: 2026-05-22T05:46:52.581Z
Evidence type: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF
Environment: production
Commit: `2026701883302c9a80851158313669e015a3465f`
Generator: `scripts/retention-archive-restore-machine-proof.mjs`
Command: `pnpm run retention:archive-restore-machine-proof`
Status: fail
CERTIFYING:false
Expires at: 2026-05-23T05:46:52.581Z

## Safety

- Non-interactive: yes
- Machine-attested: yes
- Production mutation: synthetic-canary-cleaned-up
- Secrets printed: no
- PII printed: no
- Raw report bytes printed: no
- Signed URLs printed: no

## Checks

- [fail] safe-archive-candidate-selected: Machine attestation check missing or failed.
- [fail] archive-created-or-selected: Machine attestation check missing or failed.
- [fail] isolated-restore-target-created: Machine attestation check missing or failed.
- [fail] archive-restore-integrity-verified: Machine attestation check missing or failed.
- [fail] no-pii-exposed: Machine attestation check missing or failed.
- [fail] lifecycle-cleanup-verified: Machine attestation check missing or failed.
- [fail] rollback-recovery-notes-recorded: Machine attestation check missing or failed.
- [fail] isolated-restore-target-destroyed: Machine attestation check missing or failed.

## Failures

- attestation-unavailable: machine attestation path was not provided.

## Missing Runtime Inputs

- CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON

## Sanitized Artifacts

- None.
