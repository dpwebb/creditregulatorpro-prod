---
created: 2026-04-16T21:01:05.857Z
updated: 2026-04-16T21:01:05.857Z
---

# Conditional Procedural Challenges Display

## Summary
Make the `FundamentalChallenges` component on the tradeline detail page (non-admin view) only visible when there are **no active violation-based challenges** or **all violation-based challenges have been exhausted** (i.e., all have packets that have been sent). This prevents overwhelming users with procedural options when they still have specific data violations to address first.

## Files to Modify

### 1. `pages/tradelines.$id.tsx`
- Add logic to determine whether procedural challenges should be shown:
  - Compute `activeViolations` from `violationsData?.obligationTests` by filtering out dismissed/verified ones and `MULTIPLE_COLLECTOR_VIOLATION` (same logic as in `TradelineComplianceHub`)
  - Compute `allViolationsExhausted`: for every active violation, check if a corresponding packet exists in `packetsData?.packets` with status "SENT" or a non-null `sentDate`
  - Set `showProceduralChallenges = activeViolations.length === 0 || allViolationsExhausted`
- Wrap the `<FundamentalChallenges ... />` render in a conditional: only render when `showProceduralChallenges` is true

### No new files needed

## Approach

1. In `tradelines.$id.tsx`, after the existing `violationsData` and `packetsData` queries, add a `useMemo` that:
   - Filters `violationsData?.obligationTests` to active violations (excluding dismissed/verified and MULTIPLE_COLLECTOR_VIOLATION)
   - Checks if every active violation has a matching packet in `packetsData?.packets` where `status === "SENT"` or `sentDate` is truthy
   - Returns a boolean `showProceduralChallenges`
2. Wrap the existing `<FundamentalChallenges>` JSX in `{showProceduralChallenges && (...)}`

## Risks & Considerations
- **Backward compatible**: No API changes, purely frontend conditional rendering
- **Data dependency**: Both `violationsData` and `packetsData` are already fetched on this page, so no additional network requests
- **Edge case — loading state**: While violations data is still loading, `showProceduralChallenges` will default to false (no violations array), which means procedural challenges won't flash briefly before violations load. This is the correct UX.
- **Edge case — approaching violations**: The "STATUTE_APPROACHING" type is informational, not a violation to dispute. It should NOT count as an active violation that blocks procedural challenges. The ComplianceHub already filters it out of `displayViolations`.
