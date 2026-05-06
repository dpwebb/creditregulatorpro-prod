---
created: 2026-04-15T23:58:51.619Z
updated: 2026-04-16T00:02:19.738Z
---

# RETIRED - DO NOT IMPLEMENT LEGACY REPARSE

The DocStrange reparse/backfill portions of this plan are superseded by the
deterministic credit ingestion policy. Stored tradeline repairs must come from
explicit parser rules, aliases, validation rules, or admin-corrected fixtures.

## Summary
Fix parsing/mapping errors that cause tradeline fields (accountType, responsibilityCode, highCredit, mop) to persist with incorrect values. Two root causes: falsy-value mapping bugs in `docstrangeParser.tsx` and stale data from older parser versions with no re-parse mechanism.

## Files to Modify

### 1. `helpers/docstrangeParser.tsx`
Fix falsy-value mapping bugs in `mapDocStrangeResponseToResult`. Replace `||` with `??` or explicit null checks for numeric/string fields:
- `t.accountType || "Unknown"` → `t.accountType ?? "Unknown"` (protects against empty string edge case)
- `t.highCredit || undefined` → `t.highCredit != null ? t.highCredit : undefined` (protects 0 values)
- `t.pastDue || undefined` → `t.pastDue != null ? t.pastDue : undefined`
- `t.creditLimit || undefined` → `t.creditLimit != null ? t.creditLimit : undefined`
- `t.balance || 0` → `t.balance ?? 0`
- `t.responsibilityCode || undefined` → `t.responsibilityCode ?? undefined`
- `t.paymentPattern || undefined` → `t.paymentPattern ?? undefined`
- `t.terms || undefined` → `t.terms ?? undefined`

### 2. `helpers/ingestTradelinePersistence.tsx`
No bugs found — correctly uses `??` for null checks. No changes needed.

### 3. `helpers/_htmlAccountParser.tsx`
No bugs found — parser correctly extracts all fields. No changes needed.

### 4. `helpers/ingestReportHandler.tsx`
At the end of `handleIngestProcess`, after tradelines are persisted and compliance scanning is done, call `tradelineReparseSync` for the artifact. This ensures every ingestion automatically corrects any mapping gaps by doing a second-pass reconciliation against the stored HTML.

### 5. `endpoints/admin/backfill-compliance_POST.ts`
Add a loop that calls `tradelineReparseSync` for all artifacts that have `docstrangeRawHtml` in their data. This provides a one-time admin-triggered backfill to fix all existing stale tradeline data.

## Files to Create

### 1. `helpers/tradelineReparseSync.tsx`
A helper that takes an artifactId, loads the stored `docstrangeRawHtml` from `report_artifact.data`, re-runs the parser (`parseHtmlToLLMResponse` + `mapDocStrangeResponseToResult`), matches parsed tradelines to existing DB records by creditor, and updates stale fields (accountType, responsibilityCode, highCredit, mop, etc.). Also re-runs `scanAndPersistViolations` for each updated tradeline.

## Approach

1. Fix the `||` → `??` mapping bugs in `docstrangeParser.tsx` (prevents future data loss).
2. Create the `tradelineReparseSync` helper for automatic re-parsing.
3. Wire it into the ingestion pipeline (`handleIngestProcess`) so every upload automatically reconciles.
4. Wire it into the admin backfill endpoint so existing stale data gets fixed when admin runs backfill.
5. Admin triggers the backfill once to correct all existing tradeline data.

## Risks & Considerations

- **Backward compatibility**: The mapping fix in docstrangeParser only affects the values passed through, not the shape — fully backward compatible.
- **Zero-value handling**: After the fix, `highCredit: 0` will be stored as `0.00` instead of `null`. This is semantically correct (the bureau reported 0, not "missing").
- **Automatic reconciliation**: The reparse runs automatically during ingestion as a second pass — no user action needed. The admin backfill is a one-time operation for historical data correction.
- **Creditor name resolution**: The reparse should use the same `creditorEntityResolver` flow as the original ingestion to maintain consistency.
