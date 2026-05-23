# Retention Archive Restore Machine Proof

Generated at: 2026-05-23T02:50:24.617Z
Evidence type: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF
Environment: production
Commit: `fe8231ffe2500e2c7ed7d82e1f60570b4820061c`
Generator: `scripts/retention-archive-restore-machine-proof.mjs`
Command: `pnpm run retention:archive-restore-machine-proof`
Blocker ID: retention-archive-restore
Branch: `staging`
Policy version: production-machine-proof-policy-2026-05-22
Status: pass
CERTIFYING:true
Expires at: 2026-05-24T02:50:24.617Z

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

- [pass] safe-archive-candidate-selected:
- [pass] archive-created-or-selected:
- [pass] archive-metadata-verified:
- [pass] isolated-restore-target-created:
- [pass] archive-restore-integrity-verified:
- [pass] no-pii-exposed:
- [pass] lifecycle-cleanup-verified:
- [pass] rollback-recovery-notes-recorded:
- [pass] isolated-restore-target-destroyed:

## Failures

- None.

## Missing Runtime Inputs

- None.

## Sanitized Artifacts

- .local/production-proof/retention-attestation.json
- docs/production-scale/evidence/latest-retention-archive-restore-machine-proof.json
- docs/production-scale/evidence/latest-retention-archive-restore-machine-proof.md
