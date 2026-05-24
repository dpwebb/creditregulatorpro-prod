import { canonicalFindingLabelFor } from "./findingTaxonomy";

export function getViolationLabel(category: string | null | undefined): string {
  if (!category) return "Unknown Problem";

  const canonicalLabel = canonicalFindingLabelFor(category);
  if (canonicalLabel) return canonicalLabel;

  return category
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const DOCUMENTATION_FIELD_LABELS: Record<string, string> = {
  chargeOffDate: "Missing write-off date",
  collectionAgencyName: "Collection agency not named",
  creditorId: "Company not clearly named",
  dateAssignedToCollection: "Missing collection assignment date",
  dateClosed: "Missing closed date",
  dateOfFirstDelinquency: "Missing first delinquency date",
  dateOfLastPayment: "Missing last payment date",
  lastReportedDate: "Missing last reported date",
  originalCreditorName: "Original creditor not named",
  paymentRating: "Payment rating issue",
  scheduledMonthlyPayment: "Missing monthly payment",
  status: "Account status issue",
  terms: "Missing loan terms",
};

export function getViolationDisplayLabel(violation: {
  violationCategory?: string | null;
  technicalDetails?: Record<string, any> | null;
}): string {
  const category = violation.violationCategory;
  const details = violation.technicalDetails || null;
  const fieldName =
    typeof details?.fieldName === "string"
      ? details.fieldName
      : typeof details?.missingField === "string"
        ? details.missingField
        : null;

  if (category === "DOCUMENTATION_CHAIN_FAILURE" && fieldName && DOCUMENTATION_FIELD_LABELS[fieldName]) {
    return DOCUMENTATION_FIELD_LABELS[fieldName];
  }

  if (
    category === "ACCOUNT_STATUS_INCONSISTENCY" &&
    details?.narrativeCode === "CZ"
  ) {
    return "Closed account still shows open";
  }

  return getViolationLabel(category);
}
