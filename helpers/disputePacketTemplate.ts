import { sanitizeComplianceNeutralText } from "./violationCorrectionValidation";

export const DISPUTE_PACKET_VERSION = "simple-dispute-packet-v1" as const;

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
  metadata: {
    selectedIssueIds: number[];
    reportArtifactIds: number[];
    generatedByUserId?: number | null;
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
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
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
  if (isPlaceholder(value)) return "Account number not provided";
  const cleaned = String(value ?? "").replace(/[^A-Za-z0-9]/g, "");
  if (!cleaned || isPlaceholder(cleaned)) return "Account number not provided";
  const last = cleaned.slice(-4);
  return `Account ending ${last}`;
}

export function redactSensitiveText(value: unknown, accountNumber?: string | null): string {
  let output = value instanceof Date ? formatPacketDate(value) ?? "" : String(value ?? "");

  output = output
    .replace(/\bSIN\s*[:#]?\s*\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/gi, "SIN: [masked]")
    .replace(/\bS\.?I\.?N\.?\s*[:#]?\s*\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/gi, "SIN: [masked]")
    .replace(/\b\d{3}[-\s]\d{3}[-\s]\d{3}\b/g, "[masked SIN]");

  if (accountNumber) {
    const raw = String(accountNumber).trim();
    if (raw.length >= 4) {
      output = output.split(raw).join(maskAccountNumber(raw));
    }
    const normalized = raw.replace(/[^A-Za-z0-9]/g, "");
    if (normalized.length > 4) {
      output = output.split(normalized).join(maskAccountNumber(normalized));
    }
  }

  return output.replace(/\s+/g, " ").trim();
}

function safeValue(value: unknown, accountNumber?: string | null): string {
  if (value == null || value === "") return "Not known";
  return redactSensitiveText(value, accountNumber) || "Not known";
}

function safeFieldValue(fieldName: string | null | undefined, value: unknown, accountNumber?: string | null): string {
  const normalizedField = String(fieldName ?? "").toLowerCase();
  if (normalizedField.includes("account")) {
    return maskAccountNumber(value ?? accountNumber);
  }
  if (normalizedField.includes("sin") || normalizedField.includes("social insurance")) {
    return "[masked]";
  }
  return safeValue(value, accountNumber);
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

  if (neutralExplanation) {
    const redacted = redactSensitiveText(neutralExplanation, item.accountNumber);
    if (packetType === "credit_bureau" && sourceName) {
      return `${redacted} The disputed information appears to have been supplied by ${redactSensitiveText(sourceName)}. I am asking the Credit Bureau to investigate, verify, and correct or remove this information if it cannot be substantiated.`;
    }
    return redacted;
  }

  if (packetType === "credit_bureau" && sourceName) {
    return `The disputed information appears to have been supplied by ${redactSensitiveText(sourceName)}. I am asking the Credit Bureau to investigate, verify, and correct or remove this information if it cannot be substantiated.`;
  }

  return "This item needs review because the reported information may be incomplete, inconsistent, or unsupported by the available report data.";
}

function normalizeDisputedItem(item: SimpleDisputedItemInput, packetType: DisputePacketType): SimpleDisputedItem {
  const evidenceReference = redactSensitiveText(item.evidenceReference, item.accountNumber);
  const needsManualReview = !evidenceReference || evidenceReference.toLowerCase() === "needs manual review";
  const issueType = labelizeIssueType(item.issueType);
  const disputedField = hasText(item.disputedField)
    ? redactSensitiveText(item.disputedField)
    : "Account information";

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
    reportedValue: safeFieldValue(disputedField, item.reportedValue, item.accountNumber),
    correctedExpectedValue: safeFieldValue(disputedField, item.expectedValue, item.accountNumber),
    issueType,
    explanation: buildItemExplanation(item, packetType),
    evidenceReference: needsManualReview ? "Needs manual review" : evidenceReference,
    requestedAction: item.requestedAction ?? actionForIssue(item.issueType, packetType),
    needsManualReview,
  };
}

function buildOpening(packetType: DisputePacketType): string {
  if (packetType === "collection_agency") {
    return "I am asking for a clear review of the collection account information listed below. Please confirm the collection details and correct any information that cannot be supported.";
  }

  return "I am disputing the items listed below on my credit report. Please investigate, verify the basis for the reporting, and correct or remove any information that cannot be substantiated.";
}

function buildRequestedActionSummary(packetType: DisputePacketType): string {
  if (packetType === "collection_agency") {
    return "Please clarify the collection authority and account details, and correct or remove any information that cannot be supported.";
  }

  return "Please investigate the disputed information, verify the basis for reporting, and correct or remove inaccurate or unsupported information.";
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
    signatureLine: "Signature: ________________________________    Date: __________________",
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
