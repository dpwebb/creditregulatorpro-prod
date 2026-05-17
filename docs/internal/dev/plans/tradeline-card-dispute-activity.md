---
created: 2026-04-22T23:52:27.689Z
updated: 2026-04-22T23:52:27.689Z
---

# Tradeline Card Dispute Activity Summary

## Summary
Enrich the tradeline cards on the My Accounts page (both desktop table rows and mobile cards) so users can see dispute activity at a glance — how many problems were found, how many letters were sent, how many responses came back, and any upcoming deadlines — without needing to navigate into each tradeline's detail page.

## Files to Modify

### 1. `endpoints/tradeline/list_GET.ts` + `endpoints/tradeline/list_GET.schema.ts`
- Add a secondary aggregation query that, for each returned tradeline, counts:
  - `violationCount`: total active violations from `creditorObligationTest` (where `userStatus` IS NULL or = 'active')
  - `challengesSentCount`: obligation instances with non-null `challengeSentDate`
  - `responsesReceivedCount`: obligation instances with `state = 'RESPONSE_RECORDED'`
  - `nextDeadline`: earliest future `responseDeadline` from obligation instances (null if none)
  - `approachingStatuteMonths`: if any violation has `violationCategory = 'STATUTE_APPROACHING'`, include `technicalDetails->>'monthsRemaining'` (null if none)
- Add these fields to `TradelineWithDetails` type in the schema file
- This is a read-only enhancement — fully backward compatible (new fields default to 0/null)

### 2. `components/TradelinesTable.tsx` + `components/TradelinesTable.module.css`
- **Desktop table**: Replace the single "Status" badge column with a richer "Dispute Progress" cell that shows:
  - A mini progress indicator: e.g. "3 problems · 1 letter sent · 0 replies" in a compact layout
  - If `nextDeadline` exists, show a small "⏰ Deadline: Jan 15" line
  - If `approachingStatuteMonths` exists, show "⏳ Removal in X months" in a subtle highlight
  - Keep the existing color-coded badge for the overall status but make it smaller/secondary
- **Mobile cards**: Expand the middle section to show the same dispute progress summary in a clean, scannable format:
  - Replace the single "Status" badge with a mini 3-stat row (problems / letters / replies) using small icons
  - Add a deadline callout if applicable
  - Add approaching-statute callout if applicable
- Use plain, everyday language per the project's Grade 8 literacy target
- Keep the existing `getDisputeStatusLabel` function and badge styling for the high-level status

## Files to Create
None — all changes are modifications to existing files.

## Approach
1. **Backend first**: Update the tradeline list endpoint to aggregate and return the new dispute activity fields. Use efficient sub-queries to avoid N+1 problems.
2. **Schema update**: Add the new fields to `TradelineWithDetails` so the frontend gets proper types.
3. **Frontend update**: Modify TradelinesTable to render the new data in both desktop and mobile layouts. Use existing design system components (Badge, Tooltip) and keep the design consistent with the current card style.

## Risks & Considerations
- **Performance**: The additional aggregation queries must be efficient. Use batch queries (WHERE tradeline_id IN (...)) rather than per-tradeline queries. Consider using lateral joins or window functions.
- **Backward compatibility**: The endpoint response shape is being extended (not changed), so existing consumers won't break. New fields should be nullable/defaulted.
- **Mobile layout**: The mobile card is already compact. The new information needs to be scannable without making cards too tall. Use a horizontal icon-stat layout.
- **Empty states**: When a tradeline has 0 violations, show "No problems found ✓" rather than cluttering with zeros.
