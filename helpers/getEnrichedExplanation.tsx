const FIELD_LABELS: Record<string, string> = {
  accountType: "account type",
  chargeOffDate: "date the account was written off",
  creditorId: "company name",
  dateAssignedToCollection: "date it was sent to collections",
  dateClosed: "date closed",
  dateOfFirstDelinquency: "date it first fell behind",
  dateOfLastPayment: "last payment date",
  lastReportedDate: "date it was last reported",
  originalCreditorName: "original company you owed",
  paymentRating: "payment rating",
  scheduledMonthlyPayment: "monthly payment amount",
  terms: "loan length",
};

const humanizeFieldName = (fieldName: string | null | undefined): string => {
  if (!fieldName) return "missing information";
  if (FIELD_LABELS[fieldName]) return FIELD_LABELS[fieldName];

  return fieldName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
};

const stripInternalDetails = (text: string): string => {
  return text
    .replace(/\s*Review basis:[\s\S]*$/i, "")
    .replace(/\s*reference ids?[:\s][^.;]+[.;]?/gi, "")
    .replace(/\s*rule names?[:\s][^.;]+[.;]?/gi, "")
    .replace(/\s*regulatory basis[:\s][^.;]+[.;]?/gi, "");
};

export const simplifyForUser = (text: string | null | undefined): string => {
  if (!text) return "";

  let simplified = stripInternalDetails(text);
  simplified = simplified.replace(/under\s+[A-Z][A-Za-z.\s]+\d{4}(?:(?:,\s*)?[a-z]\.\s*\d+(?:\(\d+\))?)*/g, "");

  const replacements: Array<{ pattern: RegExp; replacement: string }> = [
    { pattern: /\bThe available report data indicates:\s*/gi, replacement: "" },
    { pattern: /\bavailable report data\b/gi, replacement: "your credit report" },
    { pattern: /\btradeline\b/gi, replacement: "account" },
    { pattern: /\bfurnisher\b/gi, replacement: "company reporting this" },
    { pattern: /\boriginal creditor\b/gi, replacement: "original company you owed" },
    { pattern: /\bcreditor\b/gi, replacement: "company" },
    { pattern: /\bMetro-?2\b/gi, replacement: "credit reporting" },
    { pattern: /\bPIPEDA\b/gi, replacement: "privacy law" },
    { pattern: /\bDate of First Delinquency\b/gi, replacement: "date it first fell behind" },
    { pattern: /\bDate Assigned (?:To|to) Collection\b/gi, replacement: "date it was sent to collections" },
    { pattern: /\bsource documentation\b/gi, replacement: "proof" },
    { pattern: /\breporting basis\b/gi, replacement: "reason they reported it" },
    { pattern: /\bcorrection pathway\b/gi, replacement: "way to fix it" },
    { pattern: /\bclarification request\b/gi, replacement: "letter asking them to explain or fix it" },
    { pattern: /\bpotential inconsistency\b/gi, replacement: "possible mistake" },
    { pattern: /\bdiscrepancy\b/gi, replacement: "difference" },
    { pattern: /\bapplicable requirements\b/gi, replacement: "the rules" },
    { pattern: /\bstatute-barred\b/gi, replacement: "too old for collection action" },
    { pattern: /\blimitation period\b/gi, replacement: "time limit" },
  ];

  for (const { pattern, replacement } of replacements) {
    simplified = simplified.replace(pattern, replacement);
  }

  simplified = simplified.replace(/\s+/g, " ").replace(/\s+([.,)])/g, "$1").trim();
  return simplified;
};

const getMissingInfoExplanation = (technicalDetails: any): string | null => {
  const fieldName = technicalDetails?.fieldName || technicalDetails?.missingField;

  switch (fieldName) {
    case "dateAssignedToCollection":
      return "This collection account does not show the date it was sent to collections. That date can help verify whether the collection reporting is accurate.";
    case "dateOfFirstDelinquency":
      return "This account is missing the date it first fell behind. That date helps decide how long the account can stay on your report.";
    case "originalCreditorName":
      return "This collection account does not list the original company you owed.";
    case "terms":
      return "This loan account is missing the loan length, like 36 months or 60 months.";
    case "lastReportedDate":
      return "This account is missing the date it was last reported. That date shows whether the information is up to date.";
    case "chargeOffDate":
      return "This account says the debt was written off, but it does not show when that happened.";
    case "scheduledMonthlyPayment":
      return "This account is missing the normal monthly payment amount.";
    case "accountType":
      return "This account is missing the account type, like loan, credit card, or collection.";
    case "creditorId":
      return "This account does not clearly name the company reporting it.";
    default:
      if (!fieldName) return null;
      return `This account is missing the ${humanizeFieldName(String(fieldName))}. That information is needed to check if the account is correct.`;
  }
};

