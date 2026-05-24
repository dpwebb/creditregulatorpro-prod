import { regulationRegistry } from "./regulationRegistry";
import { ViolationCategory } from "./schema";
import { formatCurrency, parseCurrencyAmount } from "./formatters";
import {
  authorityIssueLabel,
  classifyAuthorityIssue,
  getLegalAuthorityById,
  hasFieldSpecificAuthority,
  type AuthorityIssueClassification,
} from "./legalAuthorityRegistry";
import styles from "./violationRegulationMap.module.css";

export interface RegulationReference {
  regulationId?: string;
  statute: string;
  section: string;
  shortLabel?: string;
  description: string;
  sourceUrl?: string | null;
  specificApplication?: string;
  authorityIssueClassification?: AuthorityIssueClassification;
  authorityIssueLabel?: string;
  sourceQuality?: string;
  supportLevel?: string;
  authorityType?: string;
}

function referenceFromEntry(entry: NonNullable<ReturnType<typeof regulationRegistry.getRegulationById>>): RegulationReference {
  const authority = getLegalAuthorityById(entry.id);
  return {
    regulationId: entry.id,
    statute: entry.statute,
    section: entry.citation,
    shortLabel: entry.shortLabel,
    description: entry.description,
    sourceUrl: authority?.sourceUrl ?? entry.sourceUrl ?? null,
    ...(authority
      ? {
          authorityIssueClassification: classifyAuthorityIssue(authority),
          authorityIssueLabel: authorityIssueLabel(authority),
          sourceQuality: authority.sourceQuality,
          supportLevel: authority.supportLevel,
          authorityType: authority.authorityType,
        }
      : {}),
  };
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
  const explicitRegulationIds = Array.isArray(technicalDetails?.regulationIds)
    ? technicalDetails.regulationIds.filter((id: unknown): id is string => typeof id === "string" && Boolean(id.trim()))
    : [];

  if (explicitRegulationIds.length > 0) {
    refs = explicitRegulationIds
      .map((id) => regulationRegistry.getRegulationById(id))
      .filter((entry): entry is NonNullable<ReturnType<typeof regulationRegistry.getRegulationById>> => Boolean(entry))
      .map((entry) => referenceFromEntry(entry));
  } else if (technicalDetails?.regulatoryBasis) {
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

    refs = filteredEntries.map((entry) => referenceFromEntry(entry));
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
    const hasMappedFieldRequirement = fieldName
      ? hasFieldSpecificAuthority({
          violationCategory,
          fieldName,
          accountType: technicalDetails?.accountType || technicalDetails?.portfolioType || null,
          regulationIds: ref.regulationId ? [ref.regulationId] : explicitRegulationIds,
          jurisdiction: province,
        })
      : false;

    if (violationCategory === "DOCUMENTATION_CHAIN_FAILURE") {
      if (fieldName === "dateClosed" && accountStatus && !hasMappedFieldRequirement) {
        specificApplication = `Your account shows status '${accountStatus}' but no closing date is reported. Treat this as an accuracy and completeness review unless a field-specific legal or reporting-standard requirement is mapped for this account type.`;
      } else if (fieldName === "dateClosed" && accountStatus) {
        specificApplication = `Your account shows status '${accountStatus}' but no closing date is reported. The mapped authority requires that date for this account type.`;
      } else if (fieldName === "dateAssignedToCollection" && !technicalDetails?.specificFieldRequirementMapped) {
        specificApplication = `Your credit report does not show the ${readableField} for this tradeline. Treat this as an accuracy and completeness review unless a field-specific legal or reporting-standard requirement is mapped.`;
      } else if (fieldName && !hasMappedFieldRequirement) {
        specificApplication = `Your credit report does not show the ${readableField} for this tradeline. Treat this as an accuracy and completeness review unless a field-specific legal or reporting-standard requirement is mapped.`;
      } else if (fieldName) {
        specificApplication = `Your credit report is missing the ${readableField} for this tradeline. The mapped authority indicates this field is required for this account type.`;
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
        specificApplication = `Your credit report is missing the ${extractedField} for this tradeline. Treat this as a reporting-standard completeness issue unless a field-specific legal requirement is mapped.`;
      } else if (technicalDetails?.ruleName === "BALANCE_REQUIRED") {
        specificApplication = "Your credit report is missing the Balance for this tradeline. Treat this as a reporting-standard completeness issue unless a field-specific legal requirement is mapped.";
      } else if (technicalDetails?.ruleName === "HIGH_CREDIT_REQUIRED") {
        specificApplication = "Your credit report is missing the High Credit for this tradeline. Treat this as a reporting-standard completeness issue unless a field-specific legal requirement is mapped.";
      } else if (technicalDetails?.message) {
        specificApplication = `The reporting of this account should be reviewed against the mapped reference: ${technicalDetails.message}`;
      }
    } else if (violationCategory === "BALANCE_CALCULATION_VIOLATION") {
      const balance = formatCurrencyDetail(technicalDetails?.balance, "an unspecified amount");
      const expected = formatCurrencyDetail(technicalDetails?.expectedBalance, "a different amount");
      specificApplication = `The reported balance of ${balance} does not match the expected calculation of ${expected}. Review the balance for accuracy and supporting records.`;
    } else if (violationCategory === "PAYMENT_HISTORY_MANIPULATION") {
      const detailMsg = technicalDetails?.message || "Inconsistent payment history reported.";
      specificApplication = `Your payment history appears inconsistent with the available records (${detailMsg}). Review the payment history for accuracy and support.`;
    } else if (violationCategory === "TEMPORAL_MANIPULATION") {
      const detailMsg = technicalDetails?.message || "Inconsistent dates reported.";
      specificApplication = `The dates reported on this account appear inconsistent (${detailMsg}). Review the chronology against the mapped accuracy reference.`;
    } else if (violationCategory === "ACCOUNT_STATUS_INCONSISTENCY") {
      if (ref.regulationId === "PIPEDA_4_6_1" || (ref.statute === "PIPEDA" && ref.section.includes("4.6.1"))) {
        specificApplication = `Your account reports status '${accountStatus || "Unknown"}' but the ${readableField} field is missing. This contradictory information could lead to an inappropriate decision about you.`;
      } else if (province && ref.regulationId === `${province}_CRA_ACCURACY`) {
        specificApplication = `The bureau is reporting your account as '${accountStatus || "Unknown"}' without a ${readableField} to corroborate this status. Review whether the status is supported by the account records.`;
      }
    } else if (violationCategory === "STATUTE_OF_LIMITATIONS") {
      if (ref.statute !== "PIPEDA") {
        const refDate = technicalDetails?.referenceDate ? formatDate(technicalDetails.referenceDate) : "an unknown date";
        const limitDate = technicalDetails?.reportingLimitDate ? formatDate(technicalDetails.reportingLimitDate) : "an unknown date";
        const years = technicalDetails?.retentionYears || 7;
        specificApplication = `Your last payment was on ${refDate}. The ${years}-year reporting-period reference date is ${limitDate}. Review whether this item should continue to appear on the current report.`;
      } else if (ref.regulationId === "PIPEDA_4_5" || (ref.statute === "PIPEDA" && ref.section.includes("4.5"))) {
        specificApplication = "This tradeline data has been retained beyond the period necessary for its original purpose.";
      }
    } else if (violationCategory === "BANKRUPTCY_DISCHARGE_VIOLATION") {
      specificApplication = "Your account reporting should be reviewed against your bankruptcy discharge status and supporting records.";
    } else if (violationCategory === "IDENTITY_THEFT_VIOLATION") {
      specificApplication = "This item has identity or consent indicators that require verification before continued reporting is supported.";
    } else if (violationCategory === "CREDIT_LIMIT_MANIPULATION") {
      specificApplication = "Your credit limit appears inconsistent with the available records and should be verified for accuracy.";
    } else if (violationCategory === "CROSS_ENTITY_DISCREPANCY" || violationCategory === "CROSS_BUREAU_INCONSISTENCY") {
      specificApplication = "The information reported on this account conflicts with other sources and should be reviewed for accuracy.";
    } else if (violationCategory === "MULTIPLE_COLLECTOR_VIOLATION" || violationCategory === "COLLECTOR_DUPLICATE_REPORTING") {
      specificApplication = "This debt appears to be reported more than once by collection entities and should be reviewed for duplicate reporting.";
    } else if (violationCategory?.includes("RESPONSE_") || violationCategory?.includes("INVESTIGATION_FAILURE")) {
      specificApplication = "The investigation or response to a previous dispute does not show enough support under the mapped response authority.";
    } else if (violationCategory === "BUREAU_REINSERTION_VIOLATION") {
      specificApplication = "An item previously deleted through a dispute has been reinserted without showing support for the mapped notice requirement.";
    } else if (violationCategory === "BUREAU_ACCESS_VIOLATION") {
      specificApplication = "Credit file access or disclosure should be reviewed for authorization and supporting records.";
    } else if (violationCategory === "BUREAU_DISPUTE_MARKING_FAILURE") {
      specificApplication = "The report should be reviewed to confirm whether the active dispute status is shown accurately.";
    } else if (violationCategory === "FURNISHER_REAGING_VIOLATION") {
      specificApplication = "The critical dates on this account appear inconsistent with source records and may affect reporting-period review.";
    } else if (violationCategory === "FURNISHER_STATUS_CODE_MISMATCH") {
      specificApplication = "The reported status code contradicts other information provided for this account.";
    } else if (violationCategory === "FURNISHER_JOINT_ACCOUNT_VIOLATION" || violationCategory === "FURNISHER_AUTHORIZED_USER_MISREPRESENTATION") {
      specificApplication = "Your liability and responsibility status on this account should be verified against the account records.";
    } else if (violationCategory === "FURNISHER_POST_DISPUTE_RETALIATION") {
      specificApplication = "Negative information changed shortly after a dispute and should be reviewed against supporting records.";
    } else if (violationCategory === "COLLECTOR_LICENSE_FAILURE") {
      specificApplication = "The collection agency reporting this debt may not be appropriately licensed to operate or report in your province.";
    } else if (violationCategory === "COLLECTOR_UNAUTHORIZED_FEES") {
      specificApplication = "The balance includes fees or interest amounts that were not authorized by your original agreement or by law.";
    } else if (violationCategory === "COLLECTOR_PAYMENT_ACKNOWLEDGMENT_VIOLATION") {
      specificApplication = "A payment made on this account was not appropriately credited or reflected in the reported balance.";
    } else if (violationCategory === "COLLECTOR_STATUTE_REVIVAL_ATTEMPT") {
      specificApplication = "Collection or reporting dates appear to require limitation-period review.";
    } else if (violationCategory === "DISCLOSURE_DEFICIENCY") {
      specificApplication = "The record does not show the disclosures or notices mapped to this account or your rights.";
    } else if (violationCategory === "PHANTOM_DEBT_UNVERIFIABLE") {
      specificApplication = "The reported debt cannot be verified or connected to a clear original-creditor record, raising an accuracy and support issue under the mapped reference.";
    } else if (violationCategory === "RETROACTIVE_HISTORY_MANIPULATION") {
      specificApplication = "Previously reported historical data changed retroactively and should be reviewed for source-record support.";
    } else if (violationCategory === "DATE_LOGIC_IMPOSSIBLE") {
      specificApplication = "The dates reported for this account contain logical impossibilities (e.g., closed before opened), which conflicts with mapped data integrity standards.";
    } else if (violationCategory === "STALE_REPORTING_FAILURE") {
      specificApplication = "This account has not been updated within the expected reporting cadence, resulting in stale or inaccurate information.";
    } else if (violationCategory === "CONSUMER_STATEMENT_SUPPRESSION") {
      specificApplication = "The consumer statement or alert should be reviewed to confirm whether it appears on the report as expected.";
    } else if (violationCategory === "INVESTIGATION_RUBBER_STAMP") {
      specificApplication = "The investigation response appears generic or incomplete and should be reviewed against the dispute details.";
    } else if (violationCategory === "CLOSED_ACCOUNT_BALANCE_INFLATION") {
      specificApplication = "The balance on this closed account changed after closure and should be reviewed for supporting records.";
    } else if (violationCategory === "ZOMBIE_DEBT_RESURRECTION") {
      specificApplication = "An account that was previously deleted or resolved appears again and should be reviewed for support and notice.";
    } else if (violationCategory === "LAST_ACTIVITY_DATE_MANIPULATION") {
      specificApplication = "The date of last activity appears inconsistent with source records and may affect reporting-period review.";
    } else if (violationCategory === "COLLECTION_LIMITATION_EXCEEDED") {
      specificApplication = "This collection account appears outside the mapped limitation-period reference and should be reviewed for current reporting support.";
    } else if (violationCategory === "MIXED_FILE_PERSONAL_INFO_MISMATCH") {
      specificApplication = "The personal information on your credit report does not match the expected identity record and should be reviewed for possible mixed-file reporting.";
    } else if (violationCategory === "CONSENT_WITHDRAWAL_NOT_HONORED") {
      specificApplication = "This account continues to be reported after a recorded consent withdrawal. Review whether continued reporting is supported under the mapped consent reference.";
    } else if (violationCategory === "FREEZE_PERIOD_VIOLATION") {
      specificApplication = "Activity occurred on your credit file during an active security freeze and should be reviewed for authorization and support.";
    }

    if (!specificApplication) {
      if (fieldName) {
        specificApplication = `There is an issue with the ${readableField} reporting on this account that should be reviewed against this reference.`;
      } else {
        specificApplication = "The reporting of this account should be reviewed against the mapped reference.";
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
