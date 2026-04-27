---
created: 2026-04-14T13:37:55.659Z
updated: 2026-04-14T13:37:55.659Z
---

# Version Management — Production Polish

## Summary
Three small fixes to polish the weighted change-log versioning feature before production:
1. Add missing `DialogDescription` to `AdminVersionCreateDialog` (accessibility fix)
2. Make `useChangeSummary()` only fetch when the dialog is open (unnecessary network request)
3. Add semver format validation to manual version override input

## Files to Modify

### 1. `components/AdminVersionCreateDialog.tsx`
- Add a visually-hidden `<DialogDescription>` inside `<DialogHeader>` after `<DialogTitle>` to fix the aria-describedby console warning. Text can be something like "Review change summary and create a new version".
- Pass `open` state to `useChangeSummary` via an `enabled` option so the query only runs when the dialog is open. This means the hook call stays at top level but the query won't fire until the dialog opens.

### 2. `endpoints/version/create_POST.schema.ts`
- Add a `.regex()` validator to the optional `version` field that enforces a basic semver-like format (e.g. `/^\d+\.\d+\.\d+/`). This prevents storing garbage strings like `"abc"`, `" "`, or injection-style strings as version numbers.
- Keep the field optional — omitting it still triggers auto-versioning.

### 3. `helpers/versionQueries.tsx`
- Update the `useChangeSummary` hook to accept an optional `enabled` boolean parameter, defaulting to `true`. Pass it through to the `useQuery` options.

## Files to Create
None.

## Approach
1. Update `versionQueries.tsx` to accept `enabled` param in `useChangeSummary`.
2. Update `AdminVersionCreateDialog.tsx` to add `DialogDescription` and pass `open` to `useChangeSummary({ enabled: open })`.
3. Update `create_POST.schema.ts` to add regex validation on the version field.

## Risks & Considerations
- The semver regex should be lenient enough to accept common formats (e.g. `1.0.0`, `1.0.0-beta`, `1.0.0-rc.1`) but strict enough to reject obvious garbage. A pattern like `/^\d+\.\d+\.\d+/` (anchored at start, allows suffixes) is recommended.
- This is a backend schema change — mobile app clients sending a manual version string that doesn't match the regex would get a 400. Since manual version override is admin-only and was just added, there are no existing mobile clients relying on non-semver strings. Safe to deploy.
- The `enabled` change to `useChangeSummary` is backward-compatible — existing callers without the param get `enabled: true` by default.
