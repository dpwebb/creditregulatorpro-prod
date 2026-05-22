# Production Worker Readiness Evidence

Generated at: 2026-05-22T00:46:25.445Z
Evidence type: PRODUCTION_WORKER_READINESS_EVIDENCE
Branch: `staging`
Commit: `4da09d1b87f4641f938bae3f02618f1aa142072d`
Status: prepared-awaiting-human-production-evidence
Production proof accepted: no

## Required Statements

- No production jobs were processed by Codex.
- The production worker remains default-off.
- Dry-run is non-mutating.
- Production apply requires explicit operator inputs and runtime guards.
- Blocker 2 cannot be production-ready without accepted production queue-depth evidence.
- Dashboard PASS alone is not release evidence; exact commands are required.

## Worker Default-Off Status

- Default production deploy starts worker: no
- Always-on worker service added: no

## Dry Run

- Command: `pnpm run ingest:worker --dry-run --max-jobs 1 --concurrency 1 --worker-id production-ingest-worker-dry-run --source authenticated_ingest_process`
- Mutates queue: no

## Apply Mode Guards

- Bounded max jobs required: yes (1-5)
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

- Do not rerun workflow_dispatch with worker inputs.
- Use rollback_sha production deployment for application rollback.
- If a one-shot worker is still running, stop the production application container or wait for the bounded command to exit.
- Inspect queue depth and dead-letter rows before any later apply attempt.

## Future Human Production Run Fields

- queueDepthBefore: required in future evidence
- queueDepthAfter: required in future evidence
- processedJobs: required in future evidence
- failureCount: required in future evidence
- workerExitCode: required in future evidence
- rollbackStopVerified: required in future evidence
- operatorAcknowledgementSigned: required in future evidence
- sanitizedEvidence: required in future evidence

## Accepted Production Queue-Depth Evidence

- Status: not-submitted
- Accepted: no
- Evidence path: not submitted

## Blocker Coverage

- Blocker 2 production ingest runtime: not accepted
- Blocker 11 workflow parity and rollback: not accepted
- Blocker 21 exact release evidence commands: present

## Safety

- No production jobs were processed by Codex.
- No production data was mutated by Codex.
- Parser, OCR, canonical mapping, violation, packet, and storage behavior changed: no.
