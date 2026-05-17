# Fix: TU Extraction Prompt — Missing Fields & Source Mapping

Status: COMPLETED

## Problem
The Gemini/OpenAI extraction prompt (`fallbackPdfExtractor`) was missing 3 critical date fields from its TransUnion account field list. The LLM never extracted them, so the parser found nothing, and the compliance detector fell back to `openedDate` — producing incorrect statute of limitations results (e.g. FIDO's "Last Payment Date: Aug 09, 2020" was never captured). Furthermore, 8 fields lacked source mapping instructions (Status, Balance, High Credit, Past Due, Credit Limit, Monthly Payment, Months Reviewed, Responsibility Code), leading to poor extraction accuracy for these values.

## Root Cause
The EXTRACTION_PROMPT had two main issues regarding TU accounts:
1. **Missing date fields**: The prompt omitted "Last Payment" (Last Payment Date) and "Date of First Delinquency", which are critical for statute of limitations and DOFD calculations.
2. **Missing source mapping guidance**: Several fields were listed but had no guidance on WHERE to find them in the PDF since they aren't standalone labeled fields.

## Fix
Implemented the following changes to `fallbackPdfExtractor`'s EXTRACTION_PROMPT:
- Added Last Payment and Date of First Delinquency to the field list.
- Removed Date of Last Activity (doesn't exist in TU reports).
- Added source mapping instructions for 8 implicitly-derived fields:
  - Status: From Legend
  - Balance, High Credit, Past Due, Credit Limit: From detail table rows
  - Monthly Payment: From Terms
  - Months Reviewed: From #M
  - Responsibility Code: From Account Type
- Added Balloon Payment and Charge Off columns to the detail table.
- Expanded Employment columns to include Start Date, Finish Date, Pay, and Pay Frequency.

## Impact
- After this fix, re-uploaded reports will have these dates and implicitly-derived fields extracted and stored correctly.
- The compliance detector's existing fallback chain uses `dateOfLastPayment` correctly.
- For FIDO: Aug 2020 + 6 years = Aug 2026 → WARNING (approaching), not ERROR.
- Existing reports need re-upload or manual gap-fill to pick up the missing dates.
- All changes have been deployed.