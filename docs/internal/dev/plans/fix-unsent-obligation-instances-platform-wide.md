---
created: 2026-04-15T04:33:07.503Z
updated: 2026-04-15T04:33:07.503Z
---

# Fix Unsent Obligation Instances Showing as "Used" — Platform Wide

## Summary
Obligation instances created during compliance scanning (state `OBLIGATION_PENDING`, `challenge_sent_date = NULL`) are incorrectly appearing as "used approaches" and "sent challenges" across the platform. These are **potential dispute steps** — not actual letters. No letters have been sent for any tradeline, yet the UI displays them as if they have. This plan cleans the data and fixes all affected code paths.

## Data Cleanup
Delete all obligation instances where `challenge_sent_date IS NULL` across all tradelines (8 stale records on tradelines 299 and 301). Tradeline 302 was already cleaned.

## Files to Modify

### 1. `endpoints/tradeline/rotation-history_GET.ts` ✅ (Already Fixed)
- Already updated to filter with `WHERE challengeSentDate IS NOT NULL`
- Removed `createdAt` fallback for `usedDate`

### 2. `components/ChallengeEvidencePanel.tsx` ✅ (Already Fixed)  
- Already has `sentOnly` prop that filters out PENDING instances

### 3. `components/TradelineComplianceTimeline.tsx`
- **Bug**: Uses `c.challengeSentDate || c.createdAt` fallback — shows "Challenge Sent" events for obligations that were never sent
- **Fix**: Only add challenge events where `c.challengeSentDate` is set. Skip instances with no sent date. Also update the title from "Challenge Sent" to "Letter Sent" for plain language.

### 4. `components/TradelineComplianceHub.tsx`
- Review the summary counts and status logic to ensure they only count instances with actual letters sent
- The `challengesSentCount` already filters by `challengeSentDate` ✅
- Check that the "Problems Found" tab doesn't incorrectly reference obligation instances as letters

### 5. `endpoints/dashboard/stats_GET.ts`
- **Bug**: Counts ALL obligation instances for stats (total obligations, progress, response rates) without filtering by `challengeSentDate`
- **Fix**: Add `WHERE challenge_sent_date IS NOT NULL` filter for counts that represent "letters sent" or "challenges active". Keep total obligation count unfiltered if it represents "problems found".

### 6. `endpoints/obligation-instance/list_GET.ts`
- Review: This endpoint returns all instances for a tradeline. The frontend components should handle filtering, but verify the endpoint exposes `challengeSentDate` so frontends can filter properly.

## Files to Create
None.

## Approach
1. **Delete stale data** — Remove all obligation instances with `challenge_sent_date IS NULL` from the database (tradelines 299 and 301)
2. **Fix TradelineComplianceTimeline** — Only show challenges with `challengeSentDate` set
3. **Fix dashboard stats endpoint** — Ensure letter/challenge counts only include actually-sent instances
4. **Verify TradelineComplianceHub** — Confirm summary bar and tab logic are correct

## Risks & Considerations
- **Backward compatibility**: The obligation instances being deleted were never acted on (all PENDING, no sent date). Deleting them is safe.
- **Future prevention**: The root cause is auto-creation of obligation instances during compliance scanning. These should remain as "potential disputes" internally but must never display as "sent" or "used" in the UI. All display code must check `challengeSentDate IS NOT NULL` before presenting anything as a sent letter.
- **Dashboard stats**: Need to carefully separate "problems found" counts (all instances) from "letters sent" counts (only instances with `challengeSentDate`).
