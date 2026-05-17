import { sql, type Selectable } from "kysely";

import {
  compareOutcomeSnapshots,
  sanitizeEvidenceLocationSnapshot,
  type ComparisonScope,
  type FindingOutcomeResult,
  type OutcomeComparisonInput,
  type OutcomeComparisonResult,
  type OutcomeComparisonSummary,
  type PacketFindingComparisonSnapshot,
  type ReportComparisonSnapshot,
  type ResponseComparisonSnapshot,
  type TradelineComparisonSnapshot,
} from "./outcomeComparison";
import { db } from "./db";
import { BusinessRuleError } from "./endpointErrorHandler";
import { logAudit } from "./auditLogger";
import type {
  FindingOutcome,
  FindingOutcomeConfidenceLevel,
  FindingOutcomeMatchingMethod,
  FindingOutcomeType,
  Json,
  OutcomeComparisonRun,
  OutcomeComparisonScope,
  OutcomeComparisonStatus,
  UserRole,
} from "./schema";
import { ensureOutcomeTrackingSchema } from "./outcomeTrackingSchema";

export { ensureOutcomeTrackingSchema };

export type OutcomeTrackingUser = {
  id: number;
  role: UserRole;
};

export type OutcomeComparisonRunStatus = OutcomeComparisonStatus;

export type CreateOutcomeComparisonRunInput = {
  previousReportArtifactId: number;
  laterReportArtifactId?: number | null;
  packetId?: number | null;
  comparisonScope: ComparisonScope;
  creditorObligationTestIds?: number[];
  disputePacketFindingIds?: number[];
  response?: ResponseComparisonSnapshot | null;
};

export type OutcomeListFilters = {
  packetId?: number;
  previousReportArtifactId?: number;
  laterReportArtifactId?: number;
  outcomeType?: FindingOutcomeType;
  status?: OutcomeComparisonStatus;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
};

export type PersistedFindingOutcome = {
  id: number;
  comparisonRunId: number;
  userId: number;
  disputePacketId: number | null;
  disputePacketFindingId: number | null;
  creditorObligationTestId: number | null;
  previousTradelineId: number | null;
  laterTradelineId: number | null;
  outcomeType: FindingOutcomeType;
  confidenceLevel: FindingOutcomeConfidenceLevel;
  matchingMethod: FindingOutcomeMatchingMethod;
  outcomeReasonCodes: Json;
  previousSnapshot: Json | null;
  laterSnapshot: Json | null;
  evidenceIds: Json;
  evidenceLocationSnapshot: Json;
  responseDeadlineAt: Date | string | null;
  responseReceivedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type OutcomeRunSummary = {
  id: number;
  userId: number;
  previousReportArtifactId: number;
  laterReportArtifactId: number | null;
  packetId: number | null;
  bureauId: number | null;
  comparisonScope: OutcomeComparisonScope;
  status: OutcomeComparisonStatus;
  sourceVersion: string;
  warnings: Json;
  createdBy: number | null;
  startedAt: Date | string;
  completedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  summary: OutcomeComparisonSummary;
};

export type OutcomeComparisonRunDetail = OutcomeRunSummary & {
  findingOutcomes: PersistedFindingOutcome[];
};

const SOURCE_VERSION = "outcome-comparison-v1";

const SENSITIVE_KEY_PATTERN =
  /(raw|snippet|text|pdf|packet.*body|content|storage|bucket|path|url|token|cookie|secret|api.?key|private.?key|database|authorization|accountNumber|sin|socialInsurance)/i;
const SENSITIVE_VALUE_PATTERN =
  /(\b\d{3}[- ]?\d{3}[- ]?\d{3}\b|sk-[a-z0-9_-]+|x-goog-signature|signature=|token=|session=|cookie=|postgres:\/\/|database_url|private key|api[_-]?key|raw report text|raw pdf text|storage bucket|bucket:\/\/)/i;

function isAdmin(user: OutcomeTrackingUser): boolean {
  return user.role === "admin";
}

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? null)) as Json;
}

