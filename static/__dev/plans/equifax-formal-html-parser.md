---
created: 2026-04-16T14:56:51.725Z
updated: 2026-04-16T14:56:51.725Z
---

# Equifax Formal Consumer Disclosure HTML Parser

## Summary
Rewrite the Equifax HTML parser (`parseEquifaxHtmlToLLMResponse`) to correctly parse the structured HTML that DocStrange returns from formal Equifax Canada consumer disclosure PDFs. The current parser strips HTML to raw text and uses naive regex, completely missing the rich table structures DocStrange provides. This plan creates a proper HTML-table-aware parser for Equifax reports.

---

## Problem Statement

**Current flow:**
1. DocStrange extracts PDF → structured HTML with `<table>`, `<h1>`–`<h3>`, `<hr>` page breaks
2. `detectBureau()` correctly identifies "Equifax" ✅
3. `parseEquifaxHtmlToLLMResponse()` strips HTML → raw text → regex parsing ❌
4. Most data is lost: consumer info, credit scores, account details, collections, inquiries

**PDF source (22 pages):**
- Personal Info: DAVID PHILIP WEBB, DOB 1961-xx-30, SIN xxx-xx0-240, 3 phones, 3 addresses
- Credit Score: 468 (Equifax)
- Employment: PPAY INC (current), KHITOMER CONSULTANCY LIMITED (previous)
- Accounts: 1 Revolving (Capital One, R9, $248 bal, $300 limit, $358 high), 1 Open (FIDO, O9, $341 bal)
- Collections: 2 (NATIONAL LEGAL GROUP $606, NCRI CAPITAL ASSET INC $811)
- Inquiries: 40+ records with date, member number, name, phone, hard/soft flag
- No bankruptcies, judgments, or debt recovery

**DocStrange HTML structure (key patterns):**
- Page breaks: `<hr />`
- Section headings: `<h1>Personal Info</h1>`, `<h1>Accounts</h1>`, `<h1>Accounts - Revolving</h1>`, `<h1>Collections</h1>`, `<h1>Inquiries</h1>`
- Account names: `<h2>CAPITAL ONE BANK</h2>`, `<h2>FIDO</h2>`
- Sub-sections: `<h3>Overview</h3>`, `<h3>Balance And Amounts</h3>`, `<h3>Payment Details</h3>`, `<h3>Delinquencies</h3>`
- Collection names: bold headers like `<h2>NATIONAL LEGAL GROUP</h2>` with key-value tables below
- All data in `<table>` elements with proper `<thead>`, `<tbody>`, `<tr>`, `<td>`, `<th>` tags

---

## Files to Modify

### 1. `helpers/equifaxReportParser.tsx` — **Major rewrite**
Complete rewrite of `parseEquifaxHtmlToLLMResponse()` to parse HTML tables directly instead of stripping to raw text.

**New functions to add:**

#### `parseEquifaxPersonalInfo(html: string)`
- Find the `<h1>Personal Info</h1>` or `<h1>Identification</h1>` section
- Extract from Identification table: Current Name, AKA names, Personal File Number, DOB, SIN
- Extract Phone Number table: type + number pairs
- Extract Addresses table: Type, Last Reported Date, Address, City, Province, Postal Code
- Map to `LLMResponse.consumerInfo`, `LLMResponse.personalInfo`, `LLMResponse.addresses`, `LLMResponse.telephoneNumbers`

#### `parseEquifaxCreditScore(html: string)`
- Find `<h1>Credit Score</h1>` section
- Extract "Equifax Credit Score" and the numeric value (468)
- Extract date from "as of YYYY/MM/DD"
- Map to `LLMResponse.scores[]`

#### `parseEquifaxEmployment(html: string)`
- Find the Employment section/table
- Extract Type + Employer Name pairs
- Map to `LLMResponse.employments`