export const getEnrichedExplanation = (violation: {
  violationCategory?: string | null;
  technicalDetails?: any;
  userExplanation?: string | null;
  responsibleEntity?: "BUREAU" | "CREDITOR" | "COLLECTOR" | string | null;
}): string => {
  const { violationCategory, technicalDetails, userExplanation } = violation;
  const responsibleEntity = violation.responsibleEntity || technicalDetails?.responsibleEntity;

  const getEntityName = (entity: string | undefined | null) => {
    if (entity === "BUREAU") return "the credit bureau";
    if (entity === "CREDITOR") return "the company reporting this";
    if (entity === "COLLECTOR") return "the collection agency";
    return "the company";
  };

  const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);
  const entityName = getEntityName(responsibleEntity);
  const capitalizedEntityName = capitalize(entityName);

  if (violationCategory === "DISCLOSURE_DEFICIENCY" && technicalDetails?.fieldPath) {
    const fieldPath = String(technicalDetails.fieldPath);
    if (fieldPath === "inquiries_credit_related") {
      return "Your credit report doesn't show who has checked your credit file. The bureau is required to share this with you.";
    } else if (fieldPath === "accounts[].payment_history") {
      return "Your credit report doesn't include your payment history for this account. The bureau must show whether you paid on time.";
    } else if (fieldPath.includes("personal_info") || fieldPath.includes("consumer_info")) {
      return "Your credit report is missing some of your personal details. The bureau must include correct personal information.";
    } else if (fieldPath.includes("public_records")) {
      return "Your credit report doesn't show public records. The bureau is required to include this information.";
    } else {
      const humanized = fieldPath.replace(/[\[\].]/g, ' ').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
      return `Your credit report is missing required information (${humanized}). The bureau must share this with you.`;
    }
  }

  if (
    (violationCategory === "MULTIPLE_COLLECTOR_VIOLATION" || violationCategory === "COLLECTOR_DUPLICATE_REPORTING") &&
    technicalDetails?.otherAgencyName
  ) {
    return `This same debt is also being reported by ${technicalDetails.otherAgencyName}. Two collectors can't report the same debt — only one should.`;
  }

    if (violationCategory === "DOCUMENTATION_CHAIN_FAILURE") {
    if (technicalDetails?.matchReason) {
      const ocName = technicalDetails.originalCreditorName || 'the listed company';
      if (technicalDetails.matchReason.includes("sibling")) {
        return `The name listed as the original creditor ('${ocName}') is actually another collection agency we found on your report — not the real company you originally owed money to.`;
      }
      return `The name listed as the original creditor ('${ocName}') looks like a collection agency, not the real company you originally owed money to.`;
    }
    if (technicalDetails?.assignmentDocsFound === 0) {
      return "The collection agency hasn't provided proof that they own or were assigned this debt.";
    }
    if (technicalDetails?.validationReceived === false) {
      return "The collection agency didn't respond to the debt validation request within 30 days.";
    }
    if (technicalDetails?.missingField === 'originalCreditorName') {
      return "This collection account does not list the original company you owed.";
    }
    const missingInfoExplanation = getMissingInfoExplanation(technicalDetails);
    if (missingInfoExplanation) {
      return missingInfoExplanation;
    }
    // For field-level violations (e.g. missing dates), use the stored explanation
    if (userExplanation) {
      return simplifyForUser(userExplanation);
    }
    return `${capitalizedEntityName} is missing required information for this account.`;
  }

  if (violationCategory === "BALANCE_CALCULATION_VIOLATION") {
    return `${capitalizedEntityName} has math errors in how they calculated your balance.`;
  }

  if (violationCategory === "STATUTE_OF_LIMITATIONS") {
    return "The credit bureau should have removed this account because it is too old to be reported.";
  }

  if (violationCategory === "BUREAU_INVESTIGATION_FAILURE") {
    return "The credit bureau took too long to complete their investigation of your dispute.";
  }

  if (violationCategory === "FURNISHER_REAGING_VIOLATION") {
    return "The company reporting this changed the date of your account to keep it on your report longer.";
  }

  if (violationCategory === "COLLECTOR_LICENSE_FAILURE") {
    return "The collection agency may not be properly licensed to collect debts in your state.";
  }

  if (violationCategory === "DATE_LOGIC_IMPOSSIBLE") {
    return `${capitalizedEntityName} has impossible dates reported for this account.`;
  }

  const baseExplanation = simplifyForUser(userExplanation);
  
  if (responsibleEntity) {
    if (baseExplanation) {
      return `Problem with ${entityName}: ${baseExplanation}`;
    }
    return `We found a problem with how ${entityName} is reporting this account.`;
  }

  return baseExplanation || "We found a problem with how this account is reported.";
};

export const getEnrichedRecommendedAction = (violation: {
  responsibleEntity?: "BUREAU" | "CREDITOR" | "COLLECTOR" | string | null;
  recommendedAction?: string | null;
  technicalDetails?: any;
}): string => {
  const responsibleEntity = violation.responsibleEntity || violation.technicalDetails?.responsibleEntity;
  
  if (responsibleEntity === "BUREAU") {
    return "Ask the credit bureau to check this and fix or remove anything that is wrong.";
  }
  if (responsibleEntity === "CREDITOR") {
    return "Send a letter asking the company to fix this account or show proof that it is correct.";
  }
  if (responsibleEntity === "COLLECTOR") {
    return "Send a letter asking the collection agency to prove the debt and fix any missing or wrong information.";
  }

  return simplifyForUser(violation.recommendedAction) || "Ask them to check the account and fix anything that is wrong.";
};
