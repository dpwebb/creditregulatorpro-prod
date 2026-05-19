import { createHash } from "node:crypto";
import { sql } from "kysely";

import { db } from "./db";
import { ensureResponseDocumentSchema } from "./responseDocumentSchema";
import { runResponseProcessingReplay, type ResponseReplayFilters } from "./responseReplayService";
import type { Json } from "./schema";

export const RESPONSE_PROCESSING_QUEUE_VERSION = "response-processing-queue-2026-05-19" as const;

export const RESPONSE_PROCESSING_JOB_TYPES = [
  "response_intake_process",
  "response_replay_apply",
  "response_replay_dry_run",
  "response_classification_refresh",
  "future_mailbox_intake",
] as const;

export type ResponseProcessingJobType = typeof RESPONSE_PROCESSING_JOB_TYPES[number];
export type ResponseProcessingJobStatus = "queued" | "running" | "succeeded" | "failed" | "dead_lettered";
export type ResponseProcessingJobEventType =
  | "queued"
  | "duplicate_enqueue"
  | "claimed"
  | "succeeded"
  | "failed"
  | "retry_scheduled"
  | "dead_lettered"
  | "requeued";

export type ResponseProcessingQueuePayload = {
  responseId?: number;
  filters?: ResponseReplayFilters;
  confirmApply?: boolean;
  dryRunOnly?: boolean;
  sourceType?: "manual_admin" | "simulated_inbox" | "future_mailbox" | string;
  messageReferenceHash?: string;
  sourceMessageHash?: string;
  metadata?: Record<string, Json>;
};

export type EnqueueResponseProcessingJobInput = {
  jobType: ResponseProcessingJobType;
  payload?: ResponseProcessingQueuePayload;
  idempotencyKey?: string | null;
  actorUserId?: number | null;
  source?: string | null;
  runAfter?: Date | string | null;
  maxAttempts?: number | null;
};

export type ResponseProcessingJobRecord = {
  id: number;
  jobType: ResponseProcessingJobType;
  status: ResponseProcessingJobStatus;
  payload: ResponseProcessingQueuePayload;
  idempotencyKey: string;
  actorUserId: number | null;
  source: string;
  runAfter: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  attemptCount: number;
  maxAttempts: number;
  lockedBy: string | null;
  lockedAt: string | null;
  lockedUntil: string | null;
  lastErrorCode: string | null;
  lastErrorReason: string | null;
  resultSummary: Record<string, Json>;
};

export type EnqueueResponseProcessingJobResult = {
  status: "queued" | "duplicate";
  job: ResponseProcessingJobRecord;
  duplicateOfJobId: number | null;
};

export type ProcessResponseProcessingJobResult =
  | {
      status: "idle";
      workerId: string;
      dryRun: boolean;
      job: null;
    }
  | {
      status: "dry_run_preview";
      workerId: string;
      dryRun: true;
      job: Pick<ResponseProcessingJobRecord, "id" | "jobType" | "status" | "attemptCount" | "maxAttempts" | "runAfter">;
    }
  | {
      status: "succeeded" | "failed" | "dead_lettered";
      workerId: string;
      dryRun: false;
      job: ResponseProcessingJobRecord;
    };

export type ResponseProcessingQueueMetrics = {
  generatedAt: string;
  queueVersion: typeof RESPONSE_PROCESSING_QUEUE_VERSION;
  totalJobs: number;
  queuedJobs: number;
  runningJobs: number;
  succeededJobs: number;
  failedJobs: number;
  deadLetteredJobs: number;
  staleRunningJobs: number;
  retryBacklogJobs: number;
  oldestQueuedAgeSeconds: number | null;
  duplicateEnqueueAttempts: number;
  recentWorkerRunStatus: string | null;
  recentWorkerRunAt: string | null;
  boundaries: {
    durableDbBacked: true;
    appendOnlyJobEvents: true;
    noRawResponseText: true;
    noSecretsInPayload: true;
    liveMailboxIntegrationUsed: false;
    externalAlertDeliveryUsed: false;
    canonicalFactsMutated: false;
    violationTruthMutated: false;
    packetReadinessMutated: false;
  };
};

type QueueRow = {
  id?: unknown;
  job_id?: unknown;
  jobId?: unknown;
  job_type?: unknown;
  jobType?: unknown;
  status?: unknown;
  payload?: unknown;
  idempotency_key?: unknown;
  idempotencyKey?: unknown;
  actor_user_id?: unknown;
  actorUserId?: unknown;
  source?: unknown;
  run_after?: unknown;
  runAfter?: unknown;
  started_at?: unknown;
  startedAt?: unknown;
  finished_at?: unknown;
  finishedAt?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
  updated_at?: unknown;
  updatedAt?: unknown;
  attempt_count?: unknown;
  attemptCount?: unknown;
  max_attempts?: unknown;
  maxAttempts?: unknown;
  locked_by?: unknown;
  lockedBy?: unknown;
  locked_at?: unknown;
  lockedAt?: unknown;
  locked_until?: unknown;
  lockedUntil?: unknown;
  last_error_code?: unknown;
  lastErrorCode?: unknown;
  last_error_reason?: unknown;
  lastErrorReason?: unknown;
  result_summary?: unknown;
  resultSummary?: unknown;
};

class ResponseProcessingQueueError extends Error {
  readonly code: string;
  readonly permanent: boolean;

