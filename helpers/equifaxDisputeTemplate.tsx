import {
  EquifaxDisputeReasonCode,
  getDisputeReasonDescription,
  getDisputeReasonStatutoryBasis,
  type StatuteInfo,
} from "./equifaxDisputeReasons";
import { disputeNarrativeBuilder, getDisputeLetterFraming, buildViolationAwareAccountId } from "./disputeNarrativeBuilder";
import { deduplicateLetterSections } from "./disputeNarrativeFraming";
import type { LetterContent } from "./pdfGenerator";
import { applyTemplateOverrides } from "./letterTemplateQueries";
import { formatCurrency as formatDollarAmount } from "./formatters";

/**
 * Rich tradeline details for building specific dispute content.
 */
export interface TradelineDetails {
  balance?: string | null;
  creditLimit?: string | null;
  currentBalance?: string | null;
  status?: string | null;
  accountType?: string | null;
  openedDate?: Date | null;
  dateClosed?: Date | null;
  dateOfFirstDelinquency?: Date | null;
  dateOfLastPayment?: Date | null;
  amountPastDue?: string | null;
  paymentPattern?: string | null;
  highCredit?: string | null;
  terms?: string | null;
  ecoaCode?: string | null;
  responsibilityCode?: string | null;
  lastActivityDate?: Date | null;
  isCollectionAccount?: boolean | null;
  collectionAgencyName?: string | null;
}

/**
 * Rich violation details for building specific dispute content.
 */
export interface ViolationDetails {
  violationCategory?: string | null;
  detectedValue?: string | null;
  expectedValue?: string | null;
  fieldName?: string | null;
  userExplanation?: string | null;
  recommendedAction?: string | null;
  disputeVector?: string | null;
  obligationType?: string | null;
  severity?: string | null;
  statutoryBasis?: string | null;
  notes?: string | null;
  omissions?: string | null;
  duplicateTradelineId?: number | null;
  otherAgencyName?: string | null;
  otherBalance?: string | null;
  otherDateAssigned?: string | null;
  duplicateCreditorName?: string | null;
  duplicateAccountNumber?: string | null;
  originalCreditorName?: string | null;
  matchReason?: string | null;
  assignmentDocsFound?: number | null;
  validationReceived?: boolean | null;
  daysElapsed?: number | null;
  technicalDetails?: Record<string, any> | null;
}

/**
 * Extended context for building Equifax-specific disputes.
 */
export interface EquifaxDisputeContext {
  // Consumer Info
  consumerName: string;
  consumerAddress: string[];
  consumerDOB?: string;
  consumerPhone?: string;
  consumerEmail?: string;

  // Account Info
  creditorName: string;
  accountNumber: string;

  // Dispute Details
  violationId?: number;
  violationCategory?: string;
  disputeReasonCode: EquifaxDisputeReasonCode;

  // Optional specifics for the dispute body
  expectedCorrectValue?: string;
  dateOfLastActivity?: string;
  equifaxFileNumber?: string;
  additionalNotes?: string;

  // Rich data for evidence-backed letters
  tradelineDetails?: TradelineDetails;
  violationDetails?: ViolationDetails;

  // Specific statute information from the database for this consumer's province
  statuteInfo?: StatuteInfo;
}

/**
 * Formats a date to a readable string, returning undefined if the date is null/undefined.
 */
function formatDate(date: Date | null | undefined): string | undefined {
  if (!date) return undefined;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date(date));
}

/**
 * Formats a numeric string as a currency amount.
 */
function formatCurrency(value: string | null | undefined): string | undefined {
  const formatted = formatDollarAmount(value);
  return formatted || undefined;
}

/**
 * Returns true when the violation indicates a missing DOFD that is being used as
 * a statute-of-limitations obstruction argument (SOL obstruction strategy).
 */
function isDofdSolObstructionViolation(
  violationDetails?: ViolationDetails,
  tradelineDetails?: TradelineDetails
): boolean {
  if (!violationDetails) return false;

  const isDofdField = violationDetails.fieldName === "dateOfFirstDelinquency";
  const isNullDetected =
    violationDetails.detectedValue == null ||
    violationDetails.detectedValue === "null" ||
    violationDetails.detectedValue === "";
  const expectedMentionsDelinquent =
    violationDetails.expectedValue?.toLowerCase().includes("delinquent") ?? false;

  const fieldIndicatesDofd = isDofdField || (isNullDetected && expectedMentionsDelinquent);

  if (!fieldIndicatesDofd) return false;

  // Only apply the SOL obstruction strategy when the tradeline is missing the DOFD
  return tradelineDetails?.dateOfFirstDelinquency == null;
}

