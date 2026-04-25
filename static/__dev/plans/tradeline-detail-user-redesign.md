---
created: 2026-04-15T05:54:47.121Z
updated: 2026-04-15T05:54:47.121Z
---

# Tradeline Detail Page — User-Focused Redesign

## Summary
Redesign the non-admin tradeline detail page (`pages/tradelines.$id`) to be more emotionally engaging, action-driven, and visually aggressive for Grade 8 users fighting to remove bad information from their credit reports. The admin view stays untouched.

## Current Problems
1. Header is a flat, lifeless line — no urgency or context
2. Journey stepper is abstract and passive — feels like a school progress tracker
3. Top violation card is too small and polite — the user's #1 weapon doesn't stand out
4. Other violations are hidden behind a collapsible — users may never see them
5. Quick actions float without context — user doesn't know when to use them
6. No emotional language — page is clinical, not empowering
7. "Check Again" is invisible ghost button at bottom

## Proposed Non-Admin Layout (top to bottom)

### 1. Hero Header Card (redesigned TradelineHeader compact mode)
- **Creditor name** — large, bold, like a headline
- **Bureau + humanized status** — secondary line
- **Verdict banner integrated into header**: 
  - Red/orange tint background when issues exist
  - Bold statement: "⚠️ We found 3 problems with this account. The law says they must fix it."
  - When no issues: green tint, "✅ No problems found with this account."
- Pass `issuesCount` to TradelineHeader so it can show the verdict
- The DisputeJourneyBar is REMOVED from the non-admin tradeline detail page (it's redundant — the user sees this on the homepage already, and here it competes with the actual issues)

### 2. Primary Fight Card (replaces the small top finding card)
- Full-width card with a bold left border in red/error color
- Large warning icon
- **Title** in large text: e.g., "This Debt Is Too Old To Be On Your Report"
- **Action sentence** in regular text: "This company must remove it. Send them a dispute letter now."
- **LARGE "Create Dispute Letter" button** — primary, full-width on mobile
- If letter already created: show "View Your Letter" / "Letter Sent ✓" state with green styling instead of red
- Visual weight: this card should be the DOMINANT element on the page

### 3. All Other Issues — VISIBLE (not collapsed)
- Show ALL remaining violations as individual mini-cards stacked vertically
- Each card has:
  - Left color accent (red for errors, orange for warnings)
  - Plain language title
  - One-line explanation
  - "Create Letter" or "View Letter" button on the right
- NO collapsible — if there are 5 issues, show 5 cards
- This empowers users: "Look at all the things they did wrong"

### 4. Contextual Actions Section (replaces floating quick actions)
- A single card titled "Other Things You Can Do"
- Two clearly-labeled rows:
  - 📬 "Got a reply? Record what they said" → Log a Response button
  - 📄 "See your original credit report" → View Source Report button
- Only show "Log a Response" when at least one letter has been sent (contextually relevant)
- Only show "View Source Report" when reportArtifactId exists

### 5. Letters You've Sent (conditional)
- Same as current — shows if packets exist
- Keep as-is with "Send New Letter" button

### 6. Activity Timeline (collapsed)
- Keep "What Happened So Far" as collapsible — good for power users
- Keep as-is

### 7. Account Details (collapsed)
- Keep "See account details" as collapsible
- Keep as-is

### 8. Check Again (bottom)
- Change from ghost to a proper `outline` button
- Center it, give it breathing room
- Add subtle text above: "Upload a new report to see what changed"

## Files to Modify

### `components/TradelineHeader.tsx` + `.module.css`
- Redesign compact mode:
  - Larger creditor name (like a heading)
  - Bureau + status on a secondary line
  - Add a "verdict banner" at the bottom of the compact header card
  - Accept new prop: `issuesCount: number`
  - When `issuesCount > 0`: red/orange banner "We found X problems. The law says they must fix it."
  - When `issuesCount === 0`: green banner "No problems found."
  - Give the compact header a card background/border (currently it's just a plain flex row)

### `components/TradelineComplianceHub.tsx` + `.module.css`
- Redesign the non-admin section:
  - Top finding card → "Fight Card" with much more visual weight (large left border, bigger text, full-width CTA)
  - Other violations → always visible as stacked mini-cards (remove the Collapsible wrapper)
  - Each mini-card gets a left accent color based on severity
  - Sent state: green accent instead of red, "Letter Sent ✓" badge
  - Add action-oriented copy for the main explanation text

### `pages/tradelines.$id.tsx` + `.module.css`
- Remove `<DisputeJourneyBar>` from non-admin layout (redundant on detail page)
- Pass `issuesCount` to `TradelineHeader`
- Move quick actions into a single "Other Things You Can Do" card
  - Conditionally show "Log a Response" only when `challengesSentCount > 0`
- Change "Check Again" from ghost to outline with context text above
- Adjust spacing/ordering per new layout

## Files to Create
None — all changes are modifications to existing files.

## Approach
1. Update `TradelineHeader` compact mode — add verdict banner, card styling, `issuesCount` prop
2. Update `TradelineComplianceHub` non-admin section — fight card styling, remove collapsible for other issues, add severity accents
3. Update `pages/tradelines.$id` — remove DisputeJourneyBar, restructure quick actions, update Check Again styling

## Risks & Considerations
- **Backward compatibility**: TradelineHeader gets a new optional prop — fully backward compatible
- **Mobile**: All new cards must be responsive. Fight card CTA should be full-width on mobile.
- **Empty states**: When there are 0 violations, the verdict banner should show the green "all clear" state and the fight card section should not render.
- **Admin view**: Completely untouched — all changes scoped to `!isAdmin` / `compact` branches.
- **Performance**: No new data fetching — all data already available from existing queries.
