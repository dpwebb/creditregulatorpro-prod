import { sanitizeComplianceNeutralText } from "./violationCorrectionValidation";
import type { EvidenceLocationSummary } from "./evidenceLocationIndex";
import { plainDisputeLetterReasonFor } from "./disputeLetterReason";
import { dedupeNarrativeText } from "./packetNarrative";
import {
  canonicalDisputeIntentFor,
  disputeIntentArchetypeFor,
  type CanonicalDisputeIntent,
} from "./disputeIntent";
import {
  PACKET_REQUESTED_RESULT_FALLBACK,
  formatPacketAccountIdentifier,
  formatPacketConsumerEvidenceReference,
  formatPacketDisplayDateOrNull,
  formatPacketDisplayValue,
  formatPacketExpectedValue,
  formatPacketFieldLabel,
  redactPacketSensitiveText,
} from "./disputePacketHumanization";

export const DISPUTE_PACKET_VERSION = "simple-dispute-packet-v1" as const;
export const DISPUTE_PACKET_CONSUMER_SUBJECT =
  "Request to investigate and correct credit report information";

export const DISPUTE_PACKET_TYPES = [
  "credit_bureau",
  "collection_agency",
] as const;

export type DisputePacketType = (typeof DISPUTE_PACKET_TYPES)[number];

export const ALLOWED_PACKET_REQUESTED_ACTIONS = [
  "correct inaccurate information",
  "remove unsupported information",
  "verify and provide basis",
  "update stale information",
  "correct duplicate account",
  "correct balance",
  "correct payment history",
  "correct account status",
  "correct date",
  "correct personal information",
  "clarify collection authority/details",
] as const;

export type PacketRequestedAction = (typeof ALLOWED_PACKET_REQUESTED_ACTIONS)[number];

export const PACKET_NARRATIVE_DISPUTE_CATEGORIES = [
  "FIELD_ACCURACY",
  "UNSUPPORTED_REPORTING",
  "POSSIBLE_OBSOLETE_OR_STALE_REPORTING",
  "MISSING_ACCOUNT_IDENTIFIER",
  "ACCOUNT_NOT_RECOGNIZED",
  "IDENTITY_OR_ALIAS_MISMATCH",
  "COLLECTION_OR_DEFAULT_STATUS",
  "BALANCE_OR_STATUS_ACCURACY",
  "DUPLICATE_OR_CONFLICTING_ACCOUNT",
  "GENERAL_ACCURACY",
  "UNKNOWN",
] as const;

export type PacketNarrativeDisputeCategory = (typeof PACKET_NARRATIVE_DISPUTE_CATEGORIES)[number];

export const PACKET_NARRATIVE_CAUTION_LEVELS = [
  "NORMAL",
  "CAUTIOUS",
  "NEEDS_REVIEW",
] as const;

export type PacketNarrativeCautionLevel = (typeof PACKET_NARRATIVE_CAUTION_LEVELS)[number];

export interface PacketNarrative {
  disputeIntent?: CanonicalDisputeIntent;
  disputeCategory: PacketNarrativeDisputeCategory;
  cautionLevel: PacketNarrativeCautionLevel;
  issueSummary: string;
  factualBasis: string[];
  consumerAssertion: string;
  verificationRequests: string[];
  requestedRemedies: string[];
  evidenceReferences: string[];
  readinessWarnings: string[];
  readinessBlockers: string[];
  internalReference?: string | null;
  externalReferenceDisplay?: string | null;
}

export interface SimplePacketRecipient {
  type: "credit_bureau" | "collection_agency";
  name: string;
  address: string[];
}

export interface SimplePacketConsumer {
  name: string;
  address: string[];
  phone?: string | null;
  email?: string | null;
}

export interface SimpleDisputedItemInput {
  issueId?: number | null;
  tradelineId?: number | null;
  creditorCollectorName: string | null;
  sourceFurnisherName?: string | null;
  accountNumber?: string | null;
  disputedField?: string | null;
  reportedValue?: string | number | Date | null;
  expectedValue?: string | number | Date | null;
  issueType: string | null;
  explanation?: string | null;
  findingReason?: string | null;
  findingRecommendedAction?: string | null;
  evidenceReference?: string | null;
  requestedAction?: PacketRequestedAction | null;
  narrative?: PacketNarrative | null;
}

export interface SimpleDisputedItem {
  issueId: number | null;
  tradelineId: number | null;
  creditorCollectorName: string;
  sourceFurnisherName: string | null;
  maskedAccountNumber: string;
  disputedField: string;
  reportedValue: string;
  correctedExpectedValue: string;
  issueType: string;
  explanation: string;
  findingReason: string | null;
  findingRecommendedAction: string | null;
  evidenceReference: string;
  requestedAction: PacketRequestedAction;
  needsManualReview: boolean;
  narrative: PacketNarrative | null;
}

