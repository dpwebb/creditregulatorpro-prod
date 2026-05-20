# Measured Production-Scale Load Evidence

Measured local/staging-safe evidence only. This command refuses production hosts, production-like environments, live providers, real reports, and PII.

Generated at: 2026-05-20T21:56:40.769Z
Branch: `staging`
Commit: `1dcc63f804a9850ff016d085f2ac17613e1ad6d7`
Mode: measured-local
Evidence type: MEASURED_LOCAL
Target context: localhost (local)
Status: passed
Threshold policy mode: release-blocking

## Summary

- Total requests/jobs: 78
- Request count: 32
- Queue job count: 16
- Concurrency: 2
- Observed max concurrency: 2
- Iterations: 2
- Latency p50/p95/max ms: 17.95/37.04/37.14

## Queue Depth

- Before: total=16, queued=16
- After: total=16, queued=0, succeeded=16

## DB Pool

- Configured max: 3
- Observed active signal: 2
- Observed borrowed signal: 2
- Observed open connections: unavailable
- Signal source: measured in-process bounded DB pool borrowing proxy; no database connection was opened by the load harness

## Rate Limiter

- Attempts: 24
- Accepted: 2
- Rejected: 22
- Bounded: yes

## Packet PDF Cache

- Total PDF requests: 6
- Cache hits: 4
- Cache misses: 2
- Cache miss p50/p95/max ms: 14.98/15.13/15.13

## Operator Dashboard References

- Before: `pnpm run operator:dashboard`
- After: `pnpm run operator:dashboard`
- Note: The harness records references only; run the dashboard before and after the measured baseline in release evidence.

## Threshold Results

- [pass] minRequestCount: actual=32; expected=8
- [pass] minQueueJobCount: actual=16; expected=4
- [pass] maxConcurrency: actual=2; expected=4
- [pass] maxLatencyP95Ms: actual=37.04; expected=250
- [pass] maxLatencyMaxMs: actual=37.14; expected=1000
- [pass] maxQueueDepthAfter: actual=0; expected=0
- [pass] minRateLimiterAccepted: actual=2; expected=1
- [pass] minRateLimiterRejected: actual=22; expected=1
- [pass] maxRateLimiterWritePressureEvents: actual=24; expected=100
- [pass] minPacketPdfCacheHitCount: actual=4; expected=1
- [pass] minPacketPdfCacheMissCount: actual=2; expected=1
- [pass] minDbPoolConfiguredMax: actual=3; expected=1
- [pass] requireDbPoolSignalOrExplicitUnavailable: actual=true; expected=true
- [pass] requireZeroExternalProviderCalls: actual=0; expected=0

## Safety

- Production data mutated: no
- Production database targeted: no
- Real consumer PII used: no
- Real credit reports processed: no
- Raw report bytes sent: no
- Live external providers connected: no
- External provider calls made: 0
- Parser, OCR, packet, packet PDF, violation, and deployment behavior changed: no