function asJsonArray(value: unknown): Json {
  return Array.isArray(value) ? (JSON.parse(JSON.stringify(value)) as Json) : ([] as unknown as Json);
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requiredNumber(value: unknown): number {
  const parsed = toNumber(value);
  if (parsed === null) throw new Error(`Expected numeric database id, received ${String(value)}`);
  return parsed;
}

function dateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function idText(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function normalizeIdentifier(value: unknown): string {
  return String(value ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

function accountSuffix(value: unknown): string | null {
  const normalized = normalizeIdentifier(value);
  return normalized ? normalized.slice(-4) : null;
}

function sanitizeString(value: string): string | null {
  if (SENSITIVE_VALUE_PATTERN.test(value)) return null;
  return value.length > 160 ? `${value.slice(0, 157)}...` : value;
}

export function sanitizeOutcomeSnapshot(value: unknown): Json | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return sanitizeString(value) as Json | null;
  if (typeof value === "number" || typeof value === "boolean") return value as Json;
  if (value instanceof Date) return value.toISOString() as Json;
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeOutcomeSnapshot(item))
      .filter((item) => item !== null && item !== undefined) as Json;
  }
  if (typeof value !== "object") return null;

  const output: Record<string, Json> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    const sanitized = sanitizeOutcomeSnapshot(raw);
    if (sanitized !== null && sanitized !== undefined) output[key] = sanitized;
  }
  return output as Json;
}

function normalizeParserQuality(data: unknown, processingStatus: string | null): ReportComparisonSnapshot["parserQuality"] {
  const object = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const rawQuality = object.parserQuality && typeof object.parserQuality === "object"
    ? (object.parserQuality as Record<string, unknown>)
    : {};
  const confidence =
    toNumber(rawQuality.confidence) ??
    toNumber(rawQuality.confidenceScore) ??
    toNumber(object.extractionConfidence) ??
    toNumber(object.parseConfidence);
  const requiresManualReview = rawQuality.requiresManualReview === true;
  const reasonCodes = Array.isArray(rawQuality.reasonCodes)
    ? rawQuality.reasonCodes.map(String)
    : Array.isArray(rawQuality.issues)
      ? rawQuality.issues.map((issue) =>
          issue && typeof issue === "object" && "code" in issue ? String((issue as { code: unknown }).code) : "PARSER_QUALITY_ISSUE",
        )
      : [];

  return {
    packetReady: !requiresManualReview && processingStatus !== "failed",
    canonicalReady: !requiresManualReview && processingStatus !== "failed",
    ...(confidence !== null ? { confidence } : {}),
    ...(reasonCodes.length > 0 ? { reasonCodes } : {}),
  };
}

function reportBureauFromData(data: unknown): string | null {
  const object = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const rawQuality = object.parserQuality && typeof object.parserQuality === "object"
    ? (object.parserQuality as Record<string, unknown>)
    : {};
  const value = object.bureauName ?? object.sourceBureauName ?? rawQuality.sourceBureauName;
  return typeof value === "string" ? value : null;
}

type LoadedReportArtifact = {
  id: number;
  userId: number;
  artifactType: string | null;
  reportDate: Date | string | null;
  processingStatus: string | null;
  data: Json | null;
};

async function loadReportArtifact(id: number): Promise<LoadedReportArtifact> {
  const row = (await db
    .selectFrom("reportArtifact")
    .select([
      "id",
      "userId",
      "artifactType",
      "reportDate",
      "processingStatus",
      "data",
    ])
    .where("id", "=", id)
    .executeTakeFirst()) as LoadedReportArtifact | undefined;

  if (!row) throw new BusinessRuleError("Report artifact not found", 404);
  if (row.userId === null || row.userId === undefined) {
    throw new BusinessRuleError("Report artifact has no owner", 400);
  }
  return row;
}

