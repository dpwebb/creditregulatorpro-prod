import type { LetterContent } from "./pdfGenerator";
import type { TradelineDetails, ViolationDetails } from "./equifaxDisputeTemplate";
import { formatCurrency as formatDollarAmount } from "./formatters";
import { humanizeLabels } from "./humanizeLabels";

export interface ConsumerFileReference {
  previousNames?: string[];
  previousAddresses?: string[];
  sinLastDigits?: string;
  creditReportReferenceNumber?: string;
  reportDate?: string;
}

export interface EvidentiaryStructureContext {
  violationCategory?: string | null;
  violationDetails?: ViolationDetails;
  tradelineDetails?: TradelineDetails;
  consumerFileReference?: ConsumerFileReference;
}

export interface ViolationNarrativeTemplateVariableContext extends EvidentiaryStructureContext {
  bureauName?: string | null;
  statutoryReference?: string | null;
}

function normalizeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function appendLineIfMissing(lines: string[], label: string, value: string | null | undefined) {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) return;

  const prefix = `${label}:`.toLowerCase();
  if (lines.some((line) => line.trim().toLowerCase().startsWith(prefix))) return;
  lines.push(`${label}: ${normalizedValue}`);
}

function uniqueNonBlank(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized.toLowerCase())) continue;
    seen.add(normalized.toLowerCase());
    output.push(normalized);
  }

  return output;
}

function humanizeFieldName(fieldName: string | null | undefined): string | null {
  const normalized = normalizeText(fieldName);
  if (!normalized) return null;
  return humanizeLabels.humanizeFieldName(normalized);
}

function technicalDetailsString(
  violationDetails: ViolationDetails | undefined,
  keys: string[]
): string | undefined {
  const details = violationDetails?.technicalDetails;
  if (!details || typeof details !== "object") return undefined;

  for (const key of keys) {
    const value = details[key];
    const serialized = serializeTemplateValue(value);
    if (serialized) return serialized;
  }

  return undefined;
}

function serializeTemplateValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;

  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => serializeTemplateValue(entry))
      .filter(Boolean)
      .slice(0, 3) as string[];
    return parts.length > 0 ? parts.join("; ") : undefined;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, entryValue]) => {
        const serialized = serializeTemplateValue(entryValue);
        return serialized ? `${humanizeLabels.humanizeFieldName(key)}: ${serialized}` : null;
      })
      .filter(Boolean)
      .slice(0, 4) as string[];
    return entries.length > 0 ? entries.join("; ") : undefined;
  }

  const text = String(value).trim();
  return text ? text : undefined;
}

function isMissingReportedValue(value: string | null | undefined): boolean {
  const normalized = normalizeText(value).toLowerCase();
  return (
    !normalized ||
    normalized === "null" ||
    normalized === "undefined" ||
    normalized === "0 or null" ||
    normalized === "not reported" ||
    normalized.startsWith("missing:")
  );
}

function formatTemplateValue(
  value: string | null | undefined,
  fieldName?: string | null,
  missingLabel: string = "missing / not reported"
): string {
  const normalized = normalizeText(value);
  if (isMissingReportedValue(normalized)) return missingLabel;

  const withoutMissingPrefix = normalized.replace(/^Missing:\s*/i, "").trim();
  if (!withoutMissingPrefix) return missingLabel;

  const date = new Date(withoutMissingPrefix);
  if (/^\d{4}-\d{2}-\d{2}/.test(withoutMissingPrefix) && !Number.isNaN(date.getTime())) {
    return date.toLocaleDateString("en-CA");
  }

  const fieldText = `${fieldName ?? ""}`.toLowerCase();
  const isMoneyField =
    fieldText.includes("balance") ||
    fieldText.includes("amount") ||
    fieldText.includes("limit") ||
    fieldText.includes("payment") ||
    fieldText.includes("fee") ||
    fieldText.includes("interest");

  if (isMoneyField) {
    const formatted = formatDollarAmount(withoutMissingPrefix);
    if (formatted) return formatted;
  }

  return withoutMissingPrefix;
}

