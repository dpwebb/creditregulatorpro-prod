import { createHash } from "node:crypto";
import { sql } from "kysely";

import { db } from "./db";
import { ensureIngestProcessingQueueSchema } from "./ingestProcessingQueueSchema";
import type { Json } from "./schema";

export const INGEST_PROCESSING_QUEUE_VERSION = "ingest-processing-queue-2026-05-20" as const;

export const INGEST_PROCESSING_JOB_TYPES = ["report_ingest_process"] as const;

export type IngestProcessingJobType = typeof INGEST_PROCESSING_JOB_TYPES[number];
export type IngestProcessingJobStatus = "queued" | "running" | "succeeded" | "failed" | "dead_lettered" | "canceled";
export type IngestProcessingJobEventType =
  | "queued"
  | "duplicate_enqueue"
  | "claimed"
  | "lease_extended"
  | "ocr_parsing_started"
  | "compliance_scan_started"
  | "succeeded"
  | "retry_scheduled"
  | "dead_lettered"
  | "operator_retry_requested"
  | "dead_letter_acknowledged"
  | "stale_running_reviewed"
  | "cleanup_attempted"
  | "cleanup_failed"
  | "operator_remediation_action"
  | "canceled";

export type IngestProcessingJobPayload = {
  region?: string | null;
  mimeType?: string | null;
  artifactSha256?: string | null;
  metadata?: Record<string, Json>;
};

export type EnqueueIngestProcessingJobInput = {
  jobType?: IngestProcessingJobType;
  reportArtifactId: number;
  userId: number;
  organizationId?: number | null;
  payload?: IngestProcessingJobPayload;
  idempotencyKey?: string | null;
  actorUserId?: number | null;
  source?: string | null;
  runAfter?: Date | string | null;
  maxAttempts?: number | null;
};

