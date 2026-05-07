import { regulationRegistry } from "./regulationRegistry";
import { ViolationCategory } from "./schema";
import { formatCurrency, parseCurrencyAmount } from "./formatters";
import styles from "./violationRegulationMap.module.css";

export interface RegulationReference {
  regulationId?: string;
  statute: string;
  section: string;
  description: string;
  specificApplication?: string;
}

/**
 * Returns a list of applicable Canadian regulations for a given violation.
 */
function getAllRegulationsForViolation(violation: {
  violationCategory: string | null;
  technicalDetails: any;
}): RegulationReference[] {
  const { violationCategory, technicalDetails } = violation;
  let refs: RegulationReference[] = [];

  const province = technicalDetails?.province || null;

  if (technicalDetails?.regulatoryBasis) {
    const bases = String(technicalDetails.regulatoryBasis)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    refs = bases.map((basis) => ({
      statute: basis,
      section: "Various",
      description: "System determined regulatory basis",
    }));
  } else if (violationCategory) {
    const baseEntries = regulationRegistry.getRegulationsForViolationCategory(violationCategory as ViolationCategory);
    
    const filteredEntries = baseEntries.filter((entry) => {
      // If it's a provincial entry, it usually starts with the province code, like ON_CRA_ACCURACY
      const match = entry.id.match(/^([A-Z]{2})_/);
      if (match) {
        const entryProv = match[1];
        if (!province || entryProv !== province) {
          return false;
        }
      }
      return true;
    });

    refs = filteredEntries.map((entry) => ({
      regulationId: entry.id,
      statute: entry.statute,
      section: entry.citation,
      description: entry.description,
    }));
  }

  // Deduplicate by section to prevent repetitive regulatory citations
  const uniqueRefs: RegulationReference[] = [];
  const seenSections = new Set<string>();

  for (const ref of refs) {
    if (!seenSections.has(ref.section)) {
      seenSections.add(ref.section);
      uniqueRefs.push(ref);
    }
  }

  const formatReadableField = (fName: string) => {
    return fName
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(d);
    } catch {
      return dateStr;
    }
  };

  const formatCurrencyDetail = (value: unknown, fallback: string): string => {
    if (value === undefined || value === null || value === "") return fallback;
    return parseCurrencyAmount(value as string | number) === null ? String(value) : formatCurrency(value as string | number);
  };

  return uniqueRefs.map((ref) => {
    let specificApplication = "";
    const fieldName = technicalDetails?.fieldName;
    const readableField = fieldName ? formatReadableField(fieldName) : "Field";
    const accountStatus = technicalDetails?.accountStatus || technicalDetails?.status;

    if (violationCategory === "DOCUMENTATION_CHAIN_FAILURE") {
      if (fieldName === "dateClosed" && accountStatus) {
        specificApplication = `Your account shows status '${accountStatus}' but no closing date is reported. The bureau is including date-dependent information without the date evidence to support it.`;
      } else if (fieldName === "dateAssignedToCollection" && !technicalDetails?.specificFieldRequirementMapped) {
        specificApplication = `Your credit report does not show the ${readableField} for this tradeline. Treat this as an accuracy and completeness review unless a field-specific legal or reporting-standard requirement is mapped.`;
      } else if (fieldName) {
        specificApplication = `Your credit report is missing the ${readableField} for this tradeline, which is required for complete and accurate reporting.`;
      } else if (
        technicalDetails?.ruleName === "DATE_CLOSED_REQUIRED" ||
        (technicalDetails?.message && technicalDetails.message.toLowerCase().includes("closing date"))
      ) {
        specificApplication = "Your account shows as closed but has no Closing Date. Without evidence of when this account was closed, the bureau is reporting date-dependent status information that cannot be verified.";
      } else if (technicalDetails?.ruleName === "BASE_SEGMENT_REQUIRED" && technicalDetails?.message) {
        const capsMatch = technicalDetails.message.match(/\b([A-Z_]{3,})\b/);
        let extractedField = "required information";
        if (capsMatch) {
          extractedField = capsMatch[1]
            .replace(/_/g, " ")
            .replace(/\w\S*/g, (txt: string) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
        }
        specificApplication = `Your credit report is missing the ${extractedField} for this tradeline, which is required for complete and accurate reporting.`;
      } else if (technicalDetails?.ruleName === "BALANCE_REQUIRED") {
        specificApplication = "Your credit report is missing the Balance for this tradeline, which is required for complete and accurate reporting.";
      } else if (technicalDetails?.ruleName === "HIGH_CREDIT_REQUIRED") {
        specificApplication = "Your credit report is missing the High Credit for this tradeline, which is required for complete and accurate reporting.";
      } else if (technicalDetails?.message) {
        specificApplication = `The reporting of this account does not comply with regulations: ${technicalDetails.message}`;
      }
    } else if (violationCategory === "BALANCE_CALCULATION_VIOLATION") {
      const balance = formatCurrencyDetail(technicalDetails?.balance, "an unspecified amount");
      const expected = formatCurrencyDetail(technicalDetails?.expectedBalance, "a different amount");
      specificApplication = `The reported balance of ${balance} does not match the expected calculation of ${expected}. This inaccuracy misrepresents your actual obligation.`;
    } else if (violationCategory === "PAYMENT_HISTORY_MANIPULATION") {
      const detailMsg = technicalDetails?.message || "Inconsistent payment history reported.";
      specificApplication = `Your payment history shows signs of inaccurate reporting or manipulation (${detailMsg}), which can unfairly impact your credit assessment.`;
    } else if (violationCategory === "TEMPORAL_MANIPULATION") {
      const detailMsg = technicalDetails?.message || "Inconsistent dates reported.";
      specificApplication = `The dates reported on this account are inconsistent or appear manipulated (${detailMsg}), violating the requirement for accurate and up-to-date information.`;
    } else if (violationCategory === "ACCOUNT_STATUS_INCONSISTENCY") {
      if (ref.regulationId === "PIPEDA_4_6_1" || (ref.statute === "PIPEDA" && ref.section.includes("4.6.1"))) {
        specificApplication = `Your account reports status '${accountStatus || "Unknown"}' but the ${readableField} field is missing. This contradictory information could lead to an inappropriate decision about you.`;
      } else if (province && ref.regulationId === `${province}_CRA_ACCURACY`) {
        specificApplication = `The bureau is reporting your account as '${accountStatus || "Unknown"}' without a ${readableField} to corroborate this status. They have not noted this lack of corroboration.`;
      }
    } else if (violationCategory === "STATUTE_OF_LIMITATIONS") {
      if (ref.statute !== "PIPEDA") {
        const refDate = technicalDetails?.referenceDate ? formatDate(technicalDetails.referenceDate) : "an unknown date";
        const limitDate = technicalDetails?.reportingLimitDate ? formatDate(technicalDetails.reportingLimitDate) : "an unknown date";
        const years = technicalDetails?.retentionYears || 7;
        specificApplication = `Your last payment was on ${refDate}. The ${years}-year reporting limit expired on ${limitDate}. This debt has exceeded the maximum allowed reporting period.`;
      } else if (ref.regulationId === "PIPEDA_4_5" || (ref.statute === "PIPEDA" && ref.section.includes("4.5"))) {
        specificApplication = "This tradeline data has been retained beyond the period necessary for its original purpose.";
      }
    } else if (violationCategory === "BANKRUPTCY_DISCHARGE_VIOLATION") {
      specificApplication = "Your account is being reported inappropriately given your bankruptcy discharge status. The reporting fails to reflect the legal release of this debt.";
    } else if (violationCategory === "IDENTITY_THEFT_VIOLATION") {
      specificApplication = "This item is being reported despite indicators of identity theft or lack of proper consent, failing to protect your information appropriately.";
    } else if (violationCategory === "CREDIT_LIMIT_MANIPULATION") {
      specificApplication = "Your credit limit appears to have been misreported, which can negatively impact your credit utilization ratio.";
    } else if (violationCategory === "CROSS_ENTITY_DISCREPANCY" || violationCategory === "CROSS_BUREAU_INCONSISTENCY") {
      specificApplication = "The information reported on this account conflicts with other sources, indicating that the data is not accurate or properly maintained.";
    } else if (violationCategory === "MULTIPLE_COLLECTOR_VIOLATION" || violationCategory === "COLLECTOR_DUPLICATE_REPORTING") {
      specificApplication = "This debt is being reported multiple times by different collectors, inappropriately inflating your overall debt obligations.";
    } else if (violationCategory?.includes("RESPONSE_") || violationCategory?.includes("INVESTIGATION_FAILURE")) {
      specificApplication = "The investigation or response to a previous dispute was legally insufficient or failed to provide necessary documentation.";
    } else if (violationCategory === "BUREAU_REINSERTION_VIOLATION") {
      specificApplication = "An item previously deleted through a dispute has been reinserted without the legally required notice.";
    } else if (violationCategory === "BUREAU_ACCESS_VIOLATION") {
      specificApplication = "Unauthorized access or inappropriate disclosure of your credit file occurred without your proper consent.";
    } else if (violationCategory === "BUREAU_DISPUTE_MARKING_FAILURE") {
      specificApplication = "The bureau failed to note that this item is currently under dispute, misrepresenting your account standing.";
    } else if (violationCategory === "FURNISHER_REAGING_VIOLATION") {
      specificApplication = "The critical dates on this account appear to have been altered to unfairly extend the statutory reporting limit.";
    } else if (violationCategory === "FURNISHER_STATUS_CODE_MISMATCH") {
      specificApplication = "The reported status code contradicts other information provided for this account.";
    } else if (violationCategory === "FURNISHER_JOINT_ACCOUNT_VIOLATION" || violationCategory === "FURNISHER_AUTHORIZED_USER_MISREPRESENTATION") {
      specificApplication = "Your liability and responsibility status on this account are misreported, unfairly associating you with a debt you may not be fully liable for.";
    } else if (violationCategory === "FURNISHER_POST_DISPUTE_RETALIATION") {
      specificApplication = "Negative information was inappropriately reported or escalated shortly following a dispute on this account.";
    } else if (violationCategory === "COLLECTOR_LICENSE_FAILURE") {
      specificApplication = "The collection agency reporting this debt may not be appropriately licensed to operate or report in your province.";
    } else if (violationCategory === "COLLECTOR_UNAUTHORIZED_FEES") {
      specificApplication = "The balance includes fees or interest amounts that were not authorized by your original agreement or by law.";
    } else if (violationCategory === "COLLECTOR_PAYMENT_ACKNOWLEDGMENT_VIOLATION") {
      specificApplication = "A payment made on this account was not appropriately credited or reflected in the reported balance.";
    } else if (violationCategory === "COLLECTOR_STATUTE_REVIVAL_ATTEMPT") {
      specificApplication = "An attempt has been made to revive a debt that is past the legal statute of limitations for enforcement or reporting.";
    } else if (violationCategory === "DISCLOSURE_DEFICIENCY") {
      specificApplication = "You were not provided with the required disclosures or notices concerning this account or your rights.";
    } else if (violationCategory === "PHANTOM_DEBT_UNVERIFIABLE") {
      specificApplication = "The reported debt cannot be verified or traced to a legitimate original creditor, violating requirements for accuracy and corroboration.";
    } else if (violationCategory === "RETROACTIVE_HISTORY_MANIPULATION") {
      specificApplication = "Previously reported historical data has been altered retroactively without justification, undermining the accuracy and integrity of your credit profile.";
    } else if (violationCategory === "DATE_LOGIC_IMPOSSIBLE") {
      specificApplication = "The dates reported for this account contain logical impossibilities (e.g., closed before opened), which is objectively inaccurate and violates data integrity standards.";
    } else if (violationCategory === "STALE_REPORTING_FAILURE") {
      specificApplication = "This account has not been updated within the required monthly reporting timeframe, resulting in stale and inaccurate information.";
    } else if (violationCategory === "CONSUMER_STATEMENT_SUPPRESSION") {
      specificApplication = "The legally mandated consumer statement regarding your dispute or alert was suppressed or failed to be included.";
    } else if (violationCategory === "INVESTIGATION_RUBBER_STAMP") {
      specificApplication = "The investigation into your dispute appears to have been superficial or automated, failing to address the specific inaccuracies raised.";
    } else if (violationCategory === "CLOSED_ACCOUNT_BALANCE_INFLATION") {
      specificApplication = "The balance on this closed account has been inappropriately inflated or modified after closure.";
    } else if (violationCategory === "ZOMBIE_DEBT_RESURRECTION") {
      specificApplication = "An account that was previously deleted or resolved has been inappropriately reinserted into your credit file without proper notice.";
    } else if (violationCategory === "LAST_ACTIVITY_DATE_MANIPULATION") {
      specificApplication = "The date of last activity has been modified inappropriately, potentially to extend the reporting period of negative information.";
    } else if (violationCategory === "COLLECTION_LIMITATION_EXCEEDED") {
      specificApplication = "This collection account is being actively reported after the provincial limitation period for collection has expired. Collectors cannot pursue time-barred debts.";
    } else if (violationCategory === "MIXED_FILE_PERSONAL_INFO_MISMATCH") {
      specificApplication = "The personal information on your credit report does not match your actual identity, which is a strong indicator that your file has been mixed with another consumer's data.";
    } else if (violationCategory === "CONSENT_WITHDRAWAL_NOT_HONORED") {
      specificApplication = "This account continues to be reported after you formally withdrew consent. Under PIPEDA 4.3.8, organizations must stop processing personal information once consent is withdrawn.";
    } else if (violationCategory === "FREEZE_PERIOD_VIOLATION") {
      specificApplication = "Activity occurred on your credit file during an active security freeze, which should have blocked all new access and account openings.";
    }

    if (!specificApplication) {
      if (fieldName) {
        specificApplication = `There is an issue with the ${readableField} reporting on this account that violates this standard.`;
      } else {
        specificApplication = "The reporting of this account does not comply with the requirements of this regulation.";
      }
    }

    return { ...ref, specificApplication };
  });
}

/**
 * Returns a list of applicable Canadian regulations for a given violation, excluding PIPEDA and Metro2 CRRG.
 */
export function getRegulationsForViolation(violation: {
  violationCategory: string | null;
  technicalDetails: any;
}): RegulationReference[] {
  return getAllRegulationsForViolation(violation).filter(
    (ref) => !ref.statute.startsWith("PIPEDA") && ref.statute !== "Metro2 CRRG"
  );
}

/**
 * Returns only the federal (PIPEDA / Bankruptcy Act) and universal (Metro2) regulations for a given violation.
 */
export function getFederalRegulationsForViolation(violation: {
  violationCategory: string | null;
  technicalDetails: any;
}): RegulationReference[] {
  return getAllRegulationsForViolation(violation).filter(
    (ref) =>
      ref.statute.startsWith("PIPEDA") ||
      ref.statute === "Bankruptcy and Insolvency Act" ||
      ref.statute === "Metro2 CRRG"
  );
}