function detectedValueForNarrative(violationDetails?: ViolationDetails): string | undefined {
  return (
    normalizeText(violationDetails?.detectedValue) ||
    technicalDetailsString(violationDetails, [
      "reportedValue",
      "actualValue",
      "currentValue",
      "detectedValue",
      "baseValue",
    ])
  );
}

function expectedValueForNarrative(violationDetails?: ViolationDetails): string | undefined {
  const explicit = normalizeText(violationDetails?.expectedValue);
  if (explicit && explicit !== "All required fields present") return explicit;

  return technicalDetailsString(violationDetails, [
    "expectedValue",
    "correctValue",
    "sourceValue",
    "requiredValue",
    "otherValue",
  ]);
}

function fieldNameForNarrative(
  violationCategory?: string | null,
  violationDetails?: ViolationDetails
): string {
  const detectedValue = detectedValueForNarrative(violationDetails);
  const missingField = detectedValue?.match(/^Missing:\s*(.+)$/i)?.[1];
  const technicalField = technicalDetailsString(violationDetails, [
    "fieldName",
    "field",
    "matchedField",
    "check",
  ]);
  const direct = humanizeFieldName(violationDetails?.fieldName ?? missingField ?? technicalField);
  if (direct) return direct;

  const fields = describeDisputedFields(violationCategory, violationDetails)
    .split(";")
    .map((field) => field.trim())
    .filter(Boolean);
  return fields[0] || "Disputed account field";
}

function buildSpecificIssue(field: string, reportedValue: string, expectedValue: string): string {
  if (reportedValue === "missing / not reported") {
    if (expectedValue && expectedValue !== "source-supported value") {
      return `${field} is missing or not reported; source records should support ${expectedValue}.`;
    }
    return `${field} is missing or not reported, so the tradeline cannot be verified without source support.`;
  }

  if (expectedValue && expectedValue !== "source-supported value") {
    return `${field} is reported as ${reportedValue}; expected/source-supported value is ${expectedValue}.`;
  }

  return `${field} is reported as ${reportedValue} and requires source verification.`;
}

function ensureRemovalRemedy(remedy: string): string {
  const normalized = normalizeText(remedy);
  const fallback =
    "If that remedy cannot be completed from source records, delete or suppress the tradeline.";
  if (!normalized) return fallback;
  if (/\b(delete|remove|suppress)\b/i.test(normalized) && /\btradeline|account|item|information\b/i.test(normalized)) {
    return normalized;
  }
  return `${normalized.replace(/[.;\s]+$/g, "")}. ${fallback}`;
}

