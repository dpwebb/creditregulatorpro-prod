---
created: 2026-04-21T04:30:59.011Z
updated: 2026-04-21T04:30:59.011Z
---

# Specific Messages for Documentation Chain Failure Violations

## Summary
The `DOCUMENTATION_CHAIN_FAILURE` violation category has multiple sub-types (fake original creditor, missing chain-of-ownership docs, debt validation timeout), but the UI explanation and dispute letter both produce the same generic message for all of them. This plan makes both the user-facing card text and the generated dispute letter specific to the actual detected issue.

## Files to Modify

### 1. `helpers/getEnrichedExplanation.tsx`
- Replace the single `DOCUMENTATION_CHAIN_FAILURE` case with sub-type-aware logic using `technicalDetails`:
  - **Fake original creditor** (`technicalDetails.matchReason` exists): Show something like "The listed original creditor 'NCRI INC' appears to be another collection agency — not the company you originally owed. The real original creditor is unknown."
  - **Missing chain-of-ownership docs** (`technicalDetails.assignmentDocsFound === 0`): Show "The collection agency hasn't provided proof that they own or were assigned this debt."
  - **Debt validation timeout** (`technicalDetails.validationReceived === false`): Show "The collection agency didn't respond to the debt validation request within 30 days."
  - **Missing original creditor name** (`technicalDetails.missingField === 'originalCreditorName'`): Show "This collection account doesn't list who the original creditor was."
  - Keep the current generic message as fallback.

### 2. `helpers/disputeNarrativeBuilder.tsx`
- In `disputeNarrativeBuilder()`, add a specific case for `DOCUMENTATION_CHAIN_FAILURE` (before the default fallback) that checks `violationDetails` for sub-type:
  - **Fake original creditor** (`violationDetails.originalCreditorName` + `violationDetails.matchReason`): Generate paragraphs that name the fake OC, explain it's actually a collection agency, and demand disclosure of the true original creditor.
  - **Missing chain-of-ownership**: Generate paragraphs demanding assignment/purchase documentation.
  - **Debt validation timeout**: Generate paragraphs about the 30-day validation failure.
- In `getDisputeLetterFraming()`, differentiate the DOCUMENTATION_CHAIN_FAILURE subject/introduction when violationDetails indicate a fake-OC scenario (e.g. subject: "Re: Demand for Original Creditor Disclosure — Fraudulent Chain of Title").

### 3. `helpers/buildViolationAwareAccountId` (inside disputeNarrativeBuilder.tsx)
- For `DOCUMENTATION_CHAIN_FAILURE` with fake-OC sub-type, include the listed (fake) original creditor name and collection agency name in the account identification block so the letter explicitly names them.

## Files to Create
None.

## Approach
1. Update `getEnrichedExplanation` to branch on `technicalDetails` fields for `DOCUMENTATION_CHAIN_FAILURE`.
2. Update `disputeNarrativeBuilder` and `getDisputeLetterFraming` to produce specific letter content for each sub-type.
3. Update `buildViolationAwareAccountId` to show fake-OC details in the letter's account identification block.

## Risks & Considerations
- The `technicalDetails` shape varies by sub-type — must handle all existing shapes gracefully with fallbacks.
- The deduplication in `TradelineComplianceHub` (just implemented) means non-admin users only see one `DOCUMENTATION_CHAIN_FAILURE` card — the highest-severity one. The message on that card must be the most impactful one (which it will be, since the fake-OC detection is severity ERROR vs WARNING for chain-of-ownership).
- Letters are already generated and stored in the DB — existing packets won't be affected. Only newly created packets will get the improved text.
- Must remain backward compatible for the native mobile app.
