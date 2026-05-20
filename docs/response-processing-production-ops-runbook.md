# Response Processing Production Operations Runbook

Updated: 2026-05-20

This runbook closes documentation and operator-proof gaps for response processing only. It does not claim broad production readiness or production-at-scale readiness. CreditRegulatorPro remains limited beta ready with strict constraints under `docs/limited-beta-operator-launch-policy.md`.

## Scope

Covered:

- Durable response-processing queue operations.
- Bounded worker and orchestration dry-run evidence.
- Replay/backfill dry-run and apply-confirmation evidence.
- Lifecycle retention preview and append-only cleanup-marker evidence.
- Admin remediation actions for failed, dead-lettered, and stale-running jobs.
- Operator dashboard proof rows and stop conditions.

Not covered:

- Live mailbox integration.
- Automatic live daemon activation.
- Real external alert delivery.
- Physical purge/archive automation.
- Response queue semantic changes.
- Parser, ingest, packet, storage, or response classification changes.

## Required Safety Boundaries

Operators must preserve these boundaries during every response-processing run:

- Queue claiming, idempotency, retry/dead-letter semantics, stale-running handling, and replay/apply confirmation must not be changed by operations.
- Response processing must not mutate canonical report facts, tradeline facts, violation truth, packet eligibility, or packet readiness rules.
- Raw response text, mailbox credentials, tokens, session cookies, database URLs, secrets, and full consumer PII must not appear in logs, dashboard output, evidence, or support notes.
- Stale running jobs must be reviewed explicitly. Do not silently reclaim them.
- Dead-letter retry must create a replacement job or append remediation evidence according to the existing queue service behavior. Do not mutate terminal job history silently.
- Lifecycle apply may append cleanup markers only. It must not delete queue jobs, queue events, orchestration runs, replay events, lifecycle events, or evidence.

## Pre-Run Verification

Run these checks before any supervised non-dry response-processing operation:

| Check | Command | Required result |
| --- | --- | --- |
| TypeScript | `pnpm run typecheck` | Pass |
| Build | `pnpm run build` | Pass |
| Queue tests | `pnpm exec vitest run --config vitest.config.ts tests/api/response-processing-queue.spec.ts tests/api/response-processing-queue-remediation-endpoint.spec.ts` | Pass |
| Orchestration tests | `pnpm exec vitest run --config vitest.config.ts tests/api/response-worker-orchestration.spec.ts tests/unit/response-processing-worker-orchestrator-script.spec.ts` | Pass |
| Lifecycle tests | `pnpm exec vitest run --config vitest.config.ts tests/api/response-processing-lifecycle.spec.ts tests/unit/response-processing-lifecycle-script.spec.ts` | Pass |
| Soak check | `pnpm run response:soak-check` | Pass |
| Operator dashboard | `pnpm run operator:dashboard` | Pass with expected known gaps only |
| Response ops readiness evidence | `pnpm run response:ops-readiness-evidence` | Pass; scheduler remains default-off, backfill/lifecycle remain guarded, and alerting status is explicit |
| Alert exclusion validation, if no provider is used | `pnpm run alerts:exclusion:validate` | Accepted only with signed sanitized operator exclusion evidence |
| Regression dashboard | `pnpm run test:regression-dashboard` | Pass |

Stop if any required check fails.

## Evidence Matrix

