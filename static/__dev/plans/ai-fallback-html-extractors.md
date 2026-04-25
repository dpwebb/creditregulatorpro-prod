---
created: 2026-04-18T10:48:10.045Z
updated: 2026-04-18T10:51:26.182Z
---

# AI Fallback Extractors for Credit Report Ingestion

## Summary
When DocStrange fails for any reason (429, outage, network error), the system automatically falls back to OpenAI (gpt-5-mini) then Gemini (gemini-2.5-flash) to convert the PDF into HTML that matches the exact format the existing HTML parsers expect. The existing deterministic parsers then handle all structured data extraction — no AI JSON parsing needed.

## Files to Create

### `helpers/fallbackPdfExtractor`
New helper with three functions:
- `extractHtmlWithOpenAI(base64Pdf: string): Promise<string | null>` — Sends PDF to OpenAI gpt-5-mini using native file format (`{ type: "file", file: { filename, file_data } }`). The prompt instructs the model to first detect the bureau (TransUnion vs Equifax), then produce HTML matching that bureau's expected format. Returns null on failure.
- `extractHtmlWithGemini(base64Pdf: string): Promise<string | null>` — Sends PDF to Gemini gemini-2.5-flash using `inlineData` with `mimeType: 'application/pdf'`. Same prompt strategy. Uses `GOOGLE_GEMINI_SA_KEY`. Returns null on failure.
- `extractHtmlWithFallbackChain(base64Pdf: string): Promise<{ html: string; source: "openai" | "gemini" } | null>` — Tries OpenAI first, then Gemini. Returns result with source, or null if both fail.

The prompt must include detailed HTML templates for BOTH formats:

**TransUnion HTML template:**
- Sections delimited by headers like `Personal Information :`, `Address(es) :`, `Employment(s) :`, `Telephone Number(s) :`, `Account(s) :`, `Credit Related Inquiries :`, `Non-Credit Related Inquiries :`, `Account Review Inquiries :`, `Insolvency :`
- Each section contains HTML `<table>` elements with header rows matching specific column names
- Report date in format: `as of Month Day, Year`
- TU Case ID, first reported date, last reviewed by/date in paragraph format
- Account blocks each start with a "Creditor Name" label in a table cell
- Each account has tables with fields: Account Number, Account Type, Status, Balance, High Credit, Past Due, Credit Limit, Opened Date, Reported Date, Closed Date, Posted Date, etc.
- Payment history tables with columns: Date, Balance, Payment, Past Due, MOP, Terms, High Credit, Credit Limit, Narrative
- Late payment summary tables with columns: 30, 60, 90, #M

**Equifax HTML template:**
- H1 section headers: `<h1>Personal Information</h1>`, `<h1>Credit Score</h1>`, `<h1>Accounts - Revolving</h1>`, `<h1>Accounts - Installment</h1>`, `<h1>Accounts - Open</h1>`, `<h1>Accounts - Mortgage</h1>`, `<h1>Collections</h1>`, `<h1>Inquiries</h1>`
- H2 headers for individual account/creditor names
- Personal info tables with key-value rows (Current Name, Date of Birth, SIN, addresses with Type/Date/Address/City/Province/Postal)
- Account tables: overview with Account Number/Rating Code, Balance/Amounts table, Payment history with Month/Balance/Credit Limit/High Credit/Past Due columns
- Collections: key-value tables with Date Assigned, Account Number, Amount, Balance, Member Name, etc.
- Inquiries table: Date, Member Name, Phone, May Affect Scores

## Files to Modify

### `helpers/ingestReportHandler`
**In `handleIngestSubmit`:**
- After DocStrange fails (the `submitRes.mode === "failed"` block), instead of immediately returning failure:
  1. Log that DocStrange failed and attempt fallback
  2. Call `extractHtmlWithFallbackChain(input.bytesBase64)`
  3. If fallback succeeds, store the HTML in artifact data as `docstrangeRawHtml` (same field name — the downstream pipeline doesn't care where the HTML came from), set `extractionStatus: "extracted"`, and also set `extractionSource: "openai" | "gemini"` for tracking
  4. Return success with `extractionStatus: "extracted"` so Phase 2 proceeds normally
  5. If fallback also fails, return the original failure as before
- Also fix the missing `updateArtifactProcessingStatus` import (from `ingestProcessingStatus`)

**Phase 2 (`handleIngestProcess`) needs NO changes** — since the fallback produces the same HTML format, the existing `routeHtmlToLLMResponse()` and `routeHtmlToComprehensiveResult()` work unchanged.

### `endpoints/ingest/anonymous-report_POST`
- After `submitDocStrangeExtraction` fails, try `extractHtmlWithFallbackChain` 
- If fallback succeeds, use the returned HTML exactly like the DocStrange HTML is used now
- The rest of the anonymous preview logic works unchanged

## Approach

1. Create `helpers/fallbackPdfExtractor` with carefully crafted prompts containing the exact HTML templates derived from the parser code analysis. The prompt should tell the AI: "You are converting a Canadian credit report PDF into HTML. First detect if this is TransUnion or Equifax, then produce HTML exactly matching the template below."

2. Update `helpers/ingestReportHandler` Phase 1 to try the fallback chain when DocStrange fails, storing the result in the same `docstrangeRawHtml` field so Phase 2 works without modification.

3. Update `endpoints/ingest/anonymous-report_POST` with the same fallback logic.

4. All fallback extractions logged with `[Fallback-OpenAI]` or `[Fallback-Gemini]` prefixes.

5. Store `extractionSource` in artifact data for analytics.

## Risks & Considerations

- **HTML format accuracy**: The AI must produce HTML close enough to DocStrange's format for the parsers to work. The detailed templates in the prompt mitigate this. Even if the AI's HTML isn't pixel-perfect, the parsers use regex and fuzzy matching that tolerates minor variations.
- **Backward compatibility**: Phase 2 is completely unchanged. The HTML goes through the same parsers regardless of source.
- **The `ingestReportHandler` has pre-existing TS errors** — missing `updateArtifactProcessingStatus` import from `ingestProcessingStatus` helper. Fix this as part of the change.
- **Cost**: Only triggered as fallback when DocStrange fails — minimal cost impact.
- **Large PDFs**: Both OpenAI and Gemini can handle multi-page PDFs natively. The prompt should emphasize extracting ALL pages completely.