export type IngestProcessingJobRecord = {
  id: number;
  jobType: IngestProcessingJobType;
  status: IngestProcessingJobStatus;
  reportArtifactId: number;
  userId: number;
  organizationId: number | null;
  payload: IngestProcessingJobPayload;
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

export type IngestProcessingQueueEventRecord = {
  id: number;
  jobId: number;
  eventType: IngestProcessingJobEventType;
  previousStatus: IngestProcessingJobStatus | null;
  nextStatus: IngestProcessingJobStatus;
  attemptCount: number;
  workerId: string | null;
  actorUserId: number | null;
  details: Record<string, Json>;
  errorCode: string | null;
  errorReason: string | null;
  createdAt: string;
};

export type EnqueueIngestProcessingJobResult = {
  status: "queued" | "duplicate";
  job: IngestProcessingJobRecord;
  duplicateOfJobId: number | null;
};

export type IngestProcessingQueueMetrics = {
  generatedAt: string;
  queueVersion: typeof INGEST_PROCESSING_QUEUE_VERSION;
  totalJobs: number;
  queuedJobs: number;
  runningJobs: number;
  succeededJobs: number;
  failedJobs: number;
  deadLetteredJobs: number;
  canceledJobs: number;
  staleRunningJobs: number;
  retryBacklogJobs: number;
  oldestQueuedAgeSeconds: number | null;
  duplicateEnqueueAttempts: number;
  boundaries: {
    durableDbBacked: true;
    appendOnlyJobEvents: true;
    noRawReportBytes: true;
    noExtractedReportText: true;
    parserOutputMutated: false;
    ocrBehaviorMutated: false;
    violationTruthMutated: false;
    evidenceBindingMutated: false;
    packetReadinessMutated: false;
    endpointCutoverEnabled: false;
  };
};

type QueueRow = {
  id?: unknown;
  job_id?: unknown;
  jobId?: unknown;
  job_type?: unknown;
  jobType?: unknown;
  status?: unknown;
  report_artifact_id?: unknown;
  reportArtifactId?: unknown;
  user_id?: unknown;
  userId?: unknown;
  organization_id?: unknown;
  organizationId?: unknown;
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

type QueueEventRow = {
  id?: unknown;
  job_id?: unknown;
  jobId?: unknown;
  event_type?: unknown;
  eventType?: unknown;
  previous_status?: unknown;
  previousStatus?: unknown;
  next_status?: unknown;
  nextStatus?: unknown;
  attempt_count?: unknown;
  attemptCount?: unknown;
  worker_id?: unknown;
  workerId?: unknown;
  actor_user_id?: unknown;
  actorUserId?: unknown;
  details?: unknown;
  error_code?: unknown;
  errorCode?: unknown;
  error_reason?: unknown;
  errorReason?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
};

export class IngestProcessingQueueError extends Error {
  readonly code: string;
  readonly permanent: boolean;

  constructor(code: string, message: string, permanent = true) {
    super(message);
    this.name = "IngestProcessingQueueError";
    this.code = code;
    this.permanent = permanent;
  }
}

const JOB_TYPE_SET = new Set<string>(INGEST_PROCESSING_JOB_TYPES);
const STATUS_SET = new Set<string>(["queued", "running", "succeeded", "failed", "dead_lettered", "canceled"]);
const EVENT_TYPE_SET = new Set<string>([
  "queued",
  "duplicate_enqueue",
  "claimed",
  "lease_extended",
  "ocr_parsing_started",
  "compliance_scan_started",
  "succeeded",
  "retry_scheduled",
  "dead_lettered",
  "operator_retry_requested",
  "dead_letter_acknowledged",
  "stale_running_reviewed",
  "cleanup_attempted",
  "cleanup_failed",
  "operator_remediation_action",
  "canceled",
]);
const SAFE_TOKEN_PATTERN = /^[a-zA-Z0-9_.:-]{1,120}$/;
const SAFE_KEY_PATTERN = /^[a-zA-Z0-9_.:-]{1,64}$/;
const HASH_PATTERN = /^[a-f0-9]{32,128}$/i;
const MIME_TYPE_PATTERN = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i;
const REGION_PATTERN = /^[a-zA-Z0-9_.:-]{1,40}$/;
const MAX_PAYLOAD_DEPTH = 4;
const MAX_PAYLOAD_KEYS = 60;
const MAX_PAYLOAD_ARRAY_ITEMS = 30;
const MAX_PAYLOAD_STRING_LENGTH = 240;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_LEASE_SECONDS = 300;
const FORBIDDEN_KEY_PATTERN =
  /(^|[_.:-])(raw.?bytes|bytes.?base64|pdf.?base64|raw.?pdf|report.?bytes|storage.?url|signed.?url|object.?url|raw.?text|report.?text|pdf.?text|ocr.?text|extracted.?text|plain.?text|canonical.?output|deterministic.?pipeline|evidence.?location|body|html|content|password|token|secret|authorization|cookie|session|api.?key|private.?key|database.?url|connection.?string)($|[_.:-])/i;
const FORBIDDEN_VALUE_PATTERN =
  /(%PDF|JVBERi0|data:application\/pdf;base64|raw report text|raw pdf text|full credit report|full report text|storage\.googleapis\.com|x-goog-signature|x-amz-signature|signedurl|signed_url|database_url|postgres:\/\/|mysql:\/\/|mongodb:\/\/|bearer\s+[a-z0-9._-]+|basic\s+[a-z0-9+/=._-]+|sk-[a-z0-9_-]{10,}|ghp_[a-z0-9_]{10,}|github_pat_[a-z0-9_]+|xox[baprs]-[a-z0-9-]+|akia[0-9a-z]{16}|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private key|password\s*[:=]|secret\s*[:=]|session=|cookie=)/i;
const FULL_SIN_PATTERN = /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/;
const FULL_ACCOUNT_PATTERN = /\b(?:account|acct|member)\s*(?:number|no\.?|#)?\s*[:#-]?\s*[A-Z0-9][A-Z0-9 -]{9,}\b|\b\d{10,}\b/i;
const EMAIL_ADDRESS_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

function rowValue(row: QueueRow | QueueEventRow | Record<string, unknown>, snakeCaseKey: string): unknown {
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
    throw new IngestProcessingQueueError("INVALID_NUMERIC_VALUE", `${fieldName} must be a positive integer.`);
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

function sanitizeErrorString(value: unknown, fallback: string, limit = 240): string {
  const raw = String(value ?? fallback).replace(/\s+/g, " ").trim() || fallback;
  const withoutSensitiveContent = (
    FORBIDDEN_VALUE_PATTERN.test(raw) ||
    FULL_SIN_PATTERN.test(raw) ||
    FULL_ACCOUNT_PATTERN.test(raw) ||
    EMAIL_ADDRESS_PATTERN.test(raw)
  )
    ? fallback
    : raw;
  return withoutSensitiveContent.slice(0, limit);
}

function sanitizeToken(value: string | null | undefined, fieldName: string, fallback: string): string {
  const token = String(value ?? fallback).trim();
  if (
    !SAFE_TOKEN_PATTERN.test(token) ||
    FORBIDDEN_KEY_PATTERN.test(token) ||
    FORBIDDEN_VALUE_PATTERN.test(token) ||
    FULL_SIN_PATTERN.test(token) ||
    FULL_ACCOUNT_PATTERN.test(token) ||
    EMAIL_ADDRESS_PATTERN.test(token)
  ) {
    throw new IngestProcessingQueueError("UNSAFE_QUEUE_TOKEN", `${fieldName} must be a safe internal token.`);
  }
  return token;
}

function sanitizeDate(value: Date | string | null | undefined, fieldName: string): Date {
  if (!value) return new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new IngestProcessingQueueError("INVALID_QUEUE_DATE", `${fieldName} must be a valid date.`);
  }
  return date;
}

function sanitizePayloadValue(value: unknown, fieldPath: string, depth: number): Json {
  if (depth > MAX_PAYLOAD_DEPTH) {
    throw new IngestProcessingQueueError("UNSAFE_QUEUE_PAYLOAD", `${fieldPath} is too deeply nested.`);
  }
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new IngestProcessingQueueError("UNSAFE_QUEUE_PAYLOAD", `${fieldPath} includes a non-finite number.`);
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (trimmed.length > MAX_PAYLOAD_STRING_LENGTH) {
      throw new IngestProcessingQueueError("UNSAFE_QUEUE_PAYLOAD", `${fieldPath} string is too long.`);
    }
    if (
      FORBIDDEN_VALUE_PATTERN.test(trimmed) ||
      FULL_SIN_PATTERN.test(trimmed) ||
      FULL_ACCOUNT_PATTERN.test(trimmed) ||
      EMAIL_ADDRESS_PATTERN.test(trimmed)
    ) {
      throw new IngestProcessingQueueError("UNSAFE_QUEUE_PAYLOAD", `${fieldPath} includes sensitive content.`);
    }
    return trimmed;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_PAYLOAD_ARRAY_ITEMS) {
      throw new IngestProcessingQueueError("UNSAFE_QUEUE_PAYLOAD", `${fieldPath} array has too many items.`);
    }
    return value.map((item, index) => sanitizePayloadValue(item, `${fieldPath}.${index}`, depth + 1));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > MAX_PAYLOAD_KEYS) {
      throw new IngestProcessingQueueError("UNSAFE_QUEUE_PAYLOAD", `${fieldPath} has too many keys.`);
    }
    const output: Record<string, Json> = {};
    for (const [key, item] of entries) {
      if (!SAFE_KEY_PATTERN.test(key) || FORBIDDEN_KEY_PATTERN.test(key)) {
        throw new IngestProcessingQueueError("UNSAFE_QUEUE_PAYLOAD", `${fieldPath} includes unsafe key.`);
      }
      output[key] = sanitizePayloadValue(item, `${fieldPath}.${key}`, depth + 1);
    }
    return output;
  }
  throw new IngestProcessingQueueError("UNSAFE_QUEUE_PAYLOAD", `${fieldPath} includes unsupported content.`);
}

