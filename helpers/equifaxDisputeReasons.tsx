import type { ViolationCategory, CanadianProvince } from "./schema";

/**
 * Standard Equifax dispute reason codes aligning with common dispute form categories.
 */
export type EquifaxDisputeReasonCode =
  | "ACCOUNT_NOT_MINE"
  | "NEVER_LATE"
  | "ACCOUNT_CLOSED"
  | "PAID_IN_FULL"
  | "INCORRECT_BALANCE"
  | "INCORRECT_CREDIT_LIMIT"
  | "INCORRECT_PAYMENT_STATUS"
  | "INCORRECT_DATE"
  | "OUTDATED_INFORMATION"
  | "DUPLICATE_ACCOUNT"
  | "IDENTITY_THEFT"
  | "INCORRECT_ACCOUNT_TYPE"
  | "OTHER";

/**
 * Statute information for grounding dispute letters in specific legislation.
 */
export type StatuteInfo = {
  code: string;
  sectionReference: string;
  description: string;
  sourceUrl?: string;
};

/**
 * Human-readable descriptions for Equifax dispute reason codes.
 */
export const EQUIFAX_DISPUTE_REASONS: Record<EquifaxDisputeReasonCode, string> = {
  ACCOUNT_NOT_MINE: "This account does not belong to me",
  NEVER_LATE: "I was never late on this account",
  ACCOUNT_CLOSED: "This account was closed",
  PAID_IN_FULL: "This account was paid in full",
  INCORRECT_BALANCE: "The balance reported is incorrect",
  INCORRECT_CREDIT_LIMIT: "The credit limit is incorrect",
  INCORRECT_PAYMENT_STATUS: "The payment status is incorrect",
  INCORRECT_DATE: "The date(s) reported are incorrect",
  OUTDATED_INFORMATION: "This information is outdated and should be removed",
  DUPLICATE_ACCOUNT: "This is a duplicate of another account",
  IDENTITY_THEFT: "This account was opened fraudulently",
  INCORRECT_ACCOUNT_TYPE: "The account type is incorrect",
  OTHER: "Other (see explanation)",
};

/**
 * Maps full province/territory names to their 2-letter codes.
 */
export const PROVINCE_NAME_TO_CODE: Record<string, string> = {
  "Alberta": "AB",
  "British Columbia": "BC",
  "Manitoba": "MB",
  "New Brunswick": "NB",
  "Newfoundland and Labrador": "NL",
  "Newfoundland": "NL",
  "Labrador": "NL",
  "Northwest Territories": "NT",
  "Nova Scotia": "NS",
  "Nunavut": "NU",
  "Ontario": "ON",
  "Prince Edward Island": "PE",
  "Quebec": "QC",
  "Québec": "QC",
  "Saskatchewan": "SK",
  "Yukon": "YT",
  "Yukon Territory": "YT",
};

/**
 * Normalizes a province input to a 2-letter code.
 * Tries: exact match in accuracySections keys, then uppercased match, then full-name lookup.
 */
export function normalizeProvinceCode(province: string): string {
  const accuracySectionKeys = new Set([
    "ON", "BC", "AB", "QC", "NS", "MB", "SK", "NB", "PE", "NL", "YT", "NT", "NU",
  ]);

  // Try exact match first
  if (accuracySectionKeys.has(province)) {
    return province;
  }

  // Try uppercased 2-letter code
  const upper = province.toUpperCase();
  if (accuracySectionKeys.has(upper)) {
    return upper;
  }

  // Try full name lookup (case-insensitive)
  const titleCase = Object.keys(PROVINCE_NAME_TO_CODE).find(
    (key) => key.toLowerCase() === province.toLowerCase()
  );
  if (titleCase) {
    return PROVINCE_NAME_TO_CODE[titleCase];
  }

  // Return uppercased as fallback
  return upper;
}

/**
 * Maps a detected compliance violation category to the most appropriate Equifax dispute reason code.
 *
 * @param violationCategory - The violation category from the compliance scanner
 * @param technicalDetails - Optional technical details that refine the mapping (e.g. fieldName for DOFD violations)
 * @returns The corresponding EquifaxDisputeReasonCode
 */
