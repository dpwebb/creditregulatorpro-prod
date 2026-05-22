# Disaster Recovery Restore Machine Proof

Generated at: 2026-05-22T13:46:13.877Z
Evidence type: DISASTER_RECOVERY_RESTORE_MACHINE_PROOF
Environment: production
Commit: `a7bae388efa0edb1ebbf40fecee760bde4db6c1e`
Generator: `scripts/restore-machine-proof.mjs`
Command: `pnpm run restore:machine-proof`
Blocker ID: L10-P1-002
Branch: `staging`
Policy version: production-machine-proof-policy-2026-05-22
Status: fail
CERTIFYING:false
Expires at: 2026-05-23T13:46:13.877Z

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

- [fail] latest-backup-selected: Machine attestation check missing or failed.
- [fail] isolated-restore-target-created: Machine attestation check missing or failed.
- [fail] rpo-measured: Machine attestation check missing or failed.
- [fail] rto-measured: Machine attestation check missing or failed.
- [fail] post-restore-auth-session-check: Machine attestation check missing or failed.
- [fail] post-restore-packet-pdf-retrieval-check: Machine attestation check missing or failed.
- [fail] post-restore-response-queue-check: Machine attestation check missing or failed.
- [fail] cleanup-lifecycle-check: Machine attestation check missing or failed.
- [fail] rollback-stop-verification: Machine attestation check missing or failed.
- [fail] isolated-restore-target-destroyed: Machine attestation check missing or failed.

## Failures

- attestation-unavailable: machine attestation path was not provided.

## Missing Runtime Inputs

- CRP_RESTORE_MACHINE_ATTESTATION_JSON

## Sanitized Artifacts

- None.
