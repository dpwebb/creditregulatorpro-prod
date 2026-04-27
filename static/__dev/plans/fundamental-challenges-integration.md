---
created: 2026-04-16T20:50:23.987Z
updated: 2026-04-16T20:50:23.987Z
---

# Fundamental Challenges Integration

## Summary
Repurpose the "Other Things You Can Do" section on the tradeline detail page (non-admin view) into a "Other Ways to Challenge This Account" section that surfaces fundamental procedural challenges from `challengeAccessPointGenerator`. These challenges integrate directly into the dispute letter process via `CreatePacketDialog` and `packet/create_POST`, allowing users to generate formal dispute letters based on procedural/statutory grounds even when no specific data violation has been detected.

## Current State
- The "Other Things You Can Do" section currently shows two utility actions: "Log a Response" and "View Source Report"
- `helpers/challengeAccessPointGenerator` already defines 11 procedural challenges (Bureau Authority, Creditor Authority, Permissible Purpose, Chain of Title, Collector Licensing, etc.)
- `packet/create_POST` already accepts `violationCategory` and `disputeReasonCode` independently of a `creditorObligationTestId` — it can generate letters without a detected violation
- `packetLetterBuilder` generic fallback template handles cases without violation details
- `CreatePacketDialog` has the infrastructure for pre-filling dispute params

## Files to Modify

### 1. `pages/tradelines.$id.tsx`
- Rename the "Other Things You Can Do" section to **"Other Ways to Challenge This Account"**
- Replace the current content (Log a Response / View Source Report) with a new component that renders applicable procedural challenges
- Move "Log a Response" button into the "Letters You've Sent" section (only visible when challenges have been sent)
- Move "View Source Report" into the collapsible "See account details" section
- Pass tradeline data (creditorName, status, isCollectionAccount, bureauId) to the new challenges component

### 2. New Component: `components/FundamentalChallenges.tsx`
- Accepts tradeline props (id, creditorName, status, isCollectionAccount, bureauId, etc.)
- Calls `generateAccessPointsForTradelines` from `challengeAccessPointGenerator` to get applicable challenges
- Filters out challenges that already have a violation-based packet (avoids duplication with ComplianceHub)
- Renders each challenge as a card with:
  - Plain-language label and description (Grade 8 level)
  - Entity type badge (Bureau / Creditor / Collector)
  - Priority indicator
  - "Send Challenge Letter" button
- On button click: opens `CreatePacketDialog` with pre-filled `bureauId`, `tradelineId`, and a mapped `disputeReasonCode` from the challenge's vector
- Shows a brief intro paragraph: "Even if we didn't find a specific error, you have the right to challenge how your information is being handled."

### 3. `helpers/challengeAccessPointGenerator.tsx`
- Add a `mapAccessPointToDisputeReasonCode` function that maps each `ChallengeAccessPoint.id` to the most appropriate `EquifaxDisputeReasonCode` for letter generation
- Example mappings:
  - BUREAU_AUTHORITY → "106" (Not my account)
  - CREDITOR_PURPOSE → "A10" (Never authorized account)
  - COLLECTOR_CHAIN → "031" (Account paid / closed)
  - COLLECTOR_LICENSE → "106" (Not my account)
  - etc.

### 4. `components/CreatePacketDialog.tsx`
- Add an optional `challengeAccessPointId` prop for when the dialog is opened from a fundamental challenge (not a violation)
- When `challengeAccessPointId` is set and no `autofillViolationId`:
  - Skip the recommendation step, go directly to form
  - Pre-fill `disputeReasonCode` from the mapped access point
  - Show the challenge label/description as context in the dialog header
  - Set `violationCategory` to null (this is a procedural challenge, not a detected violation)

### 5. `helpers/packetLetterBuilder.tsx` (minor)
- No structural changes needed — the generic fallback already handles cases without violation details
- The `disputeNarrativeBuilder` will use the `disputeReasonCode` to frame the letter appropriately

## Files to Create

### `components/FundamentalChallenges.tsx` + `.module.css`
New component that renders the procedural challenge cards for non-admin users on the tradeline detail page.

## Approach

### Step 1: Add dispute reason code mapping to challengeAccessPointGenerator
- Add `mapAccessPointToDisputeReasonCode()` function
- This provides the bridge between procedural challenges and the letter generation system

### Step 2: Create FundamentalChallenges component
- Build the UI component that renders applicable challenges
- Use `generateAccessPointsForTradelines` with the current tradeline's data
- Each card has a CTA button that triggers packet creation

### Step 3: Update CreatePacketDialog
- Add `challengeAccessPointId` prop support
- When present, skip recommendation step, pre-fill dispute reason code
- Show challenge context in dialog header description

### Step 4: Update tradelines.$id page
- Replace "Other Things You Can Do" with the new FundamentalChallenges component
- Relocate "Log a Response" to Letters You've Sent section
- Relocate "View Source Report" to the collapsible details section

### Step 5: Verify end-to-end flow
- Test that clicking a fundamental challenge opens CreatePacketDialog correctly
- Test that the generated letter uses appropriate procedural language
- Test that collection-specific challenges only appear for collection accounts

## Risks & Considerations

- **Backward compatibility**: The `packet/create_POST` schema already accepts all needed fields. No breaking changes to the API.
- **Letter quality**: The generic fallback template + `letterHumanizer` (OpenAI) should produce appropriate letters for procedural challenges. The `disputeNarrativeBuilder` already handles cases without specific violation details.
- **Duplicate letters**: Need to check if a packet already exists for this tradeline+bureau with the same dispute reason code to avoid duplicate challenges. Can reuse the existing duplicate draft check in `packet/create_POST`.
- **Mobile app compatibility**: All changes are frontend-only (new component + page update) or additive backend changes. No breaking API changes.
- **Grade 8 language**: All challenge descriptions in `challengeAccessPointGenerator` need to be reviewed/simplified for plain language. The current descriptions are somewhat technical.
- **Over-challenging**: Consider showing a note that users should focus on the detected violations first before pursuing procedural challenges, to avoid overwhelming the bureaus with too many simultaneous disputes.
