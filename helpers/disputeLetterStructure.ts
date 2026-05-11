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

function categoryKey(category: string | null | undefined): string {
  return normalizeText(category).toUpperCase();
}

function categoryMatches(category: string | null | undefined, values: string[]): boolean {
  return values.includes(categoryKey(category));
}

function formatDateValue(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return normalizeText(String(value)) || undefined;

  return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(date);
}

function yearsSince(value: Date | string | null | undefined): number | undefined {
  if (!value) return undefined;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;

  const now = new Date();
  let years = now.getUTCFullYear() - date.getUTCFullYear();
  const beforeAnniversary =
    now.getUTCMonth() < date.getUTCMonth() ||
    (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() < date.getUTCDate());
  if (beforeAnniversary) years -= 1;

  return years >= 0 ? years : undefined;
}

function chronologySentence(context: EvidentiaryStructureContext): string | undefined {
  const details = context.tradelineDetails;
  if (!details) return undefined;

  const opened = formatDateValue(details.openedDate);
  const lastPayment = formatDateValue(details.dateOfLastPayment);
  const lastActivity = formatDateValue(details.lastActivityDate);
  const firstDelinquency = formatDateValue(details.dateOfFirstDelinquency);

  const parts = [
    opened ? `opened on ${opened}` : null,
    lastPayment ? `last payment reported as ${lastPayment}` : null,
    lastActivity ? `last activity reported as ${lastActivity}` : null,
    firstDelinquency ? `date of first delinquency reported as ${firstDelinquency}` : null,
  ].filter(Boolean);

  if (parts.length === 0) return undefined;

  const ageBase =
    details.dateOfLastPayment ?? details.lastActivityDate ?? details.dateOfFirstDelinquency;
  const age = yearsSince(ageBase);
  const ageText = age !== undefined ? ` That date is more than ${age} year${age === 1 ? "" : "s"} old.` : "";

  return `This account is reported as ${parts.join(", ")}.${ageText}`;
}

