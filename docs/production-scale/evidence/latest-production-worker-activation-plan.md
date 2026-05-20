# Production Worker Activation Plan

Generated: 2026-05-20T20:08:08.761Z
Evidence type: DESIGN_AND_GUARD_EVIDENCE
Branch: staging
Commit: dab749d9cef5457fb0fb411bdd9f6aaa8f3b9ca7

This is a guarded design/evidence artifact. It does not activate a production worker, process production jobs, mutate production data, or claim production-at-scale readiness.

## Prerequisite

- Staging/simulated evidence path: docs/production-scale/evidence/latest-ingest-worker-simulated.json
- Evidence exists: yes
- Evidence status: passed
- Satisfied for planning: yes

## Default Behavior

- Always-on worker enabled: no
- Default deploy starts worker: no
- Docker Compose worker service added: no
- Ingest endpoint behavior changed: no

## Dry Run

- Workflow input: `run_ingest_worker_dry_run=true`
- Mutates queue: no
- Command: `pnpm run ingest:worker -- --dry-run --max-jobs 1 --concurrency 1 --worker-id production-ingest-worker-dry-run --source authenticated_ingest_process`

## Apply Guards

- workflow_dispatch input run_ingest_worker_apply=true
- ingest_worker_apply_ack=explicit-bounded-production-ingest-worker-apply
- ingest_worker_operator=<safe-token>
- CRP_ENV=production
- CRP_PRODUCTION_INGEST_WORKER_APPLY=explicit-bounded-production-ingest-worker-apply
- CRP_PRODUCTION_INGEST_WORKER_ONE_SHOT=true
- CRP_PRODUCTION_INGEST_WORKER_MAX_JOBS=<matching max jobs>
- CRP_PRODUCTION_INGEST_WORKER_OPERATOR=<safe-token>

Apply command: `pnpm run ingest:worker -- --apply --max-jobs <1-5> --concurrency 1 --worker-id production-bounded-ingest-worker --source authenticated_ingest_process`

## Rollback/Stop

- Do not rerun workflow_dispatch with worker inputs.
- Use rollback_sha production deployment for application rollback.
- If a one-shot worker is running, stop the application container or wait for the bounded command to exit; no daemon service is added.
- Inspect queue depth and dead-letter rows before any further apply run.

## Residual Risk

- Blocker 2 remains not fully production-fixed until a reviewed production run is actually activated and evidenced.
- Blocker 11 remains partial until production parity and rollback evidence are complete.
