# Statute of Limitations Approaching (STATUTE_APPROACHING) Calculation

This document outlines the logic and calculations used to trigger the `STATUTE_APPROACHING` violation, primarily evaluated by `detectStatuteOfLimitations` in the `complianceDetectorTemporal` module.

## Reference Date Priority Chain

When determining the start date for the statute of limitations retention period, the system evaluates available tradeline dates in the following fallback sequence to find the most accurate activity marker:

1. `dateOfFirstDelinquency` (Highest priority)
2. `lastActivityDate`
3. `dateOfLastPayment`
4. `dateClosed`
5. `openedDate` (Lowest priority fallback)

## Retention Limit Calculation

The retention limit is calculated by adding the province-specific retention period to the reference date.

**Example Case: Tradelines 413 & 418**
- **Province:** Nova Scotia (NS)
- **Retention Period:** 6 years
- **Statutory Reference:** R.S.N.S. 1989, c. 93, s. 9(3)
- **Reference Date Found:** August 9, 2020 
  - *Source:* `dateOfLastPayment` (because `dateOfFirstDelinquency` and `lastActivityDate` were null).
- **Reporting Limit Date:** August 9, 2026 (Reference Date + 6 years)

## Violation Trigger Condition

The `STATUTE_APPROACHING` compliance violation is flagged when:
1. The account is in a closed state.
2. The current date is **≤ 6 months** away from the `Reporting Limit Date`.

## Technical Details Payload

When the violation fires, the detector populates the `technicalDetails` payload in the database with the exact calculation parameters. This ensures full transparency for audits and UI explanations.

```json
{
  "referenceDate": "2020-08-09T00:00:00.000Z",
  "referenceDateSource": "dateOfLastPayment",
  "retentionYears": 6,
  "reportingLimitDate": "2026-08-09T00:00:00.000Z",
  "daysRemaining": 182,
  "monthsRemaining": 6,
  "province": "NS",
  "statutoryReference": "R.S.N.S. 1989, c. 93, s. 9(3)",
  "regulationIds": []
}
```