  constructor(code: string, message: string, permanent = true) {
    super(message);
    this.name = "ResponseProcessingQueueError";
    this.code = code;
    this.permanent = permanent;
  }
}

const JOB_TYPE_SET = new Set<string>(RESPONSE_PROCESSING_JOB_TYPES);
const SAFE_TOKEN_PATTERN = /^[a-zA-Z0-9_.:-]{1,120}$/;
const SAFE_KEY_PATTERN = /^[a-zA-Z0-9_.:-]{1,64}$/;
const HASH_PATTERN = /^[a-f0-9]{32,128}$/i;
const MAX_PAYLOAD_DEPTH = 4;
const MAX_PAYLOAD_KEYS = 80;
const MAX_PAYLOAD_ARRAY_ITEMS = 50;
const MAX_PAYLOAD_STRING_LENGTH = 500;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_LEASE_SECONDS = 300;
const FORBIDDEN_KEY_PATTERN =
  /(raw.?text|response.?text|extracted.?text|email.?body|full.?email|message.?body|mailbox.?credential|password|token|secret|authorization|cookie|session|api.?key|private.?key|database.?url|connection.?string|storage.?url|signed.?url)/i;
const FORBIDDEN_VALUE_PATTERN =
  /(raw report text|raw pdf text|full email body|email body dump|packet body|storage\.googleapis\.com|x-goog-signature|x-amz-signature|signedurl|signed_url|database_url|postgres:\/\/|mysql:\/\/|mongodb:\/\/|bearer\s+[a-z0-9._-]+|api[_-]?key|private key|mailbox password|imap password|smtp password|oauth refresh token|email auth token|session=|cookie=)/i;
const FULL_SIN_PATTERN = /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/;
const FULL_ACCOUNT_PATTERN = /\b(?:account|acct|member)\s*(?:number|no\.?|#)?\s*[:#-]?\s*[A-Z0-9][A-Z0-9 -]{9,}\b|\b\d{10,}\b/i;

function rowValue(row: QueueRow | Record<string, unknown>, snakeCaseKey: string): unknown {
  if (Object.prototype.hasOwnProperty.call(row, snakeCaseKey)) return row[snakeCaseKey as keyof typeof row];
  const camelCaseKey = snakeCaseKey.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
  return (row as Record<string, unknown>)[camelCaseKey];
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requiredNumber(value: unknown, fieldName: string): number {
  const parsed = toNumber(value);
  if (!Number.isInteger(parsed) || Number(parsed) <= 0) {
    throw new ResponseProcessingQueueError("INVALID_NUMERIC_VALUE", `${fieldName} must be a positive integer.`);
  }
  return Number(parsed);
}

function toIso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function jsonRecord(value: unknown): Record<string, Json> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return jsonRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (Array.isArray(value) || typeof value !== "object") return {};
  return value as Record<string, Json>;
}

function mapJobRow(row: QueueRow): ResponseProcessingJobRecord {
  return {
    id: requiredNumber(rowValue(row, "id"), "id"),
    jobType: String(rowValue(row, "job_type")) as ResponseProcessingJobType,
    status: String(rowValue(row, "status")) as ResponseProcessingJobStatus,
    payload: jsonRecord(rowValue(row, "payload")) as ResponseProcessingQueuePayload,
    idempotencyKey: String(rowValue(row, "idempotency_key") ?? ""),
    actorUserId: toNumber(rowValue(row, "actor_user_id")),
    source: String(rowValue(row, "source") ?? "operator"),
    runAfter: toIso(rowValue(row, "run_after")),
    startedAt: rowValue(row, "started_at") ? toIso(rowValue(row, "started_at")) : null,
    finishedAt: rowValue(row, "finished_at") ? toIso(rowValue(row, "finished_at")) : null,
    createdAt: toIso(rowValue(row, "created_at")),
    updatedAt: toIso(rowValue(row, "updated_at")),
    attemptCount: Number(rowValue(row, "attempt_count") ?? 0),
    maxAttempts: Number(rowValue(row, "max_attempts") ?? DEFAULT_MAX_ATTEMPTS),
    lockedBy: rowValue(row, "locked_by") ? String(rowValue(row, "locked_by")) : null,
    lockedAt: rowValue(row, "locked_at") ? toIso(rowValue(row, "locked_at")) : null,
    lockedUntil: rowValue(row, "locked_until") ? toIso(rowValue(row, "locked_until")) : null,
    lastErrorCode: rowValue(row, "last_error_code") ? String(rowValue(row, "last_error_code")) : null,
    lastErrorReason: rowValue(row, "last_error_reason") ? String(rowValue(row, "last_error_reason")) : null,
    resultSummary: jsonRecord(rowValue(row, "result_summary")),
  };
}

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJsonStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sanitizeToken(value: string | null | undefined, fieldName: string, fallback: string): string {
  const token = String(value ?? fallback).trim();
  if (!SAFE_TOKEN_PATTERN.test(token) || FORBIDDEN_KEY_PATTERN.test(token) || FORBIDDEN_VALUE_PATTERN.test(token)) {
    throw new ResponseProcessingQueueError("UNSAFE_QUEUE_TOKEN", `${fieldName} must be a safe internal token.`);
  }
  return token;
}

function sanitizeDate(value: Date | string | null | undefined, fieldName: string): Date {
  if (!value) return new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ResponseProcessingQueueError("INVALID_QUEUE_DATE", `${fieldName} must be a valid date.`);
  }
  return date;
}