async function loadReportTradelines(reportArtifactId: number): Promise<TradelineComparisonSnapshot[]> {
  const rows = await db
    .selectFrom("tradeline")
    .leftJoin("bureau", "bureau.id", "tradeline.bureauId")
    .leftJoin("creditor", "creditor.id", "tradeline.creditorId")
    .select([
      "tradeline.id",
      "tradeline.accountNumber",
      "tradeline.accountType",
      "tradeline.openedDate",
      "tradeline.dateClosed",
      "tradeline.status",
      "tradeline.balance",
      "tradeline.currentBalance",
      "tradeline.amountPastDue",
      "tradeline.creditLimit",
      "tradeline.dateOfFirstDelinquency",
      "tradeline.dateOfLastPayment",
      "tradeline.collectionAgencyName",
      "tradeline.originalCreditorName",
      "creditor.name as creditorName",
      "bureau.name as bureauName",
    ])
    .where("tradeline.reportArtifactId", "=", reportArtifactId)
    .orderBy("tradeline.id", "asc")
    .execute();

  return rows.map((row) => {
    const maskedAccountNumber = row.accountNumber ? `Account ending ${accountSuffix(row.accountNumber) ?? "unknown"}` : null;
    return {
      tradelineId: row.id,
      bureau: row.bureauName ?? null,
      creditorName: row.creditorName ?? row.originalCreditorName ?? row.collectionAgencyName ?? null,
      originalCreditorName: row.originalCreditorName ?? null,
      collectionAgencyName: row.collectionAgencyName ?? null,
      accountType: row.accountType ?? null,
      maskedAccountNumber,
      accountSuffix: accountSuffix(row.accountNumber),
      openDate: row.openedDate ? String(row.openedDate) : null,
      closeDate: row.dateClosed ? String(row.dateClosed) : null,
      status: row.status ?? null,
      balance: row.balance === null ? null : Number(row.balance),
      currentBalance: row.currentBalance === null ? null : Number(row.currentBalance),
      amountPastDue: row.amountPastDue === null ? null : Number(row.amountPastDue),
      creditLimit: row.creditLimit === null ? null : Number(row.creditLimit),
      dateOfFirstDelinquency: row.dateOfFirstDelinquency ? String(row.dateOfFirstDelinquency) : null,
      lastPaymentDate: row.dateOfLastPayment ? String(row.dateOfLastPayment) : null,
    };
  });
}

async function buildReportSnapshot(report: Awaited<ReturnType<typeof loadReportArtifact>>): Promise<ReportComparisonSnapshot> {
  const tradelines = await loadReportTradelines(report.id);
  return {
    reportArtifactId: report.id,
    userId: report.userId,
    bureau: reportBureauFromData(report.data) ?? tradelines.find((line) => line.bureau)?.bureau ?? null,
    reportDate: report.reportDate ? String(report.reportDate) : null,
    reportType: report.artifactType ?? null,
    parserQuality: normalizeParserQuality(report.data, report.processingStatus),
    tradelines,
  };
}

async function loadPacket(packetId: number) {
  const packet = await db
    .selectFrom("packet")
    .leftJoin("tradeline", "tradeline.id", "packet.tradelineId")
    .select([
      "packet.id",
      "packet.userId",
      "packet.bureauId",
      "packet.tradelineId",
      "packet.creditorObligationTestId",
      "packet.sentDate",
      "packet.bureauResponseDate",
      "packet.responseType",
      "packet.deliveryMethod",
      "packet.trackingNumber",
      "tradeline.userId as tradelineUserId",
    ])
    .where("packet.id", "=", packetId)
    .executeTakeFirst();

  if (!packet) throw new BusinessRuleError("Packet not found", 404);
  return packet;
}

function jsonArrayAsStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter((item) => !SENSITIVE_VALUE_PATTERN.test(item));
}

function targetFieldsFromPacketItemSnapshot(value: unknown): string[] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const object = value as Record<string, unknown>;
  const direct = object.targetFields;
  if (Array.isArray(direct)) return direct.map(String).filter(Boolean);
  const candidates = [
    object.disputedField,
    object.field,
    object.fieldName,
    object.targetField,
  ]
    .map((field) => (typeof field === "string" ? field : null))
    .filter((field): field is string => Boolean(field));
  return candidates.length > 0 ? candidates : undefined;
}

