# Measured Production-Scale Load Evidence

Measured local/staging-safe evidence only. This command refuses production hosts, production-like environments, live providers, real reports, and PII.

Generated at: 2026-05-21T00:20:40.403Z
Branch: `staging`
Commit: `16ff7ee53f6ec16c1d8db24d4209b699f36a5729`
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
- Latency p50/p95/max ms: 21.28/43.6/48.46

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
- Cache miss p50/p95/max ms: 12.07/16.48/16.48

## Operator Dashboard References

- Before: `pnpm run operator:dashboard`
- After: `pnpm run operator:dashboard`
- Note: The harness records references only; run the dashboard before and after the measured baseline in release evidence.

## Threshold Results

- [pass] minRequestCount: actual=32; expected=8
- [pass] minQueueJobCount: actual=16; expected=4
- [pass] maxConcurrency: actual=2; expected=4
- [pass] maxFailureRate: actual=0; expected=0
- [pass] maxLatencyP95Ms: actual=43.6; expected=250
- [pass] maxLatencyMaxMs: actual=48.46; expected=1000
- [pass] maxQueueDepthAfter: actual=0; expected=0
- [pass] maxStaleQueueCount: actual=0; expected=0
- [pass] minRateLimiterAccepted: actual=2; expected=1
- [pass] minRateLimiterRejected: actual=22; expected=1
- [pass] minRateLimiterRejectionRatio: actual=0.9167; expected=0.5
- [pass] maxRateLimiterWritePressureEvents: actual=24; expected=100
- [pass] minPacketPdfCacheHitCount: actual=4; expected=1
- [pass] minPacketPdfCacheMissCount: actual=2; expected=1
- [pass] minDbPoolConfiguredMax: actual=3; expected=1
- [pass] dbPoolSaturationWarningThreshold: actual=0.6667; expected=0.85
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