function safeDetailsValue(value: unknown, fieldPath: string, depth: number): Json {
  if (depth > MAX_PAYLOAD_DEPTH) return "[redacted]";
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (
      trimmed.length > MAX_PAYLOAD_STRING_LENGTH ||
      FORBIDDEN_VALUE_PATTERN.test(trimmed) ||
      FULL_SIN_PATTERN.test(trimmed) ||
      FULL_ACCOUNT_PATTERN.test(trimmed) ||
      EMAIL_ADDRESS_PATTERN.test(trimmed)
    ) {
      return "[redacted]";
    }
    return trimmed;
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_PAYLOAD_ARRAY_ITEMS).map((item, index) => safeDetailsValue(item, `${fieldPath}.${index}`, depth + 1));
  }
  if (typeof value === "object") {
    const output: Record<string, Json> = {};
    let redactedKeyCount = 0;
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, MAX_PAYLOAD_KEYS)) {
      if (!SAFE_KEY_PATTERN.test(key) || FORBIDDEN_KEY_PATTERN.test(key)) {
        redactedKeyCount += 1;
        output[`redacted_key_${redactedKeyCount}`] = "[redacted]";
        continue;
      }
      output[key] = safeDetailsValue(item, `${fieldPath}.${key}`, depth + 1);
    }
    return output;
  }
  return "[redacted]";
}

function safeDetailsRecord(value: unknown): Record<string, Json> {
  const safe = safeDetailsValue(jsonRecord(value), "details", 0);
  return safe && typeof safe === "object" && !Array.isArray(safe) ? safe as Record<string, Json> : {};
}

function sanitizeOptionalRegion(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const region = String(value).trim();
  if (!REGION_PATTERN.test(region) || FORBIDDEN_VALUE_PATTERN.test(region)) {
    throw new IngestProcessingQueueError("INVALID_QUEUE_PAYLOAD", "payload.region must be a safe region token.");
  }
  return region;
}