/**
 * Returns true when this is a DOFD-SOL obstruction scenario for use across builders.
 * Exported for use in disputeNarrativeBuilder.
 */
export function checkDofdSolObstruction(
  violationCategory: string | null | undefined,
  violationDetails?: ViolationDetails,
  tradelineDetails?: TradelineDetails
): boolean {
  const isDofdViolationCategory =
    violationCategory === "DOCUMENTATION_CHAIN_FAILURE" ||
    violationCategory === "DOFD_REPORTING";

  if (!isDofdViolationCategory) return false;

  return isDofdSolObstructionViolation(violationDetails, tradelineDetails);
}

function humanizeMissingFieldName(fieldName: string | null | undefined): string | null {
  if (!fieldName) return null;
  switch (fieldName) {
    case "dateClosed":
      return "closing date";
    case "dateOfFirstDelinquency":
      return "Date of First Delinquency";
    case "lastReportedDate":
      return "reported date";
    default:
      return fieldName
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/_/g, " ")
        .toLowerCase();
  }
}

function inferRequestedMissingField(
  violationDetails?: ViolationDetails,
  tradelineDetails?: TradelineDetails
): string {
  const explicitField = humanizeMissingFieldName(violationDetails?.fieldName);
  if (explicitField) return explicitField;

  const technicalDetails = violationDetails?.technicalDetails ?? {};
  const combined = [
    technicalDetails.ruleName,
    technicalDetails.ruleCategory,
    technicalDetails.message,
    violationDetails?.expectedValue,
    violationDetails?.userExplanation,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (combined.includes("closing date") || combined.includes("closed date") || combined.includes("valid closed date")) {
    return "closing date";
  }

  if (combined.includes("date of first delinquency") || combined.includes("dofd") || combined.includes("first went delinquent")) {
    return "Date of First Delinquency";
  }

  const detectedValue = violationDetails?.detectedValue;
  if (detectedValue?.startsWith("Missing: ")) {
    const rawField = detectedValue.slice("Missing: ".length).trim();
    const missingField = humanizeMissingFieldName(rawField);
    if (missingField) return missingField;
  }

  if (detectedValue === "0 or null" && violationDetails?.expectedValue?.toLowerCase().includes("credit limit")) {
    return "Credit Limit";
  }

  if (
    violationDetails?.violationCategory === "DOFD_REPORTING" ||
    violationDetails?.obligationType === "DOFD_REPORTING" ||
    (tradelineDetails?.dateOfFirstDelinquency == null && combined.includes("delinquen"))
  ) {
    return "Date of First Delinquency";
  }

  return "required data";
}

/**
 * Generates a bureau-directed requestedAction based on the violation category.
 * Used by Equifax, TransUnion, and generic fallback dispute-building code paths.
 */
export async function buildBureauRequestedAction(
  violationCategory: string | null | undefined,
  tradelineDetails?: TradelineDetails,
  violationDetails?: ViolationDetails
): Promise<string> {
  let action: string;

  if (!violationCategory) {
    action = "Please investigate this dispute, correct or delete any unverified information, and provide written confirmation.";
  } else if (checkDofdSolObstruction(violationCategory, violationDetails, tradelineDetails)) {
    action = "Please obtain the Date of First Delinquency from the furnisher or remove this tradeline from my credit file.";
  } else if (violationCategory === "DOCUMENTATION_CHAIN_FAILURE" && (violationDetails?.originalCreditorName || violationDetails?.matchReason)) {
    action = "Please disclose the true original creditor for this account and provide documentation proving the chain of title, or remove this tradeline entirely.";
  } else {
    const documentationViolations = [
      "DOCUMENTATION_CHAIN_FAILURE",
      "DOFD_REPORTING",
      "RESPONSE_NO_DOCUMENTATION",
      "RESPONSE_MOV_MISSING",
      "RESPONSE_INCOMPLETE",
    ];

    if (documentationViolations.includes(violationCategory)) {
      const missingField = inferRequestedMissingField(violationDetails, tradelineDetails);
      action = `Please obtain the missing ${missingField} to correct this tradeline, or remove it if unverified.`;
    } else {
      const accuracyViolations = [
        "BALANCE_CALCULATION_VIOLATION",
        "CREDIT_LIMIT_MANIPULATION",
        "ACCOUNT_STATUS_INCONSISTENCY",
        "FURNISHER_STATUS_CODE_MISMATCH",
        "PAYMENT_HISTORY_MANIPULATION",
        "TEMPORAL_MANIPULATION",
        "FURNISHER_REAGING_VIOLATION",
        "CROSS_BUREAU_INCONSISTENCY",
        "CROSS_ENTITY_DISCREPANCY",
        "INCORRECT_BALANCE",
        "INCORRECT_DATE",
        "INCORRECT_PAYMENT_STATUS",
      ];

      if (accuracyViolations.includes(violationCategory)) {
        action = "Please investigate and correct the identified inaccuracies, or remove the tradeline if unverified.";
            } else if (["STATUTE_OF_LIMITATIONS", "TIME_BARRED_DEBT_COLLECTION", "COLLECTOR_STATUTE_REVIVAL_ATTEMPT"].includes(violationCategory)) {
        action = "Please remove this tradeline from my credit file immediately.";
      } else if (["BUREAU_INVESTIGATION_FAILURE", "BUREAU_NOTIFICATION_FAILURE", "BUREAU_DISPUTE_MARKING_FAILURE"].includes(violationCategory)) {
        action = "Please complete the required investigation, correct any inaccuracies, and provide written notification.";
      } else if (violationCategory === "BUREAU_REINSERTION_VIOLATION") {
        action = "Please immediately re-delete this improperly reinserted information and confirm compliance with statutory notification requirements.";
      } else if (violationCategory === "BUREAU_ACCESS_VIOLATION") {
        action = "Please investigate this unauthorized access and remove any resulting inquiries.";
      } else if (violationCategory === "FURNISHER_REAGING_VIOLATION" || violationCategory === "TEMPORAL_MANIPULATION") {
        action = "Please obtain the original, verifiable Date of First Delinquency to correct the reporting dates, or remove the tradeline.";
      } else if (violationCategory === "FURNISHER_STATUS_CODE_MISMATCH") {
        action = "Please investigate and correct the status to accurately reflect the account history, or remove the tradeline.";
      } else if (violationCategory === "FURNISHER_JOINT_ACCOUNT_VIOLATION") {
        action = "Please investigate the correct account responsibility with the furnisher and update the reporting.";
      } else if (violationCategory === "FURNISHER_AUTHORIZED_USER_MISREPRESENTATION") {
        action = "Please verify the account ownership and correct the reporting to accurately reflect authorized user status.";
      } else if (violationCategory === "FURNISHER_POST_DISPUTE_RETALIATION") {
        action = "Please investigate the basis of this reporting and remove any unsubstantiated information.";
      } else if (violationCategory === "COLLECTOR_LICENSE_FAILURE") {
        action = "Please verify the collector's licensing status and remove this tradeline if they are unlicensed.";
      } else if (violationCategory === "COLLECTOR_UNAUTHORIZED_FEES") {
        action = "Please obtain an itemized statement to correct the reported balance, or remove the tradeline if unsubstantiated.";
      } else if (violationCategory === "COLLECTOR_PAYMENT_ACKNOWLEDGMENT_VIOLATION") {
        action = "Please verify the current account balance and status with the collector and update the reporting.";
      } else if (violationCategory === "COLLECTOR_DUPLICATE_REPORTING") {
        action = "Please investigate and remove any duplicate tradelines.";
      } else if (violationCategory === "RESPONSE_MOV_MISSING") {
        action = "Please provide the method and results of the investigation, or complete a new investigation if necessary.";
      } else if (violationCategory === "RESPONSE_INCOMPLETE") {
        action = "Please conduct a complete reinvestigation of all disputed items and provide a comprehensive written response.";
      } else if (violationCategory === "RESPONSE_NO_DOCUMENTATION") {
        action = "Please obtain verifiable documentation to substantiate the reported information, or correct/delete it.";
      } else if (violationCategory === "RESPONSE_ADDRESS_MISMATCH") {
        action = "Please confirm the correct address on file and reissue the complete dispute results.";
      } else if (violationCategory === "RESPONSE_UNAUTHORIZED") {
        action = "Please provide a properly authorized dispute response and conduct a new investigation if necessary.";
      } else if (violationCategory === "DISCLOSURE_DEFICIENCY") {
        action = "Please provide a corrected and complete disclosure, and correct any incomplete or inaccurate data fields.";
      } else if (violationCategory === "MIXED_FILE_PERSONAL_INFO_MISMATCH") {
        action = "Please investigate this mixed file situation, segregate my credit information from any other consumer's data, and remove all accounts that do not belong to me.";
      } else if (violationCategory === "COLLECTION_LIMITATION_EXCEEDED") {
        action = "Please remove this time-barred collection account from my credit file immediately, as it is past the legal limitation period.";
      } else if (violationCategory === "CONSENT_WITHDRAWAL_NOT_HONORED") {
        action = "Please immediately cease reporting this account and remove all information reported after the date of consent withdrawal.";
      } else if (violationCategory === "FREEZE_PERIOD_VIOLATION") {
        action = "Please investigate this unauthorized access during my security freeze and remove any resulting accounts or inquiries.";
      } else if (violationCategory === "IDENTITY_THEFT_VIOLATION") {
        action = "Please immediately block this fraudulent information from my credit file and provide written confirmation.";
      } else if (violationCategory === "BANKRUPTCY_DISCHARGE_VIOLATION") {
        action = "Please update the reporting to reflect the bankruptcy discharge status and correct any inaccuracies.";
      } else if (["CROSS_ENTITY_DISCREPANCY", "MULTIPLE_COLLECTOR_VIOLATION", "DEBT_VALIDATION_FAILURE", "ORIGINAL_CREDITOR_CHAIN_FAILURE"].includes(violationCategory)) {
        action = "Please investigate the reporting from all associated furnishers and correct or remove any inconsistent information.";
      } else if (violationCategory === "METRO2_FIELD_VIOLATION") {
        action = "Please contact the furnisher to correct the non-compliant data fields, or remove the tradeline.";
      } else {
        action = "Please investigate this dispute, correct or delete any unverified information, and provide written confirmation.";
      }
    }
  }

  // Apply DB overrides for the violation category if present
  if (violationCategory) {
    const templateKey = violationCategory.toLowerCase();
    try {
      const overrides = await resolveViolationNarrativeOverride(templateKey);
      if (overrides?.requestedAction) {
        console.log(`Applying DB requestedAction override for violation_narrative key "${templateKey}"`);
        return overrides.requestedAction;
      }
    } catch (err) {
      console.error(`Failed to resolve requestedAction override for key "${templateKey}":`, err);
    }
  }

  return action;
}

/**
 * Helper to look up violation_narrative overrides without circular imports.
 * Delegates to resolveTemplateOverrides from letterTemplateQueries.
 */
async function resolveViolationNarrativeOverride(templateKey: string) {
  const { resolveTemplateOverrides } = await import("./letterTemplateQueries");
  return resolveTemplateOverrides("violation_narrative", templateKey);
}

/**
 * Builds a detailed account identification block from tradeline details.
 * Uses sentinel strings for missing creditor name and account number.
 */
function buildAccountIdentification(
  creditorName: string,
  accountNumber: string,
  details?: TradelineDetails
): string {
  const displayCreditor = creditorName.trim() || "Not identified in consumer disclosure";
  const normalizedAccount = accountNumber.trim().toLowerCase();
  const displayAccount =
    !normalizedAccount ||
    normalizedAccount === "unknown" ||
    normalizedAccount === "not reported" ||
    normalizedAccount === "not provided in consumer disclosure"
      ? "Not reported by bureau"
      : accountNumber.trim();

  const lines: string[] = [
    `Creditor/Furnisher: ${displayCreditor}`,
    `Account Number: ${displayAccount}`,
  ];

  if (!details) return lines.join("\n");

  if (details.accountType) lines.push(`Account Type: ${details.accountType}`);
  if (details.status) lines.push(`Reported Status: ${details.status}`);
  if (details.openedDate) lines.push(`Date Opened: ${formatDate(details.openedDate)}`);
  if (details.dateClosed) lines.push(`Date Closed: ${formatDate(details.dateClosed)}`);
  if (details.lastActivityDate) lines.push(`Last Activity Date: ${formatDate(details.lastActivityDate)}`);
  if (details.dateOfLastPayment) lines.push(`Date of Last Payment: ${formatDate(details.dateOfLastPayment)}`);
  if (details.dateOfFirstDelinquency) lines.push(`Date of First Delinquency: ${formatDate(details.dateOfFirstDelinquency)}`);
  if (details.balance) lines.push(`Reported Balance: ${formatCurrency(details.balance)}`);
  if (details.currentBalance) lines.push(`Current Balance: ${formatCurrency(details.currentBalance)}`);
  if (details.creditLimit) lines.push(`Credit Limit: ${formatCurrency(details.creditLimit)}`);
  if (details.highCredit) lines.push(`High Credit: ${formatCurrency(details.highCredit)}`);
  if (details.amountPastDue) lines.push(`Amount Past Due: ${formatCurrency(details.amountPastDue)}`);
  if (details.terms) lines.push(`Terms: ${details.terms}`);
  if (details.ecoaCode) lines.push(`ECOA Code: ${details.ecoaCode}`);
  if (details.responsibilityCode) lines.push(`Responsibility: ${details.responsibilityCode}`);
  if (details.isCollectionAccount) {
    lines.push(`Collection Account: Yes`);
    if (details.collectionAgencyName) {
      lines.push(`Collection Agency: ${details.collectionAgencyName}`);
    }
  }

  return lines.join("\n");
}

/**
 * Builds the Equifax dispute letter using the official Equifax Canada template format.
 */
export async function buildEquifaxDisputeLetter(ctx: EquifaxDisputeContext, province?: string): Promise<LetterContent> {
  const currentDate = new Date().toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Hardcoded official Equifax Canada Consumer Relations address
  const recipientAddress = [
    "Consumer Relations",
    "P.O. Box 190",
    "Station Jean-Talon",
    "Montreal, QC H1S 2Z2",
  ];

  const reasonDescription = getDisputeReasonDescription(ctx.disputeReasonCode);

  // Use violation-aware framing for subject and introduction
  const framing = await getDisputeLetterFraming(
    ctx.violationDetails?.violationCategory ?? ctx.violationCategory,
    "Equifax",
    ctx.violationDetails,
    ctx.tradelineDetails
  );

  // Build violation-aware account identification
  const accountIdentification = buildViolationAwareAccountId(
    ctx.creditorName,
    ctx.accountNumber,
    ctx.violationDetails?.violationCategory ?? ctx.violationCategory,
    ctx.tradelineDetails,
    "Creditor/Furnisher",
    ctx.violationDetails
  );

  // Build plain-language disputed items section
  const disputedItemsParagraphs = disputeNarrativeBuilder({
    violationCategory: ctx.violationDetails?.violationCategory ?? ctx.violationCategory,
    tradelineDetails: ctx.tradelineDetails,
    violationDetails: ctx.violationDetails,
    reasonDescription,
    additionalNotes: ctx.additionalNotes,
    expectedCorrectValue: ctx.expectedCorrectValue,
  });
  let disputedItemsText = disputedItemsParagraphs.join("\n\n");

  const introduction = deduplicateLetterSections(framing.introduction, disputedItemsText);

  // Build statutory grounds — single location, no duplication in disputedItems
  let statutoryGrounds: string;
  if (province) {
    const statutoryBasis = getDisputeReasonStatutoryBasis(
      ctx.disputeReasonCode,
      province,
      ctx.statuteInfo
    );
    statutoryGrounds = statutoryBasis;
  } else if (ctx.violationDetails?.statutoryBasis) {
    statutoryGrounds = `This dispute is filed pursuant to ${ctx.violationDetails.statutoryBasis}.`;
  } else if (ctx.statuteInfo) {
    statutoryGrounds = `This dispute is filed pursuant to ${ctx.statuteInfo.code} ${ctx.statuteInfo.sectionReference}.`;
  } else {
    statutoryGrounds = "This dispute is filed pursuant to applicable consumer reporting legislation.";
  }

  // Generate bureau-directed requested action
  let requestedAction = await buildBureauRequestedAction(
    ctx.violationDetails?.violationCategory ?? ctx.violationCategory,
    ctx.tradelineDetails,
    ctx.violationDetails
  );
  requestedAction += " You have 30 days to complete this.";

  const certification =
    "I certify that the information provided in this letter is true and accurate to the best of my knowledge.";
  const closing = "Sincerely,";

  const letterContent: LetterContent = {
    consumerName: ctx.consumerName,
    consumerAddress: ctx.consumerAddress,
    consumerDOB: ctx.consumerDOB,
    consumerPhone: ctx.consumerPhone,
    consumerEmail: ctx.consumerEmail,
    letterDate: currentDate,

    recipientName: "Equifax Canada Co.",
    recipientAddress,

    subject: framing.subject,

    introduction,
    accountIdentification,
    disputedItems: disputedItemsText,
    statutoryGrounds,
    requestedAction,
    statutoryTimeframe: undefined,
    certification,
    closing,
  };

  if (ctx.equifaxFileNumber) {
    letterContent.supportingDocumentation = `Equifax File Number: ${ctx.equifaxFileNumber}`;
  }

  return applyTemplateOverrides(letterContent, "bureau", "equifax");
}

/**
 * Main entry point for building an Equifax dispute letter.
 * Wrapper around buildEquifaxDisputeLetter for backward compatibility.
 */
export async function buildEquifaxDispute(ctx: EquifaxDisputeContext, province?: string): Promise<LetterContent> {
  return buildEquifaxDisputeLetter(ctx, province);
}