async function loadPacketFindings(params: {
  packetId: number;
  packet: Awaited<ReturnType<typeof loadPacket>>;
  creditorObligationTestIds?: number[];
  disputePacketFindingIds?: number[];
}): Promise<PacketFindingComparisonSnapshot[]> {
  let query = db
    .selectFrom("disputePacketFindings")
    .selectAll()
    .where("disputePacketId", "=", params.packetId);

  if (params.creditorObligationTestIds && params.creditorObligationTestIds.length > 0) {
    query = query.where("creditorObligationTestId", "in", params.creditorObligationTestIds);
  }
  if (params.disputePacketFindingIds && params.disputePacketFindingIds.length > 0) {
    query = query.where("id", "in", params.disputePacketFindingIds);
  }

  const rows = await query.orderBy("id", "asc").execute();

  if (rows.length === 0 && params.packet.tradelineId) {
    return [
      {
        disputePacketId: params.packetId,
        disputePacketFindingId: null,
        creditorObligationTestId: params.packet.creditorObligationTestId ?? null,
        previousTradelineId: params.packet.tradelineId,
        targetFields: undefined,
        expectedCorrectionDirection: "any_supported_change",
        evidenceIds: [],
        evidenceLocationSnapshot: [],
        readinessSnapshot: {},
        packetItemSnapshot: { legacyPacket: true, packetId: params.packetId },
      },
    ];
  }

  return rows.map((row) => ({
    disputePacketId: row.disputePacketId,
    disputePacketFindingId: row.id,
    creditorObligationTestId: row.creditorObligationTestId,
    previousTradelineId: row.tradelineId,
    targetFields: targetFieldsFromPacketItemSnapshot(row.packetItemSnapshot),
    expectedCorrectionDirection: "any_supported_change",
    evidenceIds: jsonArrayAsStrings(row.evidenceIds),
    evidenceLocationSnapshot: sanitizeEvidenceLocationSnapshot(row.evidenceLocationSnapshot),
    readinessSnapshot: sanitizeOutcomeSnapshot(row.readinessSnapshot),
    packetItemSnapshot: sanitizeOutcomeSnapshot(row.packetItemSnapshot),
  }));
}

export async function buildOutcomeComparisonInputFromArtifacts(
  input: CreateOutcomeComparisonRunInput,
  user: OutcomeTrackingUser,
): Promise<{ comparisonInput: OutcomeComparisonInput; outcomeUserId: number; bureauId: number | null; packet: Awaited<ReturnType<typeof loadPacket>> | null }> {
  const previousReport = await loadReportArtifact(input.previousReportArtifactId);
  const outcomeUserId = previousReport.userId;

  if (!isAdmin(user) && user.id !== outcomeUserId) {
    throw new BusinessRuleError("Access denied: report artifact does not belong to you.", 403);
  }

  const laterReport = input.laterReportArtifactId
    ? await loadReportArtifact(input.laterReportArtifactId)
    : null;

  if (laterReport && laterReport.userId !== outcomeUserId) {
    throw new BusinessRuleError("Report artifacts must belong to the same user.", 400);
  }

  const packet = input.packetId ? await loadPacket(input.packetId) : null;
  if (packet) {
    const packetOwnerId = packet.userId ?? packet.tradelineUserId;
    if (packetOwnerId !== outcomeUserId) {
      throw new BusinessRuleError("Packet must belong to the same user as the comparison reports.", 400);
    }
    if (!isAdmin(user) && packetOwnerId !== user.id) {
      throw new BusinessRuleError("Access denied: packet does not belong to you.", 403);
    }
  }

  const previousSnapshot = await buildReportSnapshot(previousReport);
  const laterSnapshot = laterReport ? await buildReportSnapshot(laterReport) : null;
  const packetFindings = packet
    ? await loadPacketFindings({
        packetId: packet.id,
        packet,
        creditorObligationTestIds: input.creditorObligationTestIds,
        disputePacketFindingIds: input.disputePacketFindingIds,
      })
    : [];
  const responseReceivedAt = input.response?.responseReceivedAt ?? (packet?.bureauResponseDate ? String(packet.bureauResponseDate) : null);
  const responseType = input.response?.responseType ?? packet?.responseType ?? null;
  const response = responseReceivedAt || responseType
    ? {
        packetId: packet?.id ?? input.response?.packetId ?? null,
        responseReceivedAt,
        responseType,
        source: input.response?.source ?? "manual_record",
      } satisfies ResponseComparisonSnapshot
    : input.response ?? null;
  const delivery = packet && (packet.sentDate || packet.deliveryMethod || packet.trackingNumber)
    ? {
        packetId: packet.id,
        sentAt: packet.sentDate ? String(packet.sentDate) : null,
        deliveryMethod: packet.deliveryMethod ?? null,
        trackingNumber: packet.trackingNumber ?? null,
      }
    : null;

  return {
    outcomeUserId,
    bureauId: packet?.bureauId ?? null,
    packet,
    comparisonInput: {
      userId: outcomeUserId,
      previousReport: previousSnapshot,
      laterReport: laterSnapshot,
      packetFindings,
      response,
      delivery,
      comparisonScope: input.comparisonScope,
    },
  };
}

