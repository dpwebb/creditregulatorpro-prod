import { createHash } from "crypto";
import { sql, type Selectable } from "kysely";

import { db } from "./db";
import { BusinessRuleError } from "./endpointErrorHandler";
import { logAudit } from "./auditLogger";
import { ensureResponseDocumentSchema } from "./responseDocumentSchema";
import {
  classifyResponseDocument,
  type ResponseClassification,
  type ResponseExtractionSource,
  type ResponseProcessingResult,
  type ResponseProcessingStatus,
} from "./responseClassificationEngine";
import type {
  BureauResponseChannel,
  BureauResponseDocumentType,
  BureauResponseEvent,
  BureauResponseStatus,
  Json,
  UserRole,
} from "./schema";

export { ensureResponseDocumentSchema };

export type ResponseDocumentUser = {
  id: number;
  role: UserRole;
};

export type CaptureResponseDocumentInput = {
  userId?: number;
  packetId?: number | null;
  disputePacketFindingId?: number | null;
  findingOutcomeId?: number | null;
  comparisonRunId?: number | null;
  bureauId?: number | null;
  agencyId?: number | null;
  responseChannel: BureauResponseChannel;
  responseDocumentType: BureauResponseDocumentType;
  responseReceivedAt: Date | string;
  responseSource?: string | null;
  responseSubject?: string | null;
  responseSenderDomain?: string | null;
  responseReferenceId?: string | null;
  attachmentEvidenceId?: number | null;
  evidenceAttachmentId?: number | null;
  normalizedResponseHash?: string | null;
  responseSummary?: string | null;
  responseStatus?: BureauResponseStatus;
  rawArtifactMetadata?: Record<string, Json> | null;
  normalizedResponseMetadata?: Record<string, Json> | null;
};

export type ResponseDocumentFilters = {
  packetId?: number;
  disputePacketFindingId?: number;
  findingOutcomeId?: number;
  comparisonRunId?: number;
  bureauId?: number;
  agencyId?: number;
  responseChannel?: BureauResponseChannel;
  responseDocumentType?: BureauResponseDocumentType;
  responseStatus?: BureauResponseStatus;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
};

export type ResponseDocumentAdminReviewAction =
  | "mark_needs_review"
  | "mark_related"
  | "mark_unrelated"
  | "archive_response"
  | "link_to_packet"
  | "link_to_outcome"
  | "add_review_note";

export type UpdateResponseDocumentAdminReviewInput = {
  responseId: number;
  reviewAction: ResponseDocumentAdminReviewAction | string;
  reviewNotes?: string | null;
  packetId?: number | null;
  disputePacketFindingId?: number | null;
  comparisonRunId?: number | null;
  findingOutcomeId?: number | null;
  confirmEvidenceOnly?: boolean;
  confirmNoCanonicalChange?: boolean;
  confirmNoOutcomeClassification?: boolean;
  explicitConfirmation?: boolean;
};

