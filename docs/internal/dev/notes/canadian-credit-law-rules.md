# Canadian Credit Law Rules Reference

## 1. Core Principle (SOL scope)
The most critical distinction in Canadian credit law is between **Credit Reporting Retention Periods** (how long an item can appear on a credit report) and **Debt Collection Limitation Periods** (the legal timeframe a creditor has to sue for a debt). These are separate concepts. 

Crucially, **Canadian provincial retention limits apply to ALL credit information** (not just negative/derogatory items). This is a major difference from the US FCRA. The SOL applies to any closed account — whether it is paid, settled, or charged off. Never suppress an SOL violation just because an account appears "clean". The only exempt accounts are those that are currently open and in good standing (no delinquency, MOP 0 or 1, no past-due).

## 2. Provincial Retention Periods table

| Province / Territory | Retention Period | Statute Reference |
| --- | --- | --- |
| Ontario (ON) | 7 years | Consumer Reporting Act, R.S.O. 1990, c. C.33 |
| Quebec (QC) | 7 years | Credit Assessment Agents Act / Civil Code of Québec |
| Prince Edward Island (PE) | 7 years | Consumer Reporting Act, R.S.P.E.I. 1988, c. C-20 |
| British Columbia (BC) | 6 years | Business Practices and Consumer Protection Act, SBC 2004, c 2 |
| Alberta (AB) | 6 years | Consumer Protection Act, RSA 2000, c C-26.3 |
| Saskatchewan (SK) | 6 years | The Credit Reporting Act, RSS 1978, c C-43.2 |
| Manitoba (MB) | 6 years | The Personal Investigations Act, CCSM c P34 |
| New Brunswick (NB) | 6 years | Consumer Reporting Act, RSNB 2011, c 127 |
| Nova Scotia (NS) | 6 years | Consumer Reporting Act, RSNS 1989, c 93 |
| Newfoundland and Labrador (NL) | 6 years | Consumer Reporting Agencies Act, RSNL 1990, c C-32 |
| Northwest Territories (NT) | 6 years | Consumer Protection Act, RSNWT 1988, c C-17 |
| Nunavut (NU) | 6 years | Consumer Protection Act, RSNWT (Nu) 1988, c C-17 |
| Yukon (YT) | 6 years | Consumers Protection Act, RSY 2002, c 40 |

**Reference Date Priority Chain** for calculating SOL: 
DOFD → Last Activity Date → Date of Last Payment → Date Closed → Opened Date

## 3. Debt Collection Limitation Periods table
Timeframe to commence legal action (Statute of Limitations to sue). This determines when a collector can no longer sue, but the account stays on the report until the reporting retention expires.

| Province / Territory | Limitation Period |
| --- | --- |
| Ontario (ON) | 2 years |
| British Columbia (BC) | 2 years |
| Alberta (AB) | 2 years |
| Saskatchewan (SK) | 2 years |
| Quebec (QC) | 3 years |
| Manitoba (MB) | 6 years |
| Nova Scotia (NS) | 6 years |
| New Brunswick (NB) | 6 years |
| Prince Edward Island (PE) | 6 years |
| Newfoundland and Labrador (NL) | 6 years |
| Yukon (YT) | 6 years |
| Northwest Territories (NT) | 6 years |
| Nunavut (NU) | 6 years |

## 4. Bankruptcy & Insolvency Rules table

| Record Type | Retention Rule |
| --- | --- |
| 1st Bankruptcy | 6 years (7 years in ON, PE) from discharge |
| 2nd+ Bankruptcy | 14 years from discharge |
| Consumer Proposal | 3 years from completion OR 6 years from filing (whichever is sooner) |
| Division I Proposal | 3 years from completion |
| Undischarged Bankruptcy | Indefinite |

## 5. Key Federal Statutes
* **PIPEDA (Personal Information Protection and Electronic Documents Act)**: Federal privacy law regulating how businesses handle personal information.
  * Principle 4.3 (Consent)
  * Principle 4.5 (Limiting Use, Disclosure, and Retention)
  * Principle 4.6 (Accuracy)
  * Principle 4.6.1 (Sufficient accuracy)
