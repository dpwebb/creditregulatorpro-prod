---
created: 2026-04-08T02:39:40.641Z
updated: 2026-04-08T02:39:40.641Z
---


## Summary

When a user uploads a follow-up credit report after sending dispute packets, the upload results page currently treats it identically to a first-time upload — leading with the "Problem Score" gauge and violation counts. This is confusing because the user's primary question after disputes is **"Did my disputes work?"**, not "How many violations are in this report?"

The fix: detect whether this is a follow-up upload (crossReference exists) and, if so, **completely reorganize the page** to lead with dispute outcomes and changes, pushing the violation scan into a secondary section below.

## Current Problems

1. **Wrong narrative**: Page title says "Compliance Scan Results" even for follow-up uploads — should say something like "Here's What Changed"
2. **Buried cross-reference**: The "Changes Since Last Report" section is the 3rd or 4th section down — it should be the FIRST thing the user sees on follow-up
3. **No dispute outcome framing**: Removed accounts with dispute activity should be celebrated as potential wins; matched accounts with disputes that didn't change should be flagged for escalation. Currently it's all presented flatly.
4. **Confusing labels**: "Matched", "New", "Removed" badges are technical. Users don't think in terms of set operations — they think "Did Rogers get deleted?" or "Did my balance change?"
5. **Missing next-step guidance**: After seeing results, user doesn't know what to do — escalate? Send new disputes? Wait?

## Files to Modify

### 1. `pages/upload-results.$artifactId.tsx`
- Change the PageHeader title and subtitle to be context-aware:
  - First upload: "Compliance Scan Results" (current behavior)
  - Follow-up: "Report Comparison Results" or "What Changed Since Your Last Report"

### 2. `components/UploadScanSummary.tsx` + `.module.css` (major refactor)
- Detect `isFollowUp = !!data.crossReference`
- **First-upload mode** (no crossReference): Keep current layout as-is
- **Follow-up mode** (has crossReference): Completely different layout order:

  **Section 1: Dispute Outcome Summary Banner** (NEW — top of page)
  - A prominent card showing high-level outcomes:
    - "🎉 X account(s) removed after your disputes" (green, celebratory)
    - "⚠️ X account(s) unchanged despite disputes — may need escalation" (amber)
    - "ℹ️ X account(s) changed" (blue, neutral)
    - "❓ X account(s) removed without a dispute sent" (grey, unexplained)
  - Calculate these from crossReference data + disputeActivity presence

  **Section 2: Account-by-Account Details** (replaces the current flat comparison grid)
  - Group accounts by outcome type, presented as clear cards:
    - **"Wins — Accounts Removed After Dispute"**: removed accounts that had disputeActivity → show creditor name, packet #, celebratory green styling
    - **"Needs Escalation — Disputed But Unchanged"**: matched accounts that had disputeActivity but no meaningful changes → show creditor name, packet #, amber styling, link to escalation
    - **"Changes Detected"**: matched accounts with real field changes → show the diff (current display, but better labeled)
    - **"Unexplained Removals"**: removed accounts with no disputeActivity → show creditor name, note to investigate
    - **"New Accounts"**: added accounts
    - **"No Changes"**: matched accounts with no changes and no disputes — keep them collapsed/minimal
  - Each account card links to the tradeline detail page

  **Section 3: What To Do Next** (NEW — actionable guidance)
  - Dynamic recommendations based on outcomes:
    - If there are "needs escalation" accounts → "Send escalation packets for accounts that didn't respond"
    - If there are wins → "Document your wins in the evidence log"
    - If there are new violations → "Review new problems found"
  - Action buttons linking to relevant pages (packets, evidence, tradelines)

  **Section 4: New Scan Findings** (moved down — current top section demoted)
  - Keep the threat score gauge, violation stats, top findings, procedural challenges
  - But frame it as "This Report's Scan Results" to differentiate from the comparison above
  - Make it collapsible or at least visually secondary

### 3. `endpoints/upload-results/get_GET.ts` (backend enhancement)
- Add a `disputeOutcomeSummary` field to the response when crossReference exists:
  - `removedAfterDispute: number` — count of removed tradelines that had dispute activity
  - `unchangedAfterDispute: number` — count of matched tradelines that had dispute activity but no meaningful changes
  - `changedAfterDispute: number` — count of matched tradelines that had dispute activity AND changes
  - `removedUnexplained: number` — count of removed tradelines with no dispute activity
- This pre-computed summary avoids the frontend having to re-derive these counts

### 4. `endpoints/upload-results/get_GET.schema.ts`
- Add `DisputeOutcomeSummary` type
- Add it as optional field on `OutputType`

## Files to Create

None — all changes are to existing files.

## Approach

1. **Update the endpoint** to add `disputeOutcomeSummary` to the response (backward compatible — new optional field)
2. **Refactor UploadScanSummary** to detect follow-up mode and render the new layout
3. **Update the page** to adjust title/subtitle based on mode
4. **Style the new sections** with appropriate visual weight (wins = green/celebratory, escalation needed = amber/urgent, etc.)

## Risks & Considerations

- **Backward compatibility**: The endpoint change only adds a new optional field — no breaking changes for native mobile app
- **First-upload experience unchanged**: All changes are behind the `isFollowUp` check, so first-time users see exactly what they see today
- **Dispute activity data quality**: The current `disputeActivity` field sometimes has null `packetType`/`sentDate`/`status` (as seen in the real data). The UI should handle this gracefully — "Disputed via Packet #36" without requiring all fields
- **Edge case — multiple previous artifacts**: Current logic already picks the most recent previous artifact, which is correct
- **Large number of tradelines**: The account-by-account section should handle many tradelines without overwhelming the page. Consider collapsing "No Changes" accounts by default.
