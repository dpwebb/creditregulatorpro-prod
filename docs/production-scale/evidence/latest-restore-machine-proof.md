# Disaster Recovery Restore Machine Proof

Generated at: 2026-05-22T16:43:14.432Z
Evidence type: DISASTER_RECOVERY_RESTORE_MACHINE_PROOF
Environment: production
Commit: `dc839e2d928b607a5ac8b167f6b6402be486b566`
Generator: `scripts/restore-machine-proof.mjs`
Command: `pnpm run restore:machine-proof`
Blocker ID: L10-P1-002
Branch: `staging`
Policy version: production-machine-proof-policy-2026-05-22
Status: fail
CERTIFYING:false
Expires at: 2026-05-23T16:43:14.432Z

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

- [fail] latest-backup-selected:
- [fail] isolated-restore-target-created:
- [fail] rpo-measured:
- [fail] rto-measured:
- [fail] post-restore-auth-session-check:
- [fail] post-restore-packet-pdf-retrieval-check:
- [fail] post-restore-response-queue-check:
- [fail] cleanup-lifecycle-check:
- [fail] rollback-stop-verification:
- [fail] isolated-restore-target-destroyed:

## Failures

- restore-machine-proof-runtime-inputs-missing: Non-interactive restore proof requires a machine attestation plus configured backup source, isolated restore target, and safe synthetic fixture.

## Missing Runtime Inputs

- CRP_RESTORE_MACHINE_ATTESTATION_JSON
- CRP_RESTORE_MACHINE_BACKUP_SOURCE
- CRP_RESTORE_MACHINE_ISOLATED_TARGET
- CRP_RESTORE_MACHINE_SAFE_FIXTURE

## Sanitized Artifacts

- docs/production-scale/evidence/latest-restore-machine-proof.json
- docs/production-scale/evidence/latest-restore-machine-proof.md