export type ResponseDocumentRecord = {
  id: number;
  userId: number;
  packetId: number | null;
  disputePacketFindingId: number | null;
  findingOutcomeId: number | null;
  comparisonRunId: number | null;
  bureauId: number | null;
  agencyId: number | null;
  responseChannel: BureauResponseChannel;
  responseDocumentType: BureauResponseDocumentType;
  responseReceivedAt: Date | string;
  responseSource: string;
  responseSubject: string | null;
  responseSenderDomain: string | null;
  responseReferenceId: string | null;
  attachmentEvidenceId: number | null;
  evidenceAttachmentId: number | null;
  normalizedResponseHash: string | null;
  responseSummary: string | null;
  responseStatus: BureauResponseStatus;
  rawArtifactMetadata: Record<string, Json>;
  normalizedResponseMetadata: Record<string, Json>;
  latestProcessingEventId: number | null;
  latestProcessingStatus: ResponseProcessingStatus | "pending";
  latestClassification: ResponseClassification;
  latestClassificationConfidence: number;
  latestExtractionSource: ResponseExtractionSource;
  latestRequiresManualReview: boolean;
  latestProcessingCreatedAt: Date | string | null;
  latestProcessingEvent: ResponseProcessingEventRecord | null;
  createdBy: number | null;
  reviewedBy: number | null;
  reviewedAt: Date | string | null;
  reviewNotes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type ResponseProcessingEventRecord = {
  id: number;
  responseEventId: number;
  userId: number;
  packetId: number | null;
  disputePacketFindingId: number | null;
  findingOutcomeId: number | null;
  comparisonRunId: number | null;
  bureauId: number | null;
  agencyId: number | null;
  tradelineId: number | null;
  violationId: number | null;
  processingKind: string;
  processingStatus: ResponseProcessingStatus;
  extractionSource: ResponseExtractionSource;
  classifierRuleId: string;
  parserVersion: string;
  classification: ResponseClassification;
  classificationConfidence: number;
  confidenceThreshold: number;
  requiresManualReview: boolean;
  uncertaintyCodes: Json[];
  rawArtifactMetadata: Record<string, Json>;
  normalizedResponseMetadata: Record<string, Json>;
  deterministicExtraction: Record<string, Json>;
  fieldProvenance: Json[];
  rationale: Json[];
  regulationReferences: Json[];
  readinessImpact: Record<string, Json>;
  violationImpact: Record<string, Json>;
  idempotencyKey: string;
  normalizedResponseHash: string | null;
  originalEvidenceHash: string | null;
  fallbackRequested: boolean;
  fallbackAllowed: boolean;
  fallbackReason: string | null;
  deadLetterReason: string | null;
  createdAt: Date | string;
  createdBy: number | null;
};

const TEXT_LIMITS = {
  responseSource: 80,
  responseSubject: 240,
  responseSenderDomain: 255,
  responseReferenceId: 160,
  responseSummary: 1000,
} as const;

const FULL_SIN_PATTERN = /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/;
const FULL_ACCOUNT_PATTERN = /\b(?:account|acct|member)\s*(?:number|no\.?|#)?\s*[:#-]?\s*[A-Z0-9][A-Z0-9 -]{9,}\b|\b\d{10,}\b/i;
const RAW_OR_BODY_PATTERN = /\b(raw report text|raw pdf text|full email body|email body dump|packet body|report text dump|pdf text dump)\b/i;
const STORAGE_SECRET_PATTERN =
  /(bucket:\/\/|gs:\/\/|s3:\/\/|storage\.googleapis\.com|x-goog-signature|x-amz-signature|signedurl|signed_url|storageurl|storage_url|\/private\/|\\private\\)/i;
const SECRET_PATTERN =
  /(session=|cookie=|token=|bearer\s+[a-z0-9._-]+|api[_-]?key|private key|database_url|postgres:\/\/|mysql:\/\/|mongodb:\/\/|mailbox password|imap password|smtp password|email auth token|oauth refresh token)/i;
const LEGAL_CONCLUSION_PATTERN =
  /\b(equifax admitted fault|the bureau corrected the item|the bureau violated the law|you won|entitled to damages|this proves correction|this is legal proof|the agency must pay|confirmed legal violation|legal violation|demand|enforce)\b/i;
const REVIEW_NOTE_FORBIDDEN_PATTERN = /\b(mark corrected|mark removed|mark unchanged)\b/i;
const HASH_PATTERN = /^[a-f0-9]{32,128}$/i;
const SAFE_METADATA_KEY_PATTERN = /^[a-zA-Z0-9_.:-]{1,64}$/;
const SAFE_METADATA_MAX_DEPTH = 4;
const SAFE_METADATA_MAX_KEYS = 60;
const SAFE_METADATA_MAX_ARRAY_ITEMS = 30;

const RESPONSE_ADMIN_REVIEW_ACTIONS: ResponseDocumentAdminReviewAction[] = [
  "mark_needs_review",
  "mark_related",
  "mark_unrelated",
  "archive_response",
  "link_to_packet",
  "link_to_outcome",
  "add_review_note",
];

function isAdmin(user: ResponseDocumentUser): boolean {
  return user.role === "admin";
}

function isSupport(user: ResponseDocumentUser): boolean {
  return user.role === "support";
}

function requiredNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Expected numeric database id, received ${String(value)}`);
  return parsed;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BusinessRuleError("responseReceivedAt must be a valid date.", 400);
  }
  return date;
}

function assertSafeText(value: string, fieldName: string): string {
  if (
    FULL_SIN_PATTERN.test(value) ||
    FULL_ACCOUNT_PATTERN.test(value) ||
    RAW_OR_BODY_PATTERN.test(value) ||
    STORAGE_SECRET_PATTERN.test(value) ||
    SECRET_PATTERN.test(value) ||
    LEGAL_CONCLUSION_PATTERN.test(value)
  ) {
    throw new BusinessRuleError(`${fieldName} includes sensitive or forbidden content.`, 400);
  }
  return value;
}

function sanitizeOptionalText(
  value: string | null | undefined,
  fieldName: keyof typeof TEXT_LIMITS,
  options: { lower?: boolean } = {},
): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.length > TEXT_LIMITS[fieldName]) {
    throw new BusinessRuleError(`${fieldName} must be ${TEXT_LIMITS[fieldName]} characters or fewer.`, 400);
  }
  const safe = assertSafeText(trimmed, fieldName);
  return options.lower ? safe.toLowerCase() : safe;
}

function sanitizeSource(value: string | null | undefined): string {
  return sanitizeOptionalText(value ?? "manual_record", "responseSource") ?? "manual_record";
}

function sanitizeHash(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  if (!HASH_PATTERN.test(trimmed) || SECRET_PATTERN.test(trimmed)) {
    throw new BusinessRuleError("normalizedResponseHash must be a safe hash value.", 400);
  }
  return trimmed.toLowerCase();
}

function sanitizeMetadataValue(value: unknown, fieldPath: string, depth: number): Json {
  if (depth > SAFE_METADATA_MAX_DEPTH) {
    throw new BusinessRuleError(`${fieldPath} metadata is too deeply nested.`, 400);
  }
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new BusinessRuleError(`${fieldPath} metadata includes a non-finite number.`, 400);
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (trimmed.length > 500) {
      throw new BusinessRuleError(`${fieldPath} metadata string must be 500 characters or fewer.`, 400);
    }
    return assertSafeText(trimmed, fieldPath);
  }
  if (Array.isArray(value)) {
    if (value.length > SAFE_METADATA_MAX_ARRAY_ITEMS) {
      throw new BusinessRuleError(`${fieldPath} metadata array has too many items.`, 400);
    }
    return value.map((item, index) => sanitizeMetadataValue(item, `${fieldPath}.${index}`, depth + 1));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > SAFE_METADATA_MAX_KEYS) {
      throw new BusinessRuleError(`${fieldPath} metadata has too many keys.`, 400);
    }
    const safe: Record<string, Json> = {};
    for (const [key, nestedValue] of entries) {
      if (!SAFE_METADATA_KEY_PATTERN.test(key) || STORAGE_SECRET_PATTERN.test(key) || SECRET_PATTERN.test(key)) {
        throw new BusinessRuleError(`${fieldPath} metadata includes an unsafe key.`, 400);
      }
      safe[key] = sanitizeMetadataValue(nestedValue, `${fieldPath}.${key}`, depth + 1);
    }
    return safe;
  }
  throw new BusinessRuleError(`${fieldPath} metadata includes unsupported content.`, 400);
}

function sanitizeMetadataObject(value: Record<string, Json> | null | undefined, fieldName: string): Record<string, Json> {
  if (value === null || value === undefined) return {};
  const sanitized = sanitizeMetadataValue(value, fieldName, 0);
  if (sanitized === null || Array.isArray(sanitized) || typeof sanitized !== "object") {
    throw new BusinessRuleError(`${fieldName} must be an object.`, 400);
  }
  return sanitized as Record<string, Json>;
}

function sanitizeReviewNotes(value: string | null | undefined, required: boolean): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    if (required) throw new BusinessRuleError("Review notes are required for this action.", 400);
    return null;
  }
  if (trimmed.length > 1000) {
    throw new BusinessRuleError("Review notes must be 1000 characters or fewer.", 400);
  }
  const safe = assertSafeText(trimmed, "reviewNotes");
  if (REVIEW_NOTE_FORBIDDEN_PATTERN.test(safe)) {
    throw new BusinessRuleError("Review notes include sensitive or forbidden content.", 400);
  }
  return safe;
}

function computedHash(parts: Array<string | null>): string {
  return createHash("sha256")
    .update(parts.map((part) => part ?? "").join("|"))
    .digest("hex");
}

export function sanitizeResponseMetadata(input: CaptureResponseDocumentInput) {
  const responseReceivedAt = parseDate(input.responseReceivedAt);
  const responseSource = sanitizeSource(input.responseSource);
  const responseSubject = sanitizeOptionalText(input.responseSubject, "responseSubject");
  const responseSenderDomain = sanitizeOptionalText(input.responseSenderDomain, "responseSenderDomain", { lower: true });
  const responseReferenceId = sanitizeOptionalText(input.responseReferenceId, "responseReferenceId");
  const responseSummary = sanitizeOptionalText(input.responseSummary, "responseSummary");
  const rawArtifactMetadata = sanitizeMetadataObject(input.rawArtifactMetadata, "rawArtifactMetadata");
  const normalizedResponseMetadata = sanitizeMetadataObject(input.normalizedResponseMetadata, "normalizedResponseMetadata");
  const suppliedHash = sanitizeHash(input.normalizedResponseHash);
  const normalizedResponseHash = suppliedHash ?? computedHash([
    input.responseChannel,
    input.responseDocumentType,
    responseReceivedAt.toISOString(),
    responseSource,
    responseSenderDomain,
    responseSubject,
    responseReferenceId,
    responseSummary,
    JSON.stringify(rawArtifactMetadata),
    JSON.stringify(normalizedResponseMetadata),
  ]);

  return {
    responseReceivedAt,
    responseSource,
    responseSubject,
    responseSenderDomain,
    responseReferenceId,
    responseSummary,
    normalizedResponseHash,
    rawArtifactMetadata,
    normalizedResponseMetadata,
  };
}

function jsonRecord(value: unknown): Record<string, Json> {
  if (typeof value === "string") {
    try {
      return jsonRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return value as Record<string, Json>;
}

function jsonArray(value: unknown): Json[] {
  if (typeof value === "string") {
    try {
      return jsonArray(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? (value as Json[]) : [];
}

function toBool(value: unknown, fallback = false): boolean {
  if (value === null || value === undefined) return fallback;
  return value === true || value === "true" || value === 1 || value === "1";
}

function mapProcessingEventRow(row: any): ResponseProcessingEventRecord {
  return {
    id: requiredNumber(row.id),
    responseEventId: requiredNumber(row.responseEventId ?? row.response_event_id),
    userId: requiredNumber(row.userId ?? row.user_id),
    packetId: toNumber(row.packetId ?? row.packet_id),
    disputePacketFindingId: toNumber(row.disputePacketFindingId ?? row.dispute_packet_finding_id),
    findingOutcomeId: toNumber(row.findingOutcomeId ?? row.finding_outcome_id),
    comparisonRunId: toNumber(row.comparisonRunId ?? row.comparison_run_id),
    bureauId: toNumber(row.bureauId ?? row.bureau_id),
    agencyId: toNumber(row.agencyId ?? row.agency_id),
    tradelineId: toNumber(row.tradelineId ?? row.tradeline_id),
    violationId: toNumber(row.violationId ?? row.violation_id),
    processingKind: row.processingKind ?? row.processing_kind,
    processingStatus: row.processingStatus ?? row.processing_status,
    extractionSource: row.extractionSource ?? row.extraction_source,
    classifierRuleId: row.classifierRuleId ?? row.classifier_rule_id,
    parserVersion: row.parserVersion ?? row.parser_version,
    classification: row.classification,
    classificationConfidence: Number(row.classificationConfidence ?? row.classification_confidence ?? 0),
    confidenceThreshold: Number(row.confidenceThreshold ?? row.confidence_threshold ?? 0),
    requiresManualReview: toBool(row.requiresManualReview ?? row.requires_manual_review, true),
    uncertaintyCodes: jsonArray(row.uncertaintyCodes ?? row.uncertainty_codes),
    rawArtifactMetadata: jsonRecord(row.rawArtifactMetadata ?? row.raw_artifact_metadata),
    normalizedResponseMetadata: jsonRecord(row.normalizedResponseMetadata ?? row.normalized_response_metadata),
    deterministicExtraction: jsonRecord(row.deterministicExtraction ?? row.deterministic_extraction),
    fieldProvenance: jsonArray(row.fieldProvenance ?? row.field_provenance),
    rationale: jsonArray(row.rationale),
    regulationReferences: jsonArray(row.regulationReferences ?? row.regulation_references),
    readinessImpact: jsonRecord(row.readinessImpact ?? row.readiness_impact),
    violationImpact: jsonRecord(row.violationImpact ?? row.violation_impact),
    idempotencyKey: row.idempotencyKey ?? row.idempotency_key,
    normalizedResponseHash: row.normalizedResponseHash ?? row.normalized_response_hash ?? null,
    originalEvidenceHash: row.originalEvidenceHash ?? row.original_evidence_hash ?? null,
    fallbackRequested: toBool(row.fallbackRequested ?? row.fallback_requested),
    fallbackAllowed: toBool(row.fallbackAllowed ?? row.fallback_allowed),
    fallbackReason: row.fallbackReason ?? row.fallback_reason ?? null,
    deadLetterReason: row.deadLetterReason ?? row.dead_letter_reason ?? null,
    createdAt: row.createdAt ?? row.created_at,
    createdBy: toNumber(row.createdBy ?? row.created_by),
  };
}

function mapResponseDocument(row: Selectable<BureauResponseEvent> | any): ResponseDocumentRecord {
  return {
    id: requiredNumber(row.id),
    userId: requiredNumber(row.userId),
    packetId: toNumber(row.packetId),
    disputePacketFindingId: toNumber(row.disputePacketFindingId),
    findingOutcomeId: toNumber(row.findingOutcomeId),
    comparisonRunId: toNumber(row.comparisonRunId),
    bureauId: toNumber(row.bureauId),
    agencyId: toNumber(row.agencyId),
    responseChannel: row.responseChannel,
    responseDocumentType: row.responseDocumentType,
    responseReceivedAt: row.responseReceivedAt,
    responseSource: row.responseSource,
    responseSubject: row.responseSubject,
    responseSenderDomain: row.responseSenderDomain,
    responseReferenceId: row.responseReferenceId,
    attachmentEvidenceId: toNumber(row.attachmentEvidenceId),
    evidenceAttachmentId: toNumber(row.evidenceAttachmentId),
    normalizedResponseHash: row.normalizedResponseHash,
    responseSummary: row.responseSummary,
    responseStatus: row.responseStatus,
    rawArtifactMetadata: jsonRecord(row.rawArtifactMetadata),
    normalizedResponseMetadata: jsonRecord(row.normalizedResponseMetadata),
    latestProcessingEventId: toNumber(row.latestProcessingEventId),
    latestProcessingStatus: row.latestProcessingStatus ?? "pending",
    latestClassification: row.latestClassification ?? "unknown_manual_review",
    latestClassificationConfidence: Number(row.latestClassificationConfidence ?? 0),
    latestExtractionSource: row.latestExtractionSource ?? "deterministic",
    latestRequiresManualReview: toBool(row.latestRequiresManualReview, true),
    latestProcessingCreatedAt: row.latestProcessingCreatedAt ?? null,
    latestProcessingEvent: null,
    createdBy: toNumber(row.createdBy),
    reviewedBy: toNumber(row.reviewedBy),
    reviewedAt: row.reviewedAt,
    reviewNotes: row.reviewNotes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

type RelationshipContext = {
  userId: number;
  packetId: number | null;
  disputePacketFindingId: number | null;
  findingOutcomeId: number | null;
  comparisonRunId: number | null;
  bureauId: number | null;
  agencyId: number | null;
  tradelineId: number | null;
  violationId: number | null;
};

function addCandidate(candidates: Set<number>, value: number | null | undefined) {
  if (value !== null && value !== undefined) candidates.add(Number(value));
}

async function validateRelationships(
  input: CaptureResponseDocumentInput,
  user: ResponseDocumentUser,
): Promise<RelationshipContext> {
  if (isSupport(user)) {
    throw new BusinessRuleError("Support role cannot capture response documents.", 403);
  }

  const candidateUserIds = new Set<number>();
  if (!isAdmin(user)) addCandidate(candidateUserIds, user.id);
  if (input.userId !== undefined) addCandidate(candidateUserIds, input.userId);

  let packetId = input.packetId ?? null;
  let disputePacketFindingId = input.disputePacketFindingId ?? null;
  let findingOutcomeId = input.findingOutcomeId ?? null;
  let comparisonRunId = input.comparisonRunId ?? null;
  let bureauId = input.bureauId ?? null;
  let agencyId = input.agencyId ?? null;
  let tradelineId: number | null = null;
  let violationId: number | null = null;

  if (packetId) {
    const packet = await db
      .selectFrom("packet")
      .leftJoin("tradeline", "tradeline.id", "packet.tradelineId")
      .select([
        "packet.id",
        "packet.userId",
        "packet.bureauId",
        "packet.tradelineId",
        "packet.creditorObligationTestId",
        "tradeline.userId as tradelineUserId",
      ])
      .where("packet.id", "=", packetId)
      .executeTakeFirst();
    if (!packet) throw new BusinessRuleError("Packet not found.", 404);
    addCandidate(candidateUserIds, toNumber(packet.userId) ?? toNumber(packet.tradelineUserId));
    bureauId = bureauId ?? toNumber(packet.bureauId);
    tradelineId = tradelineId ?? toNumber(packet.tradelineId);
    violationId = violationId ?? toNumber(packet.creditorObligationTestId);
  }

  if (disputePacketFindingId) {
    const finding = await db
      .selectFrom("disputePacketFindings")
      .select(["id", "disputePacketId", "userId", "bureauId", "tradelineId", "creditorObligationTestId"])
      .where("id", "=", disputePacketFindingId)
      .executeTakeFirst();
    if (!finding) throw new BusinessRuleError("Packet finding not found.", 404);
    if (packetId && toNumber(finding.disputePacketId) !== packetId) {
      throw new BusinessRuleError("Packet finding does not belong to the supplied packet.", 400);
    }
    packetId = packetId ?? requiredNumber(finding.disputePacketId);
    addCandidate(candidateUserIds, requiredNumber(finding.userId));
    bureauId = bureauId ?? toNumber(finding.bureauId);
    tradelineId = tradelineId ?? toNumber(finding.tradelineId);
    violationId = violationId ?? toNumber(finding.creditorObligationTestId);
  }

  if (comparisonRunId) {
    const run = await db
      .selectFrom("outcomeComparisonRun")
      .select(["id", "userId", "packetId", "bureauId"])
      .where("id", "=", comparisonRunId)
      .executeTakeFirst();
    if (!run) throw new BusinessRuleError("Outcome comparison run not found.", 404);
    addCandidate(candidateUserIds, requiredNumber(run.userId));
    packetId = packetId ?? toNumber(run.packetId);
    bureauId = bureauId ?? toNumber(run.bureauId);
  }

  if (findingOutcomeId) {
    const outcome = await db
      .selectFrom("findingOutcome")
      .select([
        "id",
        "userId",
        "comparisonRunId",
        "disputePacketId",
        "disputePacketFindingId",
        "previousTradelineId",
        "creditorObligationTestId",
      ])
      .where("id", "=", findingOutcomeId)
      .executeTakeFirst();
    if (!outcome) throw new BusinessRuleError("Finding outcome not found.", 404);
    if (comparisonRunId && toNumber(outcome.comparisonRunId) !== comparisonRunId) {
      throw new BusinessRuleError("Finding outcome does not belong to the supplied comparison run.", 400);
    }
    addCandidate(candidateUserIds, requiredNumber(outcome.userId));
    comparisonRunId = comparisonRunId ?? requiredNumber(outcome.comparisonRunId);
    packetId = packetId ?? toNumber(outcome.disputePacketId);
    disputePacketFindingId = disputePacketFindingId ?? toNumber(outcome.disputePacketFindingId);
    tradelineId = tradelineId ?? toNumber(outcome.previousTradelineId);
    violationId = violationId ?? toNumber(outcome.creditorObligationTestId);
  }

  if (input.evidenceAttachmentId) {
    const attachment = await db
      .selectFrom("evidenceAttachment")
      .leftJoin("packet", "packet.id", "evidenceAttachment.packetId")
      .leftJoin("obligationInstance", "obligationInstance.id", "evidenceAttachment.obligationInstanceId")
      .leftJoin("tradeline", "tradeline.id", "obligationInstance.tradelineId")
      .select([
        "evidenceAttachment.id",
        "evidenceAttachment.uploadedBy",
        "evidenceAttachment.packetId",
        "packet.userId as packetUserId",
        "obligationInstance.userId as obligationUserId",
        "tradeline.userId as tradelineUserId",
      ])
      .where("evidenceAttachment.id", "=", input.evidenceAttachmentId)
      .executeTakeFirst();
    if (!attachment) throw new BusinessRuleError("Evidence attachment not found.", 404);
    const attachmentPacketId = toNumber(attachment.packetId);
    if (packetId && attachmentPacketId && attachmentPacketId !== packetId) {
      throw new BusinessRuleError("Evidence attachment does not belong to the supplied packet.", 400);
    }
    packetId = packetId ?? attachmentPacketId;
    const attachmentOwnerIds = [
      toNumber(attachment.packetUserId),
      toNumber(attachment.obligationUserId),
      toNumber(attachment.tradelineUserId),
    ].filter((value): value is number => value !== null);
    if (attachmentOwnerIds.length > 0) {
      attachmentOwnerIds.forEach((value) => addCandidate(candidateUserIds, value));
    } else {
      addCandidate(candidateUserIds, toNumber(attachment.uploadedBy));
    }
  }

  if (input.attachmentEvidenceId) {
    const event = await db
      .selectFrom("evidenceEvent")
      .leftJoin("packet", "packet.id", "evidenceEvent.packetId")
      .select(["evidenceEvent.id", "evidenceEvent.packetId", "packet.userId as packetUserId"])
      .where("evidenceEvent.id", "=", input.attachmentEvidenceId)
      .executeTakeFirst();
    if (!event) throw new BusinessRuleError("Evidence event not found.", 404);
    const eventPacketId = toNumber(event.packetId);
    if (packetId && eventPacketId && eventPacketId !== packetId) {
      throw new BusinessRuleError("Evidence event does not belong to the supplied packet.", 400);
    }
    packetId = packetId ?? eventPacketId;
    addCandidate(candidateUserIds, toNumber(event.packetUserId));
  }

  if (input.bureauId) {
    const bureau = await db.selectFrom("bureau").select("id").where("id", "=", input.bureauId).executeTakeFirst();
    if (!bureau) throw new BusinessRuleError("Bureau not found.", 404);
  }

  if (input.agencyId) {
    const agency = await db.selectFrom("licensedCollectionAgency").select("id").where("id", "=", input.agencyId).executeTakeFirst();
    if (!agency) throw new BusinessRuleError("Collection agency not found.", 404);
  }

  if (packetId && (!tradelineId || !violationId || !bureauId)) {
    const packet = await db
      .selectFrom("packet")
      .leftJoin("tradeline", "tradeline.id", "packet.tradelineId")
      .select([
        "packet.id",
        "packet.userId",
        "packet.bureauId",
        "packet.tradelineId",
        "packet.creditorObligationTestId",
        "tradeline.userId as tradelineUserId",
      ])
      .where("packet.id", "=", packetId)
      .executeTakeFirst();
    if (!packet) throw new BusinessRuleError("Packet not found.", 404);
    addCandidate(candidateUserIds, toNumber(packet.userId) ?? toNumber(packet.tradelineUserId));
    bureauId = bureauId ?? toNumber(packet.bureauId);
    tradelineId = tradelineId ?? toNumber(packet.tradelineId);
    violationId = violationId ?? toNumber(packet.creditorObligationTestId);
  }

  if (disputePacketFindingId && (!tradelineId || !violationId || !bureauId)) {
    const finding = await db
      .selectFrom("disputePacketFindings")
      .select(["id", "userId", "bureauId", "tradelineId", "creditorObligationTestId"])
      .where("id", "=", disputePacketFindingId)
      .executeTakeFirst();
    if (!finding) throw new BusinessRuleError("Packet finding not found.", 404);
    addCandidate(candidateUserIds, requiredNumber(finding.userId));
    bureauId = bureauId ?? toNumber(finding.bureauId);
    tradelineId = tradelineId ?? toNumber(finding.tradelineId);
    violationId = violationId ?? toNumber(finding.creditorObligationTestId);
  }

  if (candidateUserIds.size === 0) {
    if (isAdmin(user)) {
      throw new BusinessRuleError("Admin capture without a linked record requires userId.", 400);
    }
    candidateUserIds.add(user.id);
  }

  if (candidateUserIds.size > 1) {
    throw new BusinessRuleError("Response links must belong to the same user.", 400);
  }

  const responseUserId = Array.from(candidateUserIds)[0];
  if (!isAdmin(user) && responseUserId !== user.id) {
    throw new BusinessRuleError("Access denied: response document does not belong to you.", 403);
  }

  return {
    userId: responseUserId,
    packetId,
    disputePacketFindingId,
    findingOutcomeId,
    comparisonRunId,
    bureauId,
    agencyId,
    tradelineId,
    violationId,
  };
}

function assertSupportedAdminReviewAction(action: string): ResponseDocumentAdminReviewAction {
  if (!RESPONSE_ADMIN_REVIEW_ACTIONS.includes(action as ResponseDocumentAdminReviewAction)) {
    throw new BusinessRuleError("Unsupported response review action.", 400);
  }
  return action as ResponseDocumentAdminReviewAction;
}

function adminReviewNotesRequired(input: UpdateResponseDocumentAdminReviewInput): boolean {
  if (input.reviewAction === "archive_response" && input.explicitConfirmation === true) return false;
  return true;
}

function validateAdminReviewConfirmations(input: UpdateResponseDocumentAdminReviewInput): void {
  if (input.confirmEvidenceOnly !== true) {
    throw new BusinessRuleError("Confirm response documents remain evidence and metadata only.", 400);
  }
  if (input.confirmNoCanonicalChange !== true) {
    throw new BusinessRuleError("Confirm no canonical source facts will be changed.", 400);
  }
  if (input.confirmNoOutcomeClassification !== true) {
    throw new BusinessRuleError("Confirm no corrected, removed, or unchanged outcome classification will be created.", 400);
  }
  if (
    input.reviewAction === "archive_response" &&
    input.explicitConfirmation !== true &&
    !String(input.reviewNotes ?? "").trim()
  ) {
    throw new BusinessRuleError("Archive response requires notes or explicit confirmation.", 400);
  }
}

function effectiveLinks(
  response: ResponseDocumentRecord,
  input: UpdateResponseDocumentAdminReviewInput,
) {
  return {
    packetId: input.packetId ?? response.packetId,
    disputePacketFindingId: input.disputePacketFindingId ?? response.disputePacketFindingId,
    comparisonRunId: input.comparisonRunId ?? response.comparisonRunId,
    findingOutcomeId: input.findingOutcomeId ?? response.findingOutcomeId,
  };
}

function hasPacketLink(links: ReturnType<typeof effectiveLinks>): boolean {
  return links.packetId !== null || links.disputePacketFindingId !== null;
}

function hasOutcomeLink(links: ReturnType<typeof effectiveLinks>): boolean {
  return links.comparisonRunId !== null || links.findingOutcomeId !== null;
}

function responseStatusForAdminReviewAction(
  action: ResponseDocumentAdminReviewAction,
  currentStatus: BureauResponseStatus,
  links: ReturnType<typeof effectiveLinks>,
  input: UpdateResponseDocumentAdminReviewInput,
): BureauResponseStatus {
  if (action === "mark_needs_review") return "needs_review";
  if (action === "mark_unrelated") return "rejected_as_unrelated";
  if (action === "archive_response") return "archived";
  if (action === "link_to_packet") return "linked_to_packet";
  if (action === "link_to_outcome") return "linked_to_outcome";
  if (action === "mark_related") {
    if (input.packetId !== null && input.packetId !== undefined) return "linked_to_packet";
    if (input.disputePacketFindingId !== null && input.disputePacketFindingId !== undefined) return "linked_to_packet";
    if (input.comparisonRunId !== null && input.comparisonRunId !== undefined) return "linked_to_outcome";
    if (input.findingOutcomeId !== null && input.findingOutcomeId !== undefined) return "linked_to_outcome";
    return hasOutcomeLink(links) ? "linked_to_outcome" : "linked_to_packet";
  }
  return currentStatus;
}

function shouldUpdateLinks(action: ResponseDocumentAdminReviewAction): boolean {
  return action === "mark_related" || action === "link_to_packet" || action === "link_to_outcome";
}

function validateAdminReviewActionLinks(
  action: ResponseDocumentAdminReviewAction,
  links: ReturnType<typeof effectiveLinks>,
): void {
  if (action === "mark_related" && !hasPacketLink(links) && !hasOutcomeLink(links)) {
    throw new BusinessRuleError("mark_related requires at least one valid response link.", 400);
  }
  if (action === "link_to_packet" && !hasPacketLink(links)) {
    throw new BusinessRuleError("link_to_packet requires packetId or disputePacketFindingId.", 400);
  }
  if (action === "link_to_outcome" && !hasOutcomeLink(links)) {
    throw new BusinessRuleError("link_to_outcome requires comparisonRunId or findingOutcomeId.", 400);
  }
}

async function insertResponseAdminReviewEvent(
  trx: any,
  params: {
    previous: ResponseDocumentRecord;
    updated: ResponseDocumentRecord;
    reviewAction: ResponseDocumentAdminReviewAction;
    links: ReturnType<typeof effectiveLinks>;
    notes: string | null;
    actorAdminId: number;
    input: UpdateResponseDocumentAdminReviewInput;
    createdAt: Date;
  },
): Promise<void> {
  await sql`
    insert into public.response_admin_review_event (
      response_event_id,
      user_id,
      actor_admin_id,
      review_action,
      previous_response_status,
      next_response_status,
      packet_id,
      dispute_packet_finding_id,
      finding_outcome_id,
      comparison_run_id,
      review_notes_present,
      review_notes_hash,
      confirm_evidence_only,
      confirm_no_canonical_change,
      confirm_no_outcome_classification,
      explicit_confirmation,
      response_documents_remain_evidence_metadata_only,
      canonical_facts_mutated,
      outcome_classification_created,
      packet_ready_state_changed,
      packet_text_changed,
      runtime_activation,
      override_path_created,
      furnisher_flow_created,
      created_at,
      created_by
    ) values (
      ${params.updated.id},
      ${params.updated.userId},
      ${params.actorAdminId},
      ${params.reviewAction},
      ${params.previous.responseStatus},
      ${params.updated.responseStatus},
      ${params.links.packetId},
      ${params.links.disputePacketFindingId},
      ${params.links.findingOutcomeId},
      ${params.links.comparisonRunId},
      ${params.notes !== null},
      ${params.notes ? computedHash([params.notes]) : null},
      ${params.input.confirmEvidenceOnly === true},
      ${params.input.confirmNoCanonicalChange === true},
      ${params.input.confirmNoOutcomeClassification === true},
      ${params.input.explicitConfirmation === true},
      ${true},
      ${false},
      ${false},
      ${false},
      ${false},
      ${false},
      ${false},
      ${false},
      ${params.createdAt},
      ${params.actorAdminId}
    )
  `.execute(trx);
}

async function insertResponseProcessingEvent(
  trx: any,
  response: ResponseDocumentRecord,
  links: RelationshipContext,
  processing: ResponseProcessingResult,
  safe: ReturnType<typeof sanitizeResponseMetadata>,
  actorUserId: number,
): Promise<ResponseProcessingEventRecord> {
  const result = await sql<any>`
    insert into public.response_processing_event (
      response_event_id,
      user_id,
      packet_id,
      dispute_packet_finding_id,
      finding_outcome_id,
      comparison_run_id,
      bureau_id,
      agency_id,
      tradeline_id,
      violation_id,
      processing_kind,
      processing_status,
      extraction_source,
      classifier_rule_id,
      parser_version,
      classification,
      classification_confidence,
      confidence_threshold,
      requires_manual_review,
      uncertainty_codes,
      raw_artifact_metadata,
      normalized_response_metadata,
      deterministic_extraction,
      field_provenance,
      rationale,
      regulation_references,
      readiness_impact,
      violation_impact,
      idempotency_key,
      normalized_response_hash,
      original_evidence_hash,
      fallback_requested,
      fallback_allowed,
      fallback_reason,
      dead_letter_reason,
      created_by
    ) values (
      ${response.id},
      ${links.userId},
      ${links.packetId},
      ${links.disputePacketFindingId},
      ${links.findingOutcomeId},
      ${links.comparisonRunId},
      ${links.bureauId},
      ${links.agencyId},
      ${links.tradelineId},
      ${links.violationId},
      ${processing.processingKind},
      ${processing.processingStatus},
      ${processing.extractionSource},
      ${processing.classifierRuleId},
      ${processing.parserVersion},
      ${processing.classification},
      ${processing.classificationConfidence},
      ${processing.confidenceThreshold},
      ${processing.requiresManualReview},
      ${JSON.stringify(processing.uncertaintyCodes)}::jsonb,
      ${JSON.stringify(safe.rawArtifactMetadata)}::jsonb,
      ${JSON.stringify(safe.normalizedResponseMetadata)}::jsonb,
      ${JSON.stringify(processing.deterministicExtraction)}::jsonb,
      ${JSON.stringify(processing.fieldProvenance)}::jsonb,
      ${JSON.stringify(processing.rationale)}::jsonb,
      ${JSON.stringify(processing.regulationReferences)}::jsonb,
      ${JSON.stringify(processing.readinessImpact)}::jsonb,
      ${JSON.stringify(processing.violationImpact)}::jsonb,
      ${processing.idempotencyKey},
      ${processing.normalizedResponseHash},
      ${processing.originalEvidenceHash},
      ${processing.fallbackRequested},
      ${processing.fallbackAllowed},
      ${processing.fallbackReason},
      ${processing.deadLetterReason},
      ${actorUserId}
    )
    returning *
  `.execute(trx);

  const row = result.rows[0];
  if (!row) throw new BusinessRuleError("Response processing event was not created.", 500);
  return mapProcessingEventRow(row);
}

async function loadLatestProcessingEvents(responseIds: number[]): Promise<Map<number, ResponseProcessingEventRecord>> {
  if (responseIds.length === 0) return new Map();
  const result = await sql<any>`
    select distinct on (response_event_id) *
    from public.response_processing_event
    where response_event_id in (${sql.join(responseIds)})
    order by response_event_id, created_at desc, id desc
  `.execute(db);
  const map = new Map<number, ResponseProcessingEventRecord>();
  for (const row of result.rows) {
    const event = mapProcessingEventRow(row);
    map.set(event.responseEventId, event);
  }
  return map;
}

export async function captureResponseDocument(
  input: CaptureResponseDocumentInput,
  user: ResponseDocumentUser,
  request?: Request,
): Promise<ResponseDocumentRecord> {
  await ensureResponseDocumentSchema();
  const links = await validateRelationships(input, user);
  const safe = sanitizeResponseMetadata(input);
  const now = new Date();

  const { record, processing } = await db.transaction().execute(async (trx) => {
    const inserted = await trx
      .insertInto("bureauResponseEvent")
      .values({
        userId: links.userId,
        packetId: links.packetId,
        disputePacketFindingId: links.disputePacketFindingId,
        findingOutcomeId: links.findingOutcomeId,
        comparisonRunId: links.comparisonRunId,
        bureauId: links.bureauId ?? input.bureauId ?? null,
        agencyId: links.agencyId,
        responseChannel: input.responseChannel,
        responseDocumentType: input.responseDocumentType,
        responseReceivedAt: safe.responseReceivedAt,
        responseSource: safe.responseSource,
        responseSubject: safe.responseSubject,
        responseSenderDomain: safe.responseSenderDomain,
        responseReferenceId: safe.responseReferenceId,
        attachmentEvidenceId: input.attachmentEvidenceId ?? null,
        evidenceAttachmentId: input.evidenceAttachmentId ?? null,
        normalizedResponseHash: safe.normalizedResponseHash,
        responseSummary: safe.responseSummary,
        responseStatus: input.responseStatus ?? "received",
        rawArtifactMetadata: safe.rawArtifactMetadata,
        normalizedResponseMetadata: safe.normalizedResponseMetadata,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      } as any)
      .returningAll()
      .executeTakeFirstOrThrow();

    const response = mapResponseDocument(inserted as Selectable<BureauResponseEvent>);
    const processing = classifyResponseDocument({
      responseEventId: response.id,
      responseChannel: response.responseChannel,
      responseDocumentType: response.responseDocumentType,
      responseStatus: response.responseStatus,
      responseReceivedAt: response.responseReceivedAt,
      responseSource: response.responseSource,
      responseSubject: response.responseSubject,
      responseSenderDomain: response.responseSenderDomain,
      responseReferenceId: response.responseReferenceId,
      responseSummary: response.responseSummary,
      normalizedResponseHash: response.normalizedResponseHash,
      attachmentEvidenceId: response.attachmentEvidenceId,
      evidenceAttachmentId: response.evidenceAttachmentId,
      rawArtifactMetadata: safe.rawArtifactMetadata,
      normalizedResponseMetadata: safe.normalizedResponseMetadata,
      relationships: links,
    });
    const processingEvent = await insertResponseProcessingEvent(trx, response, links, processing, safe, user.id);
    const updated = await trx
      .updateTable("bureauResponseEvent")
      .set({
        latestProcessingEventId: processingEvent.id,
        latestProcessingStatus: processing.processingStatus,
        latestClassification: processing.classification,
        latestClassificationConfidence: processing.classificationConfidence,
        latestExtractionSource: processing.extractionSource,
        latestRequiresManualReview: processing.requiresManualReview,
        latestProcessingCreatedAt: processingEvent.createdAt,
        updatedAt: now,
      } as any)
      .where("id", "=", response.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      record: {
        ...mapResponseDocument(updated as Selectable<BureauResponseEvent>),
        latestProcessingEvent: processingEvent,
      },
      processing,
    };
  });

  await logAudit({
    action: "RESPONSE_RECORDED",
    entityType: "SYSTEM",
    entityId: record.id,
    userId: user.id,
    details: {
      component: "bureau_response_event",
      action: "response_captured",
      responseId: record.id,
      userId: record.userId,
      packetId: record.packetId,
      disputePacketFindingId: record.disputePacketFindingId,
      findingOutcomeId: record.findingOutcomeId,
      comparisonRunId: record.comparisonRunId,
      responseChannel: record.responseChannel,
      responseDocumentType: record.responseDocumentType,
      responseStatus: record.responseStatus,
      responseReceivedAt: record.responseReceivedAt,
      responseProcessingStatus: processing.processingStatus,
      responseClassification: processing.classification,
      responseClassificationConfidence: processing.classificationConfidence,
      responseRequiresManualReview: processing.requiresManualReview,
      deterministicExtraction: true,
      fallbackUsed: false,
      appendOnlyProcessingEventId: record.latestProcessingEventId,
      tradelineId: links.tradelineId,
      violationId: links.violationId,
      responseArtifactsRemainImmutable: true,
      responseEvidenceOverwritten: false,
      canonicalFactsMutated: false,
      violationTruthMutated: false,
      packetReadyStateChanged: false,
      createdBy: user.id,
    },
    status: "SUCCESS",
    request,
  });

  return record;
}

function applyFilters<T extends { where: (...args: any[]) => any }>(
  baseQuery: T,
  filters: ResponseDocumentFilters,
  user: ResponseDocumentUser,
): T {
  let query: any = baseQuery;
  if (!isAdmin(user)) query = query.where("userId", "=", user.id);
  if (filters.packetId !== undefined) query = query.where("packetId", "=", filters.packetId);
  if (filters.disputePacketFindingId !== undefined) query = query.where("disputePacketFindingId", "=", filters.disputePacketFindingId);
  if (filters.findingOutcomeId !== undefined) query = query.where("findingOutcomeId", "=", filters.findingOutcomeId);
  if (filters.comparisonRunId !== undefined) query = query.where("comparisonRunId", "=", filters.comparisonRunId);
  if (filters.bureauId !== undefined) query = query.where("bureauId", "=", filters.bureauId);
  if (filters.agencyId !== undefined) query = query.where("agencyId", "=", filters.agencyId);
  if (filters.responseChannel !== undefined) query = query.where("responseChannel", "=", filters.responseChannel);
  if (filters.responseDocumentType !== undefined) query = query.where("responseDocumentType", "=", filters.responseDocumentType);
  if (filters.responseStatus !== undefined) query = query.where("responseStatus", "=", filters.responseStatus);
  if (filters.startDate) query = query.where("responseReceivedAt", ">=", filters.startDate);
  if (filters.endDate) query = query.where("responseReceivedAt", "<", filters.endDate);
  return query as T;
}

export async function listResponseDocuments(
  filters: ResponseDocumentFilters,
  user: ResponseDocumentUser,
): Promise<{ responses: ResponseDocumentRecord[]; total: number }> {
  await ensureResponseDocumentSchema();
  if (isSupport(user)) throw new BusinessRuleError("Support role cannot list response documents.", 403);

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const countQuery = applyFilters(
    db.selectFrom("bureauResponseEvent").select((eb) => eb.fn.countAll<string>().as("total")),
    filters,
    user,
  );
  const count = await countQuery.executeTakeFirst();
  const total = Number(count?.total ?? 0);

  const rows = await applyFilters(
    db.selectFrom("bureauResponseEvent").selectAll().orderBy("createdAt", "desc"),
    filters,
    user,
  )
    .limit(limit)
    .offset(offset)
    .execute();
  const responses = rows.map((row) => mapResponseDocument(row as Selectable<BureauResponseEvent>));
  const processingEvents = await loadLatestProcessingEvents(responses.map((response) => response.id));
  for (const response of responses) {
    response.latestProcessingEvent = processingEvents.get(response.id) ?? null;
  }

  return {
    responses,
    total,
  };
}

export async function getResponseDocument(
  input: { responseId: number },
  user: ResponseDocumentUser,
): Promise<ResponseDocumentRecord> {
  await ensureResponseDocumentSchema();
  if (isSupport(user)) throw new BusinessRuleError("Support role cannot read response documents.", 403);

  let query = db.selectFrom("bureauResponseEvent").selectAll().where("id", "=", input.responseId);
  if (!isAdmin(user)) query = query.where("userId", "=", user.id);
  const row = await query.executeTakeFirst();
  if (!row) throw new BusinessRuleError("Response document not found.", 404);
  const response = mapResponseDocument(row as Selectable<BureauResponseEvent>);
  const processingEvents = await loadLatestProcessingEvents([response.id]);
  response.latestProcessingEvent = processingEvents.get(response.id) ?? null;
  return response;
}

export async function updateResponseDocumentAdminReview(
  input: UpdateResponseDocumentAdminReviewInput,
  user: ResponseDocumentUser,
  request?: Request,
): Promise<ResponseDocumentRecord> {
  await ensureResponseDocumentSchema();
  if (!isAdmin(user)) {
    throw new BusinessRuleError("Admin privileges required", 403);
  }

  const reviewAction = assertSupportedAdminReviewAction(input.reviewAction);
  validateAdminReviewConfirmations(input);
  const notes = sanitizeReviewNotes(input.reviewNotes, adminReviewNotesRequired(input));
  const now = new Date();

  const result = await db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom("bureauResponseEvent")
      .selectAll()
      .where("id", "=", input.responseId)
      .executeTakeFirst();
    if (!row) throw new BusinessRuleError("Response document not found.", 404);

    const response = mapResponseDocument(row as Selectable<BureauResponseEvent>);
    const links = effectiveLinks(response, input);

    if (
      input.packetId !== undefined ||
      input.disputePacketFindingId !== undefined ||
      input.comparisonRunId !== undefined ||
      input.findingOutcomeId !== undefined ||
      reviewAction === "mark_related" ||
      reviewAction === "link_to_packet" ||
      reviewAction === "link_to_outcome"
    ) {
      await validateRelationships(
        {
          userId: response.userId,
          packetId: links.packetId,
          disputePacketFindingId: links.disputePacketFindingId,
          comparisonRunId: links.comparisonRunId,
          findingOutcomeId: links.findingOutcomeId,
          bureauId: response.bureauId,
          agencyId: response.agencyId,
          responseChannel: response.responseChannel,
          responseDocumentType: response.responseDocumentType,
          responseReceivedAt: response.responseReceivedAt,
        },
        user,
      );
    }

    validateAdminReviewActionLinks(reviewAction, links);

    const nextStatus = responseStatusForAdminReviewAction(reviewAction, response.responseStatus, links, input);
    const linkPatch = shouldUpdateLinks(reviewAction)
      ? {
          packetId: links.packetId,
          disputePacketFindingId: links.disputePacketFindingId,
          comparisonRunId: links.comparisonRunId,
          findingOutcomeId: links.findingOutcomeId,
        }
      : {};

    const updated = await trx
      .updateTable("bureauResponseEvent")
      .set({
        ...linkPatch,
        responseStatus: nextStatus,
        reviewedBy: user.id,
        reviewedAt: now,
        reviewNotes: notes ?? response.reviewNotes,
        updatedAt: now,
      } as any)
      .where("id", "=", input.responseId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const updatedResponse = mapResponseDocument(updated as Selectable<BureauResponseEvent>);
    await insertResponseAdminReviewEvent(trx, {
      previous: response,
      updated: updatedResponse,
      reviewAction,
      links,
      notes,
      actorAdminId: user.id,
      input,
      createdAt: now,
    });

    return {
      previous: response,
      updated: updatedResponse,
      nextStatus,
    };
  });

  await logAudit({
    action: "UPDATE",
    entityType: "SYSTEM",
    entityId: input.responseId,
    userId: user.id,
    details: {
      component: "bureau_response_event",
      action: "response_admin_review",
      reviewAction,
      responseId: result.updated.id,
      previousResponseStatus: result.previous.responseStatus,
      newResponseStatus: result.nextStatus,
      packetId: result.updated.packetId,
      disputePacketFindingId: result.updated.disputePacketFindingId,
      comparisonRunId: result.updated.comparisonRunId,
      findingOutcomeId: result.updated.findingOutcomeId,
      responseChannel: result.updated.responseChannel,
      responseDocumentType: result.updated.responseDocumentType,
      actorAdminId: user.id,
      reviewedAt: now.toISOString(),
      reviewNotesPresent: notes !== null,
      reviewNotesHash: notes ? computedHash([notes]) : null,
      appendOnlyReviewEventWritten: true,
      responseDocumentsRemainEvidenceMetadataOnly: true,
      laterReportComparisonRequired: true,
      canonicalFactsMutated: false,
      outcomeClassificationCreated: false,
      packetReadyStateChanged: false,
      packetTextChanged: false,
      runtimeActivation: false,
      overridePathCreated: false,
      furnisherFlowCreated: false,
    },
    status: "SUCCESS",
    request,
  });

  const processingEvents = await loadLatestProcessingEvents([result.updated.id]);
  result.updated.latestProcessingEvent = processingEvents.get(result.updated.id) ?? null;
  return result.updated;
}
