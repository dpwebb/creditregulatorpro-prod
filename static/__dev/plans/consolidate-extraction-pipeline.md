---
created: 2026-04-20T15:40:22.228Z
updated: 2026-04-20T15:40:22.228Z
---

# Consolidate Extraction Pipeline — Single Comprehensive Pass

## Summary

Replace the current triple-mapping pipeline (Pass A → A_FULL → ComprehensiveResult) with a **single unified extraction function** that maps the parsed HTML to all required output shapes in one pass. The Gemini gap-fill (Pass B) remains separate as it's a distinct AI call for targeted field recovery.

### Current Flow (3 redundant local mappings)
```
PDF → HTML Extraction (AI call #1)
      ↓
  routeHtmlToLLMResponse(html) → llmData        ← called ONCE
      ├─ mapRawJsonToPassA(llmData)              ← local mapping #1 → pass_extraction (A)
      ├─ mapRawJsonToFullExtraction(llmData)     ← local mapping #2 → pass_extraction (A_FULL)
      ↓
  routeHtmlToComprehensiveResult(html)           ← calls routeHtmlToLLMResponse AGAIN
      └─ mapDocStrangeResponseToResult(llmData)  ← local mapping #3 → tradelines, consumer info, etc.
      ↓
  tradelineReparseSync(artifactId)               ← calls routeHtmlToComprehensiveResult AGAIN (3rd parse!)
      ↓
  Gap-Fill via Gemini (AI call #2)               ← separate endpoint, stays unchanged
```

### Proposed Flow (1 unified mapping)
```
PDF → HTML Extraction (AI call #1)
      ↓
  routeHtmlToLLMResponse(html) → llmData        ← called ONCE
      ↓
  unifiedExtract(llmData, rawText, artifactId)   ← single mapping function
      ├─ returns ComprehensiveParseResult        ← used for tradeline persistence
      ├─ returns PassADraftExtraction            ← derived view, stored in pass_extraction (A)
      └─ returns FullDraftExtraction             ← derived view, stored in pass_extraction (A_FULL)
      ↓
  tradelineReparseSync — SKIPPED during initial ingest (redundant — same HTML)
      ↓
  Gap-Fill via Gemini (AI call #2)               ← unchanged, separate endpoint
```

## Key Design Decisions

1. **ComprehensiveParseResult is the canonical output** — it contains the richest data (tradelines, payment histories, credit scores, inquiries, public records, consumer statements, employment info). Pass A and A_FULL are derived views stored for audit/review purposes.

2. **pass_extraction table records are preserved** — multiple downstream consumers read from this table (passAGating, passAEditLogManager, complianceDetectorDisclosure, cases/review pages). We continue writing to it, just from the unified result.

3. **tradelineReparseSync skip during ingest** — currently the reparse sync re-parses the same HTML that was just parsed. During initial ingest, this is completely redundant. The reparse sync should only run for backfill/reconciliation scenarios (called from admin/backfill-compliance_POST).

4. **Gemini gap-fill stays separate** — it's a genuinely different AI call against the raw PDF for targeted field recovery. No change needed.

5. **Backward-compatible** — all existing types (PassADraftExtraction, FullDraftExtraction, ComprehensiveParseResult) and their consumers remain unchanged. We're just changing how they're produced.

## Files to Create

### `helpers/unifiedExtractor`
- New helper that accepts `(llmData: LLMResponse, rawText: string, artifactId: number)` and returns:
  ```ts
  {
    comprehensive: ComprehensiveParseResult;
    passA: PassADraftExtraction;
    fullExtraction: FullDraftExtraction;
  }
  ```
- Internally, calls `mapDocStrangeResponseToResult(llmData, rawText)` once to get the comprehensive result
- Derives Pass A and A_FULL records from the comprehensive result (reusing the same consumer profile, bureau context, accounts, etc.) rather than re-mapping from llmData separately
- This eliminates the duplicate iteration over tradeline arrays

## Files to Modify

