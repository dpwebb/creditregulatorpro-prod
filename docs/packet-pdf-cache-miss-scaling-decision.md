# Packet PDF Cache-Miss Scaling Decision

Updated: 2026-05-20

## Selected Option

Bounded synchronous cache-miss envelope.

## Why

The existing packet download and mail-send routes expect a PDF byte response from `getOrRenderPacketPdfBase64`. A bounded async render queue would require pending/status response semantics for downloads and separate send orchestration for cache misses. That is a larger behavior change than needed for the current blocker.

The selected envelope keeps cache hits immediate and keeps first-render behavior compatible, while bounding concurrent cache-miss renders, collapsing duplicate in-flight renders by cache key, applying a render timeout, and failing safely on overload.

## Residual Risk

This is not an async render queue. Cache misses can still wait for a bounded slot, and callers receive a controlled failure if the envelope is overloaded or the render timeout is exceeded. Production target-environment capacity evidence remains required before any production-at-scale claim.

## Compatibility

The change does not alter packet wording, packet readiness rules, selected issue/evidence/regulation binding, tenant checks, cache key inputs, object storage paths, PDF content generation, parser/OCR behavior, response queues, retention, DB pool configuration, or deployment activation.

Mail-send routes still call the mail provider only after a packet PDF is resolved. If cache-miss rendering fails, the send route exits before a provider call.

## Rollback Path

Revert `helpers/packetPdfCacheMissEnvelope.ts` and the `getOrRenderPacketPdfBase64` envelope wiring in `helpers/packetPdfCache.ts`. The previous content-addressed cache behavior remains isolated behind the same helper boundary.

## Evidence Command

```sh
pnpm run packet-pdf:cache-miss-proof
```

Outputs:

- `docs/production-scale/evidence/latest-packet-pdf-cache-miss-proof.md`
- `docs/production-scale/evidence/latest-packet-pdf-cache-miss-proof.json`

The command uses synthetic local render jobs and labels the output `SIMULATED`. It is not production proof and does not call live mail or external providers.
