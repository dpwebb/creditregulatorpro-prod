---
created: 2026-04-14T13:17:46.335Z
updated: 2026-04-14T13:17:46.335Z
---

# Weighted Change Log Versioning

## Summary
Replace the line-count-based version calculator with a **weighted change log** system. Each logged system change (BUG_FIX, FEATURE_ADDED, SCHEMA_CHANGE, etc.) carries a severity weight. When creating a new version, the system queries all change log entries since the last release, sums their weights into a "change score", and maps that score into a semver bump (major/minor/patch). The admin no longer manually enters a line count — versioning is driven by the actual logged changes.

## Current State
- `helpers/versionCalculator.tsx` — takes `previousLineCount` + `currentLineCount`, calculates % diff, maps to semver
- `endpoints/version/create_POST.ts` — requires `codeLineCount` (int, min 1), calls `calculateNextVersion`
- `components/AdminVersionCreateDialog.tsx` — has a number input for line count, shows preview
- `endpoints/version/log-change_POST.ts` — already logs changes to `audit_log` with types: BUG_FIX, SYSTEM_CHANGE, CONFIG_UPDATE, SCHEMA_CHANGE, FEATURE_ADDED, FEATURE_REMOVED
- `endpoints/version/generate-notes_POST.ts` — already queries audit_log for changes since last release
- DB column `software_version.code_line_count` — stores the old line count per version

## Approach

### Weight Table
Define weights per change type:
| Change Type | Weight | Rationale |
|---|---|---|
| FEATURE_ADDED | 10 | Major new capability |
| FEATURE_REMOVED | 8 | Breaking change, significant |
| SCHEMA_CHANGE | 7 | Structural migration |
| SYSTEM_CHANGE | 5 | General system-level change |
| CONFIG_UPDATE | 2 | Low-risk operational tweak |
| BUG_FIX | 3 | Important but typically scoped |

### Score → Semver Mapping
| Total Score | Bump |
|---|---|
| ≥ 50 | Major (X.0.0) |
| 10–49 | Minor (x.Y.0) |
| 1–9 | Patch (x.y.Z) |
| 0 | No bump (keep current version) |

### Flow
1. Admin clicks "Create New Version" — no line count input anymore
2. Backend queries `audit_log` for SYSTEM-entity changes since last released version's `releasedAt`
3. Sums weights of matching entries → change score
4. Maps score to bump type (major/minor/patch)
5. Increments from last released version string
6. Shows preview in dialog: change log summary + computed version
7. Admin can still enter a manual version override if desired

## Files to Modify

### 1. `helpers/versionCalculator.tsx`
- Replace `calculateNextVersion(currentVersion, prevLines, currLines)` with `calculateNextVersionFromScore(currentVersion: string, changeScore: number): string`
- Keep the same semver parsing/incrementing logic but use the score thresholds above instead of percentage
- Also export the weight table constant `CHANGE_TYPE_WEIGHTS` for frontend preview use

### 2. `endpoints/version/create_POST.ts` + schema
- Remove `codeLineCount` as required field (make it optional for backward compat with mobile app)
- Add new logic: if no manual version provided, query audit_log for changes since last release, sum weights, call `calculateNextVersionFromScore`
- Keep `codeLineCount` optional and still store it if provided (backward compat)

### 3. `components/AdminVersionCreateDialog.tsx`
- Remove the line count number input
- Add a "Change Summary" section that shows:
  - Count of each change type since last release (fetched from a new lightweight endpoint or computed client-side from existing data)
  - The computed change score and resulting version bump
- Keep the optional manual version override input
- Keep the codename input

### 4. `endpoints/version/generate-notes_POST.ts`
- No changes needed — this already queries audit_log and generates notes. But it's referenced here for context since the same audit_log query pattern is reused.

## Files to Create

### 1. `endpoints/version/change-summary_GET`
- New lightweight GET endpoint for admin use
- Queries `audit_log` for entries with entityType='SYSTEM' and relevant actionTypes since the last released version's `releasedAt`
- Returns: `{ changes: { changeType: string, count: number, weight: number }[], totalScore: number, suggestedBump: 'major' | 'minor' | 'patch' | 'none', suggestedVersion: string }`
- Uses `CHANGE_TYPE_WEIGHTS` from versionCalculator
- Used by AdminVersionCreateDialog for the preview

### 2. Hook in `helpers/versionQueries.tsx`
- Add `useChangeSummary()` hook that calls the new endpoint

## DB Changes
- None. The `software_version.code_line_count` column stays (nullable, optional) for backward compatibility. No schema migration needed.

## Risks & Considerations
- **Backward compatibility**: `codeLineCount` becomes optional in the create schema (was required `z.number().int().min(1)`). Old mobile clients sending it will still work. New clients can omit it.
- **Empty change log**: If no changes are logged between releases, the score is 0 and no version bump occurs. The dialog should show a clear message about this.
- **Weight tuning**: The weights are a starting point. They're defined as a constant in `versionCalculator` so they can be easily adjusted later or even made configurable via `system_settings`.