function buildSpecificRemedy(
  field: string,
  expectedValue: string,
  violationDetails?: ViolationDetails,
  violationCategory?: string | null
): string {
  const recommendedAction = normalizeText(violationDetails?.recommendedAction);
  if (recommendedAction) return ensureRemovalRemedy(recommendedAction);

  const category = normalizeText(violationCategory ?? violationDetails?.violationCategory).toUpperCase();

  if (
    [
      "STATUTE_OF_LIMITATIONS",
      "TIME_BARRED_DEBT_COLLECTION",
      "COLLECTOR_STATUTE_REVIVAL_ATTEMPT",
      "STALE_REPORTING_FAILURE",
      "COLLECTION_LIMITATION_EXCEEDED",
    ].includes(category)
  ) {
    return ensureRemovalRemedy(`Correct the reporting-period field ${field}; remove the tradeline if the chronology or retention basis is not verified`);
  }

  if (
    [
      "DOCUMENTATION_CHAIN_FAILURE",
      "ORIGINAL_CREDITOR_CHAIN_FAILURE",
      "DEBT_VALIDATION_FAILURE",
      "PHANTOM_DEBT_UNVERIFIABLE",
      "DOFD_REPORTING",
      "METRO2_FIELD_VIOLATION",
    ].includes(category)
  ) {
    return ensureRemovalRemedy(`Provide source documentation for ${field} and correct the field to the documented value`);
  }

  if (
    [
      "IDENTITY_THEFT_VIOLATION",
      "MIXED_FILE_PERSONAL_INFO_MISMATCH",
      "RESPONSE_ADDRESS_MISMATCH",
    ].includes(category)
  ) {
    return ensureRemovalRemedy(`Block, correct, or suppress the unauthorized or mismatched ${field} reporting`);
  }

  if (["BUREAU_ACCESS_VIOLATION", "FREEZE_PERIOD_VIOLATION"].includes(category)) {
    return ensureRemovalRemedy(`Remove any unauthorized inquiry, file access, or account reporting tied to ${field}`);
  }

  if (
    [
      "BUREAU_INVESTIGATION_FAILURE",
      "BUREAU_NOTIFICATION_FAILURE",
      "BUREAU_DISPUTE_MARKING_FAILURE",
      "RESPONSE_MOV_MISSING",
      "RESPONSE_INCOMPLETE",
      "RESPONSE_NO_DOCUMENTATION",
      "INVESTIGATION_RUBBER_STAMP",
    ].includes(category)
  ) {
    return ensureRemovalRemedy(`Provide a field-level reinvestigation result for ${field} and correct the field if the source record does not support it`);
  }

  if (category === "BANKRUPTCY_DISCHARGE_VIOLATION") {
    return ensureRemovalRemedy(`Correct ${field} to reflect the bankruptcy, proposal, discharge, balance, or post-discharge status supported by source records`);
  }

  if (
    [
      "BALANCE_CALCULATION_VIOLATION",
      "INCORRECT_BALANCE",
      "CREDIT_LIMIT_MANIPULATION",
      "CLOSED_ACCOUNT_BALANCE_INFLATION",
      "COLLECTOR_UNAUTHORIZED_FEES",
    ].includes(category)
  ) {
    if (expectedValue && expectedValue !== "source-supported value") {
      return ensureRemovalRemedy(`Correct ${field} to ${expectedValue} and remove unsupported fees, interest, or balance amounts`);
    }
    return ensureRemovalRemedy(`Correct ${field} to the itemized amount supported by source records`);
  }

  if (expectedValue && expectedValue !== "source-supported value") {
    return ensureRemovalRemedy(`Correct ${field} to ${expectedValue}`);
  }

  return ensureRemovalRemedy(`Correct ${field} to the value supported by source records`);
}

export function buildViolationNarrativeTemplateVariables(
  context: ViolationNarrativeTemplateVariableContext = {}
): Record<string, string> {
  const violationCategory = context.violationCategory ?? context.violationDetails?.violationCategory;
  const field = fieldNameForNarrative(violationCategory, context.violationDetails);
  const reportedValue = formatTemplateValue(
    detectedValueForNarrative(context.violationDetails),
    context.violationDetails?.fieldName
  );
  const expectedValue = formatTemplateValue(
    expectedValueForNarrative(context.violationDetails),
    context.violationDetails?.fieldName,
    "source-supported value"
  );
  const specificIssue = buildSpecificIssue(field, reportedValue, expectedValue);
  const specificRemedy = buildSpecificRemedy(
    field,
    expectedValue,
    context.violationDetails,
    violationCategory
  );
  const regulatoryBasis =
    normalizeText(context.statutoryReference) ||
    normalizeText(context.violationDetails?.statutoryBasis) ||
    "PIPEDA, Schedule 1, Principle 4.6 and applicable provincial consumer reporting authority";

  return {
    bureauName: normalizeText(context.bureauName),
    exactDisputedFields: describeDisputedFields(violationCategory, context.violationDetails),
    disputedField: field,
    reportedValue,
    expectedValue,
    specificIssue,
    specificConcern: specificIssue,
    specificRemedy,
    requiredRemedy: specificRemedy,
    regulatoryBasis,
  };
}

