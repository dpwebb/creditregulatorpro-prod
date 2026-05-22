# Production Worker Runtime Machine Proof

Generated at: 2026-05-22T14:39:57.023Z
Evidence type: PRODUCTION_WORKER_RUNTIME_MACHINE_PROOF
Environment: production
Commit: `419bcbb5ebf096f751b71bf4d940b292ea0e91e5`
Generator: `scripts/production-worker-machine-proof.mjs`
Command: `pnpm run production-worker:machine-proof`
Blocker ID: L10-P1-003
Branch: `staging`
Policy version: production-machine-proof-policy-2026-05-22
Status: fail
CERTIFYING:false
Expires at: 2026-05-23T14:39:57.023Z

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

- [fail] queue-depth-before-captured: Machine attestation check missing or failed.
- [fail] worker-liveness-verified: Machine attestation check missing or failed.
- [fail] bounded-max-jobs-enforced: Machine attestation check missing or failed.
- [fail] synthetic-or-canary-job-processed: Machine attestation check missing or failed.
- [fail] queue-depth-after-captured: Machine attestation check missing or failed.
- [fail] processed-count-captured: Machine attestation check missing or failed.
- [fail] failed-dead-letter-stale-counts-captured: Machine attestation check missing or failed.
- [fail] worker-stop-rollback-verified: Machine attestation check missing or failed.
- [fail] canary-cleanup-verified: Machine attestation check missing or failed.

## Failures

- attestation-unavailable: machine attestation path was not provided.

## Missing Runtime Inputs

- CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON

## Sanitized Artifacts

- None.