function buildCategoryParticulars(
  violationCategory: string | null | undefined,
  narrativeVariables: Record<string, string>,
  context: EvidentiaryStructureContext,
  existing: string
): string {
  const category = categoryKey(violationCategory);
  const chronology = chronologySentence(context);
  const field = narrativeVariables.disputedField;
  const reportedValue = narrativeVariables.reportedValue;
  const expectedValue = narrativeVariables.expectedValue;

  if (
    categoryMatches(category, [
      "STATUTE_OF_LIMITATIONS",
      "TIME_BARRED_DEBT_COLLECTION",
      "COLLECTOR_STATUTE_REVIVAL_ATTEMPT",
      "STALE_REPORTING_FAILURE",
      "COLLECTION_LIMITATION_EXCEEDED",
    ])
  ) {
    const chronologyText =
      chronology ||
      `The reporting period is disputed because the source chronology for ${field} is missing, incomplete, stale, or not verifiable from the consumer disclosure.`;
    return `Factual basis: ${chronologyText} The disputed concern is whether the reporting chronology still supports continued reporting of this tradeline under the applicable retention and accuracy requirements.`;
  }

  if (
    categoryMatches(category, [
      "BALANCE_CALCULATION_VIOLATION",
      "INCORRECT_BALANCE",
      "CREDIT_LIMIT_MANIPULATION",
      "CLOSED_ACCOUNT_BALANCE_INFLATION",
      "COLLECTOR_UNAUTHORIZED_FEES",
    ])
  ) {
    return `Factual basis: ${field} is reported as ${reportedValue}, while the expected or source-supported value is ${expectedValue}. The bureau should compare the reported balance, past-due amount, fees, interest, credits, settlement records, and final creditor statement before continuing to report the amount.`;
  }

  if (
    categoryMatches(category, [
      "ACCOUNT_STATUS_INCONSISTENCY",
      "FURNISHER_STATUS_CODE_MISMATCH",
      "INCORRECT_PAYMENT_STATUS",
      "PAYMENT_HISTORY_MANIPULATION",
      "RETROACTIVE_HISTORY_MANIPULATION",
      "FURNISHER_REAGING_VIOLATION",
      "TEMPORAL_MANIPULATION",
      "LAST_ACTIVITY_DATE_MANIPULATION",
      "DOFD_REPORTING",
    ])
  ) {
    return `Factual basis: ${field} is the disputed status, payment, or date field. The bureau should verify the payment chronology, account status, date sequence, and furnisher reporting history against source records rather than relying on a summary code alone.`;
  }

  if (category === "BANKRUPTCY_DISCHARGE_VIOLATION") {
    return `Factual basis: ${field} must be reconciled with the bankruptcy, consumer proposal, trustee, discharge, balance, and post-discharge collection records. Any status, balance, past-due amount, or collection notation that conflicts with the insolvency record should be corrected or suppressed.`;
  }

  if (
    categoryMatches(category, [
      "DOCUMENTATION_CHAIN_FAILURE",
      "ORIGINAL_CREDITOR_CHAIN_FAILURE",
      "DEBT_VALIDATION_FAILURE",
      "PHANTOM_DEBT_UNVERIFIABLE",
    ])
  ) {
    return `Factual basis: ${field} depends on a verifiable chain from the original creditor to the current furnisher or collector. The bureau should verify the original contract, assignment chain, placement record, ownership authority, and itemized balance before treating the tradeline as verified.`;
  }

  if (
    categoryMatches(category, [
      "IDENTITY_THEFT_VIOLATION",
      "MIXED_FILE_PERSONAL_INFO_MISMATCH",
      "RESPONSE_ADDRESS_MISMATCH",
    ])
  ) {
    return `Factual basis: ${field} is disputed because the account, inquiry, address, or identity match may not belong to this consumer or may not have been authorized by this consumer. The bureau should verify identity matching, account-opening authorization, address history, and furnisher source records.`;
  }

  if (categoryMatches(category, ["BUREAU_ACCESS_VIOLATION", "FREEZE_PERIOD_VIOLATION"])) {
    return `Factual basis: ${field} is disputed because the inquiry, file access, or reporting event must be tied to a permissible purpose and any active freeze or access restriction. The bureau should identify the accessing party, date, purpose, and authorization record.`;
  }

  if (
    categoryMatches(category, [
      "BUREAU_INVESTIGATION_FAILURE",
      "BUREAU_NOTIFICATION_FAILURE",
      "BUREAU_DISPUTE_MARKING_FAILURE",
      "RESPONSE_MOV_MISSING",
      "RESPONSE_INCOMPLETE",
      "RESPONSE_NO_DOCUMENTATION",
      "INVESTIGATION_RUBBER_STAMP",
    ])
  ) {
    return `Factual basis: ${field} is disputed because the investigation result, notice, dispute notation, or method of verification does not show field-level review of the consumer's specific evidence. The bureau should identify the furnisher response, source records, correction decision, and method of verification.`;
  }

  if (existing) return `Factual basis: ${existing}`;

  return "Factual basis: The disputed reporting appears inaccurate, incomplete, inconsistent, or unverifiable based on the consumer disclosure and available account evidence.";
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
  const existingLower = existing.toLowerCase();
  if (
    existingLower.includes("disputed field/value:") &&
    existingLower.includes("specific issue:")
  ) {
    return existing;
  }

  const violationCategory = context.violationCategory ?? context.violationDetails?.violationCategory;
  const exactFields = describeDisputedFields(violationCategory, context.violationDetails);
  const narrativeVariables = buildViolationNarrativeTemplateVariables(context);
  const bureauSection = bureauSectionForViolation(violationCategory);
  const particulars = buildCategoryParticulars(
    violationCategory,
    narrativeVariables,
    context,
    existing
  );

  return [
    `Disputed field/value: ${narrativeVariables.disputedField} = ${narrativeVariables.reportedValue}`,
    `Expected/source-supported value: ${narrativeVariables.expectedValue}`,
    `Specific issue: ${narrativeVariables.specificIssue}`,
    `Exact disputed fields: ${exactFields}`,
    `Bureau section: ${bureauSection}`,
    particulars,
    existing && !particulars.includes(existing) ? `Consumer explanation / additional particulars: ${existing}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function evidenceItemsForViolationCategory(category: string | null | undefined): string[] {
  const normalized = categoryKey(category);

  if (
    categoryMatches(normalized, [
      "STATUTE_OF_LIMITATIONS",
      "TIME_BARRED_DEBT_COLLECTION",
      "COLLECTOR_STATUTE_REVIVAL_ATTEMPT",
      "STALE_REPORTING_FAILURE",
      "COLLECTION_LIMITATION_EXCEEDED",
      "FURNISHER_REAGING_VIOLATION",
      "TEMPORAL_MANIPULATION",
      "LAST_ACTIVITY_DATE_MANIPULATION",
      "DOFD_REPORTING",
    ])
  ) {
    return [
      "Credit report or consumer disclosure page showing the disputed tradeline, date opened, date of last payment, date of last activity, date of first delinquency, current status, and collection status.",
      "Payment records, account statements, charge-off record, assignment or placement record, and any source chronology used to support the reported dates.",
      "Any bureau case ID, file number, prior dispute correspondence, or correction history tied to the reporting-period issue.",
    ];
  }

  if (
    categoryMatches(normalized, [
      "BALANCE_CALCULATION_VIOLATION",
      "INCORRECT_BALANCE",
      "CREDIT_LIMIT_MANIPULATION",
      "CLOSED_ACCOUNT_BALANCE_INFLATION",
      "COLLECTOR_UNAUTHORIZED_FEES",
    ])
  ) {
    return [
      "Credit report or consumer disclosure page showing the exact balance, past-due amount, fee, interest, or credit-limit field being disputed.",
      "Final creditor statement, monthly statements, payment confirmations, settlement letter, payoff record, cancelled cheque, or bank record supporting the expected value.",
      "Itemized fee, interest, charge-off, collector placement, and payment-credit records used by the furnisher to calculate the reported amount.",
    ];
  }

  if (
    categoryMatches(normalized, [
      "ACCOUNT_STATUS_INCONSISTENCY",
      "FURNISHER_STATUS_CODE_MISMATCH",
      "INCORRECT_PAYMENT_STATUS",
      "PAYMENT_HISTORY_MANIPULATION",
      "RETROACTIVE_HISTORY_MANIPULATION",
    ])
  ) {
    return [
      "Credit report or consumer disclosure page showing the exact status, rating, or payment-history period being disputed.",
      "Monthly statements, payment confirmations, account closure records, creditor correspondence, and source payment chronology.",
      "Furnisher reporting history or investigation notes showing how the status and payment-history fields were verified.",
    ];
  }

  if (normalized === "BANKRUPTCY_DISCHARGE_VIOLATION") {
    return [
      "Credit report or consumer disclosure page showing the account, public-record notation, balance, status, and collection fields being disputed.",
      "Bankruptcy discharge, consumer proposal, trustee correspondence, court or insolvency records, and creditor post-discharge correspondence.",
      "Source records supporting any balance, past-due amount, collection status, or reporting date retained after the insolvency event.",
    ];
  }

  if (
    categoryMatches(normalized, [
      "DOCUMENTATION_CHAIN_FAILURE",
      "ORIGINAL_CREDITOR_CHAIN_FAILURE",
      "DEBT_VALIDATION_FAILURE",
      "PHANTOM_DEBT_UNVERIFIABLE",
    ])
  ) {
    return [
      "Credit report or consumer disclosure page showing the furnisher, collector, original creditor, ownership, and balance fields being disputed.",
      "Original contract or application, bill of sale, assignment agreement, placement record, itemized balance, and validation correspondence.",
      "Furnisher verification response or source-document description used to connect the reporting party to the alleged account.",
    ];
  }

  if (
    categoryMatches(normalized, [
      "COLLECTOR_DUPLICATE_REPORTING",
      "MULTIPLE_COLLECTOR_VIOLATION",
    ])
  ) {
    return [
      "Credit report or consumer disclosure pages showing each duplicate tradeline, collector, balance, account number, and date sequence.",
      "Original creditor records, assignment or transfer notices, collector placement records, and correspondence showing which party has current reporting authority.",
      "Balance and status records proving whether the same obligation is being reported more than once.",
    ];
  }

  if (
    categoryMatches(normalized, [
      "IDENTITY_THEFT_VIOLATION",
      "MIXED_FILE_PERSONAL_INFO_MISMATCH",
      "RESPONSE_ADDRESS_MISMATCH",
    ])
  ) {
    return [
      "Government ID and current address verification sufficient to match the consumer file without over-disclosing sensitive information.",
      "Credit report or consumer disclosure page showing the account, inquiry, address, or identity field that does not match the consumer.",
      "Police report, identity-theft statement, creditor application, inquiry authorization, address history, or account-opening records when available.",
    ];
  }

  if (categoryMatches(normalized, ["BUREAU_ACCESS_VIOLATION", "FREEZE_PERIOD_VIOLATION"])) {
    return [
      "Credit report or consumer disclosure page showing the inquiry, access event, file-freeze notation, or account reporting at issue.",
      "Freeze request, freeze confirmation, thaw authorization, permissible-purpose documentation, or correspondence with the accessing party.",
      "Bureau access logs or source records identifying who accessed the file, when, and for what stated purpose.",
    ];
  }

  if (
    categoryMatches(normalized, [
      "BUREAU_INVESTIGATION_FAILURE",
      "BUREAU_NOTIFICATION_FAILURE",
      "BUREAU_DISPUTE_MARKING_FAILURE",
      "RESPONSE_MOV_MISSING",
      "RESPONSE_INCOMPLETE",
      "RESPONSE_NO_DOCUMENTATION",
      "INVESTIGATION_RUBBER_STAMP",
    ])
  ) {
    return [
      "Original dispute letter, exhibits submitted, delivery confirmation, and the credit report or disclosure page disputed.",
      "Bureau response letter, updated disclosure, method-of-verification response, furnisher response, and correction or deletion history.",
      "Evidence showing any missing notice, missing dispute notation, incomplete response, or lack of field-level verification.",
    ];
  }

  return [
    "Credit report or consumer disclosure page showing the disputed item, exact field, reported value, and report date.",
    "Account statements, payment records, creditor correspondence, court or insolvency records, identity documents, screenshots, or other source records that support the factual basis of the dispute.",
    "Bureau or furnisher verification records, method-of-verification notes, correction history, and any documents relied on to keep reporting the item.",
  ];
}

function buildSupportingDocumentationSection(
  existingSupportingDocumentation: string | undefined,
  context: EvidentiaryStructureContext = {}
): string {
  const existing = normalizeText(existingSupportingDocumentation);
  if (existing.toLowerCase().includes("supporting evidence and attachments")) {
    return existing;
  }

  const violationCategory = context.violationCategory ?? context.violationDetails?.violationCategory;
  const evidenceItems = [
    "Consumer identification and current address verification.",
    ...evidenceItemsForViolationCategory(violationCategory),
  ];
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
    "Supporting evidence and attachments:",
    ...evidenceItems.map((item, index) => `${index + 1}. ${item}`),
    ...referenceLines.map((line) => `Reference: ${line}`),
  ].join("\n");
}

function buildApplicationToAccountSection(
  existingApplication: string | undefined,
  context: EvidentiaryStructureContext = {}
): string {
  const existing = normalizeText(existingApplication);
  if (existing) return existing;

  const violationCategory = context.violationCategory ?? context.violationDetails?.violationCategory;
  const category = categoryKey(violationCategory);
  const narrativeVariables = buildViolationNarrativeTemplateVariables(context);
  const field = narrativeVariables.disputedField;
  const reportedValue = narrativeVariables.reportedValue;
  const expectedValue = narrativeVariables.expectedValue;
  const remedy = narrativeVariables.specificRemedy;
  const common =
    `The authority above is applied to ${field} on this tradeline, reported as ${reportedValue}.`;

  if (
    categoryMatches(category, [
      "STATUTE_OF_LIMITATIONS",
      "TIME_BARRED_DEBT_COLLECTION",
      "COLLECTOR_STATUTE_REVIVAL_ATTEMPT",
      "STALE_REPORTING_FAILURE",
      "COLLECTION_LIMITATION_EXCEEDED",
    ])
  ) {
    return `${common} The bureau and furnisher must verify the date opened, date of last payment, date of last activity, date of first delinquency, and retention basis before continuing to report the item. If the chronology does not support continued reporting, or if the source dates cannot be verified, the required remedy is correction of the reporting dates and deletion or suppression of the tradeline.`;
  }

  if (
    categoryMatches(category, [
      "BALANCE_CALCULATION_VIOLATION",
      "INCORRECT_BALANCE",
      "CREDIT_LIMIT_MANIPULATION",
      "CLOSED_ACCOUNT_BALANCE_INFLATION",
      "COLLECTOR_UNAUTHORIZED_FEES",
    ])
  ) {
    return `${common} The expected or source-supported value is ${expectedValue}. The bureau should reconcile the amount against itemized source records, payments, settlement or payoff records, fees, interest, and charge-off records. If the amount cannot be verified at the field level, the unsupported balance information should be corrected, deleted, or suppressed.`;
  }

  if (category === "BANKRUPTCY_DISCHARGE_VIOLATION") {
    return `${common} The account must be checked against the insolvency event, discharge or proposal records, trustee records, and post-discharge reporting. Any balance, status, or collection field that conflicts with those records should be corrected, deleted, or suppressed if not verified.`;
  }

  if (
    categoryMatches(category, [
      "DOCUMENTATION_CHAIN_FAILURE",
      "ORIGINAL_CREDITOR_CHAIN_FAILURE",
      "DEBT_VALIDATION_FAILURE",
      "PHANTOM_DEBT_UNVERIFIABLE",
    ])
  ) {
    return `${common} Verification requires a documented chain from the original creditor to the current reporting party, plus itemized balance authority. If that chain or source documentation is not provided, the tradeline should not remain as verified and should be deleted or suppressed.`;
  }

  if (
    categoryMatches(category, [
      "IDENTITY_THEFT_VIOLATION",
      "MIXED_FILE_PERSONAL_INFO_MISMATCH",
      "RESPONSE_ADDRESS_MISMATCH",
    ])
  ) {
    return `${common} Verification requires identity matching, authorization, address history, and source account-opening records specific to this consumer. If the account, inquiry, or personal-information field cannot be matched and authorized, the disputed reporting should be blocked, corrected, deleted, or suppressed.`;
  }

  if (
    categoryMatches(category, [
      "BUREAU_INVESTIGATION_FAILURE",
      "BUREAU_NOTIFICATION_FAILURE",
      "BUREAU_DISPUTE_MARKING_FAILURE",
      "RESPONSE_MOV_MISSING",
      "RESPONSE_INCOMPLETE",
      "RESPONSE_NO_DOCUMENTATION",
      "INVESTIGATION_RUBBER_STAMP",
    ])
  ) {
    return `${common} The prior investigation or response must be reviewed at the field level against the consumer's submitted evidence. If the bureau cannot identify the furnisher, method of verification, source documents, and correction decision for this field, the item should be reinvestigated and any unsupported reporting corrected, deleted, or suppressed.`;
  }

  return `${common} ${remedy}`;
}