function runStatusForResult(result: OutcomeComparisonResult): OutcomeComparisonStatus {
  return result.comparisonStatus === "needs_review" ? "needs_review" : "completed";
}

function emptySummary(): OutcomeComparisonSummary {
  return {
    corrected: 0,
    removed: 0,
    unchanged: 0,
    reinserted: 0,
    partiallyCorrected: 0,
    newIssue: 0,
    unresolved: 0,
    needsReview: 0,
    notComparable: 0,
    responseReceived: 0,
  };
}

function summarizeOutcomes(outcomes: Array<{ outcomeType: string }>): OutcomeComparisonSummary {
  const summary = emptySummary();
  for (const outcome of outcomes) {
    if (outcome.outcomeType === "partially_corrected") summary.partiallyCorrected += 1;
    else if (outcome.outcomeType === "new_issue") summary.newIssue += 1;
    else if (outcome.outcomeType === "needs_review") summary.needsReview += 1;
    else if (outcome.outcomeType === "not_comparable") summary.notComparable += 1;
    else if (outcome.outcomeType === "response_received") summary.responseReceived += 1;
    else if (outcome.outcomeType in summary) {
      summary[outcome.outcomeType as keyof OutcomeComparisonSummary] += 1;
    }
  }
  return summary;
}

function runSummary(run: Selectable<OutcomeComparisonRun>, outcomes: Array<{ outcomeType: string }>): OutcomeRunSummary {
  return {
    id: requiredNumber(run.id),
    userId: requiredNumber(run.userId),
    previousReportArtifactId: requiredNumber(run.previousReportArtifactId),
    laterReportArtifactId: toNumber(run.laterReportArtifactId),
    packetId: toNumber(run.packetId),
    bureauId: toNumber(run.bureauId),
    comparisonScope: run.comparisonScope,
    status: run.status,
    sourceVersion: run.sourceVersion,
    warnings: run.warnings,
    createdBy: toNumber(run.createdBy),
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    summary: summarizeOutcomes(outcomes),
  };
}