function sanitizePositiveInteger(value: unknown, fieldName: string, options: { required?: boolean; max?: number } = {}): number | undefined {
  if (value === undefined || value === null || value === "") {
    if (options.required) throw new ResponseProcessingQueueError("INVALID_QUEUE_PAYLOAD", `${fieldName} is required.`);
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || (options.max !== undefined && parsed > options.max)) {
    throw new ResponseProcessingQueueError("INVALID_QUEUE_PAYLOAD", `${fieldName} must be a positive integer.`);
  }
  return parsed;
}

function sanitizePayloadValue(value: unknown, fieldPath: string, depth: number): Json {
  if (depth > MAX_PAYLOAD_DEPTH) {
    throw new ResponseProcessingQueueError("UNSAFE_QUEUE_PAYLOAD", `${fieldPath} is too deeply nested.`);
  }
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ResponseProcessingQueueError("UNSAFE_QUEUE_PAYLOAD", `${fieldPath} includes a non-finite number.`);
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (trimmed.length > MAX_PAYLOAD_STRING_LENGTH) {
      throw new ResponseProcessingQueueError("UNSAFE_QUEUE_PAYLOAD", `${fieldPath} string is too long.`);
    }
    if (FORBIDDEN_VALUE_PATTERN.test(trimmed) || FULL_SIN_PATTERN.test(trimmed) || FULL_ACCOUNT_PATTERN.test(trimmed)) {
      throw new ResponseProcessingQueueError("UNSAFE_QUEUE_PAYLOAD", `${fieldPath} includes sensitive content.`);
    }
    return trimmed;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_PAYLOAD_ARRAY_ITEMS) {
      throw new ResponseProcessingQueueError("UNSAFE_QUEUE_PAYLOAD", `${fieldPath} array has too many items.`);
    }
    return value.map((item, index) => sanitizePayloadValue(item, `${fieldPath}.${index}`, depth + 1));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > MAX_PAYLOAD_KEYS) {
      throw new ResponseProcessingQueueError("UNSAFE_QUEUE_PAYLOAD", `${fieldPath} has too many keys.`);
    }
    const output: Record<string, Json> = {};
    for (const [key, item] of entries) {
      if (!SAFE_KEY_PATTERN.test(key) || FORBIDDEN_KEY_PATTERN.test(key)) {
        throw new ResponseProcessingQueueError("UNSAFE_QUEUE_PAYLOAD", `${fieldPath} includes unsafe key.`);
      }
      output[key] = sanitizePayloadValue(item, `${fieldPath}.${key}`, depth + 1);
    }
    return output;
  }
  throw new ResponseProcessingQueueError("UNSAFE_QUEUE_PAYLOAD", `${fieldPath} includes unsupported content.`);
}

function sanitizeReplayFilters(filters: unknown): ResponseReplayFilters | undefined {
  if (filters === undefined || filters === null) return undefined;
  const safe = sanitizePayloadValue(filters, "payload.filters", 0);
  if (!safe || Array.isArray(safe) || typeof safe !== "object") {
    throw new ResponseProcessingQueueError("INVALID_QUEUE_PAYLOAD", "payload.filters must be an object.");
  }
  const source = safe as Record<string, Json>;
  const output: ResponseReplayFilters = {};
  if (source.userId !== undefined) output.userId = sanitizePositiveInteger(source.userId, "payload.filters.userId");
  if (source.consumerId !== undefined) output.consumerId = sanitizePositiveInteger(source.consumerId, "payload.filters.consumerId");
  if (source.packetId !== undefined) output.packetId = sanitizePositiveInteger(source.packetId, "payload.filters.packetId");
  if (source.responseId !== undefined) output.responseId = sanitizePositiveInteger(source.responseId, "payload.filters.responseId");
  if (source.sourceType !== undefined) output.sourceType = sanitizeToken(String(source.sourceType), "payload.filters.sourceType", "");
  if (source.classification !== undefined) output.classification = sanitizeToken(String(source.classification), "payload.filters.classification", "") as ResponseReplayFilters["classification"];
  if (source.manualReviewRequired !== undefined) {
    if (typeof source.manualReviewRequired !== "boolean") {
      throw new ResponseProcessingQueueError("INVALID_QUEUE_PAYLOAD", "payload.filters.manualReviewRequired must be boolean.");
    }
    output.manualReviewRequired = source.manualReviewRequired;
  }
  if (source.startDate !== undefined) output.startDate = sanitizeDate(String(source.startDate), "payload.filters.startDate").toISOString();
  if (source.endDate !== undefined) output.endDate = sanitizeDate(String(source.endDate), "payload.filters.endDate").toISOString();
  if (source.limit !== undefined) output.limit = sanitizePositiveInteger(source.limit, "payload.filters.limit", { max: 1000 });
  return output;
}

