---
created: 2026-04-17T00:50:54.507Z
updated: 2026-04-17T00:59:37.738Z
---

# Fix Mapping and Parsing Anomalies

## Summary
This plan addresses mapping and parsing anomalies across the TransUnion and Equifax parsing pipelines, snapshot timing, validation rules, and cross-bureau normalization. These anomalies critically disrupt the core dispute-tracking loop, leading to false positive success signals, missed silent corrections, and broken cross-report matching.

## Core Pipeline Context
The platform's core value relies on the following loop:
1. Upload report → Parse data → Take baseline snapshot
2. Create and send dispute packet (baseline snapshot taken)
3. Follow-up upload → Take new snapshot → Compare baseline vs follow-up
4. Detect silent corrections and score favorable changes → Track dispute success

Every anomaly listed in this plan breaks a link in that chain. For instance, bad baseline data causes phantom successes later, while unmapped status codes cause real successes to be ignored. Fixing these parsing issues is essential for accurate pipeline tracking.

## Files to Modify

### 1. `helpers/ingestReportHandler.tsx` — Stale snapshot fix
**Problem:** Snapshots are created at end of `persistTradelines` (step ~85%), but `tradelineReparseSync` (step 91%) and `gapFillTradelines` (step 92%) update tradelines *after* the snapshot, causing snapshots to contain stale/NULL data. Example: FIDO EQ snapshot has all dates NULL even though gap-fill later populated them.

**Impact:**
- FALSE POSITIVE success signals: if the initial snapshot has NULL dates (due to gap-fill timing), and the user sends a packet with that baseline, when the follow-up report arrives with those dates properly parsed, `packetImpactAssessor` will flag them as "favorable temporal changes" — a phantom success that isn't real.
- FALSE DRIFT SIGNALS: `detectSnapshotChanges` will see null→value transitions as drift when it's just gap-fill correction.

**Fix:** After the gap-fill step completes (around percent 92), re-snapshot all affected tradelines. Call `createSnapshotsForBatch(tradelineIds, artifactId)` again and update `snapshotMap` with the new snapshot IDs. This ensures drift detection and packet impact use post-gap-fill data. 
The fix must also update the packet's `baselineSnapshotId` to point to the refreshed post-gap-fill snapshot (if the packet was created in the same ingestion cycle). Additionally: the `snapshotMap` used for packet impact assessment at step 97% must be refreshed with the post-gap-fill snapshot IDs.

### 2. `helpers/equifaxAccountParser.tsx` — Source text + collection fixes
**Problem A:** `parseSingleEqAccount` doesn't include `sourceText` in its return. All Equifax tradelines get `source_text_length = 0`.
**Fix A:** In `parseSingleEqAccount`, pass the raw `html` parameter into the return object as `sourceText: html` (the chunk of HTML for that account). Similarly in `parseEqCollections`, set `sourceText: cred.html` on each collection.

