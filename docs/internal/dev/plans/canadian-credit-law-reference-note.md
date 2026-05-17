---
created: 2026-04-21T05:22:59.757Z
updated: 2026-04-21T05:22:59.757Z
---

# Canadian Credit Law Reference Note

## Summary
Create a comprehensive `static/__dev/notes/canadian-credit-law-rules.md` reference file documenting all Canadian credit reporting legal rules, regulatory interpretations, and domain-specific knowledge that the AI must consult before making any compliance logic changes. This prevents the AI from making incorrect legal assumptions.

## Files to Create

### `static/__dev/notes/canadian-credit-law-rules.md`
A single, authoritative reference document organized into the following sections:

---

### 1. CORE PRINCIPLE — SCOPE OF RETENTION LIMITS
- **Canadian provincial retention limits apply to ALL credit information**, not just negative/derogatory items
- This is different from US FCRA which distinguishes between positive and negative info
- The SOL (statute of limitations for reporting) applies to any closed account — paid, settled, charged off, or otherwise
- **Never suppress a SOL violation just because an account appears "clean" or has a good payment history**
- The only accounts exempt from SOL checks are accounts that are currently open and in good standing (no delinquency, MOP 0 or 1, no past-due amount)

### 2. PROVINCIAL CREDIT REPORTING RETENTION PERIODS
From `provincialRetentionCalculator.tsx` — these are the maximum years a credit bureau may retain account information from the reference date:

| Province | Years | Statute Reference |
|----------|-------|-------------------|
| Ontario (ON) | 7 | R.S.O. 1990, c. C.33, s. 9(3) |
| Quebec (QC) | 7 | C.Q.L.R., c. P-40.1 |
| Prince Edward Island (PE) | 7 | R.S.P.E.I. 1988, c. C-20, s. 10(3) |
| British Columbia (BC) | 6 | S.B.C. 2004, c. 2, s. 19.13 |
| Alberta (AB) | 6 | R.S.A. 2000, c. F-2, Part 6.1 |
| Saskatchewan (SK) | 6 | S.S. 2004, c. C-43.2, s. 22 |
| Manitoba (MB) | 6 | C.C.S.M. c. C200, s. 103(1) |
| New Brunswick (NB) | 6 | S.N.B. 2011, c. 146, s. 14 |
| Nova Scotia (NS) | 6 | R.S.N.S. 1989, c. 93, s. 9(3) |
| Newfoundland (NL) | 6 | R.S.N.L. 1990, c. C-32, s. 10(3) |
| Northwest Territories (NT) | 6 | R.S.N.W.T. 1988, c. C-17 |
| Nunavut (NU) | 6 | R.S.N.W.T. (Nu) 1988, c. C-17 |
| Yukon (YT) | 6 | R.S.Y. 2002, c. 40 |

**Reference date priority:** DOFD → Last Activity Date → Date of Last Payment → Date Closed → Opened Date

### 3. PROVINCIAL DEBT COLLECTION LIMITATION PERIODS
From `regulationInfractionScannerTypes.tsx` — these are the limitation periods for **debt collection enforcement** (different from reporting retention):

| Province | Years |
|----------|-------|
| ON, BC, AB, SK | 2 |
| QC | 3 |
| MB, NS, NB, PE, NL, YT, NT, NU | 6 |

**Important distinction:** Collection limitation (how long a creditor can sue to collect) is separate from reporting retention (how long a bureau can keep data on file). Do not confuse these.

### 4. BANKRUPTCY & INSOLVENCY RETENTION RULES
From `bankruptcyRules.tsx`:

| Type | Rule | Anchor Date |
|------|------|-------------|
| 1st Bankruptcy | 6 years (7 in ON, PE) | Discharge date |
| 2nd+ Bankruptcy | 14 years | Discharge date |
| Consumer Proposal | 3 years from completion OR 6 years from filing (whichever is sooner) | Completion/Filing date |
| Division I Proposal | 3 years | Completion date |
| Undischarged Bankruptcy | Indefinite | N/A |

### 5. KEY FEDERAL STATUTES
- **PIPEDA** (Personal Information Protection and Electronic Documents Act):
  - Principle 4.3 — Consent for collection/use/disclosure
  - Principle 4.5 — Limiting Use, Disclosure, and Retention
  - Principle 4.6 — Accuracy (data must be accurate, complete, up-to-date)
  - Principle 4.6.1 — Sufficiently accurate to minimize inappropriate decisions
