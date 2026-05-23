# Production Worker Runtime Machine Proof

Generated at: 2026-05-23T03:54:57.047Z
Evidence type: PRODUCTION_WORKER_RUNTIME_MACHINE_PROOF
Environment: production
Commit: `40fd438dd95a1afeee4b6d3a471b5769a44db513`
Generator: `scripts/production-worker-machine-proof.mjs`
Command: `pnpm run production-worker:machine-proof`
Blocker ID: L10-P1-003
Branch: `staging`
Policy version: production-machine-proof-policy-2026-05-22
Status: pass
CERTIFYING:true
Expires at: 2026-05-24T03:54:57.047Z

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

- [pass] queue-depth-before-captured:
- [pass] worker-liveness-verified:
- [pass] bounded-max-jobs-enforced:
- [pass] synthetic-or-canary-job-processed:
- [pass] queue-depth-after-captured:
- [pass] processed-count-captured:
- [pass] failed-dead-letter-stale-counts-captured:
- [pass] worker-stop-rollback-verified:
- [pass] canary-cleanup-verified:

## Failures

- None.

## Missing Runtime Inputs

- None.

## Sanitized Artifacts

- .local/production-proof/production-worker-attestation.json
- docs/production-scale/evidence/latest-production-worker-machine-proof.json
- docs/production-scale/evidence/latest-production-worker-machine-proof.md