function sanitizeOptionalMimeType(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const mimeType = String(value).trim().toLowerCase();
  if (!MIME_TYPE_PATTERN.test(mimeType) || mimeType !== "application/pdf") {
    throw new IngestProcessingQueueError("INVALID_QUEUE_PAYLOAD", "payload.mimeType must be application/pdf.");
  }
  return mimeType;
}

function sanitizeOptionalHash(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  const hash = String(value).trim().toLowerCase();
  if (!HASH_PATTERN.test(hash)) {
    throw new IngestProcessingQueueError("INVALID_QUEUE_PAYLOAD", `${fieldName} must be a safe hash.`);
  }
  return hash;
}

function normalizePayload(payload: IngestProcessingJobPayload | undefined): IngestProcessingJobPayload {
  const safe = sanitizePayloadValue(payload ?? {}, "payload", 0);
  if (!safe || Array.isArray(safe) || typeof safe !== "object") {
    throw new IngestProcessingQueueError("INVALID_QUEUE_PAYLOAD", "Ingest processing job payload must be an object.");
  }
  const source = safe as Record<string, Json>;
  const metadata = source.metadata === undefined
    ? undefined
    : sanitizePayloadValue(source.metadata, "payload.metadata", 0);
  if (metadata !== undefined && (!metadata || Array.isArray(metadata) || typeof metadata !== "object")) {
    throw new IngestProcessingQueueError("INVALID_QUEUE_PAYLOAD", "payload.metadata must be an object.");
  }
  return {
    region: sanitizeOptionalRegion(source.region),
    mimeType: sanitizeOptionalMimeType(source.mimeType),
    artifactSha256: sanitizeOptionalHash(source.artifactSha256, "payload.artifactSha256"),
    ...(metadata === undefined ? {} : { metadata: metadata as Record<string, Json> }),
  };
}

function normalizeJobType(value: IngestProcessingJobType | undefined): IngestProcessingJobType {
  const jobType = value ?? "report_ingest_process";
  if (!JOB_TYPE_SET.has(jobType)) {
    throw new IngestProcessingQueueError("UNSUPPORTED_JOB_TYPE", "Unsupported ingest processing job type.");
  }
  return jobType;
}

function normalizeMaxAttempts(value: number | null | undefined): number {
  if (value === undefined || value === null) return DEFAULT_MAX_ATTEMPTS;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 25) {
    throw new IngestProcessingQueueError("INVALID_MAX_ATTEMPTS", "maxAttempts must be an integer from 1 to 25.");
  }
  return parsed;
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

function buildIdempotencyKey(input: {
  jobType: IngestProcessingJobType;
  reportArtifactId: number;
  userId: number;
  payload: IngestProcessingJobPayload;
  source: string;
}): string {
  return sha256(stableJsonStringify({
    jobType: input.jobType,
    payload: input.payload,
    queueVersion: INGEST_PROCESSING_QUEUE_VERSION,
    reportArtifactId: input.reportArtifactId,
    source: input.source,
    userId: input.userId,
  }));
}

function hasUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  return (
    candidate?.code === "23505" ||
    candidate?.cause?.code === "23505" ||
    /idx_ingest_processing_job_active_idempotency_unique|duplicate key value/i.test(candidate?.message ?? "") ||
    /idx_ingest_processing_job_active_idempotency_unique|duplicate key value/i.test(candidate?.cause?.message ?? "")
  );
}

function normalizeError(error: unknown): { code: string; reason: string; permanent: boolean } {
  if (error instanceof IngestProcessingQueueError) {
    return {
      code: sanitizeToken(error.code, "errorCode", "INGEST_QUEUE_ERROR").slice(0, 80),
      reason: sanitizeErrorString(error.message, "Ingest processing queue error."),
      permanent: error.permanent,
    };
  }
  return {
    code: "INGEST_PROCESSING_FAILED",
    reason: sanitizeErrorString(error instanceof Error ? error.message : String(error), "Ingest processing job failed."),
    permanent: false,
  };
}

function retryDelaySeconds(attemptCount: number): number {
  return Math.min(60 * 2 ** Math.max(0, attemptCount - 1), 3600);
}

function mapJobRow(row: QueueRow): IngestProcessingJobRecord {
  return {
    id: requiredNumber(rowValue(row, "id"), "id"),
    jobType: String(rowValue(row, "job_type")) as IngestProcessingJobType,
    status: String(rowValue(row, "status")) as IngestProcessingJobStatus,
    reportArtifactId: requiredNumber(rowValue(row, "report_artifact_id"), "reportArtifactId"),
    userId: requiredNumber(rowValue(row, "user_id"), "userId"),
    organizationId: toNumber(rowValue(row, "organization_id")),
    payload: jsonRecord(rowValue(row, "payload")) as IngestProcessingJobPayload,
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
    lastErrorReason: rowValue(row, "last_error_reason") ? sanitizeErrorString(rowValue(row, "last_error_reason"), "Ingest processing job error.") : null,
    resultSummary: safeDetailsRecord(rowValue(row, "result_summary")),
  };
}

