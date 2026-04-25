---
created: 2026-04-15T03:22:35.272Z
updated: 2026-04-15T03:22:35.272Z
---

# Wire Compliance Config to Scanner

## Summary
Make the admin compliance configuration settings (enabled/disabled + confidence thresholds) actually control the compliance scanning engine. Currently the `compliance_config` table is read/written by the admin UI but **never consulted** by the scanner — all 43 detectors run unconditionally.

The approach uses a **safe post-filter pattern**: all detectors still run exactly as today, then results are filtered by config settings before being returned. This guarantees zero change to existing detector logic.

Additionally, seed the 31 missing violation category config rows so all 45 categories are fully represented in the admin UI.

## Current State
- 14 of 45 violation categories have `compliance_config` rows (all `enabled=true`)
- 31 categories have NO config rows at all
- `complianceScanner.scanForViolations()` never reads `compliance_config`
- 0 tradelines, 0 violations in DB — no existing data at risk

## Files to Modify

### helpers/complianceScanner.tsx
- Add a new function `loadComplianceConfig()` that queries the `compliance_config` table and returns a `Map<ViolationCategory, { enabled: boolean, confidenceThreshold: number }>`.
- In `scanForViolations()`, after ALL detectors have run (and after deduplication), apply a post-filter step:
  1. Query config via `loadComplianceConfig()`
  2. Remove violations whose category is `enabled=false` in the config
  3. Remove violations whose `confidenceScore` is below the category's `confidenceThreshold`
  4. For categories with NO config row, use defaults: `enabled=true`, `confidenceThreshold=50` (permissive — matches current behavior of accepting everything)
- This is the ONLY logic change. The detector invocations, deduplication, and everything else stays exactly the same.
- `persistViolations()` is unchanged — it receives the already-filtered array.

## Files to Create

### (none — no new files needed)

## Database Changes
- Seed the 31 missing `compliance_config` rows with:
  - `enabled = true` (matches current behavior — all detectors active)
  - `confidence_threshold` set to sensible defaults per category type (range 50–85, all below actual detector output ranges so no violations are lost)
  - `user_explanation_template` and `recommended_action_template` set to sensible defaults
  - `updated_at = NOW()`

## Approach

### Step 1: Seed missing config rows
Run a SQL INSERT for all 31 missing categories with `enabled=true` and conservative thresholds. Group by detector family:
- **Response audit detectors** (RESPONSE_*): threshold 55 (these typically output 60+)
- **Bureau detectors** (BUREAU_*): threshold 60
- **Furnisher detectors** (FURNISHER_*): threshold 60
- **Collector detectors** (COLLECTOR_*): threshold 60
- **Advanced detectors** (ZOMBIE_DEBT, PHANTOM_DEBT, etc.): threshold 65
- **Date/stale detectors** (DATE_LOGIC, STALE_REPORTING, LAST_ACTIVITY_DATE): threshold 60
- **Other** (DISCLOSURE, CONSUMER_STATEMENT, INVESTIGATION_RUBBER_STAMP, etc.): threshold 60

### Step 2: Modify complianceScanner
Add `loadComplianceConfig()` and the post-filter in `scanForViolations()`. Keep it minimal — ~20 lines of new code.

### Step 3: Add tests
Add or update `helpers/complianceScanner.spec.tsx` to test the filtering logic:
- Test that disabled categories are filtered out
- Test that violations below the confidence threshold are filtered out
- Test that categories with no config row default to enabled/threshold=50
- Test that violations above the threshold AND enabled pass through unchanged

### Step 4: Pull schema (if needed)
Run `pullSQLDatabaseSchema` if the seed step alters any schema. (It shouldn't — we're only inserting rows.)

## Risks & Considerations

### Why this is safe (non-breaking guarantees):
1. **No detector logic changes** — all 43 detectors run identically. The filter is AFTER detection.
2. **All 45 categories will be `enabled=true`** after seeding — so the filter won't remove anything new vs. today.
3. **Default thresholds are set conservatively below actual detector outputs** — so existing detection patterns are preserved.
4. **Fallback for unconfigured categories** — if somehow a new category is added to the enum but not to config, it defaults to enabled/threshold=50.
5. **0 existing tradelines/violations** — no data at risk.
6. **Both callers (`ingestReportHandler` and `rescan-compliance_POST`) go through the same `scanForViolations()`** — so the filter applies uniformly.
7. **`persistViolations()` is unchanged** — it just receives fewer items if config filters some out.
8. **Backend-only change** — no frontend/mobile changes needed, fully backward compatible.

### Future behavior (the actual improvement):
Once this is wired up, an admin can:
- Toggle a violation category to `enabled=false` → that category stops appearing in new scans
- Raise/lower a confidence threshold → only violations above the threshold are persisted
- This gives real operational control without touching code