| Area | Dry-run or proof command | Current status | Required evidence |
| --- | --- | --- | --- |
| Scheduler/live daemon activation conditions | `pnpm run response:worker-orchestrate -- --dry-run` | Dry-run proof exists. Live scheduler is not automatically enabled. | Dashboard row, dry-run output, operator signoff, target commit, max-job bound, lock scope, and stop conditions. |
| Bounded worker execution | `pnpm run response:worker -- --dry-run` | Dry-run preview exists. Non-dry worker use is explicit and bounded. | Preview output before each supervised worker run and summary output after each run. |
| External alert delivery dry-run/mock | `pnpm run alerts:dry-run` | SIMULATED dry-run payload evidence exists. Real external alert delivery is not implemented or enabled. | Sanitized SIMULATED alert payloads for ingest backlog, response dead-letter backlog, stale-running response job, packet PDF/cache warning, storage/raw report warning, DB/pool pressure warning, restore evidence missing warning, and dashboard SKIP warning. Output must show zero live external calls. |
| Formal alert exclusion | `pnpm run alerts:exclusion:validate` | Not accepted unless a filled sanitized operator artifact is submitted. | Signed acknowledgement that no external provider will be used, human monitoring cadence, manual escalation path, dashboard/soak references, alert dry-run evidence, and no PII/secrets/raw data. |
| Response ops readiness pack | `pnpm run response:ops-readiness-evidence` | Operator-ready evidence command exists. | Live scheduler status, backfill readiness, purge/archive readiness, alerting status, monitoring cadence, manual fallback, dashboard references, soak references, and unresolved risks. |
| Purge/archive readiness | `pnpm run response:lifecycle -- --dry-run` | Retention preview and append-only marker tooling exists. Physical purge/archive remains deferred. | Retention preview, drift report, protected stale/dead-letter counts, and explicit no-delete confirmation in output. |
| Historical backfill plan | `pnpm run response:replay -- --dry-run` | Replay dry-run exists. Production backfill execution remains operator-controlled. | Scanned/replayable/non-replayable counts, reason counts, stale metadata counts, filters, and no raw response text evidence. |
| Replay apply confirmation | `pnpm run response:replay -- --apply --confirm-apply --actor-user-id <operator-user-id> --limit <n>` | Apply is available only with explicit confirmation and actor attribution. | Operator approval, actor ID, tight filters, bounded limit, appended event counts, and no source-truth mutation evidence. |
| Lifecycle apply confirmation | `pnpm run response:lifecycle -- --apply --confirm-cleanup --actor-user-id <operator-user-id> --limit <n>` | Apply is available only with explicit confirmation and actor attribution. | Operator approval, actor ID, bounded limit, appended cleanup-marker counts, and proof that no physical delete occurred. |
| Remediation actions | Admin endpoint and dashboard: `pnpm exec vitest run --config vitest.config.ts tests/api/response-processing-queue-remediation-endpoint.spec.ts` | Admin-only remediation exists for retry, dead-letter acknowledgement, dead-letter replacement retry, and stale-running review. | Remediation action, actor ID, confirmation fields, linked job ID, appended event type, and no raw response text exposure. |
| Dashboard proof | `pnpm run operator:dashboard` | Dashboard includes queue, worker, lifecycle, soak, alert-boundary, and remediation rows. | Dashboard output for the audited commit with only accepted known gaps. |

## Scheduler Activation Conditions

Do not enable a live scheduler automatically. A supervised scheduled invocation may be considered only when all of the following are true:

- The intended commit is deployed and recorded.
- `pnpm run typecheck`, `pnpm run build`, response queue tests, response orchestration tests, lifecycle tests, `pnpm run response:soak-check`, `pnpm run operator:dashboard`, and `pnpm run test:regression-dashboard` pass.
- `pnpm run response:worker-orchestrate -- --dry-run` reports the expected next action and no unexpected stale lock.
- `--run` is used only for a bounded, non-daemon invocation.
- `--max-jobs` is explicitly set for the operating window.
- `--scheduled` is used only with `--run`.
- Overlap skips and stale-lock skips are treated as operator-review events, not as auto-remediation.
- No live mailbox integration or external alert delivery is expected from the scheduler.

Recommended supervised invocation pattern:

```bash
pnpm run response:worker-orchestrate -- --dry-run
pnpm run response:worker-orchestrate -- --run --scheduled --max-jobs 10 --worker-id response-operator-<date>
pnpm run response:soak-check
pnpm run operator:dashboard
```

## External Alert Delivery Boundary

Current response operations support internal operator alert surfacing through metrics, lifecycle drift reports, orchestration events, soak-check evidence, and dashboard rows. They do not send email, Slack, webhook, SMS, push, or pager alerts.

Run the external alert dry-run/mock proof with:

```bash
pnpm run alerts:dry-run
```

Outputs:

- `docs/production-scale/evidence/latest-alerts-dry-run.md`
- `docs/production-scale/evidence/latest-alerts-dry-run.json`

The output is labeled `SIMULATED` and `DRY RUN`. It proves that sanitized synthetic alert payloads can be rendered for the required categories while sending zero live external alerts and making zero live external provider calls. It must not be represented as live alert delivery proof, production proof, or production-at-scale readiness.

Interpretation:

- `SIMULATED` means local/staging-safe synthetic proof only.
- `DRY RUN` means no delivery provider is invoked.
- A clean sanitization result means the rendered payloads did not contain detected PII, secrets, raw report data, credential URLs, signed URLs, or signature data.
- Dashboard `SKIP`, `SIMULATED`, and `HUMAN_REQUIRED` rows remain release-evidence qualifiers, not hidden PASS conditions.

