# Production Worker Runtime Machine Proof

Generated at: 2026-05-22T12:46:14.770Z
Evidence type: PRODUCTION_WORKER_RUNTIME_MACHINE_PROOF
Environment: production
Commit: `79af5282d400136dd75aa3d9d952799a37b92d32`
Generator: `scripts/production-worker-machine-proof.mjs`
Command: `pnpm run production-worker:machine-proof`
Status: fail
CERTIFYING:false
Expires at: 2026-05-23T12:46:14.770Z

## Safety

- Non-interactive: yes
- Machine-attested: yes
- Human interaction required: no
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