**Problem B:** `parseEqCollections` sets `creditorName = memberName || cred.name`, which puts the *original creditor* as the creditor for collection accounts. The creditor (who's reporting) should be the collection agency.
**Impact:** When the system matches follow-up tradelines to existing ones, it uses `creditorId`. If the creditor is wrong (`memberName` instead of collection agency), the follow-up report may not match to the correct existing tradeline, creating DUPLICATE tradelines instead of updating existing ones. This breaks the entire snapshot chain for that account.
**Fix B:** Swap: set `creditorName = cred.name` (collection agency, from h2 header), `originalCreditorName = memberName` (original debtor). Keep `collectionAgencyName = cred.name` as-is.

**Problem C:** Collection accounts have NULL status. 
**Fix C:** In `parseEqCollections`, derive a status for collections. If the account is a collection, set `status = "Collection"` as a baseline. If we can detect the rating code from the tables (e.g. "9" in Rating Code column), set it as `status = "O9"` or appropriate code.

### 3. `helpers/docstrangeParser.tsx` — Account type normalization
**Problem:** TransUnion outputs `"INSTALLMENT"`, `"REVOLVING"`, `"OPEN"` (uppercase). Equifax outputs `"Revolving"`, `"Open"`, `"Collection"` (title case). No normalization.

**Fix:** In `mapDocStrangeResponseToResult`, normalize `accountType` to uppercase for all tradelines: `accountType: (t.accountType ?? "Unknown").toUpperCase()`. This creates consistent `"REVOLVING"`, `"OPEN"`, `"INSTALLMENT"`, `"COLLECTION"` values across bureaus.

### 4. `helpers/normalizeAccountData.tsx` — Status normalization for EQ rating codes
**Problem:** Equifax uses coded statuses like `"R9"`, `"O9"`, `"I1"` while TransUnion uses descriptive strings. The existing `extractCanonicalStatus` doesn't handle rating codes.
**Impact:**
- The `packetImpactAssessor.compareField` for "status" checks for derogatory keywords like "collection", "charge-off" etc. But Equifax rating codes like "R9" (bad debt) or "O9" don't contain those keywords. So even a clear success (R9→R1 = bad debt fixed to current) would be classified as NEUTRAL not FAVORABLE. The user's dispute success goes unreported.
- The `silentCorrectionDetector` has the same keyword-based status checks — "R9" doesn't match "collection" or "charge-off" so silent corrections on EQ tradelines are missed entirely.
**Fix:** Extend `extractCanonicalStatus` to handle Equifax rating codes:
- R9/O9/I9 → "BAD DEBT / CHARGE OFF"
- R1/O1/I1 → "CURRENT"
- R2-R4/O2-O4/I2-I4 → "DELINQUENT"
- R5/O5/I5 → "COLLECTION"
- R7/O7/I7 → "CONSUMER PROPOSAL"
- R8/O8/I8 → "REPOSSESSION"

Fix must ensure that `packetImpactAssessor` and `silentCorrectionDetector` either normalize statuses before comparison or understand rating codes. Also add a new `normalizeStatusForDisplay(status)` function that converts rating codes to human-readable descriptions for the UI.

### 5. `helpers/transunionAccountParser.tsx` — High credit fallback
**Problem:** FIDO TU (342) has `highCredit = $0` with `balance = $341`. The parser found `$0` in the High Credit field, but the payment history table's first row may have a more accurate high credit value.

**Fix:** After the main extraction, add a final cross-check: if `highCredit` is 0 or null but `balance > 0`, check `paymentHistoryDetails[0].highCredit` as a fallback. If still 0, check if any row in `paymentHistoryDetails` has a non-zero `highCredit` and use the max.

### 6. `helpers/metro2ValidationRules.tsx` — DOFD validation for collections + isCollectionAccount mapping
**Problem A:** The `DATE_DOFD_LOGIC` rule already has a `!data.isCollectionAccount` guard, but validation logs show it still fires for collection accounts 346 and 347. This means `isCollectionAccount` is not being passed correctly to the validator.

**Fix A:** Investigate and fix how `ingestTradelineValidator.validateTradelines` builds the validation data object — ensure `isCollectionAccount` is mapped from the parsed tradeline.

**Problem B:** `BASE_SEGMENT_REQUIRED` fires for "Missing: ACCOUNT STATUS" on collection accounts 346/347, even though the rule has a collection-account exclusion for status. Same root cause — `isCollectionAccount` not propagated.

**Fix B:** Same fix — ensure the validator passes `isCollectionAccount: true` for collection tradelines.

### 7. `helpers/ingestTradelineValidator.tsx` — Propagate isCollectionAccount
**Fix:** When building the data object for each tradeline validation, map `isCollectionAccount` from the parsed tradeline to `data.isCollectionAccount`. Also map `is_collection_account` (snake_case) for backward compat.

### 8. `helpers/crossBureauMatcher.tsx` — Cross-bureau balance discrepancy flagging (new behavior)
**Problem:** FIDO TU reports $341 balance, FIDO EQ reports $0. No automated flag exists for this cross-bureau discrepancy.

**Fix:** After successful cross-bureau matching, compare balances. If they differ by more than 10% or one is zero while the other is non-zero, log an evidence event of type `CROSS_BUREAU_BALANCE_DISCREPANCY`.

## Files to Create

None — all changes are to existing files.

## Approach

1. **Fix EQ parser outputs first** (`equifaxAccountParser.tsx`): Add sourceText, fix collection creditor swap, add collection status derivation
2. **Normalize account type** (`docstrangeParser.tsx`): Uppercase all accountType values
3. **Extend status normalization** (`normalizeAccountData.tsx`): Handle EQ rating codes
4. **Fix TU high credit** (`transunionAccountParser.tsx`): Add fallback from payment history details
5. **Fix validator data mapping** (`ingestTradelineValidator.tsx`): Propagate isCollectionAccount
6. **Fix stale snapshots** (`ingestReportHandler.tsx`): Re-snapshot after gap-fill
7. **Add cross-bureau balance flagging** (`crossBureauMatcher.tsx`): Log discrepancies
8. **Pipeline integrity validation**: After all fixes, verify by checking:
   - Snapshot dates match tradeline dates for all current tradelines
   - `packetImpactAssessor` correctly scores R9→R1 as favorable
   - `silentCorrectionDetector` recognizes EQ rating code improvements
   - Collection tradelines match correctly on follow-up upload
9. **Test end-to-end**: Test against a fresh user reset + re-upload of both the TransUnion and Equifax reports, which gives us a clean baseline to validate all fixes end-to-end.

## Risks & Considerations

- **Snapshot re-creation doubles storage**: Each ingestion will now create 2 snapshots per tradeline (pre and post gap-fill). The first can be considered the "raw parse" baseline and the second the "enriched" baseline. Drift detection should use the latest snapshot, so this is safe.
- **Backward compatibility**: All changes are additive or corrective — no API shape changes, no endpoint removals. Existing tradeline data in the DB won't be retroactively fixed; only future uploads will benefit.
- **Account type normalization**: Uppercasing changes the stored value. Any UI code doing exact-match comparisons with title-case strings (e.g. `=== "Revolving"`) will break. A search across components should be done to ensure all comparisons use case-insensitive logic or uppercase constants.
- **`ingestReportHandler.tsx` is already flagged as too long**: The snapshot refresh should be minimal code (3-4 lines). A future refactor to break this file down is recommended but out of scope.
- **Behavioral changes**: The `packetImpactAssessor` and `silentCorrectionDetector` changes are behavioral — they will change what gets flagged as "favorable" vs "neutral", potentially showing users previously missed successes.
- **Data Migration**: User will reset their account and re-upload reports post-fix, so no data migration is needed. All fixes only need to handle forward-looking ingestion correctly.