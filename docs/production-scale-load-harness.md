# Production Scale Load Harness

Updated: 2026-05-20

This document describes the local/staging-safe production-scale evidence harness added for the maximum readiness audit blocker "Production-scale load and concurrency tests are missing."

CreditRegulatorPro remains limited beta ready with strict constraints. This harness does not claim broad-production or production-at-scale readiness.

## Script

Run:

```sh
pnpm run baseline:production-scale-local -- --dry-run
```

Script path:

```text
scripts/production-scale-harness.mjs
```

The harness is dry-run and non-mutating only. It emits a structured evidence plan plus an internal bounded-concurrency self-check. It does not submit report PDFs, create packets, process queues, call external providers, or mutate production.

## Safety Gates

- Default target is `http://localhost:3333`.
- Allowed targets are local hosts and `https://staging.creditregulatorpro.com`.
- Production hosts such as `creditregulatorpro.com`, `www.creditregulatorpro.com`, `app.creditregulatorpro.com`, `prod.creditregulatorpro.com`, and `production.creditregulatorpro.com` are refused.
- Unknown hosts fail closed.
- Mutation execution flags such as `--apply`, `--execute`, and `--run` are rejected.
- External provider calls are denied and not made. The denylist covers PostGrid/mail, Stripe, mailbox/email, Slack/webhook/SMS, and signed URL exposure paths.
- The harness reports `runtimeMutationRequestsSent: 0`, `externalProviderCallsMade: 0`, `rawReportBytesSent: false`, and `rawExtractedTextStored: false`.

## Bounds

Default bounds:

| Setting | Default | Maximum |
| --- | --- | --- |
| `--max-concurrency` | 2 | 4 |
| `--iterations` | 1 | 5 |

The internal self-check runs synthetic in-process tasks through the same concurrency cap to prove the harness scheduler does not exceed the configured bound. It does not touch application runtime state.

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

Each section is reported as `planned_dry_run`. Local or staging operators can use the listed existing test/check commands as fixture-backed evidence, but this harness intentionally avoids creating or mutating data by itself.

## Evidence Commands

Primary harness check:

```sh
pnpm run baseline:production-scale-local -- --dry-run
```

Related fixture-backed local/staging evidence remains in existing checks:

```sh
pnpm run ingest:worker -- --dry-run --max-jobs 1 --concurrency 1
pnpm run test:deterministic-ingestion-report
pnpm run response:soak-check
pnpm run operator:dashboard
```

Packet and queue evidence is also covered by targeted unit/API tests referenced in the harness output.

## Production Rule

Do not run mutation-capable load tests against production from Codex. If target detection is ambiguous, the harness fails closed. Production-scale capacity proof must come from reviewed local/staging evidence and a separate operator-approved production testing plan that does not create or alter real consumer data.
