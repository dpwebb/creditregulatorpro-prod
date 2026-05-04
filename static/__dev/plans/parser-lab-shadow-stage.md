---
created: 2026-05-04T00:00:00.000Z
updated: 2026-05-04T00:00:00.000Z
---

# Parser Lab Shadow Stage

## Purpose

Add a staging-only path for streamlining TransUnion and Equifax consumer disclosure parsing without changing the production upload pipeline. The lab runs the canonical parser, reports quality and retention metrics, and highlights manual review items.

## Safety Boundary

- Admin-only endpoint: `POST /_api/parser-lab/run`
- No writes to `tradeline`
- No writes to `reportArtifact`
- No profile updates
- No compliance scans
- No packet, evidence, dispute, or billing side effects
- Existing upload endpoints stay unchanged:
  - `POST /_api/ingest/report`
  - `POST /_api/ingest/process`

## Current Implementation

- `helpers/parserLabStage.tsx`
  - Wraps `extractCanonicalCreditReport`
  - Returns parser quality, provenance, source coverage, critical field coverage, review queue, parsed preview data, and hashes

- `endpoints/parser-lab/run_POST.ts`
  - Admin auth gate
  - PDF-only validation
  - Calls the lab helper and returns JSON

- `components/ParserLabStageTab.tsx`
  - Added to `/admin-parser-testing`
  - Allows PDF upload, shadow parsing, quality review, and JSON export

## Promotion Path

1. Run real TransUnion and Equifax disclosure PDFs through Stage Lab.
2. Export JSON from each run.
3. Convert confirmed outputs into parser regression fixtures.
4. Tighten parser rules until review blockers drop.
5. Only after regression stability, promote selected parser changes into the production ingest path.

## Production Gate

Do not switch production ingestion to a new parser behavior unless:

- Parser regression tests pass.
- `pnpm run check` passes.
- Every changed parser behavior has a fixture.
- Ambiguous fields fail into review instead of being guessed.
- Original upload and parser provenance remain preserved.