function normalizePayload(jobType: ResponseProcessingJobType, payload: ResponseProcessingQueuePayload | undefined): ResponseProcessingQueuePayload {
  const safe = sanitizePayloadValue(payload ?? {}, "payload", 0);
  if (!safe || Array.isArray(safe) || typeof safe !== "object") {
    throw new ResponseProcessingQueueError("INVALID_QUEUE_PAYLOAD", "Response processing job payload must be an object.");
  }

  const source = safe as ResponseProcessingQueuePayload;
  const filters = sanitizeReplayFilters(source.filters);
  const responseId = sanitizePositiveInteger(source.responseId, "payload.responseId");
  const normalized: ResponseProcessingQueuePayload = {};

  if (responseId !== undefined) normalized.responseId = responseId;
  if (filters !== undefined) normalized.filters = filters;
  if (source.confirmApply !== undefined) {
    if (typeof source.confirmApply !== "boolean") {
      throw new ResponseProcessingQueueError("INVALID_QUEUE_PAYLOAD", "payload.confirmApply must be boolean.");
    }
    normalized.confirmApply = source.confirmApply;
  }
  if (source.dryRunOnly !== undefined) {
    if (typeof source.dryRunOnly !== "boolean") {
      throw new ResponseProcessingQueueError("INVALID_QUEUE_PAYLOAD", "payload.dryRunOnly must be boolean.");
    }
    normalized.dryRunOnly = source.dryRunOnly;
  }
  if (source.sourceType !== undefined) normalized.sourceType = sanitizeToken(String(source.sourceType), "payload.sourceType", "");
  if (source.messageReferenceHash !== undefined) {
    if (!HASH_PATTERN.test(String(source.messageReferenceHash))) {
      throw new ResponseProcessingQueueError("INVALID_QUEUE_PAYLOAD", "payload.messageReferenceHash must be a safe hash.");
    }
    normalized.messageReferenceHash = String(source.messageReferenceHash).toLowerCase();
  }
  if (source.sourceMessageHash !== undefined) {
    if (!HASH_PATTERN.test(String(source.sourceMessageHash))) {
      throw new ResponseProcessingQueueError("INVALID_QUEUE_PAYLOAD", "payload.sourceMessageHash must be a safe hash.");
    }
    normalized.sourceMessageHash = String(source.sourceMessageHash).toLowerCase();
  }
  if (source.metadata !== undefined) {
    const metadata = sanitizePayloadValue(source.metadata, "payload.metadata", 0);
    if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") {
      throw new ResponseProcessingQueueError("INVALID_QUEUE_PAYLOAD", "payload.metadata must be an object.");
    }
    normalized.metadata = metadata as Record<string, Json>;
  }

  if ((jobType === "response_intake_process" || jobType === "response_classification_refresh") && !normalized.responseId) {
    throw new ResponseProcessingQueueError("INVALID_QUEUE_PAYLOAD", `${jobType} requires payload.responseId.`);
  }
  if (jobType === "response_replay_apply" && normalized.confirmApply !== true) {
    throw new ResponseProcessingQueueError("REPLAY_APPLY_NOT_CONFIRMED", "response_replay_apply requires payload.confirmApply true.");
  }
  if (jobType === "future_mailbox_intake") {
    normalized.sourceType = "future_mailbox";
  }
  return normalized;
}

function normalizeJobType(value: ResponseProcessingJobType): ResponseProcessingJobType {
  if (!JOB_TYPE_SET.has(value)) {
    throw new ResponseProcessingQueueError("UNSUPPORTED_JOB_TYPE", "Unsupported response processing job type.");
  }
  return value;
}

function normalizeMaxAttempts(value: number | null | undefined): number {
  if (value === undefined || value === null) return DEFAULT_MAX_ATTEMPTS;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 25) {
    throw new ResponseProcessingQueueError("INVALID_MAX_ATTEMPTS", "maxAttempts must be an integer from 1 to 25.");
  }
  return parsed;
}

function buildIdempotencyKey(input: {
  jobType: ResponseProcessingJobType;
  payload: ResponseProcessingQueuePayload;
  actorUserId: number | null;
  source: string;
}): string {
  return sha256(stableJsonStringify({
    actorUserId: input.actorUserId,
    jobType: input.jobType,
    payload: input.payload,
    queueVersion: RESPONSE_PROCESSING_QUEUE_VERSION,
    source: input.source,
  }));
}

function hasUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  return (
    candidate?.code === "23505" ||
    candidate?.cause?.code === "23505" ||
    /idx_response_processing_job_active_idempotency_unique|duplicate key value/i.test(candidate?.message ?? "") ||
    /idx_response_processing_job_active_idempotency_unique|duplicate key value/i.test(candidate?.cause?.message ?? "")
  );
}

function sanitizeErrorString(value: unknown, fallback: string, limit = 240): string {
  const raw = String(value ?? fallback).replace(/\s+/g, " ").trim() || fallback;
  const withoutSecrets = FORBIDDEN_VALUE_PATTERN.test(raw) || FULL_SIN_PATTERN.test(raw) || FULL_ACCOUNT_PATTERN.test(raw)
    ? fallback
    : raw;
  return withoutSecrets.slice(0, limit);
}

function normalizeError(error: unknown): { code: string; reason: string; permanent: boolean } {
  if (error instanceof ResponseProcessingQueueError) {
    return {
      code: sanitizeToken(error.code, "errorCode", "QUEUE_ERROR").slice(0, 80),
      reason: sanitizeErrorString(error.message, "Response processing queue error."),
      permanent: error.permanent,
    };
  }
  return {
    code: "QUEUE_PROCESSING_FAILED",
    reason: sanitizeErrorString(error instanceof Error ? error.message : String(error), "Response processing job failed."),
    permanent: false,
  };
}