function fieldNamesForViolationCategory(category: string | null | undefined): string[] {
  switch (category) {
    case "BALANCE_CALCULATION_VIOLATION":
    case "INCORRECT_BALANCE":
    case "CREDIT_LIMIT_MANIPULATION":
    case "CLOSED_ACCOUNT_BALANCE_INFLATION":
    case "COLLECTOR_UNAUTHORIZED_FEES":
      return ["reported balance", "current balance", "past-due amount", "fees or credit limit"];
    case "ACCOUNT_STATUS_INCONSISTENCY":
    case "FURNISHER_STATUS_CODE_MISMATCH":
    case "INCORRECT_PAYMENT_STATUS":
    case "BANKRUPTCY_DISCHARGE_VIOLATION":
      return ["reported status", "account status code", "payment rating"];
    case "PAYMENT_HISTORY_MANIPULATION":
    case "RETROACTIVE_HISTORY_MANIPULATION":
      return ["payment history", "monthly payment chronology"];
    case "FURNISHER_REAGING_VIOLATION":
    case "TEMPORAL_MANIPULATION":
    case "LAST_ACTIVITY_DATE_MANIPULATION":
    case "STATUTE_OF_LIMITATIONS":
    case "TIME_BARRED_DEBT_COLLECTION":
    case "COLLECTOR_STATUTE_REVIVAL_ATTEMPT":
    case "STALE_REPORTING_FAILURE":
      return ["date opened", "date of last activity", "date of last payment", "date of first delinquency"];
    case "DOCUMENTATION_CHAIN_FAILURE":
    case "ORIGINAL_CREDITOR_CHAIN_FAILURE":
    case "DEBT_VALIDATION_FAILURE":
    case "PHANTOM_DEBT_UNVERIFIABLE":
      return ["creditor identity", "original creditor", "assignment chain", "account ownership"];
    case "COLLECTOR_DUPLICATE_REPORTING":
    case "MULTIPLE_COLLECTOR_VIOLATION":
      return ["duplicate account", "collector identity", "reported balance", "account ownership"];
    case "BUREAU_ACCESS_VIOLATION":
    case "FREEZE_PERIOD_VIOLATION":
      return ["inquiry", "file access", "permissible purpose"];
    case "IDENTITY_THEFT_VIOLATION":
    case "MIXED_FILE_PERSONAL_INFO_MISMATCH":
    case "RESPONSE_ADDRESS_MISMATCH":
      return ["account ownership", "identity information", "address information"];
    case "DISCLOSURE_DEFICIENCY":
      return ["consumer disclosure completeness", "source information"];
    case "RESPONSE_MOV_MISSING":
    case "RESPONSE_INCOMPLETE":
    case "RESPONSE_NO_DOCUMENTATION":
    case "BUREAU_INVESTIGATION_FAILURE":
    case "BUREAU_NOTIFICATION_FAILURE":
    case "BUREAU_DISPUTE_MARKING_FAILURE":
    case "INVESTIGATION_RUBBER_STAMP":
      return ["method of verification", "investigation result", "dispute notation"];
    default:
      return ["accuracy, completeness, and verification of the disputed account data"];
  }
}

export function describeDisputedFields(
  violationCategory?: string | null,
  violationDetails?: ViolationDetails
): string {
  const fields = uniqueNonBlank([
    humanizeFieldName(violationDetails?.fieldName),
    ...fieldNamesForViolationCategory(violationCategory ?? violationDetails?.violationCategory),
  ]);

  return fields.join("; ");
}

function bureauSectionForViolation(category: string | null | undefined): string {
  if (
    category === "BUREAU_ACCESS_VIOLATION" ||
    category === "FREEZE_PERIOD_VIOLATION"
  ) {
    return "Inquiry / file access section";
  }

  if (
    category === "IDENTITY_THEFT_VIOLATION" ||
    category === "MIXED_FILE_PERSONAL_INFO_MISMATCH" ||
    category === "RESPONSE_ADDRESS_MISMATCH"
  ) {
    return "Personal information / identity section";
  }

  if (category === "BANKRUPTCY_DISCHARGE_VIOLATION") {
    return "Public record and account tradeline sections";
  }

  return "Account / tradeline section of the consumer disclosure";
}

