import { sanitizeComplianceNeutralText } from "./violationCorrectionValidation";
import type { EvidenceLocationSummary } from "./evidenceLocationIndex";
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
  "correct account status",
  "correct date",
  "correct personal information",
  "clarify collection authority/details",
] as const;

export type PacketRequestedAction = (typeof ALLOWED_PACKET_REQUESTED_ACTIONS)[number];

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
  evidenceReference?: string | null;
  requestedAction?: PacketRequestedAction | null;
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
  evidenceReference: string;
  requestedAction: PacketRequestedAction;
  needsManualReview: boolean;
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

function isPlaceholder(value: unknown): boolean {
  if (value == null) return true;
  return PLACEHOLDER_VALUES.has(String(value).trim().toLowerCase());
}

export function formatPacketDate(value: Date | string | null | undefined): string | null {
  return formatPacketDisplayDateOrNull(value);
}

export function labelizeIssueType(value: string | null | undefined): string {
  if (!hasText(value)) return "Reporting issue";
  return value
    .trim()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function maskAccountNumber(value: unknown): string {
  return formatPacketAccountIdentifier(value);
}

export function redactSensitiveText(value: unknown, accountNumber?: string | null): string {
  return redactPacketSensitiveText(value, accountNumber);
}

function safeFieldValue(fieldName: string | null | undefined, value: unknown, accountNumber?: string | null): string {
  return formatPacketDisplayValue(fieldName, value, accountNumber);
}

function safeAccountDisplay(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (/^Account number not provided on report$/i.test(raw)) return "Account number not provided on report";
  if (/^Account identifier unavailable$/i.test(raw)) return "Account identifier unavailable";
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
  return redactSensitiveText(raw);
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

export function actionForIssue(issueType: string | null | undefined, packetType: DisputePacketType): PacketRequestedAction {
  const normalized = String(issueType ?? "").toUpperCase();

  if (packetType === "collection_agency") {
    return "clarify collection authority/details";
  }
  if (normalized.includes("BALANCE") || normalized.includes("PAYMENT")) {
    return "correct balance";
  }
  if (normalized.includes("DUPLICATE") || normalized.includes("MULTIPLE_COLLECTOR")) {
    return "correct duplicate account";
  }
  if (normalized.includes("STATUS") || normalized.includes("MOP")) {
    return "correct account status";
  }
  if (normalized.includes("DATE") || normalized.includes("REAGING") || normalized.includes("TEMPORAL")) {
    return "correct date";
  }
  if (normalized.includes("STALE")) {
    return "update stale information";
  }
  if (normalized.includes("MIXED_FILE") || normalized.includes("PERSONAL_INFO") || normalized.includes("IDENTITY")) {
    return "correct personal information";
  }
  if (normalized.includes("UNSUPPORTED") || normalized.includes("UNVERIFIABLE") || normalized.includes("DOCUMENTATION")) {
    return "remove unsupported information";
  }

  return "verify and provide basis";
}

function buildItemExplanation(item: SimpleDisputedItemInput, packetType: DisputePacketType): string {
  const neutralExplanation = sanitizeComplianceNeutralText(item.explanation) ?? null;
  const sourceName = hasText(item.sourceFurnisherName) ? item.sourceFurnisherName.trim() : null;
  const explanationPrefix = neutralExplanation
    ? `${redactSensitiveText(neutralExplanation, item.accountNumber)} `
    : "";
  const sourceSentence = packetType === "credit_bureau" && sourceName
    ? `The company identified in the report is ${redactSensitiveText(sourceName)}. `
    : "";
  const verificationRequest =
    "I am asking you to verify whether this information is accurate, complete, and supported by the records used to report this account.";

  if (packetType === "collection_agency") {
    return `${explanationPrefix}${verificationRequest} Please provide documentation showing your authority to collect or report this account, including the original creditor, balance claimed, account dates, and supporting records. If the information cannot be supported, please correct it or remove it from my credit report.`;
  }

  return `${explanationPrefix}${sourceSentence}${verificationRequest} Please investigate this item with the company that supplied the information and provide the basis for any information you continue to report. If the information cannot be verified, please correct it or remove it from my credit report.`;
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

  return {
    issueId: item.issueId ?? null,
    tradelineId: item.tradelineId ?? null,
    creditorCollectorName: isPlaceholder(item.creditorCollectorName)
      ? "Company listed on report"
      : redactSensitiveText(item.creditorCollectorName),
    sourceFurnisherName: isPlaceholder(item.sourceFurnisherName)
      ? null
      : redactSensitiveText(item.sourceFurnisherName),
    maskedAccountNumber: maskAccountNumber(item.accountNumber),
    disputedField,
    reportedValue: safeFieldValue(rawDisputedField, item.reportedValue, item.accountNumber),
    correctedExpectedValue: formatPacketExpectedValue(rawDisputedField, item.expectedValue, item.accountNumber),
    issueType,
    explanation: buildItemExplanation(item, packetType),
    evidenceReference: needsManualReview ? "Needs manual review" : evidenceReference,
    requestedAction: item.requestedAction ?? actionForIssue(item.issueType, packetType),
    needsManualReview,
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
      lines.push(redactSensitiveText(value));
    }
  }
}

function buildItemLetterBlock(item: SimpleDisputedItem, packet: SimpleDisputePacketContent): string[] {
  const fieldLabel = safeLetterFieldLabel(item.disputedField);
  const accountDisplay = safeAccountDisplay(item.maskedAccountNumber);
  const reportedValue = formatPacketDisplayValue(fieldLabel, item.reportedValue, item.maskedAccountNumber);
  const requestedResult = hasReliableExpectedValue(item.correctedExpectedValue)
    ? `Expected value: ${redactSensitiveText(item.correctedExpectedValue)}`
    : PACKET_REQUESTED_RESULT_FALLBACK;

  return [
    "Disputed Account",
    `Company reporting the account: ${redactSensitiveText(item.creditorCollectorName)}`,
    `Account: ${accountDisplay}`,
    `Information disputed: ${fieldLabel}`,
    `Reported value: ${reportedValue}`,
    requestedResult,
    "",
    "Reason for dispute:",
    redactSensitiveText(item.explanation, item.maskedAccountNumber),
    "",
    "Requested action:",
    redactSensitiveText(packet.requestedActionSummary),
  ];
}

export function buildConsumerDisputePacketLetterText(packet: SimpleDisputePacketContent): string {
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
  lines.push(redactSensitiveText(packet.openingParagraph) || "I am writing to dispute the following information on my credit report.");
  lines.push("");

  for (const item of packet.disputedItems) {
    lines.push(...buildItemLetterBlock(item, packet));
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
    reportType: redactSensitiveText(input.reportType),
    reportDate: formatPacketDate(input.reportDate) ?? null,
    dateGenerated: formatPacketDate(input.dateGenerated ?? new Date()) ?? formatPacketDate(new Date())!,
    recipient: {
      type: input.recipient.type,
      name: redactSensitiveText(input.recipient.name),
      address: input.recipient.address.map((line) => redactSensitiveText(line)).filter(Boolean),
    },
    consumer: {
      name: redactSensitiveText(input.consumer.name),
      address: input.consumer.address.map((line) => redactSensitiveText(line)).filter(Boolean),
      phone: input.consumer.phone ? redactSensitiveText(input.consumer.phone) : null,
      email: input.consumer.email ? redactSensitiveText(input.consumer.email) : null,
    },
    openingParagraph: buildOpening(input.packetType),
    disputedItems,
    requestedActionSummary: buildRequestedActionSummary(input.packetType),
    evidenceList,
    attachmentChecklist: buildAttachmentChecklist(disputedItems),
    signatureLine: `Sincerely,\n\n________________________________\n${redactSensitiveText(input.consumer.name)}`,
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
