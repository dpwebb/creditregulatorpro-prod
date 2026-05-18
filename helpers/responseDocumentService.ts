import { createHash } from "crypto";
import { type Selectable } from "kysely";

import { db } from "./db";
import { BusinessRuleError } from "./endpointErrorHandler";
import { logAudit } from "./auditLogger";
import { ensureResponseDocumentSchema } from "./responseDocumentSchema";
import type {
  BureauResponseChannel,
  BureauResponseDocumentType,
  BureauResponseEvent,
  BureauResponseStatus,
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
  createdBy: number | null;
  reviewedBy: number | null;
  reviewedAt: Date | string | null;
  reviewNotes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
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
  ]);

  return {
    responseReceivedAt,
    responseSource,
    responseSubject,
    responseSenderDomain,
    responseReferenceId,
    responseSummary,
    normalizedResponseHash,
  };
}

function mapResponseDocument(row: Selectable<BureauResponseEvent>): ResponseDocumentRecord {
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

  if (packetId) {
    const packet = await db
      .selectFrom("packet")
      .leftJoin("tradeline", "tradeline.id", "packet.tradelineId")
      .select(["packet.id", "packet.userId", "packet.bureauId", "tradeline.userId as tradelineUserId"])
      .where("packet.id", "=", packetId)
      .executeTakeFirst();
    if (!packet) throw new BusinessRuleError("Packet not found.", 404);
    addCandidate(candidateUserIds, toNumber(packet.userId) ?? toNumber(packet.tradelineUserId));
    bureauId = bureauId ?? toNumber(packet.bureauId);
  }

  if (disputePacketFindingId) {
    const finding = await db
      .selectFrom("disputePacketFindings")
      .select(["id", "disputePacketId", "userId", "bureauId"])
      .where("id", "=", disputePacketFindingId)
      .executeTakeFirst();
    if (!finding) throw new BusinessRuleError("Packet finding not found.", 404);
    if (packetId && toNumber(finding.disputePacketId) !== packetId) {
      throw new BusinessRuleError("Packet finding does not belong to the supplied packet.", 400);
    }
    packetId = packetId ?? requiredNumber(finding.disputePacketId);
    addCandidate(candidateUserIds, requiredNumber(finding.userId));
    bureauId = bureauId ?? toNumber(finding.bureauId);
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
      .select(["id", "userId", "comparisonRunId", "disputePacketId", "disputePacketFindingId"])
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

export async function captureResponseDocument(
  input: CaptureResponseDocumentInput,
  user: ResponseDocumentUser,
  request?: Request,
): Promise<ResponseDocumentRecord> {
  await ensureResponseDocumentSchema();
  const links = await validateRelationships(input, user);
  const safe = sanitizeResponseMetadata(input);
  const now = new Date();

  const inserted = await db
    .insertInto("bureauResponseEvent")
    .values({
      userId: links.userId,
      packetId: links.packetId,
      disputePacketFindingId: links.disputePacketFindingId,
      findingOutcomeId: links.findingOutcomeId,
      comparisonRunId: links.comparisonRunId,
      bureauId: links.bureauId ?? input.bureauId ?? null,
      agencyId: input.agencyId ?? null,
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
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    } as any)
    .returningAll()
    .executeTakeFirstOrThrow();

  const record = mapResponseDocument(inserted as Selectable<BureauResponseEvent>);

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

  return {
    responses: rows.map((row) => mapResponseDocument(row as Selectable<BureauResponseEvent>)),
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
  return mapResponseDocument(row as Selectable<BureauResponseEvent>);
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

    return {
      previous: response,
      updated: mapResponseDocument(updated as Selectable<BureauResponseEvent>),
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
      reviewNotesSummary: notes,
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

  return result.updated;
}