If the product intentionally uses no external alert provider, the accepted exclusion path is to record the exclusion, cite `pnpm run alerts:dry-run`, cite operator dashboard/soak evidence, and name the human monitoring path. The exclusion must not be described as live external alert proof.

Before any external alert provider is introduced, a separate task must add:

- mocked provider tests;
- dry-run output proving no real delivery;
- secret-safe configuration validation;
- dashboard evidence that distinguishes internal alert surfacing from external delivery;
- stop conditions for failed or duplicated alert sends.

Until that separate task exists, external alert delivery remains an unresolved production-operational gap.

## Purge And Archive Boundary

Use lifecycle dry-run to identify retention-eligible response-processing operational records:

```bash
pnpm run response:lifecycle -- --dry-run
```

Lifecycle apply is not physical purge/archive. It only appends sanitized lifecycle markers and must be operator-supervised:

```bash
pnpm run response:lifecycle -- --apply --confirm-cleanup --actor-user-id <operator-user-id> --limit <n>
```

Do not run physical delete/archive against response-processing queue, replay, orchestration, lifecycle, or audit history as part of this process.

## Historical Backfill Plan

Start with dry-run only:

```bash
pnpm run response:replay -- --dry-run
```

Use filters before any apply consideration:

```bash
pnpm run response:replay -- --dry-run --start-date <iso-date> --end-date <iso-date> --limit <n>
pnpm run response:replay -- --dry-run --response-id <id>
```

Records without replayable sanitized summaries must remain non-replayable. Do not rehydrate raw response text or mailbox bodies to force historical backfill. Apply mode requires explicit confirmation and actor attribution:

```bash
pnpm run response:replay -- --apply --confirm-apply --actor-user-id <operator-user-id> --limit <n>
```

## Remediation Procedure

Use the admin response queue visibility endpoint or the Response Documents admin UI to inspect failed, dead-lettered, retry-eligible, and stale-running jobs. Required operator evidence:

- job ID;
- current status;
- event history reviewed;
- actor user ID;
- remediation action;
- confirmation field used;
- linked replacement job ID when applicable;
- dashboard status after remediation.

Allowed remediation actions:

- retry a failed job with explicit retry confirmation;
- acknowledge a dead-lettered job with explicit review confirmation;
- queue a sanitized replacement job for dead-letter retry;
- mark a stale-running job reviewed without auto-reclaim.

Do not delete job history. Do not alter queue payloads manually.

## Stop Conditions

Stop response-processing operations and preserve evidence if any of these occur:

- `pnpm run response:soak-check` fails.
- `pnpm run operator:dashboard` shows unexpected critical response queue, lifecycle, orchestration, or alert drift.
- Any output includes raw response text, a full email body, a database URL, token, session cookie, private key, mailbox credential, or full consumer PII.
- A supervised worker run processes more jobs than the approved `--max-jobs` bound.
- A stale-running job is auto-reclaimed or mutated without explicit review.
- A dead-letter retry mutates terminal history instead of creating append-only remediation evidence.
- Lifecycle apply deletes records instead of appending cleanup markers.
- Replay apply reports source-truth, violation, packet readiness, or canonical fact mutation.
- External alert delivery is attempted.
- Live mailbox integration is invoked.

## Evidence Record Template

Use this template for each supervised response operations window:

| Field | Value |
| --- | --- |
| Date/time |  |
| Operator |  |
| Environment |  |
| Commit/SHA |  |
| Purpose |  |
| Dry-run commands run |  |
| Required checks result |  |
| Max jobs approved |  |
| Replay filters, if used |  |
| Lifecycle filters, if used |  |
| Remediation actions, if any |  |
| Dashboard result |  |
| Soak result |  |
| Sensitive-output check |  |
| Stop conditions observed |  |
| Signoff |  |

## Current Remaining Gaps

- Live scheduled daemon operation is not enabled automatically and still needs repeated operator-run evidence before a production-operational claim.
- External alert delivery is not implemented; internal dashboard alert surfacing plus SIMULATED dry-run payload proof is the current boundary.
- Physical purge/archive remains deferred.
- Historical production backfill execution remains operator-controlled and cannot replay records that lack stored sanitized summaries.
- Repeated production-scale smoke/load evidence remains outside this response-operations documentation task.
