---
created: 2026-04-14T14:20:53.679Z
updated: 2026-04-14T14:20:53.679Z
---

# Admin Dashboard User List with Drill-Down

## Summary
Add a User List section directly to the admin Platform Dashboard (`pages/_index`) with the ability to drill down into individual user details. The drill-down should navigate to a new admin user detail page showing that user's tradelines, packets, reports, subscription status, and activity.

## Files to Modify

### `endpoints/admin/users_GET.ts` + `endpoints/admin/users_GET.schema.ts`
- Add subscription info (plan, status, trial_end) to the response by joining with the `subscriptions` table.
- Add `reportArtifactsCount` to each user entry.
- The schema output type needs to include: `subscriptionPlan`, `subscriptionStatus`, `reportArtifactsCount`.

### `helpers/adminQueries.tsx`
- Add a new hook `useAdminUserDetail` that fetches a single user's full data (tradelines, packets, reports, subscription) for the drill-down page.
- Export the new query key.

### `pages/_index.tsx`
- Add a "Users" section between "Quick Actions" and "System Numbers" in the admin view.
- Display a compact user table using the existing `useAdminUsers` hook — showing: name/email, role badge, subscription status, tradelines count, and a "View" action.
- Each row is clickable and navigates to `/admin-user-management/{userId}`.
- Include a "View All" link to `/admin-user-management`.

## Files to Create

### `endpoints/admin/user-detail_GET.ts` + `endpoints/admin/user-detail_GET.schema.ts`
- New endpoint accepting `userId` query param.
- Returns: user profile info, subscription details, list of tradelines (id, accountNumber, creditor, status, bureau), list of packets (id, status, createdAt, tradelineAccountNumber), list of report artifacts (id, filename, createdAt, bureau), and recent audit log entries for that user.
- Admin-only access.

### `pages/admin-user-management.$userId.tsx`
- New admin-protected page for drilling down into a user.
- Shows: user profile card (name, email, role, verified status, joined date), subscription card (plan, status, trial end), and tabbed sections for Tradelines, Dispute Letters, Reports, and Activity Log.
- Each tab shows a table of that user's data.
- Back button to return to dashboard or user management page.

## Approach

1. **Update `admin/users_GET` endpoint** to include subscription and report artifact data in the response.
2. **Create `admin/user-detail_GET` endpoint** for fetching a single user's full data with related entities.
3. **Update `helpers/adminQueries`** to add the new `useAdminUserDetail` hook and update types.
4. **Update `pages/_index`** to add the compact user list in the admin dashboard view.
5. **Create `pages/admin-user-management.$userId`** as the drill-down detail page with tabs for tradelines, packets, reports, and activity.

## Risks & Considerations
- The admin/users_GET endpoint change adds new fields but doesn't remove any — fully backward compatible.
- The user detail page needs to be admin-protected via `AdminRoute` page layout.
- With only 2 users currently, the dashboard user list will be small, but should scale well with pagination if needed later.
- The drill-down page should handle cases where users have no data gracefully (empty states).