function retryDelaySeconds(attemptCount: number): number {
  return Math.min(60 * 2 ** Math.max(0, attemptCount - 1), 3600);
}

async function appendJobEvent(
  executor: any,
  params: {
    jobId: number;
    eventType: ResponseProcessingJobEventType;
    previousStatus?: ResponseProcessingJobStatus | null;
    nextStatus: ResponseProcessingJobStatus;
    attemptCount: number;
    workerId?: string | null;
    actorUserId?: number | null;
    details?: Record<string, Json>;
    errorCode?: string | null;
    errorReason?: string | null;
  },
): Promise<void> {
  await sql`
    insert into public.response_processing_job_event (
      job_id,
      event_type,
      previous_status,
      next_status,
      attempt_count,
      worker_id,
      actor_user_id,
      details,
      error_code,
      error_reason
    ) values (
      ${params.jobId},
      ${params.eventType},
      ${params.previousStatus ?? null},
      ${params.nextStatus},
      ${params.attemptCount},
      ${params.workerId ?? null},
      ${params.actorUserId ?? null},
      ${JSON.stringify(params.details ?? {})}::jsonb,
      ${params.errorCode ?? null},
      ${params.errorReason ?? null}
    )
  `.execute(executor);
}

async function findActiveJobByIdempotencyKey(idempotencyKey: string): Promise<ResponseProcessingJobRecord | null> {
  const result = await sql<QueueRow>`
    select *
    from public.response_processing_job
    where idempotency_key = ${idempotencyKey}
      and status in ('queued', 'running', 'failed')
    order by created_at asc, id asc
    limit 1
  `.execute(db);
  return result.rows[0] ? mapJobRow(result.rows[0]) : null;
}

export async function enqueueResponseProcessingJob(
  input: EnqueueResponseProcessingJobInput,
): Promise<EnqueueResponseProcessingJobResult> {
  await ensureResponseDocumentSchema();
  const jobType = normalizeJobType(input.jobType);
  const actorUserId = input.actorUserId === null || input.actorUserId === undefined
    ? null
    : requiredNumber(input.actorUserId, "actorUserId");
  const source = sanitizeToken(input.source, "source", "operator");
  const payload = normalizePayload(jobType, input.payload);
  if (jobType === "response_replay_apply" && actorUserId === null) {
    throw new ResponseProcessingQueueError("REPLAY_APPLY_ACTOR_REQUIRED", "response_replay_apply requires actorUserId.");
  }
  const idempotencyKey = input.idempotencyKey
    ? sanitizeToken(input.idempotencyKey, "idempotencyKey", "")
    : buildIdempotencyKey({ jobType, payload, actorUserId, source });
  const runAfter = sanitizeDate(input.runAfter, "runAfter");
  const maxAttempts = normalizeMaxAttempts(input.maxAttempts);

  const existing = await findActiveJobByIdempotencyKey(idempotencyKey);
  if (existing) {
    await appendJobEvent(db, {
      jobId: existing.id,
      eventType: "duplicate_enqueue",
      previousStatus: existing.status,
      nextStatus: existing.status,
      attemptCount: existing.attemptCount,
      actorUserId,
      details: {
        attemptedJobType: jobType,
        duplicateOfJobId: existing.id,
        source,
        rawResponseTextLogged: false,
        liveMailboxIntegrationUsed: false,
      },
    });
    return { status: "duplicate", job: existing, duplicateOfJobId: existing.id };
  }

  try {
    const job = await db.transaction().execute(async (trx) => {
      const result = await sql<QueueRow>`
        insert into public.response_processing_job (
          job_type,
          status,
          payload,
          idempotency_key,
          actor_user_id,
          source,
          run_after,
          max_attempts
        ) values (
          ${jobType},
          'queued',
          ${JSON.stringify(payload)}::jsonb,
          ${idempotencyKey},
          ${actorUserId},
          ${source},
          ${runAfter},
          ${maxAttempts}
        )
        returning *
      `.execute(trx);
      const inserted = mapJobRow(result.rows[0]);
      await appendJobEvent(trx as typeof db, {
        jobId: inserted.id,
        eventType: "queued",
        nextStatus: "queued",
        attemptCount: 0,
        actorUserId,
        details: {
          jobType,
          source,
          queueVersion: RESPONSE_PROCESSING_QUEUE_VERSION,
          rawResponseTextStored: false,
          rawResponseTextLogged: false,
          liveMailboxIntegrationUsed: false,
        },
      });
      return inserted;
    });
    return { status: "queued", job, duplicateOfJobId: null };
  } catch (error) {
    if (!hasUniqueViolation(error)) throw error;
    const duplicate = await findActiveJobByIdempotencyKey(idempotencyKey);
    if (!duplicate) throw error;
    await appendJobEvent(db, {
      jobId: duplicate.id,
      eventType: "duplicate_enqueue",
      previousStatus: duplicate.status,
      nextStatus: duplicate.status,
      attemptCount: duplicate.attemptCount,
      actorUserId,
      details: {
        attemptedJobType: jobType,
        duplicateOfJobId: duplicate.id,
        source,
        rawResponseTextLogged: false,
        liveMailboxIntegrationUsed: false,
      },
    });
    return { status: "duplicate", job: duplicate, duplicateOfJobId: duplicate.id };
  }
}