function buildRequestedActionSection(
  existingRequestedAction: string,
  context: EvidentiaryStructureContext = {}
): string {
  const existing = normalizeText(existingRequestedAction);
  const specificRemedy = buildViolationNarrativeTemplateVariables(context).specificRemedy;
  if (existing.toLowerCase().includes("requested correction by disputed field")) {
    if (existing.toLowerCase().includes("specific requested action:")) return existing;
    return `${existing}\nSpecific requested action: ${specificRemedy}`;
  }

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
    `Field-specific remedy: ${specificRemedy}`,
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
    applicationToAccount: buildApplicationToAccountSection(
      letterContent.applicationToAccount,
      effectiveContext
    ),
    supportingDocumentation: buildSupportingDocumentationSection(
      letterContent.supportingDocumentation,
      effectiveContext
    ),
    requestedAction: buildRequestedActionSection(letterContent.requestedAction, effectiveContext),
    statutoryTimeframe: buildTimeframeSection(letterContent.statutoryTimeframe),
    consumerStatementRight: buildConsumerStatementRight(letterContent.consumerStatementRight),
    deliveryConfirmation: buildDeliveryConfirmation(
      letterContent.deliveryConfirmation,
      letterContent.letterDate
    ),
    certification:
      normalizeText(letterContent.certification) ||
      "I certify that I am submitting this dispute in good faith and that the information provided is accurate to the best of my knowledge.",
    closing: normalizeText(letterContent.closing) || "Sincerely,",
  };
}
