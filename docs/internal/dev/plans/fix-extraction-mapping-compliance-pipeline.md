---
created: 2026-04-16T00:54:34.586Z
updated: 2026-04-16T01:09:59.222Z
---

## Summary
Comprehensive bottom-up fix of the extraction → mapping → compliance detection pipeline, updated to reflect that Canadian credit bureaus do not provide account numbers. All shortcomings identified in the analysis stem from mapping failures that cascade into false positives and false negatives in the compliance layer. This plan fixes them in dependency order: parsing, mapping, detection, integration, and UI cleanup.

---

## Files to Modify

### Layer 1: Parsing Fixes

**helpers/_htmlAccountParser.tsx**
- **Issue #2 (Status concatenation bloat):** In `parseAccount()`, when extracting `status` via `legend` field, clean up the concatenated multi-legend format. If the legend string contains comma-separated status codes, keep only the most specific/actionable one (prefer derogatory status codes over generic ones like "X-Unknown"). Strip "X-Unknown" suffix entirely as it adds no value.

### Layer 2: Mapping Fixes

**helpers/creditorEntityResolver.tsx**
- **Issue #3 (Entity type mismatch):** The resolver returns `"collection"` as entity type but `ingestTradelinePersistence` checks for `"collection_agency"`. Change the entity type for collection agencies from `"collection"` to `"collection"` (keep as-is) but ALSO update the `CreditorEntityType` union to include `"collection_agency"` as an alias, OR fix the consumer in `ingestTradelinePersistence.tsx`.

**helpers/ingestTradelinePersistence.tsx**
- **Issue #3 (continued):** Fix the broken inference line: change `entity.entityType === "collection_agency"` to `entity.entityType === "collection"` so auto-inference of `isCollectionAccount` actually fires for known collection entities like CBV and EOS.
- **Issue #4 (Matching Redesign):** 
  - Remove the two-tier matching strategy entirely. There is no "exact match by accountNumber" tier.
  - Make creditorId the PRIMARY and ONLY matching strategy in `findExistingTradeline`.
  - Remove the `mergeTradelineData` function's special handling for "upgrading Unknown account numbers".
  - Remove all `accountNumber` related conditions from `findExistingTradeline`.
  - Add disambiguation for multiple accounts from the same creditor: compare balance amounts (within 10% tolerance), compare status strings, compare date ranges to avoid merging distinct accounts. If multiple candidates exist for the same creditorId, prefer the one with the closest match rather than the first one found.

**helpers/tradelineReparseSync.tsx**
- Remove the account number matching tier (lines checking `t.accountNumber === pt.accountNumber`). Use creditorId matching only.

### Layer 3: Compliance Detection Fixes

**helpers/complianceDetectorStatus.tsx**
- **Issue #5 (Write-off + balance not flagged):** Expand `detectAccountStatusInconsistency` to also flag:
  - Status containing "WRITE-OFF", "WRITEOFF", "WO-", "BAD DEBT", "CHARGE OFF", "CHARGE-OFF", "CHARGEOFF" with balance > 0
  - Use WARNING severity (not ERROR) since some jurisdictions allow balance reporting on charge-offs for informational purposes
  - Add clear user explanation: "This account was WRITTEN OFF but still shows a balance of $X"

**helpers/complianceDetectorTemporal.tsx**
- **Issue #7 (Statute fires on clean closed accounts):** The `detectStatuteOfLimitations` function currently has a guard that skips non-derogatory accounts, but it's bypassed when `appearsClosed` is true. Fix the logic:
  - After the `appearsClosed` check, add a secondary guard: if `appearsClosed && !tradeline.dateOfFirstDelinquency && (tradeline.mop === "0" || tradeline.mop === "1") && pastDue === 0`, treat as non-derogatory and skip. A closed account with MOP 0/1, no DOFD, and no past due is a clean closure — not subject to statute of limitations for negative information.
  - The statute of limitations applies to **negative** information. A non-derogatory closed account that's simply old doesn't violate retention limits the same way.

**helpers/complianceDetectorMetro2.tsx**
- **Issue #8 (ECOA always present — map and use it):**
  - The credit report ALWAYS contains the ECOA/responsibility code (e.g., "REVOLVING / INDIVIDUAL"). The parser already extracts `responsibilityCode` correctly ("individual"), but `ecoa_code` is NULL in the DB for all tradelines.
  - Fix: 
    1. In `ingestTradelinePersistence.tsx`, add logic to derive `ecoa_code` from `responsibilityCode` when `ecoaCode` is null. Mapping: Individual→I, Joint→J, Authorized User→A, Cosigner→C.
    2. Backfill existing tradelines: run a SQL update to set ecoa_code from responsibility_code for all records where ecoa_code IS NULL.
    3. In `complianceDetectorMetro2.tsx`, do NOT suppress the ECOA check — if ecoa_code is null after ingestion, that's a real extraction bug, not a false positive.