async function peekNextResponseProcessingJob(): Promise<ResponseProcessingJobRecord | null> {
  await ensureResponseDocumentSchema();
  const result = await sql<QueueRow>`
    select *
    from public.response_processing_job
    where (
        status in ('queued', 'failed')
        and run_after <= now()
        and attempt_count < max_attempts
      )
      or (
        status = 'running'
        and locked_until is not null
        and locked_until < now()
        and attempt_count < max_attempts
      )
    order by
      case when status = 'running' then 0 else 1 end,
      run_after asc,
      created_at asc,
      id asc
    limit 1
  `.execute(db);
  return result.rows[0] ? mapJobRow(result.rows[0]) : null;
}

export async function claimNextResponseProcessingJob(input: {
  workerId: string;
  leaseSeconds?: number;
}): Promise<ResponseProcessingJobRecord | null> {
  await ensureResponseDocumentSchema();
  const workerId = sanitizeToken(input.workerId, "workerId", "response-worker");
  const leaseSeconds = Math.min(Math.max(Number(input.leaseSeconds ?? DEFAULT_LEASE_SECONDS), 30), 3600);

  return db.transaction().execute(async (trx) => {
    const candidates = await sql<QueueRow>`
      select *
      from public.response_processing_job
      where (
          status in ('queued', 'failed')
          and run_after <= now()
          and attempt_count < max_attempts
        )
        or (
          status = 'running'
          and locked_until is not null
          and locked_until < now()
          and attempt_count < max_attempts
        )
      order by
        case when status = 'running' then 0 else 1 end,
        run_after asc,
        created_at asc,
        id asc
      for update skip locked
      limit 1
    `.execute(trx);
    const candidate = candidates.rows[0] ? mapJobRow(candidates.rows[0]) : null;
    if (!candidate) return null;

    const updated = await sql<QueueRow>`
      update public.response_processing_job
      set
        status = 'running',
        attempt_count = attempt_count + 1,
        started_at = coalesce(started_at, now()),
        updated_at = now(),
        locked_by = ${workerId},
        locked_at = now(),
        locked_until = now() + make_interval(secs => ${leaseSeconds})
      where id = ${candidate.id}
      returning *
    `.execute(trx);
    const claimed = mapJobRow(updated.rows[0]);
    await appendJobEvent(trx as typeof db, {
      jobId: claimed.id,
      eventType: "claimed",
      previousStatus: candidate.status,
      nextStatus: "running",
      attemptCount: claimed.attemptCount,
      workerId,
      actorUserId: claimed.actorUserId,
      details: {
        staleReclaim: candidate.status === "running",
        leaseSeconds,
        rawResponseTextLogged: false,
      },
    });
    return claimed;
  });
}

function replayFiltersForJob(job: ResponseProcessingJobRecord): ResponseReplayFilters {
  const filters: ResponseReplayFilters = { ...(job.payload.filters ?? {}) };
  if (job.payload.responseId !== undefined && filters.responseId === undefined) {
    filters.responseId = job.payload.responseId;
  }
  return filters;
}

async function executeResponseProcessingJob(job: ResponseProcessingJobRecord): Promise<Record<string, Json>> {
  if (!JOB_TYPE_SET.has(job.jobType)) {
    throw new ResponseProcessingQueueError("UNSUPPORTED_JOB_TYPE", "Unsupported response processing job type.", true);
  }
  const payload = normalizePayload(job.jobType, job.payload);

  if (job.jobType === "future_mailbox_intake") {
    throw new ResponseProcessingQueueError(
      "LIVE_MAILBOX_INTEGRATION_DEFERRED",
      "future_mailbox_intake is an inert placeholder until live mailbox integration is explicitly implemented.",
      true,
    );
  }

  if (job.jobType === "response_replay_apply") {
    if (payload.confirmApply !== true) {
      throw new ResponseProcessingQueueError("REPLAY_APPLY_NOT_CONFIRMED", "response_replay_apply requires explicit confirmApply true.", true);
    }
    if (!job.actorUserId) {
      throw new ResponseProcessingQueueError("REPLAY_APPLY_ACTOR_REQUIRED", "response_replay_apply requires actorUserId.", true);
    }
    const result = await runResponseProcessingReplay({
      mode: "apply",
      confirmApply: true,
      actorUserId: job.actorUserId,
      filters: replayFiltersForJob({ ...job, payload }),
    });
    return {
      mode: result.mode,
      scanned: result.totals.scanned,
      replayable: result.totals.replayable,
      nonReplayable: result.totals.nonReplayable,
      appendedProcessingEvents: result.totals.appendedProcessingEvents,
      manualReviewRequired: result.totals.manualReviewRequired,
      uncertainty: result.totals.uncertainty,
      rawResponseTextLogged: false,
      canonicalFactsMutated: false,
      violationTruthMutated: false,
      packetReadinessMutated: false,
    };
  }

  const result = await runResponseProcessingReplay({
    mode: "dry_run",
    filters: replayFiltersForJob({ ...job, payload }),
  });
  return {
    mode: result.mode,
    scanned: result.totals.scanned,
    replayable: result.totals.replayable,
    nonReplayable: result.totals.nonReplayable,
    appendedProcessingEvents: 0,
    manualReviewRequired: result.totals.manualReviewRequired,
    uncertainty: result.totals.uncertainty,
    dryRunDoesNotPersist: true,
    rawResponseTextLogged: false,
    canonicalFactsMutated: false,
    violationTruthMutated: false,
    packetReadinessMutated: false,
  };
}

