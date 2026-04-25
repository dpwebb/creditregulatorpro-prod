---
created: 2026-04-21T05:33:37.308Z
updated: 2026-04-21T05:38:41.898Z
---

# Unified Regulation Registry

## Goal
Consolidate all Canadian credit-reporting regulation data into a single `regulationRegistry` helper so every violation detection has a direct, auditable reference to a confirmed statute — instead of scattered hardcoded strings across dozens of files.

## Pages
No new pages. No page changes needed.

## User accounts
No changes to roles or subscriptions.

## Look & feel
No visual changes.

## What it remembers
No database schema changes. The registry is a pure code-level data consolidation.

## How it works

### 1. Create `helpers/regulationRegistry`

A single source-of-truth file containing:

- **Statute entries** — Each regulation has a unique ID, full citation, short label, description, and applicable violation categories. Covers:
  - PIPEDA principles (4.1–4.10, especially 4.5 Limiting Use, 4.6 Accuracy, and additionally 4.3 Consent [for BUREAU_ACCESS_VIOLATION], 4.7 Safeguards [for identity theft], 4.9 Individual Access [for RESPONSE_MOV_MISSING, CONSUMER_STATEMENT_SUPPRESSION], and 4.10 Challenging Compliance [for FURNISHER_POST_DISPUTE_RETALIATION and all RESPONSE_* violations])
  - Provincial Consumer Reporting Acts with exact section numbers (e.g., Ontario CRA §9(3) accuracy duty, §10 permissible purpose, §12(4) reinvestigation, §12(5) reinsertion notification, §12(8) consumer statement rights, and equivalent sections for BC BPCPA, AB CPA, etc.)
  - Metro2 CRRG specific segment references (§4.1 Base Segment, §4.2 J1 Segment, §4.3 J2 Segment, §5.1 Classification codes, §6.1 Payment rating codes)
  - Federal bankruptcy rules with specific BIA sections (s.178(2) discharge releases debtor, s.168.1 automatic discharge for BANKRUPTCY_DISCHARGE_VIOLATION)
  - Investigation timeframe requirements (30-day statutory period)
  - Provincial Collection Agency Acts for all 13 provinces/territories (Ontario CDSSA 2017, BC BPCPA Part 7, AB Collection Practices Regulation, QC Act respecting collection of certain debts, etc.) — to back COLLECTOR_LICENSE_FAILURE, COLLECTOR_UNAUTHORIZED_FEES, COLLECTOR_STATUTE_REVIVAL_ATTEMPT, COLLECTOR_DUPLICATE_REPORTING, PHANTOM_DEBT_UNVERIFIABLE
  - Provincial Limitations Acts with full citations (ON Limitations Act 2002 S.O. 2002 c.24, BC Limitation Act SBC 2012 c.13, AB Limitations Act RSA 2000 c.L-12, etc.)
  - Canadian Human Rights Act R.S.C. 1985 c.H-6 and provincial human rights codes — mapped to the discriminationClaim table for future detection integration

- **Retention periods by province** — Raw data currently in `provincialRetentionCalculator` (the years/offsets only, not the date-math logic)

- **Collection limitation periods by province** — Raw data currently in `regulationInfractionScannerTypes`

- **Bankruptcy retention rules** — Raw data currently in `bankruptcyRules`

- **Violation-to-regulation mapping** — Which regulation entries apply to each `ViolationCategory`, replacing the current ad-hoc mapping in `violationRegulationMap`

Each entry uses a stable key like `PIPEDA_4_6`, `ON_CRA_S9_3`, `METRO2_CRRG_CLASSIFICATION`, `BIA_DISCHARGE_RETENTION` so detectors can reference them by ID.

### 2. Update compliance detectors (36 modules)

Each detector currently hardcodes strings like `"PIPEDA 4.6"`, `"Provincial CRA — Balance accuracy requirement"`, `"Metro2 CRRG Classification Standards"`. Update them to:
- Import the relevant regulation entry from `regulationRegistry`
- Use the entry's `citation` field for the `regulatoryBasis` / `fcraSection` string
- Optionally embed the entry's `id` in `technicalDetails.regulationId` for downstream traceability

