# Staging Ingest Worker Operation

This runbook covers the staging-only bounded execution path for queued report ingest jobs. It does not activate a production worker and does not change ingest endpoint behavior.

## Execution Mode

- Chosen path: bounded staging orchestration.
- Default mode: dry-run.
- Apply mode: explicit operator or manual staging deploy input only.
- Max jobs per run: 5 by default.
- Concurrency: 1.
- Runtime target: existing `creditregulatorpro-staging` container.
- Production activation: deferred to a separate production-scoped task.

The staging deploy workflow includes an optional `workflow_dispatch` input named `run_ingest_worker`. It defaults to `false`. When set to `true`, the deploy runs one bounded apply pass after staging health and response-auth smokes:

```bash
docker exec -e CRP_ENV=staging creditregulatorpro-staging bash -lc '
  set -euo pipefail
  if [ "${CRP_ENV:-}" != "staging" ]; then
    echo "Refusing staging ingest worker: CRP_ENV must be staging."
    exit 1
  fi
  if [ -z "${FLOOT_DATABASE_URL:-${STAGING_DATABASE_URL:-${DATABASE_URL:-}}}" ]; then
    echo "Refusing staging ingest worker: database environment is missing."
    exit 1
  fi
  pnpm run ingest:worker -- --apply --max-jobs 5 --concurrency 1 --worker-id staging-deploy-ingest-worker
'
```

## Operator Commands

Run these from the staging app checkout on the staging host.

Dry-run preview:

```bash
pnpm run staging:ingest-worker -- --dry-run
```

Bounded apply:

```bash
pnpm run staging:ingest-worker -- --apply --max-jobs 5 --concurrency 1 --worker-id staging-ingest-manual
```

Direct container dry-run if the wrapper is unavailable:

```bash
docker exec -e CRP_ENV=staging creditregulatorpro-staging bash -lc '
  set -euo pipefail
  test "${CRP_ENV:-}" = staging
  test -n "${FLOOT_DATABASE_URL:-${STAGING_DATABASE_URL:-${DATABASE_URL:-}}}"
  pnpm run ingest:worker -- --dry-run --max-jobs 5 --concurrency 1 --worker-id staging-ingest-manual
'
```

Status and lifecycle check:

```bash
pnpm run staging:ingest-worker -- --dry-run
pnpm run operator:dashboard
```

Confirm that the dry-run reports idle or only expected queued work, and that the operator dashboard does not show unexpected stale-running, failed-cleanup, or dead-letter ingest jobs.

## Autonomous Simulated Proof

Run this only as local/staging-safe synthetic evidence. It does not use the staging database queue and it is not production proof.

```bash
pnpm run ingest:worker:simulated-proof
```

Expected outputs:

- `docs/production-scale/evidence/latest-ingest-worker-simulated.md`
- `docs/production-scale/evidence/latest-ingest-worker-simulated.json`

The simulated proof should show 3 scoped synthetic jobs before apply, 0 queued/running scoped synthetic jobs after apply, 2 succeeded synthetic jobs, 1 intentionally malformed synthetic dead-lettered job, and no live provider calls. A nonzero bounded-apply worker exit code is expected inside this proof because the malformed synthetic job dead-letters visibly.

## Manual Staging Evidence Capture

For actual staging operator evidence, run a dry-run first, record the queue status, then run one bounded apply only if the queued work is expected and staging-safe:

```bash
pnpm run staging:ingest-worker -- --dry-run
pnpm run operator:dashboard
pnpm run staging:ingest-worker -- --apply --max-jobs 5 --concurrency 1 --worker-id staging-ingest-manual
pnpm run staging:ingest-worker -- --dry-run
pnpm run operator:dashboard
```

Expected bounded count: at most 5 jobs, concurrency 1, using only the staging container with `CRP_ENV=staging`.

Record the following in the operator evidence note:

- timestamp and operator identity
- exact commands run
- queue depth/status before the bounded apply
- bounded apply result count and any retry/dead-letter status
- queue depth/status after the bounded apply
- confirmation that the target was `creditregulatorpro-staging`
- confirmation that no production queue, production data, real consumer reports, live providers, or production worker activation were used

Interpretation:

- Pass for staging evidence only when queued/running depth recovers for the reviewed staging-safe scope and any failed/dead-letter jobs have visible lifecycle status.
- Fail or stop when the target is not clearly staging, the queue contains unexpected real records, commands would touch production, provider delivery would occur, or queue depth does not recover.
- Do not treat simulated proof, dry-run output, or dashboard PASS alone as production ingest runtime proof.

## Stop Or Disable

This is not a daemon service. To keep it disabled, do not pass `run_ingest_worker=true` to the manual staging deploy workflow and do not run the operator apply command.

If a manually started command is still running, stop the operator shell process. Do not restart or replace the main app container solely to stop this one-shot worker unless the operator has separately confirmed the app container is unhealthy.

## Safety Boundaries

- The orchestration path uses the existing `pnpm run ingest:worker` script.
- The wrapper and deploy path inject and verify `CRP_ENV=staging`.
- The wrapper refuses production-looking container names.
- The deploy path fails closed if database environment variables are unavailable inside the staging container.
- No ports are exposed.
- No Traefik labels or routing are changed.
- Raw PDF bytes and extracted text are not added to orchestration logs; the underlying worker keeps metadata-only structured logging.
- Production compose and production deploy activation remain unchanged.
