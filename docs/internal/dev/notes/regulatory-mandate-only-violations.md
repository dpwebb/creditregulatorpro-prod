# Regulatory Mandate Only Findings Policy

## Core Principle
Compliance detectors in the system must **ONLY** surface compliance findings that are backed by explicit Canadian federal or provincial regulation or an approved reporting-standard authority mapping.

Use **compliance finding** as the umbrella product term. Use **confirmed legal violation** only when the mapped authority classification explicitly supports that label.

## Metro 2 is Not Law
* Metro 2 is a U.S. industry data format standard established by the CDIA.
* It is **not** a Canadian legal requirement.
* Findings based purely on Metro 2 non-compliance should not be surfaced to the user as regulatory violations.

## Removed Fields & Checks
The following fields have been removed from compliance finding checks because they are NOT mandated by Canadian law:
* `high_credit`
* `payment_history` (as a disclosure requirement)
* `paymentRating`
* `ECOA` / `accountDesignation`
* `credit_limit`
* `portfolio_type`
* `J1`/`J2` segments
* `report_date`
* `payment_history_format`

**Database Note**: `disclosure_requirement` table rows for `accounts[].high_credit` and `accounts[].payment_history` were deleted. PIPEDA 4.9 grants an access right; it does not constitute a field-level mandate.

## Provincial CRA Scope
Provincial Credit Reporting Agencies (CRAs) regulate:
* Accuracy
* Dispute rights
* Investigation timelines
* Retention limits
They **do NOT** regulate specific data fields per tradeline.

## Retained Rules
The following rules have been kept because they are grounded in **PIPEDA 4.6 (Accuracy)**:
* `BaseSegmentRequired`
* Date logic (e.g., impossible dates)
* Balance consistency
* Creditor name presence
* Date closed

## Important Edge Cases
* **Original Creditor vs. Collection**: An original creditor reporting an `O9` or charge-off status is **NOT** a collection account.
* **Collection Findings**: Only flag collection-specific findings when the reporting entity is definitively acting as a collection agency.