function mapEventRow(row: QueueEventRow): IngestProcessingQueueEventRecord {
  return {
    id: requiredNumber(rowValue(row, "id"), "event.id"),
    jobId: requiredNumber(rowValue(row, "job_id"), "event.jobId"),
    eventType: String(rowValue(row, "event_type")) as IngestProcessingJobEventType,
    previousStatus: rowValue(row, "previous_status") ? String(rowValue(row, "previous_status")) as IngestProcessingJobStatus : null,
    nextStatus: String(rowValue(row, "next_status")) as IngestProcessingJobStatus,
    attemptCount: Number(rowValue(row, "attempt_count") ?? 0),
    workerId: rowValue(row, "worker_id") ? String(rowValue(row, "worker_id")) : null,
    actorUserId: toNumber(rowValue(row, "actor_user_id")),
    details: safeDetailsRecord(rowValue(row, "details")),
    errorCode: rowValue(row, "error_code") ? sanitizeErrorString(rowValue(row, "error_code"), "INGEST_QUEUE_ERROR", 80) : null,
    errorReason: rowValue(row, "error_reason") ? sanitizeErrorString(rowValue(row, "error_reason"), "Ingest processing event error.") : null,
    createdAt: toIso(rowValue(row, "created_at")),
  };
}

async function appendJobEvent(
  executor: any,
  params: {
    jobId: number;
    eventType: IngestProcessingJobEventType;
    previousStatus?: IngestProcessingJobStatus | null;
    nextStatus: IngestProcessingJobStatus;
    attemptCount: number;
    workerId?: string | null;
    actorUserId?: number | null;
    details?: Record<string, Json>;
    errorCode?: string | null;
    errorReason?: string | null;
  },
): Promise<void> {
  await sql`
    insert into public.ingest_processing_job_event (
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
      ${JSON.stringify(safeDetailsRecord(params.details ?? {}))}::text::jsonb,
      ${params.errorCode ? sanitizeErrorString(params.errorCode, "INGEST_QUEUE_ERROR", 80) : null},
      ${params.errorReason ? sanitizeErrorString(params.errorReason, "Ingest processing event error.") : null}
    )
  `.execute(executor);
}

async function findActiveJobByIdempotencyKey(idempotencyKey: string): Promise<IngestProcessingJobRecord | null> {
  const result = await sql<QueueRow>`
    select *
    from public.ingest_processing_job
    where idempotency_key = ${idempotencyKey}
      and status in ('queued', 'running', 'failed')
    order by created_at asc, id asc
    limit 1
  `.execute(db);
  return result.rows[0] ? mapJobRow(result.rows[0]) : null;
}

