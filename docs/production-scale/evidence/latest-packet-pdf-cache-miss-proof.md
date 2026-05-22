# Packet PDF Cache-Miss Proof

Generated: 2026-05-22T05:46:09.980Z
Evidence type: SIMULATED
Strategy: bounded synchronous cache-miss envelope
Branch: staging
Commit: 2026701883302c9a80851158313669e015a3465f

> SIMULATED packet PDF cache-miss proof is not production-at-scale proof and did not send mail or call live providers.

## Safety

- Production data mutated: no
- Live mail provider calls: no
- Live external provider calls: no
- External provider call count: 0
- Real consumer PII used: no
- Real credit reports used: no

## Prior Load Evidence

- Path: docs/production-scale/evidence/latest-load-simulated.json
- Exists: yes
- Queue/envelope implemented by prior artifact: false
- Note: Prior SIMULATED load/cache-miss capacity evidence was found.

## Envelope Metrics

- Configured max concurrency: 2
- Configured pending limit: 10
- Configured timeout ms: 1000
- Started renders: 7
- Completed renders: 6
- Failed renders: 1
- Collapsed duplicate requests: 2
- Overload rejections: 0
- Timeout count: 0
- Max active observed: 2
- Max synthetic active renders: 2

## Simulation

- Total synthetic requests: 10
- Synthetic cache-miss requests: 8
- Synthetic cache hits after warmup: 2
- Unique synthetic cache keys: 6
- Render timing p50/p95/max ms: 46.68/46.91/46.91
- Failure behavior visible: yes

## Compatibility

- Packet wording changed: no
- Packet readiness changed: no
- Violation/evidence/regulation logic changed: no
- Send provider behavior changed: no
- Parser/OCR changed: no

## Residual Risk

This is a bounded synchronous envelope, not an async render queue. Cache misses still wait for a bounded render slot and fail safely on overload or timeout. Production target-environment capacity still requires separate staged evidence.