export function enrichAccountIdentification(
  accountIdentification: string | undefined,
  context: EvidentiaryStructureContext = {}
): string {
  const lines = normalizeText(accountIdentification)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const violationCategory = context.violationCategory ?? context.violationDetails?.violationCategory;
  const narrativeVariables = buildViolationNarrativeTemplateVariables(context);
  appendLineIfMissing(lines, "Bureau Section", bureauSectionForViolation(violationCategory));
  appendLineIfMissing(lines, "Exact Field(s) Disputed", describeDisputedFields(violationCategory, context.violationDetails));
  appendLineIfMissing(lines, "Disputed Field", narrativeVariables.disputedField);
  appendLineIfMissing(lines, "Reported Field Value", narrativeVariables.reportedValue);
  appendLineIfMissing(lines, "Expected / Source-Supported Value", narrativeVariables.expectedValue);

  if (context.tradelineDetails?.paymentPattern) {
    appendLineIfMissing(lines, "Payment History Period", context.tradelineDetails.paymentPattern);
  }

  const reportDate = context.consumerFileReference?.reportDate;
  if (reportDate) {
    appendLineIfMissing(lines, "Date of Report Being Disputed", reportDate);
  }

  const fileNumber = context.consumerFileReference?.creditReportReferenceNumber;
  if (fileNumber) {
    appendLineIfMissing(lines, "Credit Report / File Reference", fileNumber);
  }

  return lines.join("\n");
}

function buildPurposeStatement(existingIntroduction: string): string {
  const intro = normalizeText(existingIntroduction);
  const purpose =
    "This is a formal dispute and reinvestigation request. I am identifying the consumer, the bureau file, the exact disputed data, the factual basis for the dispute, the supporting evidence references, and the correction requested.";

  if (!intro) return purpose;
  if (intro.toLowerCase().includes("formal dispute and reinvestigation request")) return intro;
  return `${purpose}\n\n${intro}`;
}

function buildDisputedItemsSection(
  existingDisputedItems: string | undefined,
  context: EvidentiaryStructureContext = {}
): string {
  const existing = normalizeText(existingDisputedItems);
  if (existing.toLowerCase().startsWith("disputed data fields:")) return existing;

  const violationCategory = context.violationCategory ?? context.violationDetails?.violationCategory;
  const exactFields = describeDisputedFields(violationCategory, context.violationDetails);
  const narrativeVariables = buildViolationNarrativeTemplateVariables(context);
  const bureauSection = bureauSectionForViolation(violationCategory);
  const factualBasis = existing || "The disputed reporting appears inaccurate, incomplete, inconsistent, or unverifiable based on the consumer disclosure and available account evidence.";

  return [
    `Disputed field/value: ${narrativeVariables.disputedField} = ${narrativeVariables.reportedValue}`,
    `Expected/source-supported value: ${narrativeVariables.expectedValue}`,
    `Specific issue: ${narrativeVariables.specificIssue}`,
    `Disputed data fields: ${exactFields}`,
    `Bureau section: ${bureauSection}`,
    `Factual basis: ${factualBasis}`,
  ].join("\n");
}

function buildSupportingDocumentationSection(
  existingSupportingDocumentation: string | undefined,
  context: EvidentiaryStructureContext = {}
): string {
  const existing = normalizeText(existingSupportingDocumentation);
  if (existing.toLowerCase().includes("supporting evidence and attachments index")) {
    return existing;
  }

  const referenceLines = [
    context.consumerFileReference?.creditReportReferenceNumber
      ? `Bureau file/reference number: ${context.consumerFileReference.creditReportReferenceNumber}`
      : null,
    context.consumerFileReference?.reportDate
      ? `Report date disputed: ${context.consumerFileReference.reportDate}`
      : null,
    existing || null,
  ].filter(Boolean) as string[];

  return [
    "Supporting evidence and attachments index:",
    "1. Consumer identification and current address verification.",
    "2. Credit report or consumer disclosure page showing the disputed item.",
    "3. Account-specific support for the disputed fields, such as statements, payment confirmations, settlement or closure records, court or insolvency documents, police or identity-theft reports, creditor correspondence, screenshots, or cancelled cheques when applicable.",
    "4. Requested bureau/furnisher verification records, including source documents, method of verification, furnisher identity, correction history, and any documents relied on to keep reporting the item.",
    ...referenceLines.map((line) => `Reference: ${line}`),
  ].join("\n");
}