export async function enqueueIngestProcessingJob(
  input: EnqueueIngestProcessingJobInput,
): Promise<EnqueueIngestProcessingJobResult> {
  await ensureIngestProcessingQueueSchema();
  const jobType = normalizeJobType(input.jobType);
  const reportArtifactId = requiredNumber(input.reportArtifactId, "reportArtifactId");
  const userId = requiredNumber(input.userId, "userId");
  const organizationId = input.organizationId === null || input.organizationId === undefined
    ? null
    : requiredNumber(input.organizationId, "organizationId");
  const actorUserId = input.actorUserId === null || input.actorUserId === undefined
    ? null
    : requiredNumber(input.actorUserId, "actorUserId");
  const source = sanitizeToken(input.source, "source", "operator");
  const payload = normalizePayload(input.payload);
  const idempotencyKey = input.idempotencyKey
    ? sanitizeToken(input.idempotencyKey, "idempotencyKey", "")
    : buildIdempotencyKey({ jobType, reportArtifactId, userId, payload, source });
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
        rawReportBytesStored: false,
        extractedReportTextStored: false,
      },
    });
    return { status: "duplicate", job: existing, duplicateOfJobId: existing.id };
  }

  try {
    const job = await db.transaction().execute(async (trx) => {
      const result = await sql<QueueRow>`
        insert into public.ingest_processing_job (
          job_type,
          status,
          report_artifact_id,
          user_id,
          organization_id,
          payload,
          idempotency_key,
          actor_user_id,
          source,
          run_after,
          max_attempts
        ) values (
          ${jobType},
          'queued',
          ${reportArtifactId},
          ${userId},
          ${organizationId},
          ${JSON.stringify(payload)}::text::jsonb,
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
          queueVersion: INGEST_PROCESSING_QUEUE_VERSION,
          rawReportBytesStored: false,
          extractedReportTextStored: false,
          endpointCutoverEnabled: false,
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
        rawReportBytesStored: false,
        extractedReportTextStored: false,
      },
    });
    return { status: "duplicate", job: duplicate, duplicateOfJobId: duplicate.id };
  }
}

export async function peekNextIngestProcessingJob(sourceFilter?: string | null): Promise<IngestProcessingJobRecord | null> {
  await ensureIngestProcessingQueueSchema();
  const source = sourceFilter ? sanitizeToken(sourceFilter, "source", "") : null;
  const result = await sql<QueueRow>`
    select *
    from public.ingest_processing_job
    where (
        status in ('queued', 'failed')
        and run_after <= now()
        and attempt_count < max_attempts
      )
      and (${source}::text is null or source = ${source})
    order by
      run_after asc,
      created_at asc,
      id asc
    limit 1
  `.execute(db);
  return result.rows[0] ? mapJobRow(result.rows[0]) : null;
}

export async function claimNextIngestProcessingJob(input: {
  workerId: string;
  leaseSeconds?: number;
  source?: string | null;
}): Promise<IngestProcessingJobRecord | null> {
  await ensureIngestProcessingQueueSchema();
  const workerId = sanitizeToken(input.workerId, "workerId", "ingest-worker");
  const source = input.source ? sanitizeToken(input.source, "source", "") : null;
  const leaseSeconds = Math.min(Math.max(Number(input.leaseSeconds ?? DEFAULT_LEASE_SECONDS), 30), 3600);

  return db.transaction().execute(async (trx) => {
    const candidates = await sql<QueueRow>`
      select *
      from public.ingest_processing_job
      where (
          status in ('queued', 'failed')
          and run_after <= now()
          and attempt_count < max_attempts
        )
        and (${source}::text is null or source = ${source})
      order by
        run_after asc,
        created_at asc,
        id asc
      for update skip locked
      limit 1
    `.execute(trx);
    const candidate = candidates.rows[0] ? mapJobRow(candidates.rows[0]) : null;
    if (!candidate) return null;

    const updated = await sql<QueueRow>`
      update public.ingest_processing_job
      set
        status = 'running',
        attempt_count = attempt_count + 1,
        started_at = coalesce(started_at, now()),
        updated_at = now(),
        locked_by = ${workerId},
        locked_at = now(),
        locked_until = now() + make_interval(secs => ${leaseSeconds})
      where id = ${candidate.id}
        and status in ('queued', 'failed')
        and attempt_count < max_attempts
        and (${source}::text is null or source = ${source})
      returning *
    `.execute(trx);
    if (!updated.rows[0]) return null;
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
        staleReclaim: false,
        leaseSeconds,
        rawReportBytesLogged: false,
        extractedReportTextLogged: false,
      },
    });
    return claimed;
  });
}

export async function extendIngestProcessingJobLease(params: {
  job: IngestProcessingJobRecord;
  workerId: string;
  leaseSeconds?: number;
}): Promise<IngestProcessingJobRecord> {
  await ensureIngestProcessingQueueSchema();
  const workerId = sanitizeToken(params.workerId, "workerId", "ingest-worker");
  const leaseSeconds = Math.min(Math.max(Number(params.leaseSeconds ?? DEFAULT_LEASE_SECONDS), 30), 3600);

  return db.transaction().execute(async (trx) => {
    const updated = await sql<QueueRow>`
      update public.ingest_processing_job
      set
        updated_at = now(),
        locked_until = now() + make_interval(secs => ${leaseSeconds})
      where id = ${params.job.id}
        and status = 'running'
        and locked_by = ${workerId}
        and attempt_count = ${params.job.attemptCount}
      returning *
    `.execute(trx);
    if (!updated.rows[0]) {
      throw new IngestProcessingQueueError(
        "JOB_LEASE_EXTEND_CONFLICT",
        "Ingest processing job lease was not extended because the worker no longer held the active lease.",
        true,
      );
    }
    const row = mapJobRow(updated.rows[0]);
    await appendJobEvent(trx as typeof db, {
      jobId: row.id,
      eventType: "lease_extended",
      previousStatus: "running",
      nextStatus: "running",
      attemptCount: row.attemptCount,
      workerId,
      actorUserId: row.actorUserId,
      details: {
        leaseSeconds,
        rawReportBytesLogged: false,
        extractedReportTextLogged: false,
      },
    });
    return row;
  });
}

export async function markIngestProcessingJobSucceeded(params: {
  job: IngestProcessingJobRecord;
  workerId: string;
  resultSummary?: Record<string, Json>;
}): Promise<IngestProcessingJobRecord> {
  await ensureIngestProcessingQueueSchema();
  const workerId = sanitizeToken(params.workerId, "workerId", "ingest-worker");
  const resultSummary = safeDetailsRecord({
    ...(params.resultSummary ?? {}),
    rawReportBytesLogged: false,
    extractedReportTextLogged: false,
    parserOutputMutated: false,
    ocrBehaviorMutated: false,
    violationTruthMutated: false,
    evidenceBindingMutated: false,
    packetReadinessMutated: false,
  });

  return db.transaction().execute(async (trx) => {
    const updated = await sql<QueueRow>`
      update public.ingest_processing_job
      set
        status = 'succeeded',
        finished_at = now(),
        updated_at = now(),
        locked_by = null,
        locked_at = null,
        locked_until = null,
        last_error_code = null,
        last_error_reason = null,
        result_summary = ${JSON.stringify(resultSummary)}::text::jsonb
      where id = ${params.job.id}
        and status = 'running'
        and locked_by = ${workerId}
        and attempt_count = ${params.job.attemptCount}
      returning *
    `.execute(trx);
    if (!updated.rows[0]) {
      throw new IngestProcessingQueueError(
        "JOB_FINALIZE_CONFLICT",
        "Ingest processing job was not finalized because the worker no longer held the active lease.",
        true,
      );
    }
    const row = mapJobRow(updated.rows[0]);
    await appendJobEvent(trx as typeof db, {
      jobId: row.id,
      eventType: "succeeded",
      previousStatus: "running",
      nextStatus: "succeeded",
      attemptCount: row.attemptCount,
      workerId,
      actorUserId: row.actorUserId,
      details: resultSummary,
    });
    return row;
  });
}

export async function markIngestProcessingJobFailed(params: {
  job: IngestProcessingJobRecord;
  workerId: string;
  error: unknown;
}): Promise<IngestProcessingJobRecord> {
  await ensureIngestProcessingQueueSchema();
  const normalized = normalizeError(params.error);
  const workerId = sanitizeToken(params.workerId, "workerId", "ingest-worker");
  const deadLetter = normalized.permanent || params.job.attemptCount >= params.job.maxAttempts;
  const nextStatus: IngestProcessingJobStatus = deadLetter ? "dead_lettered" : "failed";
  const eventType: IngestProcessingJobEventType = deadLetter ? "dead_lettered" : "retry_scheduled";
  const retryDelay = deadLetter ? 0 : retryDelaySeconds(params.job.attemptCount);

  return db.transaction().execute(async (trx) => {
    const updated = await sql<QueueRow>`
      update public.ingest_processing_job
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
          rawReportBytesLogged: false,
          extractedReportTextLogged: false,
        })}::text::jsonb
      where id = ${params.job.id}
        and status = 'running'
        and locked_by = ${workerId}
        and attempt_count = ${params.job.attemptCount}
      returning *
    `.execute(trx);
    if (!updated.rows[0]) {
      throw new IngestProcessingQueueError(
        "JOB_FINALIZE_CONFLICT",
        "Ingest processing job was not failed because the worker no longer held the active lease.",
        true,
      );
    }
    const row = mapJobRow(updated.rows[0]);
    await appendJobEvent(trx as typeof db, {
      jobId: row.id,
      eventType,
      previousStatus: "running",
      nextStatus,
      attemptCount: row.attemptCount,
      workerId,
      actorUserId: row.actorUserId,
      errorCode: normalized.code,
      errorReason: normalized.reason,
      details: {
        retryDelaySeconds: retryDelay,
        permanent: deadLetter,
        rawReportBytesLogged: false,
        extractedReportTextLogged: false,
      },
    });
    return row;
  });
}

export async function recordIngestProcessingJobEvent(params: {
  jobId: number;
  eventType: IngestProcessingJobEventType;
  previousStatus?: IngestProcessingJobStatus | null;
  nextStatus?: IngestProcessingJobStatus | null;
  attemptCount?: number | null;
  workerId?: string | null;
  actorUserId?: number | null;
  details?: Record<string, Json>;
  errorCode?: string | null;
  errorReason?: string | null;
}): Promise<IngestProcessingQueueEventRecord> {
  await ensureIngestProcessingQueueSchema();
  const jobId = requiredNumber(params.jobId, "jobId");
  if (!EVENT_TYPE_SET.has(params.eventType)) {
    throw new IngestProcessingQueueError("UNSUPPORTED_EVENT_TYPE", "Unsupported ingest processing event type.");
  }
  const jobResult = await sql<QueueRow>`
    select *
    from public.ingest_processing_job
    where id = ${jobId}
  `.execute(db);
  const job = jobResult.rows[0] ? mapJobRow(jobResult.rows[0]) : null;
  if (!job) throw new IngestProcessingQueueError("JOB_NOT_FOUND", "Ingest processing job not found.");
  const nextStatus = params.nextStatus ?? job.status;
  if (!STATUS_SET.has(nextStatus)) {
    throw new IngestProcessingQueueError("INVALID_QUEUE_STATUS", "Unsupported ingest processing job status.");
  }
  await appendJobEvent(db, {
    jobId,
    eventType: params.eventType,
    previousStatus: params.previousStatus ?? null,
    nextStatus,
    attemptCount: params.attemptCount ?? job.attemptCount,
    workerId: params.workerId ? sanitizeToken(params.workerId, "workerId", "") : null,
    actorUserId: params.actorUserId ?? job.actorUserId,
    details: params.details,
    errorCode: params.errorCode,
    errorReason: params.errorReason,
  });
  const eventResult = await sql<QueueEventRow>`
    select *
    from public.ingest_processing_job_event
    where job_id = ${jobId}
    order by created_at desc, id desc
    limit 1
  `.execute(db);
  return mapEventRow(eventResult.rows[0]);
}

export async function listIngestProcessingJobEvents(jobId: number): Promise<IngestProcessingQueueEventRecord[]> {
  await ensureIngestProcessingQueueSchema();
  const safeJobId = requiredNumber(jobId, "jobId");
  const events = await sql<QueueEventRow>`
    select *
    from public.ingest_processing_job_event
    where job_id = ${safeJobId}
    order by created_at asc, id asc
  `.execute(db);
  return events.rows.map(mapEventRow);
}

export async function getIngestProcessingQueueMetrics(): Promise<IngestProcessingQueueMetrics> {
  await ensureIngestProcessingQueueSchema();
  const counts = await sql<Record<string, unknown>>`
    select
      count(*)::int as total_jobs,
      count(*) filter (where status = 'queued')::int as queued_jobs,
      count(*) filter (where status = 'running')::int as running_jobs,
      count(*) filter (where status = 'succeeded')::int as succeeded_jobs,
      count(*) filter (where status = 'failed')::int as failed_jobs,
      count(*) filter (where status = 'dead_lettered')::int as dead_lettered_jobs,
      count(*) filter (where status = 'canceled')::int as canceled_jobs,
      count(*) filter (where status = 'running' and locked_until is not null and locked_until < now())::int as stale_running_jobs,
      count(*) filter (where status = 'failed' and run_after <= now() and attempt_count < max_attempts)::int as retry_backlog_jobs,
      extract(epoch from (now() - min(created_at) filter (where status = 'queued')))::int as oldest_queued_age_seconds
    from public.ingest_processing_job
  `.execute(db);
  const eventCounts = await sql<Record<string, unknown>>`
    select
      count(*) filter (where event_type = 'duplicate_enqueue')::int as duplicate_enqueue_attempts
    from public.ingest_processing_job_event
  `.execute(db);
  const row = counts.rows[0] ?? {};
  const events = eventCounts.rows[0] ?? {};
  return {
    generatedAt: new Date().toISOString(),
    queueVersion: INGEST_PROCESSING_QUEUE_VERSION,
    totalJobs: Number(rowValue(row, "total_jobs") ?? 0),
    queuedJobs: Number(rowValue(row, "queued_jobs") ?? 0),
    runningJobs: Number(rowValue(row, "running_jobs") ?? 0),
    succeededJobs: Number(rowValue(row, "succeeded_jobs") ?? 0),
    failedJobs: Number(rowValue(row, "failed_jobs") ?? 0),
    deadLetteredJobs: Number(rowValue(row, "dead_lettered_jobs") ?? 0),
    canceledJobs: Number(rowValue(row, "canceled_jobs") ?? 0),
    staleRunningJobs: Number(rowValue(row, "stale_running_jobs") ?? 0),
    retryBacklogJobs: Number(rowValue(row, "retry_backlog_jobs") ?? 0),
    oldestQueuedAgeSeconds: toNumber(rowValue(row, "oldest_queued_age_seconds")),
    duplicateEnqueueAttempts: Number(rowValue(events, "duplicate_enqueue_attempts") ?? 0),
    boundaries: {
      durableDbBacked: true,
      appendOnlyJobEvents: true,
      noRawReportBytes: true,
      noExtractedReportText: true,
      parserOutputMutated: false,
      ocrBehaviorMutated: false,
      violationTruthMutated: false,
      evidenceBindingMutated: false,
      packetReadinessMutated: false,
      endpointCutoverEnabled: false,
    },
  };
}
