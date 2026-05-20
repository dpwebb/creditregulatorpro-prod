# Packet PDF Cache

Updated: 2026-05-20

## Scope

Packet PDF downloads and mail send routes use a content-addressed cache for generated PDF bytes. This does not change packet wording, packet readiness, violation extraction, evidence binding, mail provider behavior, ingestion, or response processing.

## Cache Storage

Cached PDFs are stored through the existing packet document storage adapter using deterministic object names:

`packet-pdfs/<user-id>/<packet-id>/<purpose>-<sha256>.pdf`

The local development storage URL format is:

`local:packet-pdfs/<user-id>/<packet-id>/<purpose>-<sha256>.pdf`

Legacy `packet.pdfStorageUrl` fallback remains readable for packets without structured content or when structured rendering fails. The cache does not require a destructive migration.

## Invalidation Inputs

The SHA-256 cache key is derived from:

- cache version `packet-pdf-cache-v1`;
- render purpose: `download` or `mail`;
- `packetId`;
- PDF render `userId`;
- parsed packet content after route-specific mutations.

Route-specific mutations are part of the hashed content:

- downloads include the stored packet content and any attached consumer identification data used by the existing download render path;
- mail sends include the stored packet content, document-signing signature image, recipient override fields, and consumer identification attachment used by the existing send render path.

Changing any of those inputs produces a different cache object. For the same inputs, routes reuse the stored bytes and do not call the PDF generator again.

## Render Events

Cache misses record append-only `evidenceEvent` rows:

- `PACKET_PDF_RENDER_ATTEMPT`;
- `PACKET_PDF_RENDER_SUCCEEDED`;
- `PACKET_PDF_RENDER_FAILED`.

Event descriptions include only the render purpose and cache key. They do not store raw PDF bytes, identification images, signatures, packet body text, or extracted report text.

The operator dashboard surfaces packet PDF render attempt, success, failure, and latest-failure counts when runtime database metrics are available.

## Capacity Evidence

`getOrRenderPacketPdfBase64` returns additive timing fields for cache access and cache-miss render duration. These fields are instrumentation only and do not alter packet PDF bytes, packet wording, cache keys, storage behavior, or route semantics.

Cache misses now run inside a bounded synchronous envelope:

- cache hits still return cached bytes without entering the render envelope;
- duplicate concurrent misses for the same content-derived cache key collapse to one render;
- distinct cache misses are bounded by `CRP_PACKET_PDF_CACHE_MISS_MAX_CONCURRENCY`, defaulting to `2`;
- queued cache misses are bounded by `CRP_PACKET_PDF_CACHE_MISS_PENDING_LIMIT`, defaulting to `16`;
- cache-miss renders are bounded by `CRP_PACKET_PDF_CACHE_MISS_TIMEOUT_MS`, defaulting to `15000`;
- overload and timeout failures record packet PDF failure lifecycle evidence and fail before mail-provider calls.

The selected strategy is documented in `docs/packet-pdf-cache-miss-scaling-decision.md`. It is a bounded synchronous envelope, not an async render queue.

The simulated load harness records packet PDF cache hit count, miss count, and cache-miss render timing:

```sh
pnpm run baseline:production-scale-local -- --simulated
```

That output is capacity evidence only. It is not a packet PDF queue, not a cache-miss envelope fix, and not production-scale proof.

The cache-miss envelope proof command records synthetic local evidence:

```sh
pnpm run packet-pdf:cache-miss-proof
```

Outputs:

- `docs/production-scale/evidence/latest-packet-pdf-cache-miss-proof.md`
- `docs/production-scale/evidence/latest-packet-pdf-cache-miss-proof.json`

This evidence is labeled `SIMULATED`. It is not production-at-scale proof and does not call live mail or external providers.