### `helpers/ingestReportHandler`
**Major refactor** — replace the 3 separate mapping stages with a single call to `unifiedExtract`:
- Remove the separate Pass A mapping block (lines ~195–265)
- Remove the separate A_FULL mapping block (lines ~268–320)
- Remove the separate ComprehensiveResult block (lines ~325–380)
- Replace with a single call: `const { comprehensive, passA, fullExtraction } = unifiedExtract(llmData, rawText, artifactId)`
- Still write both pass_extraction records (A and A_FULL) for audit purposes
- Skip the `tradelineReparseSync` call during initial ingest (it's redundant when we just parsed the same HTML)
- Keep the `tradelineReparseSync` call available via the backfill endpoint
- Update SSE progress stages to reflect the simplified pipeline (fewer stages)

### `helpers/ingestResponseBuilder`
- Minor update — adjust to receive the unified result shape instead of separate passA/fullExtraction/parseResult inputs
- May simplify the BuildResponseInput interface

### `helpers/bureauDetectionRouter`
- `routeHtmlToComprehensiveResult` stays as-is (still useful for standalone calls like backfill)
- No changes needed

### `helpers/docstrangeParser` (mapDocStrangeResponseToResult)
- No changes — this is the core mapping function that the unified extractor will call

### `helpers/openaiPassAExtractor` (mapRawJsonToPassA)
- Keep the function (still used by `runPassAWithOpenAI` for DocStrange-direct extraction)
- The unified extractor will derive Pass A from the comprehensive result instead of calling this separately

### `helpers/openaiReportParser` (mapRawJsonToFullExtraction)
- Keep the function (still used by `parseReportWithOpenAI` for DocStrange-direct extraction)
- The unified extractor will derive A_FULL from the comprehensive result instead of calling this separately

### `helpers/tradelineReparseSync`
- No code changes, but it will no longer be called during the initial ingest flow
- It remains available for the backfill endpoint and admin reconciliation

## Approach

### Step 1: Create `helpers/unifiedExtractor`
- Import types from passAExtractorTypes, fullExtractionTypes, reportParserTypes
- Call mapDocStrangeResponseToResult once
- Build PassADraftExtraction by mapping from the comprehensive result's consumerInfo, sourceBureau, reportMetadata
- Build FullDraftExtraction similarly, mapping accounts from the comprehensive tradelines
- Return all three in one object

### Step 2: Refactor `helpers/ingestReportHandler`
- Replace the 3 mapping stages with a single `unifiedExtract` call
- Continue writing to pass_extraction table for both A and A_FULL
- Remove the `tradelineReparseSync` call (it re-parses the same HTML)
- Simplify SSE progress reporting (fewer stages)
- Update the response builder call

### Step 3: Update `helpers/ingestResponseBuilder`
- Adjust input interface to accept the unified result
- Keep the same output shape for backward compatibility

### Step 4: Verify downstream consumers
- passAGating: reads from pass_extraction table — no change needed (we still write records)
- passAEditLogManager: reads from pass_extraction — no change needed
- complianceDetectorDisclosure: reads from pass_extraction — no change needed
- cases/review pages: read from pass_extraction — no change needed
- anonymousCompliancePreview: uses routeHtmlToComprehensiveResult directly — no change needed

## Risks & Considerations

1. **Backward compatibility**: The pass_extraction table must still be populated with both A and A_FULL records. Multiple systems read from it.

2. **Anonymous ingest endpoint** (`ingest/anonymous-report_POST`): Uses `routeHtmlToLLMResponse` and `routeHtmlToComprehensiveResult` directly. Needs review but likely doesn't need changes since it has a simpler flow.

3. **Admin backfill endpoint** (`admin/backfill-compliance_POST`): Calls `tradelineReparseSync` — this remains useful for re-processing old artifacts and should not be removed.

4. **Derivation accuracy**: When deriving Pass A and A_FULL from the comprehensive result, we must ensure all fields are correctly mapped. The comprehensive result may have slightly different field names/structures.

5. **Testing**: The unified extractor should produce identical pass_extraction records as the current separate mappings. We should verify this with a sample artifact.

6. **Mobile app compatibility**: All changes are backend-only. No endpoint signatures change. Fully backward compatible.