function buildRequestedActionSection(existingRequestedAction: string): string {
  const existing = normalizeText(existingRequestedAction);
  if (existing.toLowerCase().includes("requested correction by disputed field")) return existing;

  const specificRequest = existing || "Please reinvestigate the disputed account information and correct any inaccurate, incomplete, or unverifiable reporting.";

  return [
    "Requested correction by disputed field:",
    "1. Open a reinvestigation for each disputed field identified above.",
    "2. Verify each field against original source records from the furnisher, creditor, collector, court, insolvency record, or other source relied on for reporting.",
    "3. Correct any inaccurate, incomplete, stale, internally inconsistent, or unsupported field.",
    "4. Delete or suppress any field, inquiry, account notation, or tradeline that cannot be verified from source documentation.",
    "5. Mark the account or item as disputed while the investigation is pending, where your bureau process supports dispute notation.",
    "6. Provide written results, an updated credit disclosure, the furnisher name, the method of verification, and copies or descriptions of the records relied on for any item that remains.",
    `Specific requested action: ${specificRequest}`,
  ].join("\n");
}

function buildTimeframeSection(existingTimeframe: string | undefined): string {
  const existing = normalizeText(existingTimeframe);
  const writtenResults =
    "Please provide the results of your reinvestigation in writing, including an updated disclosure or correction notice and the verification method used for any item that remains.";

  if (!existing) return writtenResults;
  if (existing.toLowerCase().includes("results of your reinvestigation in writing")) return existing;
  return `${existing} ${writtenResults}`;
}

function buildConsumerStatementRight(existingStatementRight: string | undefined): string {
  const existing = normalizeText(existingStatementRight);
  if (existing) return existing;
  return "If any disputed information remains after reinvestigation, please provide the process for adding or preserving a consumer statement or dispute notation on the file.";
}

function buildDeliveryConfirmation(existingDeliveryConfirmation: string | undefined, letterDate: string): string {
  const existing = normalizeText(existingDeliveryConfirmation);
  const auditText =
    `Delivery and audit record: this dispute is dated ${letterDate}. I will retain a copy of this letter, the supporting evidence index, delivery confirmation, tracking number if mailed, and your written response. If submitted by mail, registered mail or tracked courier should be used and the tracking number should be preserved.`;

  if (!existing) return auditText;
  if (existing.toLowerCase().includes("delivery and audit record")) return existing;
  return `${existing}\n${auditText}`;
}

function mergeConsumerFileReference(
  letterContent: LetterContent,
  context: EvidentiaryStructureContext
): ConsumerFileReference | undefined {
  const reference = context.consumerFileReference ?? letterContent.consumerFileReference;
  if (!reference) return undefined;

  return {
    previousNames: reference.previousNames?.filter(Boolean),
    previousAddresses: reference.previousAddresses?.filter(Boolean),
    sinLastDigits: normalizeText(reference.sinLastDigits).replace(/\D/g, "").slice(-4) || undefined,
    creditReportReferenceNumber: normalizeText(reference.creditReportReferenceNumber) || undefined,
    reportDate: normalizeText(reference.reportDate) || undefined,
  };
}

export function applyEvidentiaryDisputeStructure(
  letterContent: LetterContent,
  context: EvidentiaryStructureContext = {}
): LetterContent {
  const consumerFileReference = mergeConsumerFileReference(letterContent, context);
  const effectiveContext = { ...context, consumerFileReference };

  return {
    ...letterContent,
    consumerFileReference,
    introduction: buildPurposeStatement(letterContent.introduction),
    accountIdentification: enrichAccountIdentification(letterContent.accountIdentification, effectiveContext),
    disputedItems: buildDisputedItemsSection(letterContent.disputedItems, effectiveContext),
    supportingDocumentation: buildSupportingDocumentationSection(
      letterContent.supportingDocumentation,
      effectiveContext
    ),
    requestedAction: buildRequestedActionSection(letterContent.requestedAction),
    statutoryTimeframe: buildTimeframeSection(letterContent.statutoryTimeframe),
    consumerStatementRight: buildConsumerStatementRight(letterContent.consumerStatementRight),
    deliveryConfirmation: buildDeliveryConfirmation(
      letterContent.deliveryConfirmation,
      letterContent.letterDate
    ),
    certification:
      normalizeText(letterContent.certification) ||
      "I certify that this dispute is submitted in good faith and that the information provided is accurate to the best of my knowledge.",
    closing: normalizeText(letterContent.closing) || "Sincerely,",
  };
}
