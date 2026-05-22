# Disaster Recovery Restore Machine Proof

Generated at: 2026-05-22T20:41:38.527Z
Evidence type: DISASTER_RECOVERY_RESTORE_MACHINE_PROOF
Environment: machine-proof-simulation
Commit: `035b06c1271475e74d0bbd808daeb001898fe7b3`
Generator: `scripts/restore-machine-proof.mjs`
Command: `pnpm run restore:machine-proof`
Blocker ID: L10-P1-002
Branch: `staging`
Policy version: production-machine-proof-policy-2026-05-22
Status: pass
CERTIFYING:true
Expires at: 2026-05-23T20:41:38.527Z

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

- [pass] latest-backup-selected:
- [pass] isolated-restore-target-created:
- [pass] rpo-measured:
- [pass] rto-measured:
- [pass] post-restore-auth-session-check:
- [pass] post-restore-packet-pdf-retrieval-check:
- [pass] post-restore-response-queue-check:
- [pass] cleanup-lifecycle-check:
- [pass] rollback-stop-verification:
- [pass] isolated-restore-target-destroyed:

## Failures

- None.

## Missing Runtime Inputs

- None.

## Sanitized Artifacts

- machine-proof-simulation:restore
- docs/production-scale/evidence/latest-restore-machine-proof.json
- docs/production-scale/evidence/latest-restore-machine-proof.md
