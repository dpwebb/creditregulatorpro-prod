---
created: 2026-04-22T23:07:16.562Z
updated: 2026-04-22T23:21:27.205Z
---

# Fix Dispute Letter Raw Code Leakage & Missing Narrative Coverage

## Summary
Dispute letters generated for the 4 new violation categories (`MIXED_FILE_PERSONAL_INFO_MISMATCH`, `COLLECTION_LIMITATION_EXCEEDED`, `CONSENT_WITHDRAWAL_NOT_HONORED`, `FREEZE_PERIOD_VIOLATION`) output raw internal codes (e.g. `"ADDRESS_MISMATCH"`) directly into consumer-facing letters instead of human-readable explanations. The entire letter-building pipeline — narrative, framing, and requested action — has no awareness of these categories and falls through to generic paths that dump technical identifiers.

Additionally, the generic fallback in `disputeNarrativeBuilder` should be hardened to never output raw ALL_CAPS_UNDERSCORE codes even for future unmapped categories.

## Root Cause
Packet 82 was generated for a `MIXED_FILE_PERSONAL_INFO_MISMATCH` violation where:
- `detectedValue` = `"ADDRESS_MISMATCH"` (internal code from `complianceDetectorMixedFile`)
- No `fieldName` or `expectedValue` was set
- `disputeNarrativeBuilder` has no branch for this category → falls to generic "The reported value X is inaccurate"
- `getDisputeLetterFraming` has no branch → generic subject "Accuracy and Completeness"
- `buildBureauRequestedAction` has no branch → generic "investigate this dispute"

Additionally, the `complianceDetectorMixedFile` province comparison is a naive string match (`"Nova Scotia" !== "NS"`) which produces false positive ADDRESS_MISMATCH violations. Real database data shows user_province = "Nova Scotia" and report_province = "NS" — the same province but different formats. A province normalization step is needed.

## Files to Modify

### 1. `helpers/disputeNarrativeBuilder.tsx`
Add category-specific narrative branches (early returns, like the existing SOL and DOCUMENTATION_CHAIN_FAILURE branches) for ALL 4 new violation categories:

- **MIXED_FILE_PERSONAL_INFO_MISMATCH**: Based on `detectedValue` (DOB_MISMATCH / NAME_MISMATCH / ADDRESS_MISMATCH), explain in plain language what doesn't match, using actual values from `violationDetails` (e.g. "The Date of Birth on my credit report does not match my actual Date of Birth, which strongly suggests this file has been mixed with another consumer's information"). Include the actual mismatched values if present in technicalDetails.
- **COLLECTION_LIMITATION_EXCEEDED**: Explain that the collection account has exceeded the provincial limitation period and is still being actively reported. Include province and limitation years from technicalDetails.
- **CONSENT_WITHDRAWAL_NOT_HONORED**: Explain that reporting continued after formal consent withdrawal, referencing the withdrawal date.
- **FREEZE_PERIOD_VIOLATION**: For ACCOUNT_DURING_FREEZE: explain an account was opened during an active security freeze. For INQUIRY_DURING_FREEZE: explain a hard inquiry occurred during a freeze.

Also add a **safety net** in the generic `detectedValue` output path: if `detectedValue` matches the pattern of an internal code (ALL_CAPS with underscores, e.g. `ADDRESS_MISMATCH`), replace it with the `userExplanation` from violationDetails, or fall back to `getViolationLabel(violationCategory)`, rather than outputting the raw code. This protects against future categories that might be added without narrative coverage.

### 2. `helpers/equifaxDisputeTemplate.tsx`
In `getDisputeLetterFraming()`, add framing entries for the 4 new categories:
- **MIXED_FILE_PERSONAL_INFO_MISMATCH**: Subject: "Re: Mixed Credit File — Personal Information Mismatch", Intro: "I am writing because the personal information on my credit report does not match my actual identity, which suggests my file has been mixed with another consumer's."
- **COLLECTION_LIMITATION_EXCEEDED**: Subject: "Re: Request for Removal — Collection Past Legal Time Limit", Intro: "I am writing to request the removal of a collection account that has exceeded the provincial limitation period for collection activity."
- **CONSENT_WITHDRAWAL_NOT_HONORED**: Subject: "Re: Unauthorized Continued Reporting After Consent Withdrawal", Intro: "I am writing because an account continues to be reported on my credit file after I formally withdrew my consent for information sharing."
- **FREEZE_PERIOD_VIOLATION**: Subject: "Re: Unauthorized Activity During Security Freeze", Intro: "I am writing to report unauthorized activity on my credit file during an active security freeze."

