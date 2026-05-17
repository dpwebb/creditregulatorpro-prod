---
created: 2026-04-16
updated: 2026-04-16T13:09:51.485Z
---

# Fix Version System — Automatic Code/System Change Tracking

## Summary
The version system should AUTOMATICALLY track code/system changes — not require manual admin logging, and not count regular user activity. Currently, zero system changes are recorded because (a) admin/config endpoints don't log audit entries, and (b) CHANGE_TYPE_WEIGHTS pollutes the score with user activity types. Fix: auto-log system changes in all admin/config endpoints, remove user activity types from version scoring, and remove the manual "Log Change" UI since it's never used.

## Root Cause
1. `CHANGE_TYPE_WEIGHTS` includes operational user activity types (CREATE, UPDATE, DELETE, UPLOAD, etc.) that shouldn't count toward version bumps.
2. Admin/system config endpoints (settings, compliance config, feature flags, scanning rules, statutes, migrations) have NO audit logging at all — so system changes are never recorded.
3. The only mechanism was manual "Log Change" button which the admin never uses.

## Files to Modify

### 1. `helpers/versionCalculator.tsx`
- Remove ALL operational action types from `CHANGE_TYPE_WEIGHTS`. Keep ONLY system/code change types:
  - FEATURE_ADDED: 10
  - FEATURE_REMOVED: 8
  - SCHEMA_CHANGE: 7
  - SYSTEM_CHANGE: 5
  - BUG_FIX: 3
  - CONFIG_UPDATE: 2
  - SETTINGS_CHANGED: 2
- Remove: CREATE, UPDATE, DELETE, UPLOAD, PACKET_GENERATED, DOWNLOAD, ESCALATION_TRIGGERED, EXHAUSTION_REACHED, CHALLENGE_INITIATED, CHALLENGE_UPDATED, RESPONSE_RECORDED, DATA_EXPORT

### 2. Auto-log system changes in admin/config endpoints
Add `logAudit` calls (using appropriate system action types) to these endpoints that currently have NO audit logging:

**CONFIG_UPDATE action:**
- `endpoints/admin/compliance-config_POST.ts` — logs CONFIG_UPDATE when compliance config is changed

**SETTINGS_CHANGED action:**
- `endpoints/admin/settings_POST.ts` — logs SETTINGS_CHANGED when system settings are modified

**FEATURE_ADDED / FEATURE_REMOVED actions:**
- `endpoints/feature-flag/create_POST.ts` — logs FEATURE_ADDED
- `endpoints/feature-flag/update_POST.ts` — logs SYSTEM_CHANGE (flag toggled/modified)
- `endpoints/feature-flag/delete_POST.ts` — logs FEATURE_REMOVED

**SYSTEM_CHANGE action:**
- `endpoints/scanning-rule/update_POST.ts` — logs SYSTEM_CHANGE
- `endpoints/scanning-rule/delete_POST.ts` — logs SYSTEM_CHANGE
- `endpoints/scanning-rule/generate_POST.ts` — logs SYSTEM_CHANGE (new rules auto-generated)

**SCHEMA_CHANGE action:**
- `endpoints/statute/create_POST.ts` — logs SCHEMA_CHANGE (new statute added)
- `endpoints/statute/update_POST.ts` — logs SCHEMA_CHANGE (statute modified)
- `endpoints/statute/delete_POST.ts` — logs SCHEMA_CHANGE (statute removed)
- `endpoints/migration/create_POST.ts` — logs SCHEMA_CHANGE (migration added)

### 3. `endpoints/version/generate-notes_POST.ts`
- Update `relevantActionTypes` to ONLY include system/code change types: BUG_FIX, SYSTEM_CHANGE, CONFIG_UPDATE, SCHEMA_CHANGE, FEATURE_ADDED, FEATURE_REMOVED, SETTINGS_CHANGED
- Simplify the AI prompt to focus on code/system change categorization only, removing guidance about "Data Changes" and "Compliance & Workflow Activity"

### 4. `components/AdminVersionTab.tsx`
- Remove the manual "Log Change" dialog and related state/handlers (isLogChangeOpen, logChangeForm, handleOpenLogChange, handleLogChange, logChangeMutation) since changes are now tracked automatically
- Remove the "Log Change" button from the hero card actions and from other version card footers
- Remove the import of `useLogSystemChange`

### 5. Cleanup
- `helpers/useLogSystemChange.tsx` — can be deleted since the manual log dialog is removed
- `endpoints/version/log-change_POST.ts` — can be deleted since manual logging is no longer needed (keep for backward compatibility if the mobile app uses it; otherwise delete)

## Files to Create
None.

## Approach
1. Update `CHANGE_TYPE_WEIGHTS` to remove operational types (step 1)
2. Add audit logging to all admin/config endpoints (step 2)
3. Update `generate-notes_POST.ts` to only query system change types (step 3)
4. Remove manual "Log Change" UI from AdminVersionTab (step 4)
5. Clean up unused helpers/endpoints (step 5)

## Risks & Considerations
- After this fix, the change summary will accurately reflect admin/system configuration changes only
- `change-summary_GET.ts` and `create_POST.ts` automatically benefit from step 1 since they derive their filter from `CHANGE_TYPE_WEIGHTS`
- No database or schema changes needed
- The "Log Change" endpoint deletion must be checked against mobile app backward compatibility. If the mobile app doesn't call it, safe to delete. If unsure, keep the endpoint but remove only the frontend UI.
- The version score will initially be 0 after cleanup — it will start accumulating as admins make real config/system changes going forward