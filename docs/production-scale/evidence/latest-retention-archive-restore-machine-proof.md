# Retention Archive Restore Machine Proof

Generated at: 2026-05-22T15:15:39.929Z
Evidence type: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF
Environment: production
Commit: `276476125ac366e2ee3b6be5a4fdc114029a83a8`
Generator: `scripts/retention-archive-restore-machine-proof.mjs`
Command: `pnpm run retention:archive-restore-machine-proof`
Blocker ID: retention-archive-restore
Branch: `staging`
Policy version: production-machine-proof-policy-2026-05-22
Status: fail
CERTIFYING:false
Expires at: 2026-05-23T15:15:39.929Z

## Safety

- Non-interactive: yes
- Machine-attested: yes
- Human interaction required: no
- Human observed: no
- Manual approval required: no
- Dry-run only: no
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