- **Bankruptcy and Insolvency Act** (R.S.C. 1985, c. B-3, s. 178) — discharge releases bankrupt from all provable claims
- **Metro2 CRRG** (Canadian Credit Reporting Resource Guide) — data furnisher reporting standards
- **Canadian Human Rights Act** — 14 protected grounds for discrimination claims

### 6. STALE REPORTING RULES
- Furnishers have an obligation under PIPEDA 4.6 to report accurate, current information
- Accounts with an **active balance** (including charge-offs/write-offs with balance > $0) must still be reported monthly
- Accounts truly closed with $0 balance (paid, settled, transferred) have no ongoing monthly reporting obligation
- Stale reporting threshold: WARNING at >2 months, ERROR at >6 months since last update

### 7. INVESTIGATION TIMEFRAMES
| Jurisdiction | Timeframe |
|-------------|-----------|
| Ontario | 30 business days |
| British Columbia | 30 business days |
| Alberta | 30 days |
| Quebec | 30 days (strict) |
| All others | 30 days |

### 8. DISPUTE PROGRESSION — 4-PHASE SYSTEM
Phase 1: Foundational Challenge (AUTHORITY_TO_REPORT + PERMISSIBLE_PURPOSE)
Phase 2: Methodological Challenge (VERIFICATION_METHOD + COMPLETENESS_ATTESTATION)
Phase 3: Substantive Challenge (ACCURACY_ATTESTATION + INVESTIGATION_PROCEDURE)
Phase 4: Procedural Exhaustion (TIMING_COMPLIANCE) — final phase, ready for legal action

Terminal labels follow this 4-phase progression system. The old "PROCEDURALLY EXHAUSTED — CURRENTLY" label has been retired.

### 9. COLLECTION ACCOUNT RULES
- Collection agencies must identify original creditor
- Assignment dates required for collection reporting
- Collection agencies must be licensed in the province they operate in
- TransUnion puts agency name in creditorName field; Equifax puts agency in h2 header with memberName as original creditor
- Collection limitation periods (Section 3 above) determine when a collector can no longer sue, but the account may still appear on the report until the reporting retention period (Section 2) expires

### 10. ZERO BALANCE RULE — BANKRUPTCY
- Any debt included in a discharged bankruptcy MUST report a $0 balance
- If balance > $0 is detected on a bankruptcy-included tradeline, this triggers a Bankruptcy Discharge Violation

### 11. CRITICAL RULES FOR AI CHANGES
These rules must be followed by the AI before making any compliance logic changes:

1. **Never assume US rules apply.** Canadian law is different in scope, retention periods, and enforcement.
2. **SOL applies to ALL closed accounts in Canada** — not just "negative" ones. This was explicitly confirmed by the platform owner.
3. **Do not suppress legitimate violations** based on assumptions about account quality (e.g., "this account has good payment history so SOL shouldn't apply").
4. **When in doubt about a legal interpretation, ask the user before implementing.** The user is the domain expert on Canadian credit law.
5. **Retention period ≠ limitation period.** Reporting retention (how long data stays on file) and collection limitation (how long a creditor can sue) are two different legal concepts with different timeframes.
6. **Province matters.** Always resolve the consumer's province before applying any retention or limitation rules. Default to Ontario only as a last resort.
7. **The reference date for SOL is NOT just the opened date.** Use the priority chain: DOFD → Last Activity → Last Payment → Date Closed → Opened Date.

---

## Files to Modify
None — this is a new reference file only.

## Approach
1. Create the `static/__dev/notes/canadian-credit-law-rules.md` file with the content above.
2. All content is sourced from existing codebase files: `provincialRetentionCalculator`, `regulationInfractionScannerTypes`, `bankruptcyRules`, `regulationConstants`, `complianceDetectorTemporal`, `complianceDetectorStaleReporting`, and KB content sections.
3. Section 11 incorporates lessons learned from the previous conversation where the AI incorrectly assumed SOL only applies to derogatory accounts.

## Risks & Considerations
- This file is a **reference for the AI**, not a legal document for end users. It should be kept in `__dev/notes/` so it doesn't ship to production.
- If provincial laws change, this file must be updated alongside the code.
- This note captures the rules **as currently implemented in the platform**. If the user identifies additional legal nuances, they should be added here.