#### `parseEquifaxAccounts(html: string)`
- Split by `<h1>Accounts - Revolving</h1>`, `<h1>Accounts - Open</h1>`, `<h1>Accounts - Mortgage</h1>`, `<h1>Accounts - Installment</h1>`
- Within each section, split by `<h2>CREDITOR_NAME</h2>` boundaries
- For each account, extract:
  - **Creditor name** from `<h2>` tag
  - **Overview table**: Account Number, Phone, Highest Balance, Notes, Member Number, Rating Code, Rating Code Description
  - **Balance & Amounts / Account Dates table** (vertical key-value layout):
    - Left column: Balance, Credit Limit, Payment Due, Actual payment, Amount Past Due, Amount Written Off
    - Right column: Opened, Last Reported, Last Payment, Date Closed
  - **Payment Details table**: Months Reviewed, Payment Responsibility
  - **Delinquency dates** from the Delinquencies table
  - **Payment History detail table**: Month, Balance, Credit Limit, High Credit, Past Due, Payment (spanning multiple pages via split tables)
- Map Rating Code (R9, O9, I1, etc.) to status
- Map account type from section header (Revolving/Open/Mortgage/Installment)
- Map to `LLMResponse.tradelines[]`

#### `parseEquifaxCollections(html: string)`
- Find `<h1>Collections</h1>` section
- Split by collection name headers (e.g., `<h2>NATIONAL LEGAL GROUP</h2>` or bold text)
- Each collection has a vertical key-value table:
  - Date Assigned, Member Name, Phone Number, Member Number, First Delinquency, Account Number, Amount, Status, Balance, Narrative, Date Paid/Settled, Date Verified, Last Payment Date
- Map each collection to a tradeline with `isCollectionAccount: true`
- Map to `LLMResponse.tradelines[]` (appended to account tradelines)

#### `parseEquifaxInquiries(html: string)`
- Find `<h1>Inquiries</h1>` section
- Parse the main inquiry table: DATE, MEMBER NUMBER, MEMBER NAME, PHONE, MAY AFFECT SCORES
- Map "Yes"/"No" in MAY AFFECT SCORES to Hard/Soft inquiry type
- Map to `LLMResponse.inquiries[]`, `LLMResponse.creditRelatedInquiries[]`, `LLMResponse.nonCreditRelatedInquiries[]`

#### `parseEquifaxPublicRecords(html: string)`
- Find `<h1>Public Records</h1>` section
- Check for Bankruptcy, Judgments, Debt Recovery sections
- Currently empty for this report but parser should handle future reports
- Map to `LLMResponse.publicRecords[]`, `LLMResponse.insolvency[]`

#### Updated `parseEquifaxHtmlToLLMResponse(html: string)`
- Call all the above functions
- Set `response.bureau = "Equifax"`
- Extract report date from header: "Request Date YYYY/MM/DD"
- Compose the full LLMResponse

### 2. `helpers/_htmlParserUtils.tsx` — Minor additions (if needed)
- May need utility functions for Equifax-specific table parsing
- The existing `parseAllTables`, `parseTableRows`, `extractFieldFromTables` are already solid
- May need a `getHtmlSection(html, startH1Regex, endH1Regex)` helper for splitting by `<h1>` boundaries

### 3. `helpers/docstrangeParser.tsx` — Fix existing TypeScript errors
- Fix TS2339 errors on `lastActivityDate`, `monthlyPayment`, `paymentHistoryProfile`, `sourceText`, `monthsReviewed` properties
- These properties exist on the `_htmlAccountParser` output but not on the Zod-validated `DocStrangeTradelineSchema`
- Cast the tradeline objects to `any` or extend the schema

---

## Files to Create

None — all changes fit within existing files.

---

## Approach

### Step 1: Fix existing TypeScript errors in `docstrangeParser.tsx`
Quick fix to resolve the TS errors that already exist.

### Step 2: Add HTML section extraction utility
Add a `getEquifaxHtmlSection()` function to `equifaxReportParser.tsx` that can extract HTML between `<h1>` boundaries across page breaks (`<hr />`).

### Step 3: Implement personal info parser
Parse the Identification, Phone, and Addresses tables from the HTML.

### Step 4: Implement credit score parser
Extract Equifax Credit Score value and date.

### Step 5: Implement employment parser
Extract employer name and type from HTML table.

### Step 6: Implement accounts parser (core logic)
The most complex piece — parse all account types (Revolving, Open, Mortgage, Installment) from their structured HTML tables with Overview, Balance/Amounts, Payment Details, and Payment History sub-sections.

### Step 7: Implement collections parser
Parse the Collections section into tradelines with collection-specific fields.

