---
created: 2026-04-15T17:51:19.133Z
updated: 2026-04-15T17:51:19.133Z
---

# Remove Account Number Violation from Platform

## Summary
Credit bureaus in Canada are not required by law to include tradeline account numbers in consumer disclosures. They routinely mask or omit them. The platform currently flags missing account numbers as a `DOCUMENTATION_CHAIN_FAILURE` violation with ERROR severity and 98% confidence — this is legally incorrect and must be removed.

## Scope of Change
There are zero existing violations in the database for this check, so no data cleanup is needed.

## Files to Modify

### 1. `helpers/complianceDetectorMetro2.tsx`
- **Remove check #16** ("Missing account number") entirely — the block starting with `// 16. Missing account number` that flags tradelines with empty/missing `accountNumber` as `DOCUMENTATION_CHAIN_FAILURE`

### 2. `helpers/violationRegulationMap.tsx`
- In the `DOCUMENTATION_CHAIN_FAILURE` case, **remove the `accountNumber` from the array** in the conditional:
  ```
  if (["accountNumber", "accountType", "portfolioType", "accountDesignation"].includes(fieldName))
  ```
  Change to: `["accountType", "portfolioType", "accountDesignation"]`
- **Remove the `specificApplication` block** for `fieldName === "accountNumber"` that says "Your credit report is missing the Account Number for this tradeline..."

## Files to Create
None.

## Approach
1. Remove the detection code from `complianceDetectorMetro2.tsx`
2. Remove the regulation mapping and specific application text from `violationRegulationMap.tsx`
3. No database cleanup needed (0 existing violations)

## Risks & Considerations
- **Backward compatible**: Removing a violation type only means fewer false positives — no API shape changes, no UI changes needed
- **Other account number references are fine**: The `accountNumber` field is still used throughout the platform for display, matching, and identification — we're only removing the *violation check* that flags its absence
- The `disputeNarrativeBuilder` uses `accountNumber` as a display field in letter text, not as a violation — no change needed there
- The `complianceDetectors.tsx` field mapping for "account number" is used for categorizing generic violation messages, not for triggering new violations — safe to leave as-is
