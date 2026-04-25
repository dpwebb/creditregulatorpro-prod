---
created: 2026-04-16T16:47:59.861Z
updated: 2026-04-16T16:47:59.861Z
---

# Bureau-Specific Parser Compartmentalization

## Summary
Refactor the credit report parsing pipeline to cleanly separate TransUnion and Equifax logic into self-contained, bureau-specific modules. Today, ~15 shared field extractors use regex patterns written primarily for TransUnion's vertical key-value layout. When Equifax reports use a different tabular layout or different labels, these extractors silently return wrong data or null — causing false compliance violations and incorrect field mappings (e.g., the collection agency name bug we just fixed).

The goal is a **Strategy Pattern** where each bureau owns its own extraction logic while sharing common infrastructure (types, HTML table parsing utilities, PDF text extraction).

## Current Architecture (Problem)

### Three overlapping parsing paths
1. **PDF Text Path** — `reportParser` → shared `tradeline*Extractor` helpers (TransUnion-biased regex)
2. **TransUnion HTML Path** — `htmlReportParser` + `_htmlAccountParser` (deterministic HTML parsing)
3. **Equifax HTML Path** — `equifaxReportParser` (partial, bolted-on)

### Shared extractors that assume TransUnion layout
- `tradelineBasicInfoExtractors` — isCollectionAccount, collectionAgencyName
- `tradelineAmountExtractors` — balance, highCredit, pastDue, creditLimit, monthlyPayment (+ async Gemini variants)
- `tradelineDateExtractors` — dateAssignedToCollection, lastActivityDate, lastPaymentDate, maturityDate
- `tradelineAccountTypeExtractors` — responsibilityCode, ecoaCode
- `tradelineOtherExtractors` — interestRate, terms, paymentPattern
- `tradelinePatterns` — section splitting + tradeline extraction from raw text
- `tradelineSectionSplitter` + `tradelineSectionSplitterUtils` + `tradelineSectionSplitterStrategies`

These are referenced by: `reportParser`, `tradelinePatterns`, and `SourceReportParsedView` (frontend debug view).

### Routing layer
- `bureauDetectionRouter` — routes HTML to TU or EQ parser, produces `ComprehensiveParseResult`
- `bureauDetector` — detects bureau from raw PDF text
- `docstrangeParser` — orchestrates DocStrange API → HTML → parse pipeline

## Files to Modify

### Phase 1: Clean HTML Parsing Path (Primary — where all real reports flow)

1. **`helpers/bureauDetectionRouter`** — Refactor to be a thin dispatcher. It should:
   - Detect bureau (already does this)
   - Delegate entirely to `transunionHtmlParser` or `equifaxHtmlParser`
   - No parsing logic in the router itself

2. **`helpers/htmlReportParser`** — Rename/refactor to `helpers/transunionHtmlParser`. This already handles TU-specific HTML parsing. Changes:
   - Move all TransUnion-specific logic here (already mostly in place)
   - Export `parseTransUnionHtmlToLLMResponse` (rename from `parseHtmlToLLMResponse`)
   - Keep `parseHtmlToRawText` as a shared utility (move to `_htmlParserUtils`)

3. **`helpers/_htmlAccountParser`** — Rename/refactor to `helpers/transunionAccountParser`. This is already TransUnion-specific (uses TU's "Creditor Name" label patterns, TU's table structures).