In `buildBureauRequestedAction()`, add specific requested actions:
- **MIXED_FILE_PERSONAL_INFO_MISMATCH**: "Please investigate this mixed file situation, segregate my credit information from any other consumer's data, and remove all accounts that do not belong to me."
- **COLLECTION_LIMITATION_EXCEEDED**: "Please remove this time-barred collection account from my credit file immediately, as it is past the legal limitation period."
- **CONSENT_WITHDRAWAL_NOT_HONORED**: "Please immediately cease reporting this account and remove all information reported after the date of consent withdrawal."
- **FREEZE_PERIOD_VIOLATION**: "Please investigate this unauthorized access during my security freeze and remove any resulting accounts or inquiries."

### 3. `helpers/complianceDetectorMixedFile.tsx`
- Add a province normalization step: before comparing provinces, normalize both values to the same format using a province code/name mapping. For example, "NS" and "Nova Scotia" should both resolve to the same canonical value. This prevents false positive ADDRESS_MISMATCH violations.
- The normalization should handle: all 13 Canadian province/territory 2-letter codes (AB, BC, MB, NB, NL, NS, NT, NU, ON, PE, QC, SK, YT) mapped to their full names, case-insensitive matching, and graceful fallback (if neither format matches, compare as-is).
- Change the `detectedValue` field from internal codes to human-readable descriptions:
  - `"DOB_MISMATCH"` → `"Date of Birth does not match"`
  - `"NAME_MISMATCH"` → `"Last name does not match"`
  - `"ADDRESS_MISMATCH"` → `"Province does not match"`

### 4. `helpers/canadianJurisdictions.tsx`
Add a province code-to-name map and a `normalizeProvince()` function that converts any province input (code or full name) to a canonical form for comparison. This will be used by the mixed file detector and can be reused across the codebase.

### 5. `helpers/complianceDetectorCollectionLimitation.tsx`
Ensure `detectedValue` is human-readable (currently it stores `yearsSinceReference` as a number, which is fine — but verify it won't produce confusing output in the narrative path).

### 6. `helpers/complianceDetectorConsentWithdrawal.tsx`
Ensure `detectedValue` is human-readable (currently `"CONSENT_IGNORED"` — change to `"Reporting continued after consent withdrawal"`).

### 7. `helpers/complianceDetectorFreezeViolation.tsx`
Ensure `detectedValue` values are human-readable:
- `"ACCOUNT_DURING_FREEZE"` → `"Account opened during active security freeze"`
- `"INQUIRY_DURING_FREEZE"` → `"Hard inquiry during active security freeze"`

### 8. `helpers/transunionDisputeTemplate.tsx`
If TransUnion template uses similar framing/narrative logic, ensure the same 4 categories are handled there too (check if it delegates to the shared functions or has its own).

## Files to Create
None.

## Approach
1. Add province normalization utility to `canadianJurisdictions` helper with a code↔name map for all 13 Canadian provinces/territories.
2. Update the 4 detector helpers to use human-readable `detectedValue` strings instead of ALL_CAPS codes, and use the new normalizeProvince function in the province comparison for mixed file detector.
3. Add category-specific narrative branches in `disputeNarrativeBuilder` for all 4 new categories.
4. Add framing (subject/intro) in `getDisputeLetterFraming` for the 4 new categories.
5. Add requested actions in `buildBureauRequestedAction` for the 4 new categories.
6. Add the generic safety net in `disputeNarrativeBuilder` to catch any future ALL_CAPS codes.
7. Verify the TransUnion template delegates to the same shared functions (if so, no separate changes needed).
8. Test by triggering a rescan and packet generation to verify the letter content is now human-readable.

## Risks & Considerations
- **Backward compatibility**: Existing violations in the DB still have old `detectedValue` codes (e.g. `"ADDRESS_MISMATCH"`). The narrative builder must handle both old and new values gracefully — the safety net for ALL_CAPS codes covers this.
- **Both packet paths**: There are TWO packet creation endpoints (`packet/create_POST` and `packet/build_POST`). The `create_POST` path uses `packetLetterBuilder` → `disputeNarrativeBuilder`. The `build_POST` path uses `packetTemplatesCA` or bureau-specific templates directly. Both must be covered — the shared `getDisputeLetterFraming`, `disputeNarrativeBuilder`, and `buildBureauRequestedAction` functions are used by both paths, so fixing those covers both.
- **No data migration needed**: Old violations don't need to be updated in the DB; the narrative builder will handle old codes via the safety net.
- **Existing false positives**: Users who already have ADDRESS_MISMATCH violations triggered by province abbreviation differences (e.g. NS vs Nova Scotia) will still have those old violations in the DB. A rescan will clear them, but old packets generated from these false positives will remain. Consider advising affected users to regenerate packets.