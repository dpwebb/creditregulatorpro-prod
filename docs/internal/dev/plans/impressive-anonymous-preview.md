---
created: 2026-04-17T02:21:28.502Z
updated: 2026-04-17T02:21:28.502Z
---

# Impressive Anonymous Preview — Duplicate Detection & Stronger Messaging

## Summary
Make the anonymous upload preview a compelling sales funnel by (a) detecting potential duplicate collection accounts and flagging them as a violation, and (b) replacing weak detail messages with stronger, more specific language that explains the real impact of each problem.

## Files to Modify

### `endpoints/ingest/anonymous-report_POST.ts`
Two changes:

**1. Duplicate collection detection:**
After the tradeline loop, analyze all collection accounts found. If 2+ collection accounts share similar original creditor names or similar balance amounts, produce a special "duplicate" type problem that replaces one of the generic collection cards. Use fuzzy matching on creditor names (e.g. normalize to lowercase, strip "inc", "ltd", "corp", etc.) to detect duplicates. Even without a perfect match, if there are 2+ collection accounts at all, add a card noting that multiple collectors on the same debt is a common violation worth investigating.

**2. Stronger detail messages per type:**
- **collection**: Title: "A debt collector has placed a claim on your file". Detail: "{name} is reporting a collection. Under Canadian law, they must prove you actually owe this debt. If they can't, it must be removed." 
- **pastDue**: Title: "An overdue balance is dragging down your score". Detail: "{name} says you owe ${amount}. If this amount is wrong — even by $1 — it's a reporting error that could be costing you money every day."
- **derogatory**: Title: "A negative mark is damaging your credit". Detail: "{name} has flagged your account with a serious negative status. This lowers your score and can affect your ability to borrow, rent, or get hired."
- **publicRecord**: Title: "A public record is on your credit file". Detail: "A {type} record was found. Public records have the biggest impact on your credit and can stay on your file for years."
- **duplicate** (new type): Title: "Multiple collectors may be reporting the same debt". Detail: "We found {count} collection accounts that may be duplicates. Under Canadian law, the same debt cannot be listed more than once. This is a serious violation."
- **info** (zero problems): Title: "No obvious issues — but that doesn't mean you're clear". Detail: "Many problems are hidden in the technical codes. A deep compliance scan checks over 200 rules that a quick look can't catch."

**3. Increase sampleProblems limit from 3 to 5** to show more issues and increase urgency.

### `components/AnonymousUploadPreview.tsx`
- Add the new "duplicate" type with its own icon (Copy from lucide-react) and accent color (orange/warning)
- Support up to 5 problem cards

### `components/AnonymousUploadPreview.module.css`
- Add `.accentDuplicate::before` style with a distinct orange/warning color

## Files to Create
None.

## Approach
1. Update the endpoint to add duplicate detection logic after the tradeline loop and strengthen all detail messages
2. Update the component to support the new "duplicate" type with appropriate icon and accent
3. Increase the sample limit from 3 to 5

## Risks & Considerations
- Duplicate detection is heuristic — false positives are OK here since this is a preview/sales funnel, not a legal determination. The language says "may be duplicates" to be safe.
- Keep all language at grade-8 level. No legal jargon beyond "Canadian law" and "violation".
- Backward compatible: the new "duplicate" type is additive; old string fallback still works in the frontend.
