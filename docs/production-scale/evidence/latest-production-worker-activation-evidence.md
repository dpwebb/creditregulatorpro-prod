# Production Worker Activation Evidence

Generated at: 2026-05-22T03:34:39.831Z
Evidence type: PRODUCTION_WORKER_ACTIVATION_EVIDENCE
Branch: `staging`
Commit: `e61ef8db93ba454971586a4e2958f7dcad165ebf`
Status: prepared-default-off
Production proof: no

## Required Statements

- The production worker remains default-off.
- Production activation remains deferred unless an operator explicitly runs the guarded workflow.
- Dry-run is non-mutating and cannot claim or process queue jobs.
- Apply mode requires explicit operator confirmation and a bounded max-job value.
- This activation evidence does not process production jobs and does not close blocker 2.
- Accepted staging worker evidence is prerequisite context only, not production proof.

## Activation Gate

- Production worker default-off: yes
- Production activation remains deferred: yes
- Explicit activation inputs required: yes
- workflow_dispatch input run_ingest_worker=true
- choose exactly one of run_ingest_worker_dry_run=true or run_ingest_worker_apply=true
- ingest_worker_max_jobs explicitly set to 1-5
- ingest_worker_apply_ack required for apply
- ingest_worker_operator safe token required for apply

## Dry Run

- Command: `pnpm run ingest:worker --dry-run --max-jobs 1 --concurrency 1 --worker-id production-ingest-worker-dry-run --source authenticated_ingest_process`
- Mutates queue: no
- Claims jobs: no

## Apply Mode

- Command: `pnpm run ingest:worker --apply --max-jobs <1-5> --concurrency 1 --worker-id production-bounded-ingest-worker --source authenticated_ingest_process`
- Confirmation string: `explicit-bounded-production-ingest-worker-apply`
- Max jobs bound: 1-5
- workflow_dispatch input run_ingest_worker_apply=true
- workflow_dispatch input run_ingest_worker_dry_run=false
- ingest_worker_max_jobs explicitly set to 1-5
- ingest_worker_apply_ack=explicit-bounded-production-ingest-worker-apply
- ingest_worker_operator set to a safe token
- CRP_ENV=production
- CRP_PRODUCTION_INGEST_WORKER_APPLY=explicit-bounded-production-ingest-worker-apply
- CRP_PRODUCTION_INGEST_WORKER_ONE_SHOT=true
- CRP_PRODUCTION_INGEST_WORKER_MAX_JOBS matching --max-jobs
- CRP_PRODUCTION_INGEST_WORKER_OPERATOR set to a safe token
- --concurrency=1
- --source=authenticated_ingest_process
- --worker-id present

## Rollback/Stop

- Do not rerun workflow_dispatch with run_ingest_worker=true.
- Use rollback_sha production deployment for application rollback.
- If a one-shot worker is still running, stop the production application container or wait for the bounded command to exit.
- Inspect queue depth and dead-letter rows before any later apply attempt.

## Future Operator Run Fields

- queueDepthBefore: required in future operator evidence
- queueDepthAfter: required in future operator evidence
- processedJobs: required in future operator evidence
- failureCount: required in future operator evidence
- deadLetterCount: required in future operator evidence
- workerExitCode: required in future operator evidence
- rollbackStopVerified: required in future operator evidence
- operatorAcknowledgementSigned: required in future operator evidence
- sanitizedEvidence: required in future operator evidence

## Staging Worker Evidence

- Exists: yes
- Accepted: yes
- Production proof: no
- Queue depth before/after: 2/0
- Processed/failed/dead-lettered: 2/0/0

## Blocker Coverage

- Blocker 2 production ingest runtime: not accepted
- Blocker 11 workflow parity and rollback: not accepted
- Blocker 21 exact evidence commands: present

## Safety

- No production jobs were processed by Codex.
- No production data was mutated by Codex.
- Parser, OCR, canonical mapping, violation, packet, and queue lifecycle behavior changed: no.