async function markJobSucceeded(job: ResponseProcessingJobRecord, workerId: string, resultSummary: Record<string, Json>): Promise<ResponseProcessingJobRecord> {
  return db.transaction().execute(async (trx) => {
    const updated = await sql<QueueRow>`
      update public.response_processing_job
      set
        status = 'succeeded',
        finished_at = now(),
        updated_at = now(),
        locked_by = null,
        locked_at = null,
        locked_until = null,
        last_error_code = null,
        last_error_reason = null,
        result_summary = ${JSON.stringify(resultSummary)}::jsonb
      where id = ${job.id}
      returning *
    `.execute(trx);
    const row = mapJobRow(updated.rows[0]);
    await appendJobEvent(trx as typeof db, {
      jobId: row.id,
      eventType: "succeeded",
      previousStatus: "running",
      nextStatus: "succeeded",
      attemptCount: row.attemptCount,
      workerId,
      actorUserId: row.actorUserId,
      details: {
        resultSummary,
        rawResponseTextLogged: false,
        canonicalFactsMutated: false,
        violationTruthMutated: false,
        packetReadinessMutated: false,
      },
    });
    return row;
  });
}

export async function markResponseProcessingJobFailed(params: {
  job: ResponseProcessingJobRecord;
  workerId: string;
  error: unknown;
}): Promise<ResponseProcessingJobRecord> {
  const normalized = normalizeError(params.error);
  const deadLetter = normalized.permanent || params.job.attemptCount >= params.job.maxAttempts;
  const nextStatus: ResponseProcessingJobStatus = deadLetter ? "dead_lettered" : "failed";
  const eventType: ResponseProcessingJobEventType = deadLetter ? "dead_lettered" : "retry_scheduled";
  const retryDelay = deadLetter ? 0 : retryDelaySeconds(params.job.attemptCount);

  return db.transaction().execute(async (trx) => {
    const updated = await sql<QueueRow>`
      update public.response_processing_job
      set
        status = ${nextStatus},
        finished_at = ${deadLetter ? sql`now()` : sql`null`},
        updated_at = now(),
        run_after = ${deadLetter ? sql`run_after` : sql`now() + make_interval(secs => ${retryDelay})`},
        locked_by = null,
        locked_at = null,
        locked_until = null,
        last_error_code = ${normalized.code},
        last_error_reason = ${normalized.reason},
        result_summary = ${JSON.stringify({
          errorCode: normalized.code,
          retryDelaySeconds: retryDelay,
          permanent: deadLetter,
          rawResponseTextLogged: false,
        })}::jsonb
      where id = ${params.job.id}
      returning *
    `.execute(trx);
    const row = mapJobRow(updated.rows[0]);
    await appendJobEvent(trx as typeof db, {
      jobId: row.id,
      eventType,
      previousStatus: "running",
      nextStatus,
      attemptCount: row.attemptCount,
      workerId: params.workerId,
      actorUserId: row.actorUserId,
      errorCode: normalized.code,
      errorReason: normalized.reason,
      details: {
        retryDelaySeconds: retryDelay,
        permanent: deadLetter,
        rawResponseTextLogged: false,
      },
    });
    return row;
  });
}

export async function processNextResponseProcessingJob(input: {
  workerId?: string;
  leaseSeconds?: number;
  dryRun?: boolean;
} = {}): Promise<ProcessResponseProcessingJobResult> {
  const workerId = sanitizeToken(input.workerId, "workerId", `response-worker-${process.pid}`);
  if (input.dryRun === true) {
    const job = await peekNextResponseProcessingJob();
    if (!job) return { status: "idle", workerId, dryRun: true, job: null };
    return {
      status: "dry_run_preview",
      workerId,
      dryRun: true,
      job: {
        id: job.id,
        jobType: job.jobType,
        status: job.status,
        attemptCount: job.attemptCount,
        maxAttempts: job.maxAttempts,
        runAfter: job.runAfter,
      },
    };
  }

  const job = await claimNextResponseProcessingJob({ workerId, leaseSeconds: input.leaseSeconds });
  if (!job) return { status: "idle", workerId, dryRun: false, job: null };

  try {
    const resultSummary = await executeResponseProcessingJob(job);
    const succeeded = await markJobSucceeded(job, workerId, resultSummary);
    return { status: "succeeded", workerId, dryRun: false, job: succeeded };
  } catch (error) {
    const failed = await markResponseProcessingJobFailed({ job, workerId, error });
    return { status: failed.status === "dead_lettered" ? "dead_lettered" : "failed", workerId, dryRun: false, job: failed };
  }
}

