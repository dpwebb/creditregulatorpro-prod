# SIMULATED Production-Scale Load Evidence

SIMULATED local evidence only. This is not repeated target-environment production-scale proof and does not claim production-at-scale readiness.

Generated at: 2026-05-20T18:30:24.005Z
Branch: `staging`
Commit: `b5a2ee3505e6faa836d857d980c7f708304ff211`
Target context: localhost (local)
Status: passed

## Summary

- Total synthetic requests/jobs: 23
- Synthetic request count: 8
- Synthetic queue job count: 4
- Concurrency level: 2
- Iterations: 1
- Elapsed ms: 81.46
- Throughput/sec: 98.21
- Latency p50/p95/max ms: 15.12/31.93/31.93

## Ingest Queue Depth

- SIMULATED before: total=4, queued=4
- SIMULATED after: total=4, queued=0, succeeded=4
- Stale queued jobs remaining: 0

## Packet PDF Cache

- Cache hits: 2
- Cache misses: 1
- Cache-miss render timing p50/p95/max ms: 14.73/14.73/14.73
- Packet PDF queue/envelope implemented by this task: no

## DB Pool Signal

- Configured max: 3
- Observed active connections: not available
- Observed open connections: not available
- Observed borrowed signal: 2
- Signal source: SIMULATED in-process bounded worker borrowing; no database was stressed.

## Rate Limiter Pressure

- SIMULATED attempts: 8
- Accepted: 2
- Rejected: 6
- Real abusive traffic sent: no
- Database mutated: no

## Dashboard Warnings

- Before available: no
- After available: no
- Source: not collected by harness; run pnpm run operator:dashboard for live dashboard state

## Safety

- Production data mutated: no
- Production database targeted: no
- Real consumer PII used: no
- Real credit reports processed: no
- Live external providers connected: no
- External provider calls made: 0
- Parser, OCR, packet wording, packet PDF behavior, violation logic, storage behavior, response queue semantics, retention behavior, and deployment activation changed: no
- Production-at-scale readiness claimed: no

## Remaining Blockers

- Blocker 3: SIMULATED evidence only; repeated local/staging measured proof remains required.
- Blocker 4: Cache-miss timing evidence captured; packet PDF queue/envelope fix is not implemented.
- Blocker 16: SIMULATED pool signal only; staging DB pool pressure evidence remains required.
- Blocker 17: SIMULATED pressure only; no real abusive traffic or production DB writes.
