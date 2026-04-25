---
created: 2026-04-14T14:17:08.078Z
updated: 2026-04-14T14:17:08.078Z
---

## Summary
Fix the admin dashboard showing regular user tradelines in "Problems That Need Your Attention" section. Admin accounts don't own tradelines, so this section should be removed from the admin dashboard view. The stats endpoint showing system-wide counts is fine (it's labeled "System Numbers" for admin).

## Files to Modify

### `pages/_index.tsx`
- Remove the entire "Pending Issues Section" block from the admin view (the `pendingIssuesSection` div containing `DashboardPendingIssues`)
- Admin dashboard should only show: Quick Actions → System Numbers (stats grid) → Recent Activity

### `endpoints/dashboard/pending-issues_GET.ts`
- Always filter by the logged-in user's ID regardless of role (`tradeline.userId = user.id`)
- Remove the `if (user.role !== 'admin')` conditional — all users see only their own data
- This ensures even if the component is ever re-added for admin, it won't leak other users' data

## Files to Create
None.

## Approach
1. Update `pending-issues_GET` to always filter by `user.id` (defense in depth)
2. Remove `DashboardPendingIssues` from the admin section of `_index.tsx`

## Risks & Considerations
- The stats endpoint (`dashboard/stats_GET`) intentionally shows system-wide data for admins labeled "System Numbers" — this is correct and should NOT be changed
- No schema changes needed — output shape stays the same
- Backward compatible — no input/output shape changes
