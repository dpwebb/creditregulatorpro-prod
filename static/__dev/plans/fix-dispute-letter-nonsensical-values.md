---
created: 2026-04-23T00:05:09.428Z
updated: 2026-04-23T00:05:09.428Z
---

# Fix Dispute Letters Using Raw Technical Values Instead of Plain Language

## Summary
Dispute letters are outputting nonsensical technical jargon because `disputeNarrativeBuilder` uses raw `detectedValue` / `expectedValue` from the compliance scanner's `technicalDetails` directly in consumer-facing letters. These values are internal diagnostic metrics (character counts like "28 chars", rule thresholds like "Max 24 chars", literal "null", internal IDs like "308", status codes like "WO-Bad debt write-off", and jargon like "Non-zero rating reflecting the derogatory status"). 

Each violation already has a `userExplanation` field written in plain Grade-8 language. The narrative builder should use that instead of the raw technical values for violation categories that produce non-consumer-meaningful data.

## Root Cause
The `disputeNarrativeBuilder` generic handler (lines handling `violationDetails.detectedValue` / `expectedValue`) inserts these values verbatim. When the letterHumanizer (OpenAI) rewrites the text, it faithfully keeps these nonsense values since the prompt says "keep ALL factual data exactly intact."

Affected violation categories and their problematic values:
- **PAYMENT_HISTORY_MANIPULATION**: `"28 chars"` / `"Max 24 chars"` — Metro2 character count validation
- **DOCUMENTATION_CHAIN_FAILURE** (paymentRating): `"0"` / `"Non-zero rating reflecting the derogatory status"` — internal jargon
- **DOCUMENTATION_CHAIN_FAILURE** (BASE_SEGMENT_REQUIRED): `"Missing: DATE OPENED"` / `"All required fields present"` — internal format  
- **DOCUMENTATION_CHAIN_FAILURE** (DATE_CLOSED_REQUIRED): `"null"` / `"Valid closed date"` — literal null string
- **ACCOUNT_STATUS_INCONSISTENCY**: `"WO-Bad debt write-off"` — internal status code that currently falls through but produces jargon
- **COLLECTOR_DUPLICATE_REPORTING**: `"308"`, `"309"` — internal tradeline IDs
- **DISCLOSURE_DEFICIENCY**: no detected/expected values but has userExplanation that could be leveraged

## Files to Modify

### 1. `helpers/disputeNarrativeBuilder.tsx`
This is the primary fix location. Changes needed:

**A. Add a dedicated `PAYMENT_HISTORY_MANIPULATION` handler** (before the generic detected/expected block):
- Payment history character counts are never consumer-meaningful
- Use `userExplanation` directly: "Your payment history shows unexpected negative changes that don't match what was reported before."
- Include the payment pattern details from `tradelineDetails.paymentPattern` if available
- Return early after building the paragraph

**B. Add a dedicated `ACCOUNT_STATUS_INCONSISTENCY` handler**:
- The detectedValue is a raw status code (e.g. "WO-Bad debt write-off")
- Use `userExplanation` which already says "The account status doesn't match the balance"
- If tradelineDetails has both status and balance, produce a concrete paragraph: "This account shows a status of [humanized status] but still reports a balance of $X"

**C. Add a dedicated `DISCLOSURE_DEFICIENCY` handler**:
- No detected/expected values at all
- Use `userExplanation` which describes what's missing

**D. Improve the generic detected/expected value guard** to reject clearly technical values:
- Values matching `/^\d+ chars$/` pattern (character counts)
- Values matching `/^Max \d+ chars$/` pattern (rule thresholds)  
- Values that are `"All required fields present"` (rule-level expectations)
- Values that are pure numeric strings with no field context and no expectedValue (internal IDs like "308", "309")
- When these are detected, fall back to using `userExplanation` instead of the raw values
- If `userExplanation` is also empty, use the existing `reasonDescription` fallback

**E. For the `"Missing: X"` pattern in detectedValue**: The existing code handles this but produces awkward phrasing when expectedValue is "All required fields present". Fix the handler to ignore that expectedValue and instead say: "The [humanized field] for this account is not included in my credit file."

### 2. `helpers/letterHumanizer.tsx`
Minor improvement to the system prompt to add one more safety rule:
- Add: "If any value appears to be an internal system code, character count, or technical metric rather than actual account data, rephrase it naturally or omit it."

This is a defense-in-depth measure — the primary fix is in the narrative builder.

## Files to Create
None.

## Approach
1. **Fix `disputeNarrativeBuilder`**: Add dedicated handlers for PAYMENT_HISTORY_MANIPULATION, ACCOUNT_STATUS_INCONSISTENCY, and DISCLOSURE_DEFICIENCY before the generic block. Improve the generic block's value guards.
2. **Fix `letterHumanizer`**: Add a safety instruction to the OpenAI prompt.
3. **Verify**: Test with the FIDO tradeline (ID 410) that triggered the original report, confirming the letter now contains meaningful plain-language content.

## Risks & Considerations
- **Backward compatibility**: These are output quality improvements only — no input/output shape changes. Fully backward compatible.
- **userExplanation quality**: The `userExplanation` values in the database are already well-written in plain language. However, if a violation somehow has no `userExplanation`, the code must fall back gracefully to the existing `reasonDescription`.
- **Existing specialized handlers**: Several violation categories already have dedicated handlers (STATUTE_OF_LIMITATIONS, DOCUMENTATION_CHAIN_FAILURE with DOFD, MULTIPLE_COLLECTOR_VIOLATION, etc.). The new handlers must be placed correctly to not conflict with these.
- **Letter humanizer**: Even with the narrative builder fix, the humanizer should have a safety net for any future technical values that slip through.