### Step 8: Implement inquiries parser
Parse the multi-page inquiry table with hard/soft classification.

### Step 9: Implement public records parser (stub + bankruptcy/judgment support)
Parse when present; empty for this specific report.

### Step 10: Wire everything together in `parseEquifaxHtmlToLLMResponse()`
Compose all parsers into the final LLMResponse output.

### Step 11: Test with the provided report
Run the parser against the provided DocStrange HTML to verify all fields are correctly extracted.

---

## Expected Extraction Results (Validation Targets)

For the provided report, the parser must produce:

| Field | Expected Value |
|-------|---------------|
| bureau | "Equifax" |
| reportDate | "2026/04/16" |
| consumerInfo.fullName | "DAVID PHILIP WEBB" |
| consumerInfo.dateOfBirth | "1961-xx-30" |
| personalFileNumber | "3708406180" |
| scores[0].score | 468 |
| scores[0].scoreType | "Equifax Credit Score" |
| tradelines count | 4 (Capital One + FIDO + 2 collections) |
| tradelines[0].creditorName | "CAPITAL ONE BANK" |
| tradelines[0].accountNumber | "***581" |
| tradelines[0].accountType | "Revolving" |
| tradelines[0].balance | 248 |
| tradelines[0].creditLimit | 300 |
| tradelines[0].highCredit | 358 |
| tradelines[0].pastDue | 248 |
| tradelines[0].status | "R9" |
| tradelines[0].dateOpened | "2023/04/25" |
| tradelines[0].dateClosed | "2024/06/17" |
| tradelines[0].lastPaymentDate | "2023/10/27" |
| tradelines[0].responsibilityCode | "Individual" |
| tradelines[1].creditorName | "FIDO" |
| tradelines[1].accountType | "Open" |
| tradelines[1].balance | 341 |
| tradelines[1].status | "O9" |
| tradelines[2].creditorName | "NATIONAL LEGAL GROUP" |
| tradelines[2].isCollection | true |
| tradelines[2].balance | 606 |
| tradelines[3].creditorName | "NCRI CAPITAL ASSET INC" |
| tradelines[3].balance | 811 |
| inquiries count | ~40+ |
| hardInquiries | BMO-2015, BMO 2203, FAIRSTONE, LENDCARE, etc. |
| employments[0] | "PPAY INC" (Current) |
| employments[1] | "KHITOMER CONSULTANCY LIMITED" (Previous) |
| addresses[0] | "PO BOX 593, STEWIACKE, NS, B0N 2J0" (Current) |
| phones | 902-805-3415, 416-884-3737, 647-612-7729 |

---

## Risks & Considerations

### Backward Compatibility
- The `parseEquifaxHtmlToLLMResponse()` function is ONLY called for Equifax HTML reports
- TransUnion parsing is completely unaffected (different code path)
- The LLMResponse output format is unchanged — downstream consumers (Pass-A mapper, comprehensive result mapper) work as-is
- The old text-based `parseEquifaxSections()` / `extractEquifaxTradeline()` can remain for fallback but will no longer be the primary path

### Format Variations
- This parser is optimized for the **formal Equifax Canada Consumer Disclosure** PDF format
- Other Equifax formats (credit monitoring alerts, etc.) may have different HTML structures
- The parser should degrade gracefully if expected HTML tags aren't found (return empty arrays, not crash)

### DocStrange HTML Quirks
- Page boundaries create `<hr />` tags that can split tables
- Some tables may be split across pages (e.g., Payment History spanning pages 6+)
- The parser must handle table continuation across page breaks
- Member Number in the HTML has a subtle typo: "6500N40987" vs PDF's "650ON40987" — need to preserve as-is from HTML

### Collection → Tradeline Mapping
- Collections must map to tradelines with proper flags
- `isCollectionAccount = true`
- `dateAssignedToCollection` from "Date Assigned"
- `dateOfFirstDelinquency` from "First Delinquency"
- The original creditor info may or may not be present
- These two collections share the same account number (***672) and member (NCRI INC) — they are separate entries on the report

### Rating Code Mapping
- R9 = "Revolving - Bad debt, collection account or unable to locate"
- O9 = "Open - Bad debt, collection account or unable to locate"
- The parser should store both the code (R9) and the description
