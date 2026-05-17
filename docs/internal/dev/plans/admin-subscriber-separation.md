---
created: 2026-04-14T12:34:49.339Z
updated: 2026-04-14T12:34:49.339Z
---

## Summary
Properly separate the admin and subscriber (regular user) experiences. Admin is a platform administrator — they do not have credit reports, disputes, or subscriptions. The admin dashboard, sidebar navigation, and global UI elements should reflect administrative functions only, not consumer dispute functions.

## Current Problems
1. **Dashboard (`pages/_index`)**: Admin sees `QuickSetupWizard` (prompts to upload reports), "Upload Report" button, "Pending Issues" (consumer tradeline issues), and consumer-focused metric cards ("Credit Reporting Companies", "All Accounts", etc.). The admin view is essentially the same consumer dashboard with different phrasing.
2. **Sidebar (`AppLayout`)**: Admin nav includes consumer items: "Upload Report", "My Accounts", "My Disputes" group (Dispute Letters, Evidence & Messages, Calendar & Deadlines), "Me" group (Progress & Stats, My Info & Help).
3. **Global banner**: "You are sending these letters yourself" shows for admins — this is consumer-only messaging.
4. **Dashboard stats endpoint**: Already supports admin seeing system-wide data (no userId filter for admin), but the frontend presents it as personal data.

## Files to Modify

### `pages/_index.tsx`
- **Remove for admin**: `QuickSetupWizard`, "Upload Report" header button
- **Redesign admin dashboard** to show platform administration overview:
  - System-wide stats: total users, total report artifacts across all users, total tradelines system-wide, total packets system-wide (reusing existing dashboard/stats data which already returns unfiltered data for admin)
  - Quick links to admin functions: User Management, Compliance Config, Version Management, Activity Logs, Parser Testing
  - Keep the existing `DashboardPendingIssues` for admin since it already shows system-wide compliance issues (useful for admin monitoring)
  - Keep `DashboardActivityTable` for admin since it shows system-wide recent packets
- **Keep for regular user**: `DisputeJourneyTracker` (unchanged), no admin-related content

### `components/AppLayout.tsx`
- **Admin sidebar nav**: Remove consumer-specific items. Admin sidebar should have:
  - **Platform** group: Home (dashboard), User Management, Compliance Config, Activity Logs, Error Logs
  - **Legal & Rules** group: Keep as-is (these are reference data admins manage)
  - **Tools** group: Parser Testing, Version Management, Report a Problem
- Remove "Upload Report", "My Accounts", "My Disputes", "Me" groups from admin nav
- **Global banner**: Only show "You are sending these letters yourself" for non-admin users (add `user.role !== "admin"` check)

### `components/FloatingReportButton.tsx`
- Already correctly shows for admin (bug reporting) — no change needed.

## Files NOT Modified (no changes needed)
- `endpoints/dashboard/stats_GET` — Already returns system-wide unfiltered data for admin
- `endpoints/dashboard/pending-issues_GET` — Already returns all users' issues for admin
- `components/ProtectedRoute` — Already properly handles admin bypassing subscription/terms checks
- `components/DisputeJourneyTracker` — Consumer-only component, not shown to admin

## Approach

1. **Update `components/AppLayout.tsx`**:
   - Restructure admin sidebar nav items to only include platform management functions
   - Add `isAdmin` check to the global banner so it only shows for regular users

2. **Update `pages/_index.tsx`**:
   - Remove `QuickSetupWizard` and "Upload Report" button for admin
   - Build an admin-specific dashboard view with:
     - Platform overview cards (system-wide user count, artifact count, tradeline count, packet count)
     - Admin quick-action links to key admin pages
     - Keep `DashboardPendingIssues` (system-wide compliance monitoring)
     - Keep `DashboardActivityTable` (system-wide recent activity)
   - The user count can come from a simple additional query or reuse existing data

## Risks & Considerations
- **Backward compatible**: No endpoint changes needed — just frontend presentation changes.
- **Admin can still access consumer pages via URL**: The `UserRoute` protected route allows both admin and user roles. This is fine for tech support scenarios (admin viewing data). The sidebar just won't navigate there.
- **Dashboard stats endpoint already differentiates**: Admin sees system-wide totals. The frontend just needs to label them correctly (e.g., "Total Accounts System-wide" not "Your Accounts").