**helpers/complianceDetectorStaleReporting.tsx**
- **Issue #6 (Stale reporting over-exempts):** Refine the early-exit for inactive accounts:
  - Still skip truly dead accounts (paid, settled, transferred)
  - But DO check charge-off and write-off accounts that have a non-zero balance — these are still being actively reported and furnishers must keep them current
  - The logic: if status includes "charge" or "write" BUT balance > 0, don't skip — continue with the staleness check

### Layer 4: Integration Fixes

**helpers/complianceScanner.tsx**
- **Issue #9 (Duplicate mapViolationToObligationType):** Remove the `mapViolationToObligationType` function from this file and import it from a shared location.

**endpoints/tradeline/rescan-compliance_POST.ts**
- **Issue #9 (continued):** Extract the `mapViolationToObligationType` function into the shared `complianceScanner.tsx` helper (or a new small helper) and have both `complianceScanner.tsx` and this endpoint import from the same source. The endpoint version is missing several categories that the scanner version handles. Consolidate to the more complete version from `complianceScanner.tsx`.

### Layer 5: UI & Form Fixes

**components/CreateTradelineDialog.tsx**
- Make the account number field optional (not required). Change the zod schema from `.min(1, "Account number is required")` to `.optional()`. Keep the field in the form but as optional.

**components/TradelinesTable.tsx**
- Remove or hide the "Account" column that displays `accountNumber`. Remove it from exports (CSV and PDF) too since it will always be empty.

**components/TradelineHeader.tsx**
- Remove the `accountNumber` display span. The header should show creditor name and bureau name as the primary identifiers, not account number.
- Show the responsibility code and ECOA in the tradeline detail UI so users can see who is responsible for the account.

**pages/tradelines.$id.tsx**
- Change the page title from `Account {tradeline.accountNumber}` to use the creditor name instead.
- Use ECOA in dispute letters/packets — the responsibility type affects what disputes can be filed (e.g., authorized users have different rights than primary holders).

---

## Files to Create

None — all changes are modifications to existing files.

---

## Approach

### Step 1: Fix Mapping Redesign & UI Cleanup
1. Re-architect matching in `ingestTradelinePersistence.tsx` and `tradelineReparseSync.tsx` to use creditorId exclusively, adding robust disambiguation logic based on balance, status, and dates.
2. Update all UI components (`CreateTradelineDialog`, `TradelinesTable`, `TradelineHeader`, `pages/tradelines.$id.tsx`) to remove or hide account number displays and validation requirements.

### Step 2: Fix Parsing 
3. Clean up status concatenation to remove "X-Unknown" noise in `_htmlAccountParser.tsx`.

### Step 3: Fix Compliance Detectors (Downstream)
4. Expand `detectAccountStatusInconsistency` to catch write-offs with balance
5. Fix `detectStatuteOfLimitations` to not fire on clean non-derogatory closed accounts
6. Map ECOA code from responsibility code during ingestion instead of suppressing missing ECOA errors
7. Allow stale reporting check on charge-offs/write-offs with active balances

### Step 4: Fix Integration (Glue)
8. Consolidate the duplicate `mapViolationToObligationType` into a single shared function
9. Ensure both `complianceScanner.persistViolations` and the rescan endpoint use the same mapping

### Step 5: Verify
- Rescan all 4 tradelines after fixes
- Tradeline 303 (Scotiabank, clean closed): should have FEWER false positive violations (no more statute of limitations)
- Tradeline 304 (Capital One, write-off): should now show violations for write-off + balance
- Tradeline 305 (FIDO, derogatory): should correctly identify as collection-related
- Tradeline 306 (Rogers, old closed): should retain the statute of limitations violation from previous fix
- Verify UI does not show empty account number fields and matching works via creditorId correctly.

---

## Risks & Considerations

1. **Backward compatibility (mobile app):** All changes are to helpers and internal logic — no endpoint input/output shapes change. The rescan endpoint output stays the same. Safe for the deployed native app. Removing account numbers from UI shouldn't impact mobile if it doesn't rely on it.

2. **Matching Strategy Shift:** Relying solely on creditorId + heuristics (balance, dates, status) for disambiguation might result in merging two distinct accounts from the same creditor if their balances and dates are very similar. The tolerance settings must be tuned carefully.

3. **Collection type inference:** Changing the entity type check from `"collection_agency"` to `"collection"` will cause existing collection-entity tradelines to now be flagged as `isCollectionAccount = true` on next ingest. This is the **correct** behavior but will surface new violations on rescan.

4. **Statute of limitations guard change:** The new guard for clean closed accounts (`MOP 0/1, no DOFD, no pastDue`) must be carefully tested to ensure it doesn't accidentally suppress legitimate violations on derogatory closed accounts.

5. **Stale reporting change:** Allowing charge-offs/write-offs with balance to be checked for staleness will surface new violations. These are legitimate but users may see more violations than before.

6. **mapViolationToObligationType consolidation:** Moving this to a shared location requires updating imports in both `complianceScanner.tsx` and the rescan endpoint. Must ensure the consolidated version includes ALL categories from both sources.