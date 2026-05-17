---
created: 2026-04-11T19:21:57.237Z
updated: 2026-04-11T19:21:57.237Z
---

## Summary
Add an admin "Reset User" capability to the User Management page. When an admin resets a user, all of that user's uploaded credit bureau reports (report artifacts) and all downstream derived data (tradelines, packets, obligation instances, evidence events, etc.) are automatically deleted. The user account itself remains intact.

This also clarifies the admin role: admins manage the platform and its functions, they do not have credit reports. Admins can edit user account info for tech support purposes.

## Files to Create

### `endpoints/admin/reset-user_POST`
- Admin-only endpoint that accepts `{ userId: number }`.
- Fetches all `report_artifact` records for the given userId.
- Loops through each and calls `deleteReportArtifactCascade` for each report artifact.
- Also cleans up any user-level data not tied to report artifacts:
  - `fraud_freeze` records for the user
  - `subscription` records (optional — may want to preserve)
  - `change_detection_snapshot` or similar user-scoped records
- Returns a summary of what was deleted (report artifact count, tradeline count, etc.).
- Logs the action in the audit log.

## Files to Modify

### `helpers/adminQueries`
- Add a `useResetUser` mutation hook that calls the new `admin/reset-user_POST` endpoint.
- Invalidates the admin users query cache on success so counts refresh.

### `pages/admin-user-management`
- Add a "Reset" action button per user row (or a row-click action menu).
- Clicking "Reset" opens a confirmation dialog warning that ALL credit reports and derived data will be permanently deleted.
- The confirmation requires typing the user's email to confirm (safety measure).
- Shows a loading state during the reset operation.
- Displays a success/error toast after completion.
- Admin users cannot be reset (only regular "user" role accounts).

## Approach

1. **Create the backend endpoint** `admin/reset-user_POST`:
   - Validate admin session.
   - Accept `userId` in the request body.
   - Verify the target user exists and is not an admin.
   - Query all `report_artifact` records for that user.
   - Call `deleteReportArtifactCascade` for each report artifact (reuses existing cascade logic).
   - Also delete any fraud_freeze records for the user.
   - Log the reset action in audit_log.
   - Return a summary: `{ success: true, deletedReportArtifacts: N, deletedTradelines: N }`.

2. **Add the mutation hook** in `helpers/adminQueries`:
   - `useResetUser()` mutation that POSTs to `admin/reset-user`.
   - On success, invalidate `["admin", "users"]` queries.

3. **Update the admin user management page**:
   - Add an actions column with a dropdown menu containing "Reset User Data" option.
   - Add a confirmation dialog component inline with email-typing safety.
   - Wire up the mutation, toast notifications, and loading states.

## Risks & Considerations

- **Irreversible action**: The reset permanently deletes all user credit data. The email-confirmation safeguard is critical.
- **Transaction size**: If a user has many report artifacts, the cascade deletes could be large. The existing `deleteReportArtifactCascade` already uses transactions per artifact — we should wrap the whole reset in a single transaction for atomicity, or accept per-artifact transactions if the total is too large.
- **Admin self-protection**: The endpoint must refuse to reset admin accounts.
- **Backward compatibility**: This adds a new endpoint and UI — no existing endpoints or schemas are modified in an incompatible way.
- **Audit trail**: The reset action and all cascade deletions are logged via the existing audit logger.
