# Production Scale Load Harness

Updated: 2026-05-20

This document describes the local/staging-safe production-scale evidence harness added for the maximum readiness audit blocker "Production-scale load and concurrency tests are missing."

CreditRegulatorPro remains limited beta ready with strict constraints. This harness does not claim broad-production or production-at-scale readiness.

## Script

Run:

```sh
pnpm run baseline:production-scale-local -- --simulated
```

Script path:

```text
scripts/production-scale-harness.mjs
```

The harness has two explicit safe modes:

- `--simulated` generates bounded in-process SIMULATED load evidence and writes Markdown/JSON evidence.
- `--dry-run` emits the older structured evidence plan plus an internal bounded-concurrency self-check.

The command requires an explicit safe mode. It does not submit report PDFs, create packets, process real queues, call external providers, or mutate production.

SIMULATED evidence is not production proof and is not repeated target-environment production-scale evidence.

## Safety Gates

- Default target is `http://localhost:3333`.
- Allowed targets are local hosts and `https://staging.creditregulatorpro.com`.
- Production hosts such as `creditregulatorpro.com`, `www.creditregulatorpro.com`, `app.creditregulatorpro.com`, `prod.creditregulatorpro.com`, and `production.creditregulatorpro.com` are refused.
- Unknown hosts fail closed.
- Running without `--simulated`, `--local`, or `--dry-run` fails closed.
- Production-looking environment variables or production database URLs fail closed.
- Live provider enablement flags fail closed.
- Mutation execution flags such as `--apply`, `--execute`, and `--run` are rejected.
- External provider calls are denied and not made. The denylist covers PostGrid/mail, Stripe, mailbox/email, Slack/webhook/SMS, and signed URL exposure paths.
- The harness reports `runtimeMutationRequestsSent: 0`, `externalProviderCallsMade: 0`, `rawReportBytesSent: false`, and `rawExtractedTextStored: false`.

## Bounds

Default bounds:

| Setting | Default | Maximum |
| --- | --- | --- |
| `--max-concurrency` | 2 | 4 |
| `--iterations` | 1 | 5 |

The simulated load run uses bounded synthetic in-process tasks through the same concurrency cap. It does not touch application runtime state.

## SIMULATED Evidence Output

`--simulated` writes:

- `docs/production-scale/evidence/latest-load-simulated.md`
- `docs/production-scale/evidence/latest-load-simulated.json`

The report includes:

- total synthetic requests/jobs;
- concurrency level and iterations;
- elapsed time, throughput, and latency p50/p95/max;
- SIMULATED ingest queue depth before/after;
- packet PDF cache hit count, miss count, and cache-miss render timing;
- DB pool configured max plus SIMULATED borrowed/active signal;
- SIMULATED rate limiter accepted/rejected counts;
- dashboard warning before/after fields when dashboard data is supplied;
- external provider call count, expected to be zero.

Unavailable real runtime signals are labeled unavailable or SIMULATED. Do not treat SIMULATED queue depth, DB pool, or rate-limit pressure as production proof.

## Reported Domains

The dry-run report includes these sections:

- Concurrent authenticated upload/process enqueue behavior.
- Ingest worker bounded concurrency.
- OCR fallback path.
- Packet creation/build under bounded load.
- Packet PDF cache repeated download behavior.
- Response queue operations.
- Operator dashboard read latency.
- DB pool config visibility.
- Failure/dead-letter behavior.

Dry-run sections are reported as `planned_dry_run`. The simulated report adds bounded local measurements, but local or staging operators still need repeated target-environment evidence before any production-scale claim.

## Evidence Commands

Primary harness check:

```sh
pnpm run baseline:production-scale-local -- --simulated
```

Related fixture-backed local/staging evidence remains in existing checks:

```sh
pnpm run baseline:production-scale-local -- --dry-run
pnpm run ingest:worker -- --dry-run --max-jobs 1 --concurrency 1
pnpm run test:deterministic-ingestion-report
pnpm run response:soak-check
pnpm run operator:dashboard
```

Packet and queue evidence is also covered by targeted unit/API tests referenced in the harness output.

## Production Rule

Do not run mutation-capable load tests against production from Codex. If target detection is ambiguous, the harness fails closed. Production-scale capacity proof must come from repeated reviewed local/staging evidence and a separate operator-approved production testing plan that does not create or alter real consumer data.

## Remaining Blockers

- Blocker 3 remains SIMULATED/local evidence only until repeated local or staging throughput/latency/queue/DB observations are reviewed.
- Blocker 4 has cache-miss timing evidence, but packet PDF queueing or cache-miss envelope work is not implemented here.
- Blocker 16 remains incomplete for production until staging-safe DB pool pressure evidence records real active/open/latency signals.
- Blocker 17 remains incomplete for production until rate-limit write pressure is proven with bounded staging-safe aggregate metrics.