export interface SimpleDisputePacketContent {
  version: typeof DISPUTE_PACKET_VERSION;
  packetType: DisputePacketType;
  title: string;
  reportType: string;
  reportDate: string | null;
  dateGenerated: string;
  recipient: SimplePacketRecipient;
  consumer: SimplePacketConsumer;
  openingParagraph: string;
  disputedItems: SimpleDisputedItem[];
  requestedActionSummary: string;
  evidenceList: string[];
  attachmentChecklist: string[];
  signatureLine: string;
  evidenceLocations?: Record<string, EvidenceLocationSummary[]>;
  metadata: {
    selectedIssueIds: number[];
    reportArtifactIds: number[];
    generatedByUserId?: number | null;
    internalReferences?: Array<{
      findingId: number;
      violationId: number;
      tradelineId: number | null;
      reportArtifactId: number | null;
      evidenceIds: string[];
      regulationIds: string[];
      ruleIds: string[];
      fieldKey?: string | null;
      sourceField?: string | null;
      readiness?: Record<string, unknown>;
    }>;
  };
  signatureImage?: string | null;
  consumerIdentificationImage?: string | null;
  consumerIdentificationFileName?: string | null;
}

export interface BuildSimpleDisputePacketInput {
  packetType: DisputePacketType;
  reportType: string;
  reportDate?: Date | string | null;
  dateGenerated?: Date | string | null;
  recipient: SimplePacketRecipient;
  consumer: SimplePacketConsumer;
  disputedItems: SimpleDisputedItemInput[];
  reportArtifactIds?: Array<number | null | undefined>;
  generatedByUserId?: number | null;
}

const PLACEHOLDER_VALUES = new Set([
  "",
  "unknown",
  "unknown account",
  "unknown creditor",
  "unknown collector",
  "not reported",
  "not provided",
  "not available",
  "n/a",
  "na",
  "-",
]);

function hasText(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return value.trim().length > 0;
}