function mapFindingOutcome(row: Selectable<FindingOutcome>): PersistedFindingOutcome {
  return {
    id: requiredNumber(row.id),
    comparisonRunId: requiredNumber(row.comparisonRunId),
    userId: requiredNumber(row.userId),
    disputePacketId: toNumber(row.disputePacketId),
    disputePacketFindingId: toNumber(row.disputePacketFindingId),
    creditorObligationTestId: toNumber(row.creditorObligationTestId),
    previousTradelineId: toNumber(row.previousTradelineId),
    laterTradelineId: toNumber(row.laterTradelineId),
    outcomeType: row.outcomeType,
    confidenceLevel: row.confidenceLevel,
    matchingMethod: row.matchingMethod,
    outcomeReasonCodes: row.outcomeReasonCodes,
    previousSnapshot: row.previousSnapshot,
    laterSnapshot: row.laterSnapshot,
    evidenceIds: row.evidenceIds,
    evidenceLocationSnapshot: row.evidenceLocationSnapshot,
    responseDeadlineAt: row.responseDeadlineAt,
    responseReceivedAt: row.responseReceivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function persistFindingOutcomes(params: {
  comparisonRunId: number;
  userId: number;
  result: OutcomeComparisonResult;
  disputePacketId?: number | null;
  responseReceivedAt?: Date | null;
  responseDeadlineAt?: Date | null;
}): Promise<PersistedFindingOutcome[]> {
  if (params.result.findingOutcomes.length === 0) return [];

  const rows = params.result.findingOutcomes.map((outcome: FindingOutcomeResult) => ({
    comparisonRunId: params.comparisonRunId,
    userId: params.userId,
    disputePacketId: params.disputePacketId ?? null,
    disputePacketFindingId: toNumber(outcome.disputePacketFindingId),
    creditorObligationTestId: toNumber(outcome.creditorObligationTestId),
    previousTradelineId: toNumber(outcome.previousTradelineId),
    laterTradelineId: toNumber(outcome.laterTradelineId),
    outcomeType: outcome.outcomeType,
    confidenceLevel: outcome.confidenceLevel,
    matchingMethod: outcome.matchingMethod,
    outcomeReasonCodes: asJson(outcome.reasonCodes),
    previousSnapshot: sanitizeOutcomeSnapshot(outcome.safePreviousSnapshot),
    laterSnapshot: sanitizeOutcomeSnapshot(outcome.safeLaterSnapshot),
    evidenceIds: asJsonArray(outcome.evidenceIds),
    evidenceLocationSnapshot: sanitizeOutcomeSnapshot(outcome.evidenceLocationSnapshot) ?? ([] as unknown as Json),
    responseDeadlineAt: params.responseDeadlineAt ?? null,
    responseReceivedAt: params.responseReceivedAt ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  const inserted = await db
    .insertInto("findingOutcome")
    .values(rows as any)
    .returningAll()
    .execute();

  return inserted.map((row) => mapFindingOutcome(row as Selectable<FindingOutcome>));
}

export async function createOutcomeComparisonRun(
  input: CreateOutcomeComparisonRunInput,
  user: OutcomeTrackingUser,
  request?: Request,
): Promise<OutcomeComparisonRunDetail> {
  await ensureOutcomeTrackingSchema();
  const { comparisonInput, outcomeUserId, bureauId, packet } = await buildOutcomeComparisonInputFromArtifacts(input, user);
  const result = compareOutcomeSnapshots(comparisonInput);
  const status = runStatusForResult(result);
  const completedAt = new Date();
  const responseReceivedAt = dateOrNull(comparisonInput.response?.responseReceivedAt);

  const detail = await db.transaction().execute(async (trx) => {
    const run = await trx
      .insertInto("outcomeComparisonRun")
      .values({
        userId: outcomeUserId,
        previousReportArtifactId: input.previousReportArtifactId,
        laterReportArtifactId: input.laterReportArtifactId ?? null,
        packetId: input.packetId ?? null,
        bureauId,
        comparisonScope: input.comparisonScope,
        status,
        sourceVersion: SOURCE_VERSION,
        warnings: asJson(result.warnings),
        createdBy: user.id,
        startedAt: completedAt,
        completedAt,
        createdAt: completedAt,
        updatedAt: completedAt,
      } as any)
      .returningAll()
      .executeTakeFirstOrThrow();

    if (result.findingOutcomes.length > 0) {
      const rows = result.findingOutcomes.map((outcome) => ({
        comparisonRunId: run.id,
        userId: outcomeUserId,
        disputePacketId: input.packetId ?? null,
        disputePacketFindingId: toNumber(outcome.disputePacketFindingId),
        creditorObligationTestId: toNumber(outcome.creditorObligationTestId),
        previousTradelineId: toNumber(outcome.previousTradelineId),
        laterTradelineId: toNumber(outcome.laterTradelineId),
        outcomeType: outcome.outcomeType,
        confidenceLevel: outcome.confidenceLevel,
        matchingMethod: outcome.matchingMethod,
        outcomeReasonCodes: asJson(outcome.reasonCodes),
        previousSnapshot: sanitizeOutcomeSnapshot(outcome.safePreviousSnapshot),
        laterSnapshot: sanitizeOutcomeSnapshot(outcome.safeLaterSnapshot),
        evidenceIds: asJsonArray(outcome.evidenceIds),
        evidenceLocationSnapshot: sanitizeOutcomeSnapshot(outcome.evidenceLocationSnapshot) ?? ([] as unknown as Json),
        responseDeadlineAt: null,
        responseReceivedAt,
        createdAt: completedAt,
        updatedAt: completedAt,
      }));

      await trx.insertInto("findingOutcome").values(rows as any).execute();
    }

    const findings = await trx
      .selectFrom("findingOutcome")
      .selectAll()
      .where("comparisonRunId", "=", run.id)
      .orderBy("id", "asc")
      .execute();

    return {
      ...runSummary(run as Selectable<OutcomeComparisonRun>, findings),
      findingOutcomes: findings.map((row) => mapFindingOutcome(row as Selectable<FindingOutcome>)),
    };
  });

  await logAudit({
    action: "CREATE",
    entityType: packet ? "PACKET" : "REPORT_ARTIFACT",
    entityId: packet?.id ?? input.previousReportArtifactId,
    userId: user.id,
    details: {
      component: "outcome_tracking",
      comparisonRunId: detail.id,
      comparisonScope: input.comparisonScope,
      summary: detail.summary,
    },
    status: "SUCCESS",
    request,
  });

  return detail;
}

function applyRunFilters<T extends { where: (...args: any[]) => any }>(
  baseQuery: T,
  filters: OutcomeListFilters,
  user: OutcomeTrackingUser,
): T {
  let query: any = baseQuery;
  if (!isAdmin(user)) query = query.where("userId", "=", user.id);
  if (filters.packetId !== undefined) query = query.where("packetId", "=", filters.packetId);
  if (filters.previousReportArtifactId !== undefined) query = query.where("previousReportArtifactId", "=", filters.previousReportArtifactId);
  if (filters.laterReportArtifactId !== undefined) query = query.where("laterReportArtifactId", "=", filters.laterReportArtifactId);
  if (filters.status !== undefined) query = query.where("status", "=", filters.status);
  if (filters.startDate) query = query.where("createdAt", ">=", filters.startDate);
  if (filters.endDate) query = query.where("createdAt", "<", filters.endDate);
  if (filters.outcomeType) {
    query = query.where(
      "id",
      "in",
      db
        .selectFrom("findingOutcome")
        .select("comparisonRunId")
        .where("outcomeType", "=", filters.outcomeType),
    );
  }
  return query as T;
}

export async function listOutcomeComparisonRuns(
  filters: OutcomeListFilters,
  user: OutcomeTrackingUser,
): Promise<{ runs: OutcomeRunSummary[]; total: number }> {
  await ensureOutcomeTrackingSchema();
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const countRow = await applyRunFilters(
    db.selectFrom("outcomeComparisonRun").select((eb) => eb.fn.countAll<string>().as("total")),
    filters,
    user,
  ).executeTakeFirst();

  const runs = await applyRunFilters(
    db.selectFrom("outcomeComparisonRun").selectAll(),
    filters,
    user,
  )
    .orderBy("createdAt", "desc")
    .limit(limit)
    .offset(offset)
    .execute();

  const runIds = runs.map((run) => run.id as number);
  const findings = runIds.length > 0
    ? await db
        .selectFrom("findingOutcome")
        .selectAll()
        .where("comparisonRunId", "in", runIds)
        .execute()
    : [];
  const findingsByRun = new Map<number, Selectable<FindingOutcome>[]>();
  for (const finding of findings) {
    const key = finding.comparisonRunId;
    const group = findingsByRun.get(key) ?? [];
    group.push(finding as Selectable<FindingOutcome>);
    findingsByRun.set(key, group);
  }

  return {
    runs: runs.map((run) => runSummary(run as Selectable<OutcomeComparisonRun>, findingsByRun.get(run.id as number) ?? [])),
    total: Number(countRow?.total ?? 0),
  };
}

export async function getOutcomeComparisonRun(
  input: { comparisonRunId: number },
  user: OutcomeTrackingUser,
): Promise<OutcomeComparisonRunDetail> {
  await ensureOutcomeTrackingSchema();

  let query = db
    .selectFrom("outcomeComparisonRun")
    .selectAll()
    .where("id", "=", input.comparisonRunId);
  if (!isAdmin(user)) query = query.where("userId", "=", user.id);

  const run = await query.executeTakeFirst();
  if (!run) throw new BusinessRuleError("Outcome comparison run not found or access denied", 404);

  const findings = await db
    .selectFrom("findingOutcome")
    .selectAll()
    .where("comparisonRunId", "=", run.id)
    .orderBy("id", "asc")
    .execute();

  return {
    ...runSummary(run as Selectable<OutcomeComparisonRun>, findings),
    findingOutcomes: findings.map((row) => mapFindingOutcome(row as Selectable<FindingOutcome>)),
  };
}

export async function outcomeTrackingTableNames(): Promise<string[]> {
  const rows = await sql<{ table_name: string }>`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('outcome_comparison_run', 'finding_outcome', 'packet_outcome_summary')
    order by table_name
  `.execute(db);
  return rows.rows.map((row) => row.table_name);
}