* **Bankruptcy and Insolvency Act (R.S.C. 1985, c. B-3, s. 178)**: Governs federal insolvency rules and discharge of debts.
* **Metro2 CRRG**: Credit Reporting Resource Guide rules for accurate data furnishing.
* **Canadian Human Rights Act**: Protects against discrimination across 14 protected grounds in the provision of services (including credit).

## 6. Stale Reporting Rules
* Furnishers must report current info as per PIPEDA 4.6.
* Active balance accounts (including charge-offs with balance > $0) must be reported monthly.
* Closed $0 balance accounts have no monthly reporting obligation.
* WARNING triggered at >2 months of no updates for active accounts.
* ERROR triggered at >6 months of no updates for active accounts.

## 7. Investigation Timeframes table

| Province / Entity | Timeframe to Investigate |
| --- | --- |
| Ontario | 30 business days |
| British Columbia | 30 business days |
| Alberta | 30 days |
| Quebec | 30 days strict |
| All others | 30 days |

## 8. 4-Phase Dispute Progression
1. **Phase 1: Foundational Challenge**: Targeting AUTHORITY_TO_REPORT and PERMISSIBLE_PURPOSE.
2. **Phase 2: Methodological Challenge**: Targeting VERIFICATION_METHOD and COMPLETENESS_ATTESTATION.
3. **Phase 3: Substantive Challenge**: Targeting ACCURACY_ATTESTATION and INVESTIGATION_PROCEDURE.
4. **Phase 4: Procedural Exhaustion**: Targeting TIMING_COMPLIANCE. *(Note: The old "PROCEDURALLY EXHAUSTED — CURRENTLY" label is retired).*

## 9. Collection Account Rules
* **Original Creditor Linkage**: Agencies must identify the original creditor and assignment dates are required. They must be licensed to collect in the consumer's province.
* **CRA Display Nuances**: TransUnion (TU) puts the collection agency in the `creditorName` field. Equifax (EQ) puts the agency in an `h2` header with the `memberName` acting as the original creditor.
* **Limitation vs. Retention**: Collection limitation periods determine when a collector can't sue. The account stays on the credit report until the reporting retention expires.

## 10. Zero Balance Rule
* **Discharged Bankruptcy**: Any debt included in a discharged bankruptcy MUST report a $0 balance. A balance > $0 on a discharged debt triggers a Bankruptcy Discharge Violation.

## 11. Critical Rules for AI Changes
1. Never assume US rules apply.
2. SOL applies to ALL closed accounts — confirmed by platform owner.
3. Don't suppress legitimate violations based on account quality assumptions.
4. When in doubt about legal interpretation, ask user first.
5. Retention period ≠ limitation period.
6. Province matters — always resolve before applying rules.
7. Reference date for SOL uses priority chain, not just opened date.

## 12. Regulation Registry
The `helpers/regulationRegistry.tsx` helper is the canonical location for all regulation data. `regulationConstants` has been deleted and replaced by this registry. The registry contains:
* All PIPEDA principles (4.3, 4.5, 4.6, 4.6.1, 4.7, 4.9, 4.10)
* Provincial CRA exact sections for all 13 provinces/territories
* Metro2 CRRG specific segment references (§4.1-§6.1)
* BIA sections (s.178(2), s.168.1)
* Provincial Collection Agency Acts for all provinces
* Provincial Limitations Acts
* Canadian Human Rights Act
* Retention periods, collection limitation periods, and bankruptcy retention rules
* Complete violation-to-regulation mapping (all 46 `ViolationCategory` values mapped)

All compliance detectors and infraction scanners now include `regulationIds` in their `technicalDetails` referencing these centralized keys.

## 13. TC Status vs Collection Tradeline
* TC (Turned over to Collection) status does NOT make a tradeline a collection tradeline.
* TC means the original creditor turned the account over to collections, but the tradeline still belongs to the original creditor.
* `is_collection_account` should remain `false` for TC-status original creditor tradelines.
* A true collection tradeline is a separate entry reported BY the collection agency itself.
* The distinction matters for compliance scanning: collection-specific rules (license verification, assignment date requirements) should NOT apply to TC-status original creditor tradelines.