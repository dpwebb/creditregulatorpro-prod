# Production Observability Metrics

Updated: 2026-05-20

Controlling audit: `docs/production-at-scale-maximum-audit.md`

CreditRegulatorPro remains limited beta ready with strict constraints. It is not broad-production ready and is not production-at-scale ready.

## Scope

Production observability now extends beyond response processing into ingest, OCR/parser, packet PDF, storage, auth/rate-limit, and DB configuration/pool-pressure signals. These metrics are operator visibility only. They do not change parser output, violation detection, packet readiness, storage architecture, response queue semantics, or deployment behavior.

## Sensitivity Boundary

Metrics and events must not contain:

- raw report PDF bytes;
- raw extracted report text;
- full consumer PII;
- secrets, tokens, authorization headers, session cookies, or database URLs;
- object storage names or signed URLs.

Storage object names are represented only by short hashes. Auth and rate-limit metrics are aggregate counts only and do not expose emails, IP addresses, session IDs, or cookies.

## Dashboard Rows

Run:

```bash
pnpm run operator:dashboard
```

When `FLOOT_DATABASE_URL` is available, the `Production Observability` category reports:

- ingest health threshold;
- OCR/parser health threshold;
- packet PDF health threshold;
- storage health threshold;
- auth/rate-limit threshold;
- DB config/pool threshold.

Threshold status values are:

- `OK`
- `Warning`
- `Critical`

## Thresholds

| Signal | Warning | Critical |
| --- | ---: | ---: |
| Ingest queued jobs | 25 | 100 |
| Ingest failed jobs | 3 | 10 |
| Ingest dead letters | 1 | 1 |
| Ingest stale running jobs | 1 | 1 |
| Oldest queued ingest age | 3600 seconds | 14400 seconds |
| OCR failures | 1 | 3 |
| Parser failures | 1 | 3 |
| Parser uncertainty/manual review | 5 | 20 |
| Packet PDF failures | 1 | 3 |
| Storage failures | 1 | 3 |
| Auth failures | 10 | 25 |
| Active rate-limit entries | 50 | 200 |
| Max observed rate-limit count | 100 | 500 |
| DB latency proxy | 250 ms | 1000 ms |
| DB active connections | 20 | 50 |

## Durable/Script-Visible Sources

- Ingest queue status and lifecycle events: `ingest_processing_job` and `ingest_processing_job_event`.
- OCR/parser counts: sanitized `reportArtifact.data` metadata and ingest job result summaries.
- Packet PDF attempts, success, failure, and cache hits: `evidenceEvent` rows with packet PDF event types.
- Storage read/write/delete failures: sanitized `auditLog` rows with `details.metric = "storage_failure"`.
- Auth trend: aggregate `auditLog` login success/failure counts and `loginAttempts` failure counts.
- Rate-limit pressure: aggregate `rateLimitEntry` counts.
- DB signal: environment-driven pool config plus read-only latency and active-connection proxies.

## Operator Response

- `Critical`: pause the affected operation class, preserve audit/log context, review the relevant dashboard row, and do not promote readiness.
- `Warning`: review the source rows and recent changes before continuing a beta run.
- `OK`: continue normal limited-beta monitoring cadence.

External alert delivery remains future work; dashboard visibility is the current operator signal.