export function mapViolationToDisputeReason(
  violationCategory: string | null | undefined,
  technicalDetails?: {
    fieldName?: string;
    ruleName?: string;
    ruleCategory?: string;
  } | null
): EquifaxDisputeReasonCode {
  if (!violationCategory) return "OTHER";

  const category = violationCategory as ViolationCategory;

  switch (category) {
    case "IDENTITY_THEFT_VIOLATION":
    case "BUREAU_ACCESS_VIOLATION":
    case "RESPONSE_UNAUTHORIZED":
      return "IDENTITY_THEFT";

    case "BALANCE_CALCULATION_VIOLATION":
      return "INCORRECT_BALANCE";

    case "CREDIT_LIMIT_MANIPULATION":
      return "INCORRECT_CREDIT_LIMIT";

    case "ACCOUNT_STATUS_INCONSISTENCY":
    case "FURNISHER_STATUS_CODE_MISMATCH":
    case "PAYMENT_HISTORY_MANIPULATION":
      return "INCORRECT_PAYMENT_STATUS";

    case "TEMPORAL_MANIPULATION":
    case "FURNISHER_REAGING_VIOLATION":
    case "PROCEDURAL_TIMING_VIOLATION":
      return "INCORRECT_DATE";

    case "STATUTE_OF_LIMITATIONS":
    case "COLLECTOR_STATUTE_REVIVAL_ATTEMPT":
    case "BANKRUPTCY_DISCHARGE_VIOLATION":
      return "OUTDATED_INFORMATION";

    case "COLLECTOR_DUPLICATE_REPORTING":
    case "MULTIPLE_COLLECTOR_VIOLATION":
      return "DUPLICATE_ACCOUNT";

    case "FURNISHER_JOINT_ACCOUNT_VIOLATION":
    case "FURNISHER_AUTHORIZED_USER_MISREPRESENTATION":
      return "ACCOUNT_NOT_MINE";

    case "DOCUMENTATION_CHAIN_FAILURE": {
      // DOFD missing → SOL obstruction strategy; argue potential expiry
      if (technicalDetails?.fieldName === "dateOfFirstDelinquency") {
        return "OUTDATED_INFORMATION";
      }
      // Closed-date or other date-related rule → challenge the date accuracy
      if (
        technicalDetails?.ruleName === "DATE_CLOSED_REQUIRED" ||
        technicalDetails?.fieldName?.toLowerCase().includes("date") ||
        technicalDetails?.ruleCategory?.toLowerCase().includes("date")
      ) {
        return "INCORRECT_DATE";
      }
      // Truly unclassifiable documentation failure
      return "OTHER";
    }

    case "CROSS_ENTITY_DISCREPANCY":
    case "CROSS_BUREAU_INCONSISTENCY":
      return "OTHER";

    default:
      return "OTHER";
  }
}

/**
 * Returns the human-readable description for a dispute reason code.
 */
export function getDisputeReasonDescription(code: EquifaxDisputeReasonCode): string {
  return EQUIFAX_DISPUTE_REASONS[code] || "Other";
}

/**
 * Returns the relevant statutory basis for the dispute reason based on the consumer's province.
 * This helps ground the dispute in specific provincial legislation.
 *
 * @param code - The dispute reason code
 * @param province - The 2-letter Canadian province code (e.g., "ON", "BC") or full name
 * @param statuteInfo - Optional specific statute information from the database; when provided,
 *                      overrides the hardcoded accuracySections fallback map.
 * @returns A string citing the specific legal basis
 */
export function getDisputeReasonStatutoryBasis(
  code: EquifaxDisputeReasonCode,
  province: string,
  statuteInfo?: StatuteInfo
): string {
  const prov = normalizeProvinceCode(province) as CanadianProvince;

  let baseStatute: string;

  if (statuteInfo) {
    // Use the specific statute info from the database
    baseStatute = `${statuteInfo.description} (${statuteInfo.code}), ${statuteInfo.sectionReference}`;
  } else {
    // Fall back to hardcoded accuracy sections map
    const accuracySections: Record<string, string> = {
      ON: "Consumer Reporting Act, R.S.O. 1990, c. C.33, Section 12(1)",
      BC: "Consumer Reporting Act, R.S.B.C. 1996, c. 69, Section 14",
      AB: "Personal Information Protection Act, S.A. 2003, c. P-6.5, Section 24",
      QC: "Act respecting the protection of personal information in the private sector, c. P-39.1, Section 12",
      NS: "Consumer Reporting Act, S.N.S. 2010, c. 13, Section 18",
      MB: "Consumer Protection Act, C.C.S.M. c. C200, Section 113",
      SK: "Consumer Protection and Business Practices Act, S.S. 2014, c. C-30.2, Section 8-14",
      NB: "Consumer Reporting Act, S.N.B. 2009, c. C-24.3, Section 15",
      PE: "Consumer Reporting Act, R.S.P.E.I. 1988, c. C-26, Section 12",
      NL: "Consumer Protection and Business Practices Act, S.N.L. 2009, c. C-31.1, Section 46",
      YT: "Consumer Protection Act, R.S.Y. 2002, c. 40, Section 46",
      NT: "Consumer Protection Act, S.N.W.T. 2007, c. 11, Section 58",
      NU: "Consumer Protection Act, R.S.N.W.T. (Nu) 1988, c. C-17, Section 58",
    };
    baseStatute = accuracySections[prov] || "Applicable Consumer Reporting Legislation";
  }

  switch (code) {
        case "OUTDATED_INFORMATION":
      return `Pursuant to ${baseStatute}, there is a maximum retention period for consumer credit information. This account has exceeded that period.`;

    case "IDENTITY_THEFT":
    case "ACCOUNT_NOT_MINE":
      return `Pursuant to ${baseStatute}, the reporting agency has a statutory duty to ensure maximum possible accuracy. Reporting an account not belonging to the consumer is a failure of this duty.`;

    case "INCORRECT_BALANCE":
    case "INCORRECT_CREDIT_LIMIT":
    case "INCORRECT_PAYMENT_STATUS":
    case "INCORRECT_DATE":
      return `Pursuant to ${baseStatute}, the reported data is demonstrably inaccurate. The reporting agency is required to re-investigate, verify the accuracy of this information, and correct or delete it if it cannot be verified.`;

    case "DUPLICATE_ACCOUNT":
      return `Pursuant to ${baseStatute}, reporting the same obligation multiple times artificially inflates the consumer's debt load and violates the accuracy requirements.`;

    default:
      return `Pursuant to ${baseStatute}, the reporting agency is required to follow reasonable procedures to ensure maximum possible accuracy of information in consumer reports. The consumer has the right to dispute any inaccurate or incomplete information, and the agency must re-investigate and record the current status of the disputed item.`;
  }
}