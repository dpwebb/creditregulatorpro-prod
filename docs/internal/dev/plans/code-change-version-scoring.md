---
created: 2026-04-19T22:46:34.461Z
updated: 2026-04-19T22:56:53.788Z
---

# Code-Change-Based Version Scoring

## Summary
Fully automated version scoring — NO admin input. Every admin/system operation that modifies platform behavior automatically contributes to the version score through the existing audit_log entries (which already capture CREATE/UPDATE/DELETE operations on system entities via `logAudit` calls in endpoints). Reset all existing versions and start fresh at v1.0.0.

### Version Format: `{major}.{minor}.{patch}`
Examples: v1.0.0, v1.0.1, v1.1.0, v2.0.0

### Scoring Model
Each tracked operation gets a SemVer level (MAJOR, MINOR, or PATCH):

**MAJOR level operations** (breaking/structural changes):
- SYSTEM entity: SCHEMA_CHANGE, FEATURE_REMOVED
- Any entity: DELETE of a BUREAU (removing a whole bureau is breaking)

**MINOR level operations** (new capabilities, non-breaking):
- SYSTEM entity: FEATURE_ADDED, SYSTEM_CHANGE
- BUREAU entity: CREATE
- STATUTE entity: CREATE
- OBLIGATION entity: CREATE
- ENFORCEMENT_MECHANISM entity: CREATE
- REGULATORY_UPDATE entity: CREATE
- FEATURE_FLAG entity: CREATE, DELETE
- SCANNING_RULE entity: CREATE
- FURNISHER_OBLIGATION / FURNISHER_VALIDATION entity: CREATE
- COMPLIANCE_CONFIG entity: any change (UPDATE, SETTINGS_CHANGED)

**PATCH level operations** (fixes, tweaks, updates):
- SYSTEM entity: BUG_FIX, CONFIG_UPDATE, SETTINGS_CHANGED
- BUREAU entity: UPDATE
- STATUTE entity: UPDATE, DELETE
- OBLIGATION entity: UPDATE, DELETE
- ENFORCEMENT_MECHANISM entity: UPDATE, DELETE
- REGULATORY_UPDATE entity: UPDATE, DELETE
- FEATURE_FLAG entity: UPDATE
- SCANNING_RULE entity: UPDATE, DELETE
- FURNISHER_OBLIGATION / FURNISHER_VALIDATION entity: UPDATE, DELETE

User-level entities (TRADELINE, PACKET, REPORT_ARTIFACT, USER_ACCOUNT, EVIDENCE_EVENT, etc.) do NOT contribute.

### Version Bump Logic
The version bump is determined by the **highest-level change** since the last release, NOT cumulative sums:
- If ANY MAJOR-level operation exists → major bump: {major+1}.0.0
- Else if ANY MINOR-level operation exists → minor bump: {major}.{minor+1}.0
- Else if ANY PATCH-level operation exists → patch bump: {major}.{minor}.{patch+1}
- No tracked operations → no bump

### No Manual Input
- Remove the "Manual Change Entry" / "Log a Change" form from AdminVersionCreateDialog entirely
- Remove the `version/log-change_POST` endpoint (or deprecate)
- The change-summary endpoint reads directly from audit_log

## Database Changes
1. DELETE all rows from `software_version` table
2. DELETE all rows from `version_migration` table  
3. DELETE all rows from `beta_issue_report` table (if version-related)
4. INSERT initial version: v1.0.0, status='released', released_at=NOW()

## Files to Modify

### 1. helpers/versionCalculator
- Remove all percentage/impact/weight constants
- Add OPERATION_LEVEL_MAP: nested map of entityType → actionType → 'MAJOR' | 'MINOR' | 'PATCH' | null (null = not tracked)
- Add TRACKED_ENTITY_TYPES: list of entity types that contribute
- Add `getOperationLevel(entityType, actionType): 'MAJOR' | 'MINOR' | 'PATCH' | null`
- Add `calculateNextSemVer(currentVersion: string, highestLevel: 'MAJOR' | 'MINOR' | 'PATCH'): string`
- Add `determineHighestLevel(operations: {entityType, actionType}[]): 'MAJOR' | 'MINOR' | 'PATCH' | 'none'`

### 2. endpoints/version/change-summary_GET (schema + handler)
- Query audit_log for tracked entity types since last release
- For each entry, get its SemVer level via getOperationLevel
- Return: { changes: [{entityType, actionType, count, level}], highestLevel: 'MAJOR'|'MINOR'|'PATCH'|'none', suggestedVersion, lastReleasedVersion, totalOperations }
- Replace totalScore/totalImpactPercent/suggestedBump with highestLevel

### 3. endpoints/version/create_POST
- Use determineHighestLevel + calculateNextSemVer instead of score/percentage calculation

### 4. endpoints/version/generate-notes_POST
- Query audit_log for tracked entity operations since last release
- Group by entityType for categorization in the Gemini prompt
- Categories: "System Changes", "Bureau Changes", "Compliance Changes", "Configuration Changes", etc.

### 5. endpoints/version/validate-publish_POST
- Update the "Change Logs" check to query audit_log for entries where entityType is in TRACKED_ENTITY_TYPES

### 6. components/AdminVersionCreateDialog
- Display change summary grouped by level (Major Changes, Minor Changes, Patch Changes)
- Show the highest level prominently with a badge
- Show suggested version

### 7. helpers/versionQueries
- Update useChangeSummary return type to match new shape (highestLevel instead of totalScore)

### 8. endpoints/version/log-change_POST
- DELETE this endpoint entirely (or at minimum remove its usage from AdminVersionCreateDialog)

## Approach
1. Run SQL to delete all existing versions/migrations, insert v1.0.0 as current released version
2. Pull updated schema if needed
3. Update helpers/versionCalculator with new SemVer level-based logic
4. Update endpoints/version/change-summary_GET to use audit_log with OPERATION_LEVEL_MAP
5. Update endpoints/version/create_POST to use highest-level change calculation
6. Update endpoints/version/generate-notes_POST to use tracked entities
7. Update endpoints/version/validate-publish_POST change log check
8. Update helpers/versionQueries for new output shape
9. Update components/AdminVersionCreateDialog — display grouped changes and highest level
10. Delete endpoints/version/log-change_POST

## Risks & Considerations
- Backward compatibility: output shape of change-summary changes — update all consumers
- Existing audit_log entries from before v1.0.0 release date won't contribute (clean start)
- Version format changes to standard SemVer patch format
- The highest-level version bumping ignores smaller changes implicitly (though they will be reflected in release notes if tracked).