Priority detectors (these have the most hardcoded references):
- `complianceDetectorMetro2` — 5+ `regulatoryBasis` strings
- `complianceDetectorTemporal` — retention period references
- `complianceDetectorStaleReporting` — PIPEDA 4.6 reference
- `complianceDetectorBureau` — Provincial CRA investigation timeframe
- `complianceDetectorBalance` — balance accuracy
- `complianceDetectorStatus` — status accuracy
- `complianceDetectorCollector` — collection limitation periods
- `complianceDetectorFurnisher` — furnisher reporting obligations

Also update the 6 regulation infraction scanner sub-modules:
- `regulationInfractionScannerBureau` — "Provincial Consumer Reporting Acts" string
- `regulationInfractionScannerCreditor` — "PIPEDA / Provincial CRA" strings
- `regulationInfractionScannerCollector` — collection limitation references
- `regulationInfractionScannerSpecialized` — medical/student loan references

### 3. Simplify `violationRegulationMap`

Currently reconstructs legal basis retroactively. Replace its internal data with a thin lookup against `regulationRegistry`. It keeps its export shape (so downstream consumers like `ComplianceViolationCard` don't break) but delegates all data to the registry.

### 4. Update data-consuming helpers

- `provincialRetentionCalculator` — Import retention period raw data from the registry instead of defining it locally. Keep the calculation functions (date math, expiry logic).
- `regulationInfractionScannerTypes` — Move `COLLECTION_LIMITATION_PERIODS` to the registry; import it back.
- `bankruptcyRules` — Import bankruptcy retention data from the registry; keep rule evaluation logic.
- `regulationConstants` — Retire entirely; all data moves to the registry. Update any importers.

### 5. Update the dev notes

Update `static/__dev/notes/canadian-credit-law-rules.md` to reference the new registry as the canonical location for all regulation data.

### 6. Implement missing detectors

Implement new compliance detectors for 3 ViolationCategory values that exist in the DB enum but have no detector code:
- `COLLECTOR_PAYMENT_ACKNOWLEDGMENT_VIOLATION` — backed by Provincial Collection Agency Acts (must acknowledge payments within statutory timeframe).
- `DATE_LOGIC_IMPOSSIBLE` — backed by PIPEDA 4.6 (accuracy) — detect dates that are logically impossible (e.g., opened date after closed date).
- `FURNISHER_RESPONSE_QUALITY` — backed by Provincial CRA reinvestigation standards — assess quality of furnisher responses (separate from the existing CREDITOR_RESPONSE_QUALITY which assesses creditor responses).

### 7. Complete violation-to-regulation mapping

Explicitly map ALL 45 ViolationCategory values to their regulatory backing from the registry. Currently only ~3 out of 45 carry formal citations in the violation output. The registry must ensure every single violation carries a direct reference.

## Execution order

1. Create `helpers/regulationRegistry` with all consolidated data
2. Update `violationRegulationMap` to be a thin lookup
3. Update `regulationConstants` consumers, then delete `regulationConstants`
4. Update `provincialRetentionCalculator`, `regulationInfractionScannerTypes`, `bankruptcyRules` to import from registry
5. Update compliance detectors (batch by similarity — Metro2 group, temporal group, bureau group, etc.)
6. Update regulation infraction scanner sub-modules
7. Implement missing detectors (`COLLECTOR_PAYMENT_ACKNOWLEDGMENT_VIOLATION`, `DATE_LOGIC_IMPOSSIBLE`, `FURNISHER_RESPONSE_QUALITY`)
8. Complete violation-to-regulation mapping for all 45 violation categories
9. Update dev notes

## Outside services
None. This is a pure code refactor with no external service changes.

## Risks & backward compatibility (Considerations)
- All endpoint input/output shapes remain unchanged — no API breaking changes
- The `DetectedViolation` and `InfractionFinding` types keep their existing fields; we only standardize the string values
- `violationRegulationMap` keeps its export interface so frontend components (`ComplianceViolationCard`, `ComplianceAuditViewer`, etc.) continue working
- The refactor is large (~40+ files touched) so it should be done in batches, verifying after each batch
- The Provincial Collection Agency Act citations need legal review since these vary significantly by province and some provinces have updated their acts recently.
- Metro2 CRRG section numbers should be verified against the latest CRRG edition.
- The 3 new detectors are net-new code, not just a refactor, and require thorough unit testing to avoid false positives.
