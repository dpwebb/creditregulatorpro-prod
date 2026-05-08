# Ingestion Violation Coverage

Verified: May 8, 2026

## Current Coverage Summary

For each ingested tradeline, the compliance scanner currently checks:

- 50 enabled violation categories with bona fide local authority mappings.
- 49 scanner detector call sites in the ingestion scanner.
- About 70 concrete runtime checks after expanding grouped detector calls.
- 12 active dynamic scanning rules.
- 0 invalid active dynamic scanning rules.

## Expanded Runtime Count

The scanner has 49 direct call sites. Three of those call sites expand into multiple checks:

- `runAllResponseAuditDetectors` expands into 5 response-audit checks.
- `detectMetro2RulesetViolations` expands into 7 Metro2 validation checks.
- `executeActiveRules` currently expands into 12 valid active dynamic rules.

That produces approximately 70 concrete checks per tradeline:

```text
49 direct scanner calls
- 3 grouped call placeholders
+ 5 response-audit checks
+ 7 Metro2 checks
+ 12 active dynamic rules
= 70 concrete runtime checks
```

## Authority-Backed Categories

The platform currently has 50 configured violation categories. All 50 are enabled and all 50 resolve to at least one bona fide local authority mapping through the local registry.

This means the scanner can evaluate 50 backed categories in general, subject to the facts available on the ingested tradeline, report artifact history, dispute history, bankruptcy records, province resolution, and correction truth layer.

## Dynamic Rule State

The dynamic-rule cleanup has been completed:

- Active dynamic rules: 12
- Valid active dynamic rules: 12
- Invalid active dynamic rules: 0

The prior invalid active rules were archived because their definitions were stored as JSON strings instead of JSON objects. The update endpoint now stores rule definitions as JSON objects to prevent recurrence.

## Field-Specific Authority Caveat

There are currently 0 exact field-specific authority records in the local authority registry.

That matters for missing-information issues. Missing information that supports a review status is only an actionable violation when it can be mapped to a specific local or federal law, regulation, or official/private reporting standard that requires that exact field for the account type.

Until exact field-level authority records are added, missing-field findings such as missing `dateOfFirstDelinquency`, missing `dateClosed`, missing `terms`, or missing `dateAssignedToCollection` should not be surfaced as confirmed actionable violations based only on generic PIPEDA accuracy language or generic Metro2 base-segment language.

## Current Interpretation

The current safe operating statement is:

> Each ingestion checks 50 authority-backed violation categories and approximately 70 concrete runtime checks per tradeline. However, missing-field issues remain review-only unless the local registry contains an exact field-level authority record for that field and account type.

## Source Code References

- Scanner orchestration: `helpers/complianceScanner.tsx`
- Authority registry: `helpers/legalAuthorityRegistry.ts`
- Regulation mapping: `helpers/regulationRegistry.tsx`
- Dynamic rule execution: `helpers/dynamicRuleExecutor.tsx`
- Metro2 validation rules: `helpers/metro2ValidationRules.tsx`
- Missing-field authority gate: `helpers/violationRuleEvidence.ts`
