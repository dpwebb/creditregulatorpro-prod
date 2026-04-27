---
created: 2026-04-16T03:19:58.053Z
updated: 2026-04-16T03:19:58.053Z
---

# Two-Bureau Parser Cleanup

## Summary
Simplify the multi-bureau parser architecture to ONLY support TransUnion and Equifax. Remove the image/PNG upload path and the "unknown" bureau fallback. Enforce that only PDF uploads from these two Canadian bureaus are accepted. Keeps the DOB extraction fix that was already applied.

## Files to Delete
- **helpers/imageReportExtractor** — No longer needed. We only accept PDFs, not images.

## Files to Modify

### helpers/bureauDetectionRouter
- Remove the "unknown" fallback logic from `routeHtmlToLLMResponse`. If bureau is "unknown", throw a clear error: "Unsupported credit bureau format. Only TransUnion and Equifax Canada reports are accepted."
- Change return type of `detectBureau` from `"TransUnion" | "Equifax" | "unknown"` to `"TransUnion" | "Equifax"`, throwing an error for unrecognized formats.
- Fix the `@ts-ignore` comments by importing `parseEquifaxHtmlToLLMResponse` properly (the equifaxReportParser needs to export it — see below).
- Fix the import of `mapDocStrangeResponseToResult` — this function is not currently exported from docstrangeParser. Need to either export it or inline the mapping logic.

### helpers/equifaxReportParser
- Add a new export: `parseEquifaxHtmlToLLMResponse(html: string): LLMResponse` that parses Equifax HTML into the same `LLMResponse` format that `htmlReportParser.parseHtmlToLLMResponse` produces for TransUnion.
- This function should handle Equifax-specific HTML structure: section headers like "CREDIT INFORMATION", "PERSONAL INFORMATION", "INQUIRIES", etc.
- Must extract: personalInfo (name, DOB, SIN), addresses, employments, tradelines, inquiries, public records, insolvency.
- Keep existing text-based functions (`isEquifaxFormat`, `parseEquifaxSections`, `extractEquifaxTradeline`) for backward compatibility.

### helpers/docstrangeParser
- Export the internal `mapDocStrangeResponseToResult` function so `bureauDetectionRouter` can use it. Currently it's only used internally. Just add the `export` keyword — no logic changes.

### helpers/ingestReportHandler
- Replace the two direct calls to TransUnion-only parsers with the bureau router:
  - Replace `parseHtmlToLLMResponse(rawHtml)` → `routeHtmlToLLMResponse(rawHtml)` (for Pass-A mapping)
  - Replace `mapHtmlToComprehensiveResult(rawHtml)` → `routeHtmlToComprehensiveResult(rawHtml)` (for comprehensive result)
- Keep the `mimeType === "application/pdf"` gate — do NOT add image support.
- Add a try/catch around the router calls to handle the "unsupported bureau" error gracefully and send it as an SSE error to the frontend.

## Files NOT Modified (guaranteed untouched)
- **helpers/htmlReportParser** — TransUnion parser, LOCKED
- **helpers/_htmlAccountParser** — TransUnion account parser, LOCKED
- **helpers/_htmlParserUtils** — Already fixed (DOB vertical table fix stays), no further changes
- **helpers/docstrangeLLM** — LLMResponse types, LOCKED
- All downstream mappers (openaiPassAExtractor, etc.) — LOCKED

## Approach
1. Delete `imageReportExtractor`
2. Export `mapDocStrangeResponseToResult` from `docstrangeParser`
3. Add `parseEquifaxHtmlToLLMResponse` to `equifaxReportParser`
4. Simplify `bureauDetectionRouter` — strict TransUnion/Equifax only, error on unknown
5. Wire `ingestReportHandler` to use the router instead of direct TransUnion calls

## Risks & Considerations
- **Backward compatibility**: No endpoint signatures change. Same input/output shapes. The mobile app is unaffected.
- **Existing TransUnion reports**: Zero risk — the TransUnion parser is never modified, only called through a thin routing layer.
- **Equifax HTML parser**: This is new code — it will need real Equifax PDF samples to validate against. The initial implementation should be conservative and extract what it can.
- **Error handling**: Unknown bureau formats now produce a clear user-facing error instead of silently producing empty data. This is better UX.
