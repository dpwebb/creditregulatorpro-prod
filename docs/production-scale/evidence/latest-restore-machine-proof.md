# Disaster Recovery Restore Machine Proof

Generated at: 2026-05-23T02:50:18.180Z
Evidence type: DISASTER_RECOVERY_RESTORE_MACHINE_PROOF
Environment: production
Commit: `fe8231ffe2500e2c7ed7d82e1f60570b4820061c`
Generator: `scripts/restore-machine-proof.mjs`
Command: `pnpm run restore:machine-proof`
Blocker ID: L10-P1-002
Branch: `staging`
Policy version: production-machine-proof-policy-2026-05-22
Status: pass
CERTIFYING:true
Expires at: 2026-05-24T02:50:18.180Z

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

- .local/production-proof/restore-attestation.json
- docs/production-scale/evidence/latest-restore-machine-proof.json
- docs/production-scale/evidence/latest-restore-machine-proof.md
