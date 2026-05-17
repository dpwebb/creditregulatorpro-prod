---
created: 2026-04-21T16:18:55.870Z
updated: 2026-04-21T16:31:22.432Z
---


# Streamline Credit Bureau Report Extraction — Capture All Fields (TU + EQ)

## Summary
Audit the TransUnion Consumer Disclosure parsing pipeline against the standardized TU report format and close all gaps so that **every relevant field** from the report is extracted, mapped, and persisted to the database. This covers both the HTML path (primary — DocStrange) and the PDF text fallback path.

## Gap Analysis (Current State vs. PDF Template)

### ✅ Already Extracted & Persisted
- Personal Info (name, DOB, SIN status)
- Cross References (aliases, former names)
- Addresses (full history with since-dates, phone associations)
- Employments (employer name, occupation, dates, pay)
- Telephone Numbers (qualifier, number, extension, type, date)
- Account-level fields: creditorName, accountNumber, accountType, responsibilityCode, all dates (opened, closed, firstDelinquency, lastPayment, posted, chargeOff, balloonPayment, reported), balance, highCredit, creditLimit, pastDue, monthlyPayment, terms, status/legend, MOP, paymentPattern
- Payment History summary (30/60/90/#M counts)
- Inquiries (credit-related, non-credit-related, account review — with date, name, telephone)
- Insolvency section
- Consumer Statements
- Report metadata (TU Case ID, first reported date, last reviewed by/date)

### ❌ Gaps — Fields Extracted but NOT Persisted
1. **`paymentHistoryProfile`** — The raw MOP string (e.g., "111111159") is extracted by `transunionAccountParser` but `ingestTradelinePersistence` sets `paymentHistoryProfile: null` on insert. The `tradeline` table HAS the column `payment_history_profile` — it just never gets populated.

2. **`monthsReviewed`** — Extracted by both TU and EQ parsers but never mapped to a tradeline column or stored anywhere. Needs a new column on `tradeline_payment_history` or `tradeline`.

3. **Payment History Detail Rows** — The monthly breakdown (Date, Balance, Payment, Past Due, MOP, Terms, High Credit, Credit Limit, Balloon Payment, Charge Off, **Narrative**) is fully extracted into `paymentHistoryDetails[]` by the account parser. However, it is **only stored as JSON in `pass_extraction`** and is NOT persisted to any queryable table. A new `tradeline_payment_history_detail` table is needed.

4. **Narrative / Legend Codes** — Each monthly payment history row has a Narrative column (e.g., "WO / CG", "TC / CG", "AC /", "CZ /"). These are extracted in `paymentHistoryDetails[].narrative` but have no dedicated storage.

5. **Payment History Summary Counts** — The `{30: x, 60: x, 90: x, #M: x}` object is extracted but only partially persisted. The `tradeline_payment_history` table has `times_30_days_late`, `times_60_days_late`, `times_90_days_late` columns but the HTML parser's `paymentHistory` object isn't being mapped to these columns in the `unifiedExtractor` → `comprehensiveReportStorage` pipeline.

### ❌ Gaps — Not Extracted at All (PDF Text Fallback Path)
6. **PDF Text Path Consumer Info** — The `consumerInfoExtractor` + sub-helpers work on raw text but don't handle the structured TU format (table-based Personal Info, Cross References, Addresses, Employments, Telephones). These are only extracted via the HTML path (`transunionHtmlParser`). The PDF text fallback should have a TU-specific extractor.

7. **PDF Text Path Inquiries** — The `inquiryExtractor` uses raw text pattern matching and misses the three-category TU structure (Credit Related / Non-Credit Related / Account Review). On the HTML path this is handled correctly.

## Equifax Gap Analysis

**EQ Account fields NOT extracted:**
- Creditor Phone number (e.g., "800-728-3277") from Overview table
- Notes field (e.g., "Written-off Closed by credit grantor") from Overview table
- Member Number for regular accounts (e.g., "650ON40987") — only extracted for collections currently
- Rating Code as a separate field (e.g., "R9") — currently mixed into status
- Rating Code Description (e.g., "Revolving - Bad debt, collection account or unable to locate")
- Amount Written Off — not extracted
- Delinquencies dates list — the report has explicit delinquency dates, not extracted as structured data

**EQ Collection fields NOT extracted:**
- Date Verified
- Date Paid/Settled  
- Narrative (field key exists in HTML but not populated)
- Phone Number

**EQ Report-level sections NOT parsed:**
- Employment is a SEPARATE h1 section in the EQ report, but `parseEqPersonalInfo` only looks within the Personal Info section — so employment extraction may fail for actual EQ reports
- "Alerts, Disclosures And Contact History" section (Service Type, Details, Date Reported, Compliance Date) — entire section not parsed
- Personal File Number (EQ reference number, e.g., "3708406180") — not captured as report metadata
- Bank Information Reported section
- Secured Loans section
- Consolidated Debt, Debt Recovery as separate Public Records sub-types

## Files to Modify

### 1. `helpers/ingestTradelinePersistence.tsx`
- Map `paymentHistoryProfile` from the parsed tradeline data instead of hardcoding `null`
- Map `monthsReviewed` once a column exists

### 2. `helpers/unifiedExtractor.tsx`
- Ensure the `paymentHistory` summary counts (30, 60, 90, #M) from the HTML parser are mapped to the `ExtractedPaymentHistory.times30DaysLate`, `times60DaysLate`, `times90DaysLate` fields
- Ensure `paymentHistoryProfile` from the parser is passed through to the `ParsedTradeline`

### 3. `helpers/reportParser.tsx` (PDF text fallback)
- Ensure `paymentHistoryProfile`, `monthsReviewed`, and `paymentHistoryDetails` are mapped from the TU/EQ account parser output to the `ParsedTradeline` type when going through the PDF text extraction path

### 4. `helpers/comprehensiveReportStorage.tsx`
- Add logic to store payment history detail rows to the new `tradeline_payment_history_detail` table
- Map the `paymentHistory` summary counts to `times_30_days_late`, `times_60_days_late`, `times_90_days_late` on `tradeline_payment_history`

### 5. `helpers/transunionAccountParser.tsx`
- No changes needed — already extracts all fields from the HTML path

### 6. `helpers/equifaxAccountParser.tsx`
- Add extraction of `monthsReviewed` field consistently (partially done)
- Ensure `paymentHistoryProfile` extraction is consistent
- `parseSingleEqAccount`: Extract creditor phone, notes, member number, rating code, rating code description, amount written off from the Overview and Balance tables
- `parseEqCollections`: Extract date verified, date paid/settled, narrative, phone number
- Add new function `parseEqEmployment` that handles the standalone Employment h1 section (Type + Employer Name table)
- Handle delinquency dates extraction

### 7. `helpers/equifaxReportParser.tsx`
- Call the new `parseEqEmployment` function and map results
- Add parsing for "Alerts, Disclosures And Contact History" section
- Extract EQ reference number as report metadata

## Files to Create

### 1. New DB table: `tradeline_payment_history_detail`
Schema:
```sql
CREATE TABLE tradeline_payment_history_detail (
  id SERIAL PRIMARY KEY,
  tradeline_id INTEGER NOT NULL REFERENCES tradeline(id) ON DELETE CASCADE,
  report_artifact_id INTEGER NOT NULL REFERENCES report_artifact(id) ON DELETE CASCADE,
  period_date DATE,
  balance NUMERIC,
  payment NUMERIC,
  past_due NUMERIC,
  mop VARCHAR(10),
  terms VARCHAR(50),
  high_credit NUMERIC,
  credit_limit NUMERIC,
  balloon_payment NUMERIC,
  charge_off NUMERIC,
  narrative VARCHAR(255),
  region TEXT NOT NULL DEFAULT 'CA',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_tphd_tradeline_id ON tradeline_payment_history_detail(tradeline_id);
CREATE INDEX idx_tphd_artifact_id ON tradeline_payment_history_detail(report_artifact_id);
```

### 2. New column on `tradeline` table
```sql
ALTER TABLE tradeline ADD COLUMN months_reviewed VARCHAR(20);
ALTER TABLE tradeline ADD COLUMN creditor_phone VARCHAR(50);
ALTER TABLE tradeline ADD COLUMN member_number VARCHAR(100);
ALTER TABLE tradeline ADD COLUMN rating_code VARCHAR(20);
ALTER TABLE tradeline ADD COLUMN rating_code_description VARCHAR(500);
ALTER TABLE tradeline ADD COLUMN amount_written_off NUMERIC;
ALTER TABLE tradeline ADD COLUMN notes TEXT;
ALTER TABLE tradeline ADD COLUMN date_verified DATE;
ALTER TABLE tradeline ADD COLUMN date_paid_settled DATE;

## Approach

### Step 1: Database Schema Changes
- Create `tradeline_payment_history_detail` table
- Add `months_reviewed` column to `tradeline`
- Pull updated schema

### Step 2: Fix `paymentHistoryProfile` Persistence
- In `ingestTradelinePersistence.tsx`, change `paymentHistoryProfile: null` to use the actual extracted value from the parsed tradeline

### Step 2b: Update EQ Account Parser
- Update EQ Account Parser to extract all missing fields from Overview table, Balance/Amounts table, and Payment Details

### Step 2c: Update EQ Collection Parser
- Update EQ Collection Parser to extract date_verified, date_paid_settled, narrative, phone

### Step 2d: Fix EQ Employment Extraction
- Fix EQ Employment extraction (standalone h1 section)

### Step 3: Map Payment History Summary Counts
- In `unifiedExtractor.tsx`, map the HTML parser's `paymentHistory` object (`{30, 60, 90, #M}`) to the `ExtractedPaymentHistory` fields (`times30DaysLate`, `times60DaysLate`, `times90DaysLate`)
- Store `#M` as `monthsReviewed` on the tradeline

### Step 4: Persist Payment History Detail Rows
- Update `comprehensiveReportStorage.tsx` to insert rows into `tradeline_payment_history_detail` from the `paymentHistoryDetails[]` array
- Each monthly row gets its own database record with: period_date, balance, payment, past_due, mop, terms, high_credit, credit_limit, balloon_payment, charge_off, narrative

### Step 5: Ensure `monthsReviewed` Persistence
- Update `ingestTradelinePersistence.tsx` to map `monthsReviewed` to the new column

### Step 5b: Persist New EQ-specific Columns
- Update `ingestTradelinePersistence.tsx` to persist the new EQ-specific columns

### Step 6: Verify End-to-End
- Test with actual report upload to verify all fields flow from parser → extractor → persistence → database

## Risks & Considerations

1. **Backward Compatibility**: All changes are additive (new columns, new table). No existing data or API shapes are modified. Existing reports in the database won't have the new detail rows — only new uploads will populate them.

2. **Data Volume**: Payment history detail rows can be significant (up to 24 rows per account × N accounts per report). For a report with 4 accounts and 24 months each, that's ~96 rows per upload. This is manageable.

3. **PDF Text Fallback**: The text-based `reportParser` path doesn't extract `paymentHistoryDetails` — it only gets the summary counts. This is acceptable since the HTML path (DocStrange) is the primary pipeline. The PDF text path is a fallback and won't populate detail rows.

4. **Date Parsing for Detail Rows**: The `period_date` from payment history is in formats like "Jul 2024", "May 2024" — these need to be parsed to proper dates (first of month).

5. **Duplicate Prevention**: Need ON CONFLICT handling or pre-check when storing detail rows to avoid duplicates if a report is re-processed.

6. **EQ Payment History Layout**: EQ report has two-column payment history layout (left + right halves side by side). The HTML parser must handle both halves being in the same table. The current `parseSingleEqAccount` uses `mapTableRows` which should handle this, but needs verification.

7. **N/A Values in EQ Reports**: N/A values in EQ reports (e.g., Credit Limit = "N/A") need to be parsed as null, not as strings.
