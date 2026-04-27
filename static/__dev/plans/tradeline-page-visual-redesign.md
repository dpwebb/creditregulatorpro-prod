---
created: 2026-04-15T05:39:55.162Z
updated: 2026-04-15T05:39:55.162Z
---

# Tradeline Detail Page — Visual Redesign (Non-Admin)

## Summary
Restructure the tradeline detail page for regular users to be action-first, visually clean, and guided. Replace the current data-dump layout with a journey-oriented experience that tells the user exactly where they are and what to do next. Admin view stays unchanged.

## Current Problems
- Header card wastes space with data (balance, date, type) that isn't actionable
- "PHASE 1: FOUNDATIONAL CHALLENGE — PENDING" is jargon
- Stats bar (Problems Found / Letters Sent / Replies Back) is disconnected numbers
- Too many visual layers stacked vertically with no visual hierarchy
- No sense of journey or progress — user can't tell where they are

## New Non-Admin Layout (top to bottom)

### 1. Compact Header (replaces the huge TradelineHeader card)
- **Creditor name** (large, bold) + **Bureau name** (small, muted) + **Status badge** on one line
- No stats grid, no account number, no terminal phase bar
- Account details still accessible via "See account details" collapsible lower down
- Visually: just a clean row, not a full card — saves ~150px of vertical space

### 2. Journey Progress Bar (replaces stats bar AND terminal phase bar)
- A visual horizontal stepper with 3 steps:
  - **Step 1: "Problems Found"** — shows count (e.g. "3 issues"), marked complete if violations exist
  - **Step 2: "Letter Sent"** — shows count, marked complete if any letters sent
  - **Step 3: "Waiting for Reply"** — shows count, marked complete if responses received
- Each step is a small circle/icon connected by lines, with the current step highlighted
- This replaces both the old stats bar numbers AND the confusing "PHASE 1" jargon
- Encouraging micro-copy below: e.g. "Your next step: send a dispute letter" or "Great — waiting on a reply!" depending on current state

### 3. Main Action Card (the hero — top violation finding)
- The current top finding card stays but gets elevated visually:
  - Subtle colored left border (red/orange) to draw the eye
  - Violation category as the title
  - Plain language explanation
  - "What to do" recommendation
  - **Large, prominent "Create Dispute Letter" button**
- Remove the "Check Again" rescan button from here (move it to a subtle link at the bottom of the page)

### 4. Other Issues Accordion (stays mostly as-is)
- "See 2 other issues we found" collapsible — already simplified, keep it

### 5. Remove tabs entirely for non-admin
- Merge "Your Letters" content below the main action area instead of a separate tab
- If letters exist, show a small "Letters You've Sent" section with compact list
- If no letters yet, don't show anything (the journey bar already indicates no letters)
- This eliminates the cognitive overhead of tab navigation for just 2 tabs

### 6. Secondary Actions (compact)
- Small row: [Log a Response] [View Source Report] — stays as-is

### 7. Timeline (compact, collapsible)
- "What Happened So Far" becomes a collapsible like "See account details"
- When nothing is recorded yet, hide it entirely (don't show empty state)

### 8. Account Details Collapsible (stays)
- "See account details" — shows ParsedDataOverview when expanded

## Files to Modify

### components/TradelineHeader.tsx + .module.css
- Add a `compact` prop (boolean). When true:
  - Render only: creditor name (h1), bureau name, status badge — in a single clean row
  - Hide the stats grid, terminal phase bar, account number, collection box
  - Lighter visual treatment — no card border, just the text
- When false (admin): unchanged

### pages/tradelines.$id.tsx + .module.css
- For non-admin:
  - Pass `compact` to TradelineHeader
  - Remove Tabs entirely — render content in a flat vertical flow
  - Add journey progress bar between header and main content
  - Show ChallengeEvidencePanel (letters list) inline below the action area if packets exist, instead of a separate tab
  - Make timeline collapsible and hide when empty
  - Move ComplianceRescanButton to a subtle text link at the page bottom
- For admin: completely unchanged

### components/TradelineComplianceHub.tsx
- No structural changes needed — already renders the right content for non-admin
- Minor: ensure it doesn't duplicate anything that's now in the page

## Files to Create

### components/DisputeJourneyBar.tsx + .module.css  
**Already exists** — but needs to be repurposed or a new component created if the existing one doesn't match. Check existing component first.
- A horizontal 3-step progress indicator
- Props: `problemsCount`, `lettersSentCount`, `repliesCount`
- Shows which step is current, completed, or upcoming
- Includes encouraging micro-copy below the steps
- Visually: circles connected by lines, with labels and counts

## Approach

1. **Update TradelineHeader** — add `compact` prop for non-admin minimal view
2. **Create/update DisputeJourneyBar** — the journey progress stepper component
3. **Restructure pages/tradelines.$id** — flat layout for non-admin, remove tabs, integrate journey bar, make timeline collapsible and hidden when empty, show letters inline

## Risks & Considerations
- **Admin view must stay 100% unchanged** — all modifications gated on `!isAdmin`
- **Mobile responsiveness** — journey bar needs to work on small screens (stack vertically if needed)
- **DisputeJourneyBar component already exists** — check if it can be reused or needs replacement
- **Backend compatibility** — no backend changes needed, this is purely frontend
- **"Your Letters" tab URL** — users with bookmarks to `?tab=letters` need graceful handling (just show letters section scrolled into view)
- The page file is already flagged as too long — this restructure should ideally reduce its size by removing tab logic for non-admin, but we need to be careful not to make it worse