function sentenceKey(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isPlaceholder(value: unknown): boolean {
  if (value == null) return true;
  return PLACEHOLDER_VALUES.has(String(value).trim().toLowerCase());
}

export function formatPacketDate(value: Date | string | null | undefined): string | null {
  return formatPacketDisplayDateOrNull(value);
}

export function labelizeIssueType(value: string | null | undefined): string {
  if (!hasText(value)) return "Reporting issue";
  const intent = canonicalDisputeIntentFor({ issueType: value });
  if (intent !== "GENERAL_ACCURACY_REVIEW") {
    return disputeIntentArchetypeFor(intent).label;
  }
  const normalized = value
    .trim()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();

  if (/documentation chain failure|verification integrity failure/.test(normalized)) {
    return "Verification issue";
  }
  if (/chain integrity concern/.test(normalized)) {
    return "Ownership or reporting support issue";
  }
  if (/regulatory reference|raw reference|metadata concern/.test(normalized)) {
    return "Reporting review detail";
  }

  return normalized
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function maskAccountNumber(value: unknown): string {
  return formatPacketAccountIdentifier(value);
}

export function redactSensitiveText(value: unknown, accountNumber?: string | null): string {
  return redactPacketSensitiveText(value, accountNumber);
}

function safeLetterText(value: unknown, accountNumber?: string | null): string {
  return redactSensitiveText(value, accountNumber)
    .replace(/\bsource\s+report\b/gi, "credit report")
    .replace(/\breport\s+artifact\b/gi, "credit report")
    .replace(/\bartifact\b/gi, "credit report")
    .replace(/\s+/g, " ")
    .trim();
}

function safeFieldValue(fieldName: string | null | undefined, value: unknown, accountNumber?: string | null): string {
  return formatPacketDisplayValue(fieldName, value, accountNumber);
}

function safeAccountDisplay(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (/^Account number not provided on report$/i.test(raw)) return "Account number not shown on report";
  if (/^Account identifier unavailable$/i.test(raw)) return "Account number not shown on report";
  return maskAccountNumber(raw);
}

function safeLetterFieldLabel(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "Account information";
  if (
    /[_:./-]/.test(raw) ||
    /[a-z][A-Z]/.test(raw) ||
    /artifact|tradeline|reference|rule\s*id/i.test(raw)
  ) {
    return formatPacketFieldLabel(raw);
  }
  return safeLetterText(raw);
}

function hasReliableExpectedValue(value: unknown): value is string {
  const raw = String(value ?? "").trim();
  const normalized = raw.toLowerCase();
  return Boolean(raw) &&
    normalized !== PACKET_REQUESTED_RESULT_FALLBACK.toLowerCase() &&
    normalized !== "information not provided on report" &&
    normalized !== "account number not provided on report" &&
    normalized !== "account identifier unavailable";
}

function isDefaultVerificationText(value: unknown): boolean {
  const normalized = String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return normalized ===
    "i am asking you to verify whether this information is accurate complete and supported by the records used to report this account" ||
    normalized ===
    "i am asking you to verify whether this collection account information is accurate complete and supported by records showing the authority to collect or report this account";
}

interface ConsumerSafeFindingTextOptions {
  rejectLowValueReason?: boolean;
}

function isLowValueReasonText(value: unknown): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return true;

  if (
    /\braw\s+reference\b/i.test(raw) ||
    /\bfield\s*:/i.test(raw) ||
    /\brule\s*id\b/i.test(raw) ||
    /\bmetadata\b/i.test(raw) ||
    /\b(?:reportArtifactId|sourceReportArtifactId|tradelineId|referenceId|fieldKey|sourceField)\b/i.test(raw)
  ) {
    return true;
  }

  const normalized = raw.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const fillerOnly = normalized
    .replace(/\b(?:raw|the|from|source|credit|report|item|applicable|reporting|requirements?|reference|supporting|rule|code|regulation)\b/g, "")
    .trim();

  if (!fillerOnly && /(?:reference|requirements?|rule|code|regulation)/i.test(raw)) {
    return true;
  }

  if (/^[A-Z]{2,}(?:_[A-Z0-9]+)+$/.test(raw.replace(/\s+/g, ""))) {
    return true;
  }

  return /\bsource\s+report\b/i.test(raw) &&
    (raw.length <= 160 || /\b(?:page|field)\b|#\s*\d+/i.test(raw)) &&
    !/\b(?:does not|doesn't|incorrect|inaccurate|mismatch|not match|reported as|shown as|records show|appears)\b/i.test(raw);
}

function consumerSafeFindingText(
  value: unknown,
  accountNumber?: string | null,
  options: ConsumerSafeFindingTextOptions = {},
): string | null {
  const neutral = typeof value === "string" ? sanitizeComplianceNeutralText(value) : null;
  if (!neutral || isDefaultVerificationText(neutral)) return null;
  if (options.rejectLowValueReason && isLowValueReasonText(neutral)) return null;

  let output = safeLetterText(neutral, accountNumber)
    .replace(/\bDocumentation Chain Failure\b/gi, "verification issue")
    .replace(/\bVerification Integrity Failure\b/gi, "verification issue")
    .replace(/\bRegulatory Reference\b/gi, "reporting reference")
    .replace(/\bChain Integrity Concern\b/gi, "ownership or reporting support issue")
    .replace(/\bRaw reference\b/gi, "supporting reference")
    .replace(/\bMetadata concern\b/gi, "supporting detail")
    .replace(/\b[A-Z]{2,}(?:_[A-Z0-9]+)+\b/g, "the applicable reporting reference")
    .replace(/\b(?:PIPEDA|FCRA)\b/gi, "the applicable reporting reference")
    .replace(/\blegal action\b/gi, "reporting review")
    .replace(/\bstatut(?:e|ory)\b/gi, "reporting rule")
    .replace(/\bsubsection\b/gi, "supporting reference")
    .replace(/\bsection\s+\d+[A-Za-z0-9().-]*\b/gi, "supporting reference")
    .replace(/\b(?:report\s+)?artifact\s*#?\s*\d+\b/gi, "credit report")
    .replace(/\bcredit\s+report\s*#\s*\d+\b/gi, "credit report")
    .replace(/\b(?:reportArtifactId|sourceReportArtifactId|tradelineId|referenceId|fieldKey|sourceField)\s*:?\s*[A-Za-z0-9_.-]+/gi, "")
    .replace(/\bfield\s*:\s*[^;.]+[;.]?/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();

  output = output.replace(/^(expected|corrected expected value)\s*:\s*not known\.?$/i, "").trim();
  if (!output || isDefaultVerificationText(output)) return null;
  if (/^(not known|information not provided on report|requested result: verify the correct information)/i.test(output)) {
    return null;
  }
  if (options.rejectLowValueReason && isLowValueReasonText(output)) return null;
  return output;
}

export interface PacketActionIssueContext {
  disputedField?: string | null;
  violationCategory?: string | null;
  disputeVector?: string | null;
}

function normalizedActionText(...values: Array<string | null | undefined>): string {
  return values
    .filter(hasText)
    .join(" ")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function actionTextHasAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

export function actionForIssue(
  issueType: string | null | undefined,
  packetType: DisputePacketType,
  context: PacketActionIssueContext = {},
): PacketRequestedAction {
  const intent = canonicalDisputeIntentFor({
    issueType,
    violationCategory: context.violationCategory,
    disputeVector: context.disputeVector,
    disputedField: context.disputedField,
    packetType,
  });
  if (intent !== "GENERAL_ACCURACY_REVIEW") {
    const requestedAction = disputeIntentArchetypeFor(intent).requestedAction;
    return packetType === "collection_agency"
      ? "clarify collection authority/details"
      : requestedAction as PacketRequestedAction;
  }

  const issueText = normalizedActionText(issueType, context.violationCategory, context.disputeVector);
  const fieldText = normalizedActionText(context.disputedField);
  const combinedText = normalizedActionText(issueText, fieldText);

  if (packetType === "collection_agency") {
    return "clarify collection authority/details";
  }
  if (
    actionTextHasAny(combinedText, [
      "PAYMENT HISTORY",
      "PAYMENT STATUS",
      "PAYMENT RECORD",
      "LATE PAYMENT",
      "LATE PAYMENTS",
      "DELINQUENT PAYMENT",
    ]) ||
    /\bPAYMENT\b/.test(issueText)
  ) {
    return "correct payment history";
  }
  if (
    actionTextHasAny(issueText, ["BALANCE", "AMOUNT PAST DUE", "PAST DUE", "AMOUNT DUE", "CREDIT LIMIT"]) ||
    actionTextHasAny(fieldText, ["BALANCE", "AMOUNT PAST DUE", "PAST DUE", "AMOUNT DUE", "CREDIT LIMIT"])
  ) {
    return "correct balance";
  }
  if (actionTextHasAny(issueText, ["DUPLICATE", "MULTIPLE COLLECTOR"])) {
    return "correct duplicate account";
  }
  if (
    actionTextHasAny(combinedText, [
      "DATE",
      "REAGING",
      "RE AGING",
      "TEMPORAL",
      "LAST REPORTED",
      "DATE OPENED",
      "OPENED DATE",
      "DATE CLOSED",
      "CLOSED DATE",
      "REPORTING PERIOD",
    ])
  ) {
    return "correct date";
  }
  if (actionTextHasAny(combinedText, ["STATUS", "OPEN", "CLOSED", "MOP"])) {
    return "correct account status";
  }
  if (actionTextHasAny(issueText, ["STALE", "REPORTING PERIOD", "OBSOLETE"])) {
    return "update stale information";
  }
  if (actionTextHasAny(issueText, ["MIXED FILE", "PERSONAL INFO", "PERSONAL INFORMATION", "IDENTITY"])) {
    return "correct personal information";
  }
  if (actionTextHasAny(issueText, ["UNSUPPORTED", "UNVERIFIABLE", "DOCUMENTATION"])) {
    return "remove unsupported information";
  }

  return "verify and provide basis";
}

function buildItemExplanation(item: SimpleDisputedItemInput, packetType: DisputePacketType): string {
  const verificationRequest =
    "I am asking you to verify whether this information is accurate, complete, and supported by the records used to report this account.";
  const neutralExplanation = sanitizeComplianceNeutralText(item.explanation) ?? null;
  const explanationText = neutralExplanation ? safeLetterText(neutralExplanation, item.accountNumber) : "";
  const explanationPrefix = explanationText && explanationText !== verificationRequest
    ? `${explanationText} `
    : "";

  if (packetType === "collection_agency") {
    return `${explanationPrefix}${verificationRequest} If the information cannot be supported, please correct it or remove it from my credit report.`;
  }

  return `${explanationPrefix}${verificationRequest} If the information cannot be verified, please correct it or remove it from my credit report.`;
}

function sanitizeNarrativeList(values: unknown, accountNumber?: string | null): string[] {
  if (!Array.isArray(values)) return [];
  return dedupeNarrativeText(
    values
      .map((value) => safeLetterText(value, accountNumber))
      .filter(Boolean),
  );
}

function sanitizePacketNarrative(
  narrative: PacketNarrative | null | undefined,
  accountNumber?: string | null,
): PacketNarrative | null {
  if (!narrative) return null;
  const disputeCategory = PACKET_NARRATIVE_DISPUTE_CATEGORIES.includes(narrative.disputeCategory)
    ? narrative.disputeCategory
    : "UNKNOWN";
  const cautionLevel = PACKET_NARRATIVE_CAUTION_LEVELS.includes(narrative.cautionLevel)
    ? narrative.cautionLevel
    : "NEEDS_REVIEW";

  return {
    disputeIntent: narrative.disputeIntent,
    disputeCategory,
    cautionLevel,
    issueSummary: safeLetterText(narrative.issueSummary, accountNumber),
    factualBasis: sanitizeNarrativeList(narrative.factualBasis, accountNumber),
    consumerAssertion: safeLetterText(narrative.consumerAssertion, accountNumber),
    verificationRequests: sanitizeNarrativeList(narrative.verificationRequests, accountNumber),
    requestedRemedies: sanitizeNarrativeList(narrative.requestedRemedies, accountNumber),
    evidenceReferences: sanitizeNarrativeList(narrative.evidenceReferences, accountNumber),
    readinessWarnings: sanitizeNarrativeList(narrative.readinessWarnings, accountNumber),
    readinessBlockers: sanitizeNarrativeList(narrative.readinessBlockers, accountNumber),
    internalReference: narrative.internalReference ?? null,
    externalReferenceDisplay: narrative.externalReferenceDisplay
      ? safeLetterText(narrative.externalReferenceDisplay, accountNumber)
      : null,
  };
}

function normalizeDisputedItem(item: SimpleDisputedItemInput, packetType: DisputePacketType): SimpleDisputedItem {
  const rawDisputedField = hasText(item.disputedField)
    ? item.disputedField
    : "Account information";
  const disputedField = formatPacketFieldLabel(rawDisputedField);
  const evidenceReference = formatPacketConsumerEvidenceReference({
    evidenceReference: item.evidenceReference,
    fieldName: rawDisputedField,
    accountNumber: item.accountNumber,
  });
  const needsManualReview = !evidenceReference || evidenceReference.toLowerCase() === "needs manual review";
  const issueType = labelizeIssueType(item.issueType);
  const narrative = sanitizePacketNarrative(item.narrative, item.accountNumber);
  const findingReason = consumerSafeFindingText(item.findingReason ?? item.explanation, item.accountNumber, {
    rejectLowValueReason: true,
  });
  const findingRecommendedAction = consumerSafeFindingText(item.findingRecommendedAction, item.accountNumber, {
    rejectLowValueReason: true,
  });

  return {
    issueId: item.issueId ?? null,
    tradelineId: item.tradelineId ?? null,
    creditorCollectorName: isPlaceholder(item.creditorCollectorName)
      ? "Company listed on report"
      : safeLetterText(item.creditorCollectorName),
    sourceFurnisherName: isPlaceholder(item.sourceFurnisherName)
      ? null
      : safeLetterText(item.sourceFurnisherName),
    maskedAccountNumber: maskAccountNumber(item.accountNumber),
    disputedField,
    reportedValue: safeFieldValue(rawDisputedField, item.reportedValue, item.accountNumber),
    correctedExpectedValue: formatPacketExpectedValue(rawDisputedField, item.expectedValue, item.accountNumber),
    issueType,
    explanation: buildItemExplanation(item, packetType),
    findingReason,
    findingRecommendedAction,
    evidenceReference: needsManualReview ? "Needs manual review" : evidenceReference,
    requestedAction: item.requestedAction ?? actionForIssue(item.issueType, packetType, {
      disputedField,
    }),
    needsManualReview,
    narrative,
  };
}

function buildOpening(packetType: DisputePacketType): string {
  void packetType;
  return "I am writing to dispute the following information on my credit report.";
}

function buildRequestedActionSummary(packetType: DisputePacketType): string {
  if (packetType === "collection_agency") {
    return "Please provide documentation showing your authority to collect or report this account, including the original creditor, balance claimed, account dates, and supporting records, and correct or remove any information that cannot be substantiated.";
  }

  return "Please investigate this item with the company that supplied the information, provide the basis for any information you continue to report, and correct or remove any information that cannot be substantiated.";
}

function buildAttachmentChecklist(items: SimpleDisputedItem[]): string[] {
  const checklist = [
    "Copy of this dispute packet",
    "Copy of the relevant credit report page or source report section",
    "Consumer identification, if required by the recipient",
  ];

  if (items.some((item) => item.needsManualReview)) {
    checklist.push("Manual evidence review for any item marked Needs manual review");
  }

  return checklist;
}

function pushNonEmpty(lines: string[], ...values: Array<string | null | undefined>): void {
  for (const value of values) {
    if (value && value.trim()) {
      lines.push(safeLetterText(value));
    }
  }
}

function pushSection(lines: string[], title: string, values: string[]): void {
  if (values.length === 0) return;
  lines.push("");
  lines.push(title);
  lines.push(...values.map((value) => `- ${safeLetterText(value)}`));
}

function hasDisplayValue(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return Boolean(normalized) &&
    !PLACEHOLDER_VALUES.has(normalized) &&
    normalized !== "information not provided on report" &&
    normalized !== PACKET_REQUESTED_RESULT_FALLBACK.toLowerCase();
}

function normalizedReadableText(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isBalanceDisplayField(value: unknown): boolean {
  const normalized = normalizedReadableText(value);
  return normalized.includes("balance") || normalized.includes("amount owing") || normalized.includes("amount due");
}

function isDateOrActivityDisplayField(value: unknown): boolean {
  const normalized = normalizedReadableText(value);
  return (
    normalized.includes("date") ||
    normalized.includes("last reported") ||
    normalized.includes("activity") ||
    normalized.includes("last payment") ||
    normalized.includes("opened") ||
    normalized.includes("closed") ||
    normalized.includes("delinquency")
  );
}

function narrativeFactValue(item: SimpleDisputedItem, terms: string[]): string | null {
  const facts = item.narrative?.factualBasis ?? [];
  for (const fact of facts) {
    const match = fact.match(/^The report shows\s+([^:]+):\s*(.+)\.$/i);
    if (!match) continue;
    const label = normalizedReadableText(match[1]);
    if (!terms.some((term) => label.includes(term))) continue;
    const value = safeLetterText(match[2], item.maskedAccountNumber);
    if (hasDisplayValue(value)) return value;
  }
  return null;
}

function consumerIssueLabel(item: SimpleDisputedItem): string {
  if (item.narrative?.disputeIntent) {
    return disputeIntentArchetypeFor(item.narrative.disputeIntent).label;
  }

  const issueType = safeLetterText(item.issueType, item.maskedAccountNumber)
    .replace(/\bStatute Of Limitations\b/gi, "Reporting period")
    .replace(/\bStatute\b/gi, "Reporting")
    .replace(/\bViolation\b/gi, "issue")
    .replace(/\s+/g, " ")
    .trim();
  return issueType || "Reporting issue";
}

function requestedActionSentenceForItem(item: SimpleDisputedItem): string {
  if (item.narrative?.disputeIntent) {
    return disputeIntentArchetypeFor(item.narrative.disputeIntent).bureauActionSentence;
  }

  switch (item.requestedAction) {
    case "correct balance":
      return "Please investigate the reported balance and correct it, or remove the item if it cannot be verified.";
    case "correct payment history":
      return "Please investigate the reported payment history and correct it, or remove the item if it cannot be verified.";
    case "correct account status":
      return "Please investigate the account status and correct it, or remove the item if it cannot be verified.";
    case "correct date":
      return "Please investigate the reported date information and correct it, or remove the item if it cannot be verified.";
    case "update stale information":
      return "Please investigate whether this item should continue to appear on the current report, and update or remove it if it cannot be verified.";
    case "correct duplicate account":
      return "Please investigate whether this account is duplicated and correct or remove any duplicate reporting.";
    case "correct personal information":
      return "Please investigate whether this information belongs on my credit file and correct or remove it if it cannot be verified.";
    case "remove unsupported information":
      return "Please remove this information if the records supporting it cannot be verified.";
    case "clarify collection authority/details":
      return "Please verify the collection authority and account details, and correct or remove any information that cannot be supported.";
    case "correct inaccurate information":
      return "Please investigate and correct any inaccurate or incomplete information.";
    case "verify and provide basis":
    default:
      return "Please investigate this item, provide the basis for any information that remains, and correct or remove it if it cannot be verified.";
  }
}

interface CreditBureauReasonBlock {
  reasonTitle: string;
  specificReason: string;
  explanation: string;
  requestedAction: string;
  evidenceSentence: string | null;
}

function evidenceSentenceForReasonBlock(item: SimpleDisputedItem): string | null {
  const evidenceReference = consumerSafeFindingText(item.evidenceReference, item.maskedAccountNumber);
  if (evidenceReference && evidenceReference.toLowerCase() !== "needs manual review") {
    return evidenceReference;
  }

  const narrativeEvidence = item.narrative?.evidenceReferences
    .map((value) => consumerSafeFindingText(value, item.maskedAccountNumber))
    .find((value): value is string => Boolean(value));
  if (narrativeEvidence) return narrativeEvidence;

  const fieldLabel = safeLetterFieldLabel(item.disputedField);
  const reportedValue = safeLetterText(
    formatPacketDisplayValue(fieldLabel, item.reportedValue, item.maskedAccountNumber),
    item.maskedAccountNumber,
  );
  if (hasDisplayValue(reportedValue)) {
    return `The report shows ${fieldLabel}: ${reportedValue}.`;
  }

  return null;
}

function fallbackSpecificReasonForItem(item: SimpleDisputedItem, accountName: string, explanation: string): string {
  const intent = item.narrative?.disputeIntent ?? canonicalDisputeIntentFor({
    issueType: item.issueType,
    disputedField: item.disputedField,
    disputeCategory: item.narrative?.disputeCategory,
  });
  const archetype = disputeIntentArchetypeFor(intent);
  if (intent !== "GENERAL_ACCURACY_REVIEW") return archetype.consumerNarrative;

  const fieldLabel = safeLetterFieldLabel(item.disputedField);
  const explanationText = safeLetterText(explanation, item.maskedAccountNumber);

  if (!/^account information$/i.test(fieldLabel)) {
    return `I dispute the ${fieldLabel} information for ${accountName}. ${explanationText}`.trim();
  }

  return `I dispute the ${consumerIssueLabel(item).toLowerCase()} for ${accountName}. ${explanationText}`.trim();
}

function buildCreditBureauReasonBlock(item: SimpleDisputedItem): CreditBureauReasonBlock {
  const accountName = safeLetterText(item.creditorCollectorName, item.maskedAccountNumber) || "Company listed on report";
  const issueLabel = consumerIssueLabel(item);
  const intent = item.narrative?.disputeIntent ?? canonicalDisputeIntentFor({
    issueType: item.issueType,
    disputedField: item.disputedField,
    disputeCategory: item.narrative?.disputeCategory,
  });
  const archetype = disputeIntentArchetypeFor(intent);
  const explanation = intent === "GENERAL_ACCURACY_REVIEW"
    ? plainDisputeLetterReasonFor({
        issueType: item.issueType,
        requestedAction: item.requestedAction,
        disputedField: item.disputedField,
        narrative: item.narrative,
      })
    : archetype.consumerNarrative;

  return {
    reasonTitle: `${accountName}: ${issueLabel}`,
    specificReason: fallbackSpecificReasonForItem(item, accountName, explanation),
    explanation: explanation === archetype.consumerNarrative ? "" : explanation,
    requestedAction: item.findingRecommendedAction ?? requestedActionSentenceForItem(item),
    evidenceSentence: evidenceSentenceForReasonBlock(item),
  };
}

function pushCreditBureauReasonBlock(lines: string[], item: SimpleDisputedItem): void {
  const block = buildCreditBureauReasonBlock(item);
  lines.push("");
  lines.push("Why I am disputing this item:");
  lines.push(`Account reviewed: ${safeLetterText(block.reasonTitle, item.maskedAccountNumber)}`);
  lines.push(`Specific dispute reason: ${safeLetterText(block.specificReason, item.maskedAccountNumber)}`);
  const explanation = safeLetterText(block.explanation, item.maskedAccountNumber);
  if (explanation && sentenceKey(explanation) !== sentenceKey(block.specificReason)) {
    lines.push(`Plain-language explanation: ${explanation}`);
  }
  lines.push(`Requested bureau action: ${safeLetterText(block.requestedAction, item.maskedAccountNumber)}`);
  if (block.evidenceSentence) {
    lines.push(`Evidence or mismatch reference: ${safeLetterText(block.evidenceSentence, item.maskedAccountNumber)}`);
  }
}

function reportedBalanceForPlainLetter(item: SimpleDisputedItem): string | null {
  const reportedValue = safeLetterText(
    formatPacketDisplayValue(item.disputedField, item.reportedValue, item.maskedAccountNumber),
    item.maskedAccountNumber,
  );
  if (isBalanceDisplayField(item.disputedField) && hasDisplayValue(reportedValue)) return reportedValue;
  return narrativeFactValue(item, ["balance", "amount owing", "amount due"]);
}

function reportedDateForPlainLetter(item: SimpleDisputedItem): string | null {
  const fieldLabel = safeLetterFieldLabel(item.disputedField);
  const reportedValue = safeLetterText(
    formatPacketDisplayValue(fieldLabel, item.reportedValue, item.maskedAccountNumber),
    item.maskedAccountNumber,
  );
  if (isDateOrActivityDisplayField(fieldLabel) && hasDisplayValue(reportedValue)) {
    return `${fieldLabel}: ${reportedValue}`;
  }
  const narrativeDate = narrativeFactValue(item, [
    "date last reported",
    "date reported",
    "last activity",
    "opened date",
    "closed date",
    "date of first delinquency",
    "date of last payment",
  ]);
  return narrativeDate;
}

function buildNarrativeLetterBlock(item: SimpleDisputedItem, packet: SimpleDisputePacketContent): string[] {
  const narrative = item.narrative;
  if (!narrative) return [];
  const lines = [
    "Reason for dispute:",
    safeLetterText(narrative.issueSummary, item.maskedAccountNumber),
    safeLetterText(narrative.consumerAssertion, item.maskedAccountNumber),
  ].filter(Boolean);

  pushSection(lines, "Factual basis:", narrative.factualBasis);
  pushSection(lines, "Verification requested:", narrative.verificationRequests);
  pushSection(lines, "Requested remedies:", narrative.requestedRemedies);
  pushSection(lines, "Evidence references:", narrative.evidenceReferences);
  pushSection(lines, "Readiness warnings:", narrative.readinessWarnings);
  pushSection(lines, "Readiness blockers:", narrative.readinessBlockers);

  if (lines.length === 0) {
    return [
      "Reason for dispute:",
      safeLetterText(item.explanation, item.maskedAccountNumber),
      "",
      "Requested action:",
      safeLetterText(packet.requestedActionSummary),
    ];
  }

  return lines;
}

export function buildConsumerDisputePacketItemLines(
  item: SimpleDisputedItem,
  packet: SimpleDisputePacketContent,
): string[] {
  const fieldLabel = safeLetterFieldLabel(item.disputedField);
  const accountDisplay = safeAccountDisplay(item.maskedAccountNumber);
  const reportedValue = formatPacketDisplayValue(fieldLabel, item.reportedValue, item.maskedAccountNumber);
  const requestedResult = hasReliableExpectedValue(item.correctedExpectedValue)
    ? `Expected value: ${redactSensitiveText(item.correctedExpectedValue)}`
    : PACKET_REQUESTED_RESULT_FALLBACK;

  const headerLines = [
    "Disputed Account",
    `Company reporting the account: ${safeLetterText(item.creditorCollectorName)}`,
    `Account: ${accountDisplay}`,
    `Information disputed: ${fieldLabel}`,
    `Reported value: ${reportedValue}`,
    requestedResult,
  ];

  if (item.narrative) {
    return [...headerLines, "", ...buildNarrativeLetterBlock(item, packet)];
  }

  return [
    ...headerLines,
    "",
    "Reason for dispute:",
    safeLetterText(item.explanation, item.maskedAccountNumber),
    "",
    "Requested action:",
    safeLetterText(packet.requestedActionSummary),
  ];
}

function buildCreditBureauDisputePacketItemLines(item: SimpleDisputedItem): string[] {
  const accountDisplay = safeAccountDisplay(item.maskedAccountNumber);
  const balance = reportedBalanceForPlainLetter(item);
  const reportedDate = reportedDateForPlainLetter(item);
  const lines = [
    "The account in question is:",
    "",
    `Creditor/Reporter: ${safeLetterText(item.creditorCollectorName)}`,
    `Account Number: ${accountDisplay}`,
  ];

  if (balance) lines.push(`Reported Balance: ${balance}`);
  if (reportedDate) lines.push(`Date Reported / Last Activity: ${reportedDate}`);

  pushCreditBureauReasonBlock(lines, item);

  return lines;
}

function buildCreditBureauDisputePacketLetterText(packet: SimpleDisputePacketContent): string {
  const reportDatePhrase = packet.reportDate ? ` dated ${safeLetterText(packet.reportDate)}` : "";
  const lines: string[] = [];

  pushNonEmpty(lines, packet.consumer.name, ...packet.consumer.address);
  if (packet.consumer.phone) lines.push(`Phone: ${safeLetterText(packet.consumer.phone)}`);
  if (packet.consumer.email) lines.push(`Email: ${safeLetterText(packet.consumer.email)}`);

  lines.push("");
  pushNonEmpty(lines, packet.dateGenerated);
  lines.push("");
  pushNonEmpty(lines, packet.recipient.name, ...packet.recipient.address);
  lines.push("");
  lines.push("Subject: Dispute of Credit Report Information");
  lines.push("");
  lines.push("To Whom It May Concern,");
  lines.push("");
  lines.push(
    `I am writing to dispute information appearing on my credit report${reportDatePhrase}. I am asking that this item be reviewed and corrected or removed if it cannot be verified as accurate.`,
  );
  lines.push("");

  for (const item of packet.disputedItems) {
    lines.push(...buildCreditBureauDisputePacketItemLines(item));
    lines.push("");
  }

  lines.push(
    "Please investigate this item and update my credit file accordingly. If the information cannot be verified as accurate and complete, I request that it be corrected or removed from my credit report.",
    "",
    "Please send me written confirmation of the results of your investigation and provide an updated copy of my credit report if a correction is made.",
    "",
    "Sincerely,",
  );
  pushNonEmpty(lines, packet.consumer.name);

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function buildConsumerDisputePacketLetterText(packet: SimpleDisputePacketContent): string {
  if (packet.packetType === "credit_bureau") {
    return buildCreditBureauDisputePacketLetterText(packet);
  }

  const lines: string[] = [];

  pushNonEmpty(lines, packet.dateGenerated);
  lines.push("");
  pushNonEmpty(lines, packet.recipient.name, ...packet.recipient.address);
  lines.push("");
  lines.push(`Re: ${DISPUTE_PACKET_CONSUMER_SUBJECT}`);
  lines.push("");
  lines.push("Consumer:");
  pushNonEmpty(
    lines,
    packet.consumer.name,
    ...packet.consumer.address,
    packet.consumer.phone ? `Phone: ${packet.consumer.phone}` : null,
    packet.consumer.email ? `Email: ${packet.consumer.email}` : null,
  );
  lines.push("");
  lines.push("Credit report reviewed:");
  pushNonEmpty(lines, packet.reportType);
  lines.push(`Report date: ${packet.reportDate ?? "Information not provided on report"}`);
  lines.push("");
  lines.push(safeLetterText(packet.openingParagraph) || "I am writing to dispute the following information on my credit report.");
  lines.push("");

  for (const item of packet.disputedItems) {
    lines.push(...buildConsumerDisputePacketItemLines(item, packet));
    lines.push("");
  }

  lines.push("Sincerely,");
  lines.push("");
  lines.push("________________________________");
  pushNonEmpty(lines, packet.consumer.name);

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function buildSimpleDisputePacketContent(input: BuildSimpleDisputePacketInput): SimpleDisputePacketContent {
  const disputedItems = input.disputedItems.map((item) => normalizeDisputedItem(item, input.packetType));
  const evidenceList = Array.from(
    new Set(disputedItems.map((item) => item.evidenceReference || "Needs manual review"))
  );
  const selectedIssueIds = input.disputedItems
    .map((item) => item.issueId)
    .filter((id): id is number => typeof id === "number" && Number.isFinite(id));
  const reportArtifactIds = Array.from(
    new Set(
      (input.reportArtifactIds ?? [])
        .filter((id): id is number => typeof id === "number" && Number.isFinite(id))
        .map((id) => Number(id))
    )
  );

  return {
    version: DISPUTE_PACKET_VERSION,
    packetType: input.packetType,
    title:
      input.packetType === "collection_agency"
        ? "Collection Agency Clarification/Dispute Packet"
        : "Credit Bureau Dispute Packet",
    reportType: safeLetterText(input.reportType),
    reportDate: formatPacketDate(input.reportDate) ?? null,
    dateGenerated: formatPacketDate(input.dateGenerated ?? new Date()) ?? formatPacketDate(new Date())!,
    recipient: {
      type: input.recipient.type,
      name: safeLetterText(input.recipient.name),
      address: input.recipient.address.map((line) => safeLetterText(line)).filter(Boolean),
    },
    consumer: {
      name: safeLetterText(input.consumer.name),
      address: input.consumer.address.map((line) => safeLetterText(line)).filter(Boolean),
      phone: input.consumer.phone ? safeLetterText(input.consumer.phone) : null,
      email: input.consumer.email ? safeLetterText(input.consumer.email) : null,
    },
    openingParagraph: buildOpening(input.packetType),
    disputedItems,
    requestedActionSummary: buildRequestedActionSummary(input.packetType),
    evidenceList,
    attachmentChecklist: buildAttachmentChecklist(disputedItems),
    signatureLine: `Sincerely,\n\n________________________________\n${safeLetterText(input.consumer.name)}`,
    metadata: {
      selectedIssueIds,
      reportArtifactIds,
      generatedByUserId: input.generatedByUserId ?? null,
    },
  };
}

export function isSimpleDisputePacketContent(value: unknown): value is SimpleDisputePacketContent {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { version?: unknown }).version === DISPUTE_PACKET_VERSION &&
    DISPUTE_PACKET_TYPES.includes((value as { packetType?: DisputePacketType }).packetType as DisputePacketType) &&
    Array.isArray((value as { disputedItems?: unknown }).disputedItems)
  );
}