export async function requeueDeadLetteredResponseProcessingJob(input: {
  jobId: number;
  actorUserId: number;
}): Promise<ResponseProcessingJobRecord> {
  await ensureResponseDocumentSchema();
  const jobId = requiredNumber(input.jobId, "jobId");
  const actorUserId = requiredNumber(input.actorUserId, "actorUserId");

  return db.transaction().execute(async (trx) => {
    const locked = await sql<QueueRow>`
      select *
      from public.response_processing_job
      where id = ${jobId}
      for update
    `.execute(trx);
    const previous = locked.rows[0] ? mapJobRow(locked.rows[0]) : null;
    if (!previous) throw new ResponseProcessingQueueError("JOB_NOT_FOUND", "Response processing job not found.");
    if (previous.status !== "dead_lettered") {
      throw new ResponseProcessingQueueError("JOB_REQUEUE_UNSAFE", "Only dead-lettered response processing jobs can be manually requeued.");
    }

    const updated = await sql<QueueRow>`
      update public.response_processing_job
      set
        status = 'queued',
        run_after = now(),
        updated_at = now(),
        started_at = null,
        finished_at = null,
        attempt_count = 0,
        locked_by = null,
        locked_at = null,
        locked_until = null,
        last_error_code = null,
        last_error_reason = null,
        result_summary = ${JSON.stringify({
          requeuedFromDeadLetter: true,
          requeuedByActorUserId: actorUserId,
          rawResponseTextLogged: false,
        })}::jsonb
      where id = ${jobId}
      returning *
    `.execute(trx);
    const row = mapJobRow(updated.rows[0]);
    await appendJobEvent(trx as typeof db, {
      jobId: row.id,
      eventType: "requeued",
      previousStatus: "dead_lettered",
      nextStatus: "queued",
      attemptCount: 0,
      actorUserId,
      details: {
        requeuedByActorUserId: actorUserId,
        rawResponseTextLogged: false,
        liveMailboxIntegrationUsed: false,
      },
    });
    return row;
  });
}

export async function getResponseProcessingQueueMetrics(): Promise<ResponseProcessingQueueMetrics> {
  await ensureResponseDocumentSchema();
  const result = await sql<any>`
    with counts as (
      select
        count(*)::int as total_jobs,
        coalesce(sum(case when status = 'queued' then 1 else 0 end), 0)::int as queued_jobs,
        coalesce(sum(case when status = 'running' then 1 else 0 end), 0)::int as running_jobs,
        coalesce(sum(case when status = 'succeeded' then 1 else 0 end), 0)::int as succeeded_jobs,
        coalesce(sum(case when status = 'failed' then 1 else 0 end), 0)::int as failed_jobs,
        coalesce(sum(case when status = 'dead_lettered' then 1 else 0 end), 0)::int as dead_lettered_jobs,
        coalesce(sum(case when status = 'running' and locked_until is not null and locked_until < now() then 1 else 0 end), 0)::int as stale_running_jobs,
        coalesce(sum(case when status = 'failed' and run_after <= now() and attempt_count < max_attempts then 1 else 0 end), 0)::int as retry_backlog_jobs,
        extract(epoch from (now() - min(case when status = 'queued' then created_at else null end)))::int as oldest_queued_age_seconds
      from public.response_processing_job
    ),
    duplicate_attempts as (
      select count(*)::int as duplicate_enqueue_attempts
      from public.response_processing_job_event
      where event_type = 'duplicate_enqueue'
    ),
    recent_worker as (
      select event_type, created_at
      from public.response_processing_job_event
      where event_type in ('claimed', 'succeeded', 'retry_scheduled', 'dead_lettered', 'failed')
      order by created_at desc, id desc
      limit 1
    )
    select
      counts.*,
      duplicate_attempts.duplicate_enqueue_attempts,
      recent_worker.event_type as recent_worker_run_status,
      recent_worker.created_at as recent_worker_run_at
    from counts
    cross join duplicate_attempts
    left join recent_worker on true
  `.execute(db);
  const row = result.rows[0] ?? {};
  const oldest = rowValue(row, "oldest_queued_age_seconds");
  return {
    generatedAt: new Date().toISOString(),
    queueVersion: RESPONSE_PROCESSING_QUEUE_VERSION,
    totalJobs: Number(rowValue(row, "total_jobs") ?? 0),
    queuedJobs: Number(rowValue(row, "queued_jobs") ?? 0),
    runningJobs: Number(rowValue(row, "running_jobs") ?? 0),
    succeededJobs: Number(rowValue(row, "succeeded_jobs") ?? 0),
    failedJobs: Number(rowValue(row, "failed_jobs") ?? 0),
    deadLetteredJobs: Number(rowValue(row, "dead_lettered_jobs") ?? 0),
    staleRunningJobs: Number(rowValue(row, "stale_running_jobs") ?? 0),
    retryBacklogJobs: Number(rowValue(row, "retry_backlog_jobs") ?? 0),
    oldestQueuedAgeSeconds: oldest === null || oldest === undefined ? null : Number(oldest),
    duplicateEnqueueAttempts: Number(rowValue(row, "duplicate_enqueue_attempts") ?? 0),
    recentWorkerRunStatus: rowValue(row, "recent_worker_run_status") ? String(rowValue(row, "recent_worker_run_status")) : null,
    recentWorkerRunAt: rowValue(row, "recent_worker_run_at") ? toIso(rowValue(row, "recent_worker_run_at")) : null,
    boundaries: {
      durableDbBacked: true,
      appendOnlyJobEvents: true,
      noRawResponseText: true,
      noSecretsInPayload: true,
      liveMailboxIntegrationUsed: false,
      externalAlertDeliveryUsed: false,
      canonicalFactsMutated: false,
      violationTruthMutated: false,
      packetReadinessMutated: false,
    },
  };
}