4. **`helpers/equifaxReportParser`** — Already exists but incomplete. Flesh it out:
   - `parseEquifaxHtmlToLLMResponse` already exists — ensure it handles all Equifax-specific collection account mapping (collection agency name = creditor name under `<h2>`, original creditor = memberName field)
   - Equifax-specific date formats (YYYY/MM/DD vs TU's "MMM DD, YYYY")
   - Equifax-specific rating codes (R1-R9, I1-I9) vs TU's status labels

5. **`helpers/docstrangeParser`** — Update `mapDocStrangeResponseToResult` to be bureau-aware:
   - For collection accounts: TU puts agency in creditorName, EQ puts agency in h2 header and memberName as the original creditor
   - Date parsing should respect bureau-specific formats
   - The `mapHtmlToComprehensiveResult` function should use the router

6. **`helpers/_htmlParserUtils`** — Keep as shared infrastructure. Move `parseHtmlToRawText` here from `htmlReportParser` if not already there.

### Phase 2: Clean PDF Text Parsing Path (Fallback)

7. **`helpers/reportParser`** — Refactor the `parseReport` function to:
   - Detect bureau first (already does)
   - Delegate tradeline extraction to bureau-specific modules:
     - `transunionPdfExtractor` for TU text patterns
     - `equifaxPdfExtractor` for EQ text patterns
   - Remove the inline Equifax bolt-on (`isEquifaxFormat` check + `extractEquifaxTradelinesFromSection`)
   - The augmentation loop (lines ~180-280) should call bureau-specific field extractors

8. **`helpers/tradelinePatterns`** — Rename/refactor to `helpers/transunionPdfExtractor`. This helper's `extractTradelines` function uses regex patterns specific to TransUnion's text layout.

9. **`helpers/tradelineSectionSplitter`** + `tradelineSectionSplitterUtils` + `tradelineSectionSplitterStrategies` — These are TU-specific section splitting strategies. Move under `transunionPdfExtractor` or keep as dedicated TU helpers.

10. **Create `helpers/equifaxPdfExtractor`** — New helper for Equifax-specific PDF text parsing:
    - Equifax section splitting (already partially in `equifaxReportParser.parseEquifaxSections`)
    - Equifax tradeline extraction from text blocks
    - Equifax-specific field extractors (DD/MM/YYYY dates, R1-R9 codes, horizontal table amounts)

### Phase 3: Consolidate Shared Extractors

11. **`helpers/tradelineBasicInfoExtractors`** — Keep only truly bureau-agnostic utilities (if any). Move bureau-specific regex into TU/EQ modules.

12. **`helpers/tradelineAmountExtractors`** — Split:
    - Async Gemini extractors (`extractBalanceAsync`, etc.) stay shared (they use AI, not regex)
    - Sync regex extractors move to bureau-specific modules

13. **`helpers/tradelineDateExtractors`** — Move TU-specific date regex to `transunionPdfExtractor`; EQ date parsing to `equifaxPdfExtractor`.

14. **`helpers/tradelineAccountTypeExtractors`** — Move to bureau-specific modules.

15. **`helpers/tradelineOtherExtractors`** — Move to bureau-specific modules.

16. **`components/SourceReportParsedView`** — Update imports. This component references the shared extractors for its debug display. It should call bureau-neutral functions or import from the appropriate bureau module based on detected bureau.

### Phase 4: Update Downstream Consumers

17. **`helpers/ingestTradelinePersistence`** — Already correctly handles bureau-agnostic `ParsedTradeline` objects. No changes needed as long as the parsers produce correct output.

18. **`helpers/ingestReportHandler`** — Update imports if function names change. The pipeline calls `routeHtmlToLLMResponse` and `routeHtmlToComprehensiveResult` which will keep the same API.

19. **`helpers/tradelineReparseSync`** — Update to use bureau-aware re-parsing.

20. **Parser test infrastructure** — `endpoints/parser-test-case/run_POST` and `helpers/parserPatternAnalyzer` should route tests through the bureau-specific parsers.

## Files to Create

1. **`helpers/transunionHtmlParser`** — Extracted from current `htmlReportParser` (may be a rename)
2. **`helpers/transunionAccountParser`** — Extracted from current `_htmlAccountParser` (may be a rename)
3. **`helpers/transunionPdfExtractor`** — Extracted from current `tradelinePatterns` + shared extractors' TU-specific regex
4. **`helpers/equifaxPdfExtractor`** — New: Equifax-specific PDF text field extraction
5. **`helpers/equifaxAccountParser`** — Extracted from `equifaxReportParser`'s account parsing functions (`parseEqAccounts`, `parseEqCollections`, `parseSingleEqAccount`)

## Approach

### Step 1: Create bureau-specific HTML parsers (Phase 1)
- Extract TransUnion HTML logic into `transunionHtmlParser` and `transunionAccountParser`
- Flesh out Equifax HTML logic in the existing `equifaxReportParser`
- Update `bureauDetectionRouter` to be a thin dispatcher
- Update `docstrangeParser` to use router
- **Test**: Re-run existing parser test cases to ensure no regressions

### Step 2: Create bureau-specific PDF text parsers (Phase 2)
- Extract TransUnion text patterns into `transunionPdfExtractor`
- Create `equifaxPdfExtractor` for Equifax text patterns
- Refactor `reportParser` to delegate to bureau-specific modules
- **Test**: Re-run parser test cases for both PDF and HTML paths

### Step 3: Consolidate and clean up shared extractors (Phase 3)
- Move bureau-specific regex from shared extractors into the appropriate bureau modules
- Keep truly shared utilities (Gemini async extractors, generic date parsing)
- Delete or hollow out extractors that are now empty
- Update `SourceReportParsedView` imports

### Step 4: Update downstream consumers (Phase 4)
- Verify `ingestReportHandler`, `tradelineReparseSync`, and parser test infrastructure work with new module structure
- Run end-to-end ingestion test with a TransUnion and Equifax report

## Risks & Considerations

1. **Backward compatibility**: This is deployed as a native mobile app. All endpoint input/output shapes must remain identical. The refactor is internal to the parsing layer — endpoint contracts (`ingest/report_POST`, `ingest/process_POST`, `parser-test-case/run_POST`) stay the same.

2. **Shared types are the contract**: `ParsedTradeline`, `ComprehensiveParseResult`, `LLMResponse` must remain unchanged. All bureau-specific parsers produce these same types.

3. **SourceReportParsedView dependency**: The frontend debug component directly imports shared extractors. It needs updating but only imports, not behavior.

4. **Equifax HTML parser completeness**: The current `equifaxReportParser` handles accounts and collections but may be missing edge cases. The refactor should not introduce new parsing logic — just reorganize existing logic. New Equifax parsing improvements can come after.

5. **Gemini async extractors**: The async/AI-powered extractors (`extractBalanceAsync`, `extractMopAsync`, etc.) are genuinely bureau-agnostic since they use LLM intelligence rather than regex. These should stay shared.

6. **Incremental rollout**: Each phase can be deployed independently. Phase 1 (HTML path) is highest priority since that's where all real DocStrange reports flow. Phase 2 (PDF text) is the fallback path. Phase 3 (cleanup) is housekeeping.

7. **Collection account handling**: The bug we just fixed (collectionAgencyName not being set) is a symptom of the generic parser not understanding bureau-specific semantics. Bureau-specific parsers should explicitly handle:
   - **TransUnion**: "Creditor Name" on a collection = collection agency; may have a separate "Original Creditor" field
   - **Equifax**: `<h2>` header = collection agency; `memberName` table row = original creditor
