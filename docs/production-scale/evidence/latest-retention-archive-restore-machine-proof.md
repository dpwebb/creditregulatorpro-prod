# Retention Archive Restore Machine Proof

Generated at: 2026-05-22T17:52:11.556Z
Evidence type: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF
Environment: production
Commit: `b0c8de12b0d85ef47789ad35c7182ff1b6db4ca7`
Generator: `scripts/retention-archive-restore-machine-proof.mjs`
Command: `pnpm run retention:archive-restore-machine-proof`
Blocker ID: retention-archive-restore
Branch: `staging`
Policy version: production-machine-proof-policy-2026-05-22
Status: fail
CERTIFYING:false
Expires at: 2026-05-23T17:52:11.556Z

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

- [fail] safe-archive-candidate-selected:
- [fail] archive-created-or-selected:
- [fail] archive-metadata-verified:
- [fail] isolated-restore-target-created:
- [fail] archive-restore-integrity-verified:
- [fail] no-pii-exposed:
- [fail] lifecycle-cleanup-verified:
- [fail] rollback-recovery-notes-recorded:
- [fail] isolated-restore-target-destroyed:

## Failures

- retention-archive-restore-runtime-inputs-missing: Non-interactive retention archive/restore proof requires a machine attestation plus archive access, isolated restore target, and safe archive candidate evidence.

## Missing Runtime Inputs

- CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON
- CRP_RETENTION_ARCHIVE_RESTORE_ARCHIVE_ACCESS
- CRP_RETENTION_ARCHIVE_RESTORE_ISOLATED_TARGET
- CRP_RETENTION_ARCHIVE_RESTORE_SAFE_CANDIDATE

## Sanitized Artifacts

- docs/production-scale/evidence/latest-retention-archive-restore-machine-proof.json
- docs/production-scale/evidence/latest-retention-archive-restore-machine-proof.md
