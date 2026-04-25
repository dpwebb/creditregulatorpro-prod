---
created: 2026-04-07T14:13:06.237Z
updated: 2026-04-07T14:13:06.237Z
---

# Simplify User UI — Comprehensive Navigation & Page Consolidation

## Summary

The current regular-user sidebar has **17 navigation items** spread across 5 groups, many of which overlap or fragment the same data across multiple pages. This plan consolidates the user experience from 17 nav items down to **8**, merging related pages into tabbed views and eliminating redundancy — while keeping all existing functionality intact.

---

## Current vs. Proposed Navigation

### Current (17 items for regular users)
```
MAIN (5)
  Home | Upload Your Report | Your Reports | Bankruptcy Info | Credit Reporting Companies

YOUR DISPUTES (4)
  Accounts on Your Report | Messages Sent & Received | Your Proof & Files | Check a Creditor

YOUR LETTERS (2)
  Dispute Letters | Important Dates

PROGRESS & STATS (4)
  How You're Doing | What Changed | Dispute History | Upcoming Deadlines

YOU & HELP (3)
  Your Info | How to Use This App | Report a Problem
```

### Proposed (8 items for regular users)
```
MAIN (3)
  Home | Upload Report | My Accounts

MY DISPUTES (3)
  Dispute Letters | Evidence & Messages | Calendar & Deadlines

ME (2)
  Progress & Stats | My Info & Help
```

---

## Consolidation Details

### 1. **"My Accounts"** — Merge 5 pages into one tabbed page
Combines: `tradelines` + `creditor-validations` + `change-detection` + `report-artifacts` + `bankruptcy-tracker`

**Tabs:**
- **All Accounts** (current tradelines page content — TradelinesTable, TradelinesToolbar, legend, etc.)
- **Problems Found** (current creditor-validations — stats cards + ComplianceTradelineCard grid)
- **Changes Detected** (current change-detection — stats + drift log table)
- **Uploaded Reports** (current report-artifacts — artifact table with inline editing)
- **Bankruptcy** (current bankruptcy-tracker — stats + filters + BankruptcyTable)

The individual account detail page (`tradelines.$id`) stays as-is since it's already well-structured with its own tabs.

### 2. **"Evidence & Messages"** — Merge 2 pages into one tabbed page
Combines: `evidence-events` + `evidence-management`

**Tabs:**
- **Messages** (current evidence-events — EvidenceEventsTable with bulk actions)
- **Files & Proof** (current evidence-management — EvidenceFilesTab/EvidenceChallengesTab)

### 3. **"Calendar & Deadlines"** — Merge 2 pages into one tabbed page
Combines: `compliance-calendar` + `deadline-calendar`

**Tabs:**
- **Calendar View** (current compliance-calendar — react-big-calendar with stats)
- **Deadline List** (current deadline-calendar — DeadlineCalendarView + AutoEscalationPanel for admins)

### 4. **"Progress & Stats"** — Merge 2 pages into one tabbed page
Combines: `analytics-dashboard` + `dispute-rotation-analytics`

**Tabs:**
- **Overview** (current analytics-dashboard — SuccessMetricsCard by scope)
- **Strategy Analysis** (current dispute-rotation-analytics — charts + tradeline health table)

### 5. **"My Info & Help"** — Merge 3 items into one tabbed page
Combines: `profile-settings` + `user-manual` + `beta-issues`

**Tabs:**
- **Profile** (current profile-settings — ProfileForm + SubscriptionSection)
- **How to Use This App** (current user-manual content)
- **Report a Problem** (current beta-issues content)

### 6. **"Credit Reporting Companies" (bureaus)** — Move to admin-only
Regular users rarely need this page directly. Bureau contact info is already shown in context (tradeline detail, packet views). Make it admin-only in the sidebar. If users need bureau info, it can be linked from the account detail page.

---

## Files to Create

### New consolidated pages:
1. **`pages/my-accounts`** — Tabbed page combining tradelines, creditor-validations, change-detection, report-artifacts, bankruptcy-tracker
2. **`pages/evidence`** — Tabbed page combining evidence-events + evidence-management
3. **`pages/calendar`** — Tabbed page combining compliance-calendar + deadline-calendar
4. **`pages/progress`** — Tabbed page combining analytics-dashboard + dispute-rotation-analytics
5. **`pages/my-info`** — Tabbed page combining profile-settings, user-manual, beta-issues

Each new page will import and render the existing components/content from the original pages as tab content — no logic rewrite needed.

## Files to Modify

1. **`components/AppLayout.tsx`** — Update sidebar navigation:
   - Regular user nav reduced to 8 items across 3 groups
   - Move bureaus to admin-only
   - Update paths and labels
   
2. **`pages/_index.tsx`** (Dashboard) — Update links to point to new consolidated routes (e.g., `/tradelines` → `/my-accounts`, `/evidence-events` → `/evidence`)

3. **`components/DashboardQuickActions.tsx`** — Update action links
4. **`components/DashboardPendingIssues.tsx`** — Update "See All Accounts" link
5. **Various components** that use `Link to="/tradelines"` etc. — Update to new routes

## Files to Delete (after consolidation)
None immediately — keep old pages as redirects during transition, then clean up later. The old page files can contain simple `<Navigate to="/my-accounts?tab=..." />` redirects for backward compatibility (important since this is a native mobile app).

---

## Approach

### Phase 1: Create consolidated pages
1. Create `pages/my-accounts` with Tabs component, importing existing content from the 5 source pages
2. Create `pages/evidence` with Tabs component
3. Create `pages/calendar` with Tabs component
4. Create `pages/progress` with Tabs component
5. Create `pages/my-info` with Tabs component

### Phase 2: Update navigation
6. Update `AppLayout.tsx` sidebar nav items for regular users
7. Update Dashboard links and quick actions

### Phase 3: Add redirects for backward compatibility
8. Convert old pages (`tradelines`, `evidence-events`, `evidence-management`, `compliance-calendar`, `deadline-calendar`, `analytics-dashboard`, `dispute-rotation-analytics`, `report-artifacts`, `bankruptcy-tracker`, `creditor-validations`, `profile-settings`, `user-manual`, `beta-issues`) to simple redirects that preserve query params and map to the correct tab in the new consolidated page

### Phase 4: Cleanup
9. Update any remaining internal links across components
10. Verify all routes work correctly

---

## Risks & Considerations

- **Backward compatibility**: This project is deployed as a native mobile app. All old routes MUST redirect to new routes — never remove them. Old endpoints stay untouched.
- **Tab state via URL**: Each consolidated page should read `?tab=X` from the URL so deep links and redirects work correctly (e.g., `/my-accounts?tab=problems` opens the Problems Found tab).
- **tradelines.$id stays unchanged**: The account detail page is already well-organized and doesn't need consolidation.
- **Admin pages untouched**: This plan only affects the regular user navigation. Admin-specific pages (statutes, metro2-compliance, obligations, etc.) remain in their current structure.
- **Component reuse**: No existing components need to be rewritten. The consolidated pages simply import and render the same content that the original pages rendered — just organized under tabs.
- **Performance**: Tabs should lazy-render (only mount content when the tab is active) to avoid loading all 5 data sources at once on `my-accounts`.
