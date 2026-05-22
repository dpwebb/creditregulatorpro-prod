# Production Worker Runtime Machine Proof

Generated at: 2026-05-22T17:52:03.889Z
Evidence type: PRODUCTION_WORKER_RUNTIME_MACHINE_PROOF
Environment: production
Commit: `b0c8de12b0d85ef47789ad35c7182ff1b6db4ca7`
Generator: `scripts/production-worker-machine-proof.mjs`
Command: `pnpm run production-worker:machine-proof`
Blocker ID: L10-P1-003
Branch: `staging`
Policy version: production-machine-proof-policy-2026-05-22
Status: fail
CERTIFYING:false
Expires at: 2026-05-23T17:52:03.889Z

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

- [fail] queue-depth-before-captured:
- [fail] worker-liveness-verified:
- [fail] bounded-max-jobs-enforced:
- [fail] synthetic-or-canary-job-processed:
- [fail] queue-depth-after-captured:
- [fail] processed-count-captured:
- [fail] failed-dead-letter-stale-counts-captured:
- [fail] worker-stop-rollback-verified:
- [fail] canary-cleanup-verified:

## Failures

- production-worker-machine-proof-runtime-inputs-missing: Non-interactive production worker proof requires a sanitized machine attestation with queue, liveness, canary, cleanup, and stop/rollback runtime data.

## Missing Runtime Inputs

- CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON
- CRP_PRODUCTION_WORKER_QUEUE_ACCESS
- CRP_PRODUCTION_WORKER_LIVENESS_ACCESS
- CRP_PRODUCTION_WORKER_CANARY_JOB_ACCESS
- CRP_PRODUCTION_WORKER_STOP_ROLLBACK_ACCESS

## Sanitized Artifacts

- docs/production-scale/evidence/latest-production-worker-machine-proof.json
- docs/production-scale/evidence/latest-production-worker-machine-proof.md
