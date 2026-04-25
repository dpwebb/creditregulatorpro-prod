export const simplifyForUser = (text: string | null | undefined): string => {
  if (!text) return "";
  let simplified = text.replace(/under\s+[A-Z][A-Za-z.\s]+\d{4}(?:(?:,\s*)?[a-z]\.\s*\d+(?:\(\d+\))?)*/g, '');
  simplified = simplified.replace(/\s+/g, ' ').replace(/\s+([.,)])/g, '$1').trim();
  return simplified;
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
      return "This collection account doesn't list who the original creditor was.";
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
      return `Issue with ${entityName}: ${baseExplanation}`;
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
    return "File a dispute with the credit bureau to remove this inaccuracy.";
  }
  if (responsibleEntity === "CREDITOR") {
    return "Send a letter to the company reporting this account to correct the reporting.";
  }
  if (responsibleEntity === "COLLECTOR") {
    return "Challenge the collection agency by demanding debt validation.";
  }

  return violation.recommendedAction || "Review and take appropriate action to correct this reporting issue.";
};