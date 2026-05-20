# Production Ingest Worker Activation Plan

Updated: 2026-05-20

## Status

Production ingest worker activation is prepared as a bounded, manual, fail-closed path. It is not enabled by default, not an always-on daemon, and not production-at-scale proof.

Prerequisite staging/simulated evidence exists at:

- `docs/production-scale/evidence/latest-ingest-worker-simulated.md`
- `docs/production-scale/evidence/latest-ingest-worker-simulated.json`

That evidence is SIMULATED and does not prove production queue processing. It only satisfies the prerequisite for preparing a guarded production path.

## Default Production Deploy

The default production deploy does not run the ingest worker.

Do not set any ingest worker workflow inputs for ordinary production deploys. The deploy will print that production ingest worker execution is skipped.

No Docker Compose worker service is added. No always-on worker is created. The only production path is an explicitly requested one-shot workflow command.

## Dry Run Procedure

Use dry-run before any apply attempt:

```sh
pnpm run ingest:worker -- --dry-run --max-jobs 1 --concurrency 1 --worker-id production-ingest-worker-dry-run --source authenticated_ingest_process
```

In GitHub Actions, use `workflow_dispatch` on production with:

- `run_ingest_worker_dry_run=true`
- `run_ingest_worker_apply=false`
- `ingest_worker_max_jobs=1` explicitly set

Dry-run previews eligible queue status only. It must not claim jobs, process jobs, update artifacts, or mutate queue state.

## Apply Procedure

Apply remains deferred unless an operator explicitly approves a bounded one-shot production run.

Required workflow inputs:

- `run_ingest_worker_apply=true`
- `run_ingest_worker_dry_run=false`
- `ingest_worker_max_jobs` set to `1`, `2`, `3`, `4`, or `5`
- `ingest_worker_operator` set to a safe operator token
- `ingest_worker_apply_ack=explicit-bounded-production-ingest-worker-apply`

Required runtime guards inside the container:

- `CRP_ENV=production`
- `CRP_PRODUCTION_INGEST_WORKER_APPLY=explicit-bounded-production-ingest-worker-apply`
- `CRP_PRODUCTION_INGEST_WORKER_ONE_SHOT=true`
- `CRP_PRODUCTION_INGEST_WORKER_MAX_JOBS` matching the requested `--max-jobs`
- `CRP_PRODUCTION_INGEST_WORKER_OPERATOR` set to a safe operator token

Bounded apply command:

```sh
pnpm run ingest:worker -- --apply --max-jobs <1-5> --concurrency 1 --worker-id production-bounded-ingest-worker --source authenticated_ingest_process
```

The worker refuses production-like apply if any guard is missing or invalid.

The workflow also refuses any requested worker run unless `ingest_worker_max_jobs` is explicitly provided. The deploy default remains worker-off and does not infer a production worker job bound.

## Queue-Depth Check

Before apply, record dry-run output and operator dashboard queue status. After apply, record:

- processed job count
- failure count
- queue depth before/after
- any dead-letter rows
- artifact status changes
- worker exit code

Failure exit code must be treated as blocking evidence. Do not continue silently after failed or dead-lettered jobs.

Generate non-mutating readiness evidence before promotion review:

```sh
pnpm run production-worker:readiness-evidence
```

That command writes `docs/production-scale/evidence/latest-production-worker-readiness.md` and `.json`. It does not run the production worker. It remains unresolved until a human/operator production queue-depth evidence artifact is supplied and accepted.

## Rollback/Stop

There is no daemon to disable. To stop production worker execution:

- do not rerun workflow dispatch with worker inputs
- if a one-shot command is still running, stop the production application container or wait for the bounded command to exit
- deploy a rollback SHA through the existing production `rollback_sha` workflow input if application rollback is needed
- inspect queue depth and dead-letter rows before any later apply attempt

## Risk Statement

This plan does not mutate production data by itself and does not process production jobs unless an operator deliberately runs the guarded apply path. Production ingest runtime remains not fully fixed until an approved production run is executed and evidenced. Production deployment parity also remains partial until rollback and production worker-path evidence are complete.
