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

export type IngestProcessingQueuePayloadSummary = {
  reportArtifactId: number;
  region: string | null;
  mimeType: string | null;
  artifactSha256Present: boolean;
  metadataKeys: string[];
  rawReportBytesStored: false;
  extractedReportTextStored: false;
};

export type IngestProcessingJobInspection = Omit<IngestProcessingJobRecord, "payload" | "resultSummary"> & {
  payloadSummary: IngestProcessingQueuePayloadSummary;
  resultSummary: Record<string, Json>;
  staleRunning: boolean;
  retryEligible: boolean;
  reviewEligible: boolean;
  cancelEligible: boolean;
  remediationStatus: {
    deadLetterReviewedAt: string | null;
    staleRunningReviewedAt: string | null;
    canceledAt: string | null;
    replacementJobId: number | null;
  };
  lastEvent: IngestProcessingQueueEventRecord | null;
  events?: IngestProcessingQueueEventRecord[];
};

export type ListIngestProcessingJobsInput = {
  jobId?: number | null;
  status?: IngestProcessingJobStatus | null;
  limit?: number | null;
  offset?: number | null;
  includeEvents?: boolean;
};

export type ListIngestProcessingJobsResult = {
  jobs: IngestProcessingJobInspection[];
  total: number;
};

export type IngestProcessingRemediationAction =
  | "retry_dead_letter"
  | "mark_reviewed"
  | "cancel_job";

export type RemediateIngestProcessingJobInput = {
  jobId: number;
  action: IngestProcessingRemediationAction;
  actorUserId: number;
  confirmRetry?: boolean | null;
  confirmReview?: boolean | null;
  confirmCancel?: boolean | null;
  reviewNote?: string | null;
};

export type RemediateIngestProcessingJobResult = {
  status: "replacement_queued" | "reviewed" | "canceled";
  job: IngestProcessingJobInspection;
  replacementJob: IngestProcessingJobInspection | null;
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
  cleanupAttemptedEvents: number;
  cleanupFailedEvents: number;
  cleanupFailedJobs: number;
  operatorRemediationEvents: number;
  deadLetterReviewedJobs: number;
  staleRunningReviewedJobs: number;
  lastRemediationStatus: string | null;
  lastRemediationAt: string | null;
  workerLiveness: IngestProcessingWorkerLiveness;
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
    endpointCutoverEnabled: true;
  };
};

export type IngestProcessingWorkerHeartbeatRecord = {
  workerId: string;
  source: string | null;
  status: string;
  lastSeenAt: string;
  details: Record<string, Json>;
};

export type IngestProcessingWorkerLiveness = {
  checkedAt: string;
  staleAfterSeconds: number;
  hasRecentHeartbeat: boolean;
  stale: boolean;
  ageSeconds: number | null;
  workerId: string | null;
  source: string | null;
  status: string | null;
  lastSeenAt: string | null;
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

type WorkerHeartbeatRow = {
  worker_id?: unknown;
  workerId?: unknown;
  source?: unknown;
  status?: unknown;
  last_seen_at?: unknown;
  lastSeenAt?: unknown;
  details?: unknown;
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

function rowValue(row: QueueRow | QueueEventRow | WorkerHeartbeatRow | Record<string, unknown>, snakeCaseKey: string): unknown {
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

function isMissingQueueTable(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  return (
    candidate?.code === "42P01" ||
    candidate?.cause?.code === "42P01" ||
    /relation .*ingest_processing_(job|worker_heartbeat).* does not exist/i.test(candidate?.message ?? "") ||
    /relation .*ingest_processing_(job|worker_heartbeat).* does not exist/i.test(candidate?.cause?.message ?? "")
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

function normalizeStatusFilter(value: IngestProcessingJobStatus | null | undefined): IngestProcessingJobStatus | null {
  if (value === undefined || value === null) return null;
  if (!STATUS_SET.has(value)) {
    throw new IngestProcessingQueueError("INVALID_QUEUE_STATUS", "Unsupported ingest processing job status filter.");
  }
  return value;
}

function normalizeRemediationAction(value: IngestProcessingRemediationAction): IngestProcessingRemediationAction {
  if (!["retry_dead_letter", "mark_reviewed", "cancel_job"].includes(value)) {
    throw new IngestProcessingQueueError("UNSUPPORTED_REMEDIATION_ACTION", "Unsupported ingest processing queue remediation action.");
  }
  return value;
}

function normalizeLimit(value: number | null | undefined, fallback: number, max: number): number {
  if (value === undefined || value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > max) {
    throw new IngestProcessingQueueError("INVALID_QUEUE_LIMIT", `limit must be an integer from 1 to ${max}.`);
  }
  return parsed;
}

function normalizeOffset(value: number | null | undefined): number {
  if (value === undefined || value === null) return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new IngestProcessingQueueError("INVALID_QUEUE_OFFSET", "offset must be a non-negative integer.");
  }
  return parsed;
}

function normalizeReviewNote(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const safe = safeDetailsValue(value, "reviewNote", 0);
  if (typeof safe !== "string" || safe === "[redacted]") {
    throw new IngestProcessingQueueError("UNSAFE_REMEDIATION_NOTE", "reviewNote includes unsafe content.");
  }
  return safe.slice(0, 500);
}

function isJobStaleRunning(job: IngestProcessingJobRecord): boolean {
  return job.status === "running" && Boolean(job.lockedUntil) && new Date(job.lockedUntil as string).getTime() < Date.now();
}

function summarizePayload(job: IngestProcessingJobRecord): IngestProcessingQueuePayloadSummary {
  return {
    reportArtifactId: job.reportArtifactId,
    region: job.payload.region ?? null,
    mimeType: job.payload.mimeType ?? null,
    artifactSha256Present: Boolean(job.payload.artifactSha256),
    metadataKeys: Object.keys(job.payload.metadata ?? {}).sort(),
    rawReportBytesStored: false,
    extractedReportTextStored: false,
  };
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

function mapWorkerHeartbeatRow(row: WorkerHeartbeatRow): IngestProcessingWorkerHeartbeatRecord {
  return {
    workerId: sanitizeToken(String(rowValue(row, "worker_id") ?? ""), "workerId", "ingest-worker"),
    source: rowValue(row, "source") ? String(rowValue(row, "source")) : null,
    status: sanitizeToken(String(rowValue(row, "status") ?? "unknown"), "status", "unknown"),
    lastSeenAt: toIso(rowValue(row, "last_seen_at")),
    details: safeDetailsRecord(rowValue(row, "details")),
  };
}

function normalizeStaleAfterSeconds(value: number | null | undefined): number {
  const parsed = Number(value ?? 300);
  if (!Number.isFinite(parsed)) return 300;
  return Math.min(Math.max(Math.floor(parsed), 30), 3600);
}

function emptyWorkerLiveness(staleAfterSeconds: number): IngestProcessingWorkerLiveness {
  return {
    checkedAt: new Date().toISOString(),
    staleAfterSeconds,
    hasRecentHeartbeat: false,
    stale: true,
    ageSeconds: null,
    workerId: null,
    source: null,
    status: null,
    lastSeenAt: null,
  };
}

function replacementJobIdFromEvent(event: IngestProcessingQueueEventRecord | null): number | null {
  const replacementJobId = event?.details.replacementJobId;
  return typeof replacementJobId === "number" && Number.isInteger(replacementJobId) && replacementJobId > 0
    ? replacementJobId
    : null;
}

function buildInspection(
  job: IngestProcessingJobRecord,
  events: IngestProcessingQueueEventRecord[],
  includeEvents = true,
): IngestProcessingJobInspection {
  const sortedEvents = [...events].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id - right.id);
  const lastEvent = sortedEvents[sortedEvents.length - 1] ?? null;
  const deadLetterReviewedEvent = [...sortedEvents].reverse().find((event) => event.eventType === "dead_letter_acknowledged") ?? null;
  const staleReviewedEvent = [...sortedEvents].reverse().find((event) => event.eventType === "stale_running_reviewed") ?? null;
  const canceledEvent = [...sortedEvents].reverse().find((event) => event.eventType === "canceled") ?? null;
  const replacementEvent = [...sortedEvents].reverse().find((event) => event.eventType === "operator_retry_requested") ?? null;
  const staleRunning = isJobStaleRunning(job);
  const replacementJobId = replacementJobIdFromEvent(replacementEvent);
  return {
    id: job.id,
    jobType: job.jobType,
    status: job.status,
    reportArtifactId: job.reportArtifactId,
    userId: job.userId,
    organizationId: job.organizationId,
    idempotencyKey: job.idempotencyKey,
    actorUserId: job.actorUserId,
    source: job.source,
    runAfter: job.runAfter,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    lockedBy: job.lockedBy,
    lockedAt: job.lockedAt,
    lockedUntil: job.lockedUntil,
    lastErrorCode: job.lastErrorCode,
    lastErrorReason: job.lastErrorReason,
    payloadSummary: summarizePayload(job),
    resultSummary: safeDetailsRecord(job.resultSummary),
    staleRunning,
    retryEligible: job.status === "dead_lettered" && !replacementJobId,
    reviewEligible: (job.status === "dead_lettered" && !deadLetterReviewedEvent) || (staleRunning && !staleReviewedEvent),
    cancelEligible: job.status === "queued" || job.status === "failed",
    remediationStatus: {
      deadLetterReviewedAt: deadLetterReviewedEvent?.createdAt ?? null,
      staleRunningReviewedAt: staleReviewedEvent?.createdAt ?? null,
      canceledAt: canceledEvent?.createdAt ?? null,
      replacementJobId,
    },
    lastEvent,
    ...(includeEvents ? { events: sortedEvents } : {}),
  };
}

async function loadEventsForJobs(
  jobIds: number[],
  executor: any = db,
): Promise<Map<number, IngestProcessingQueueEventRecord[]>> {
  if (jobIds.length === 0) return new Map();
  const result = await sql<QueueEventRow>`
    select *
    from public.ingest_processing_job_event
    where job_id in (${sql.join(jobIds)})
    order by created_at asc, id asc
  `.execute(executor);
  const byJobId = new Map<number, IngestProcessingQueueEventRecord[]>();
  for (const row of result.rows.map(mapEventRow)) {
    const existing = byJobId.get(row.jobId) ?? [];
    existing.push(row);
    byJobId.set(row.jobId, existing);
  }
  return byJobId;
}

async function loadJobInspection(
  jobId: number,
  executor: any = db,
  includeEvents = true,
): Promise<IngestProcessingJobInspection> {
  const result = await sql<QueueRow>`
    select *
    from public.ingest_processing_job
    where id = ${jobId}
  `.execute(executor);
  const job = result.rows[0] ? mapJobRow(result.rows[0]) : null;
  if (!job) throw new IngestProcessingQueueError("JOB_NOT_FOUND", "Ingest processing job not found.");
  const eventMap = await loadEventsForJobs([job.id], executor);
  return buildInspection(job, eventMap.get(job.id) ?? [], includeEvents);
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

async function findActiveReplacementByIdempotencyKey(
  idempotencyKey: string,
  originalJobId: number,
  executor: any,
): Promise<IngestProcessingJobRecord | null> {
  const result = await sql<QueueRow>`
    select *
    from public.ingest_processing_job
    where idempotency_key = ${idempotencyKey}
      and id <> ${originalJobId}
      and status in ('queued', 'running', 'failed')
    order by created_at asc, id asc
    limit 1
  `.execute(executor);
  return result.rows[0] ? mapJobRow(result.rows[0]) : null;
}

export async function getLatestIngestProcessingJobByIdempotencyKey(
  idempotencyKey: string,
): Promise<IngestProcessingJobRecord | null> {
  await ensureIngestProcessingQueueSchema();
  const safeIdempotencyKey = sanitizeToken(idempotencyKey, "idempotencyKey", "");
  const result = await sql<QueueRow>`
    select *
    from public.ingest_processing_job
    where idempotency_key = ${safeIdempotencyKey}
    order by created_at desc, id desc
    limit 1
  `.execute(db);
  return result.rows[0] ? mapJobRow(result.rows[0]) : null;
}

export async function getLatestIngestProcessingJobForArtifact(
  reportArtifactId: number,
): Promise<IngestProcessingJobRecord | null> {
  await ensureIngestProcessingQueueSchema();
  const safeArtifactId = requiredNumber(reportArtifactId, "reportArtifactId");
  const result = await sql<QueueRow>`
    select *
    from public.ingest_processing_job
    where report_artifact_id = ${safeArtifactId}
    order by created_at desc, id desc
    limit 1
  `.execute(db);
  return result.rows[0] ? mapJobRow(result.rows[0]) : null;
}

export async function getLatestIngestProcessingJobForArtifactReadOnly(
  reportArtifactId: number,
): Promise<IngestProcessingJobRecord | null> {
  const safeArtifactId = requiredNumber(reportArtifactId, "reportArtifactId");
  try {
    const result = await sql<QueueRow>`
      select *
      from public.ingest_processing_job
      where report_artifact_id = ${safeArtifactId}
      order by created_at desc, id desc
      limit 1
    `.execute(db);
    return result.rows[0] ? mapJobRow(result.rows[0]) : null;
  } catch (error) {
    if (isMissingQueueTable(error)) return null;
    throw error;
  }
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
          endpointCutoverEnabled: true,
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

export async function claimIngestProcessingJobById(input: {
  jobId: number;
  workerId: string;
  leaseSeconds?: number;
}): Promise<IngestProcessingJobRecord | null> {
  await ensureIngestProcessingQueueSchema();
  const jobId = requiredNumber(input.jobId, "jobId");
  const workerId = sanitizeToken(input.workerId, "workerId", "ingest-worker");
  const leaseSeconds = Math.min(Math.max(Number(input.leaseSeconds ?? DEFAULT_LEASE_SECONDS), 30), 3600);

  return db.transaction().execute(async (trx) => {
    const candidates = await sql<QueueRow>`
      select *
      from public.ingest_processing_job
      where id = ${jobId}
        and status in ('queued', 'failed')
        and run_after <= now()
        and attempt_count < max_attempts
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
        requestBoundImmediateProcessing: true,
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

export async function recordIngestProcessingWorkerHeartbeat(params: {
  workerId: string;
  source?: string | null;
  status: string;
  details?: Record<string, Json>;
}): Promise<IngestProcessingWorkerHeartbeatRecord> {
  await ensureIngestProcessingQueueSchema();
  const workerId = sanitizeToken(params.workerId, "workerId", "ingest-worker");
  const source = params.source ? sanitizeToken(params.source, "source", "") : null;
  const status = sanitizeToken(params.status, "status", "heartbeat");
  const result = await sql<WorkerHeartbeatRow>`
    insert into public.ingest_processing_worker_heartbeat (
      worker_id,
      source,
      status,
      last_seen_at,
      details
    ) values (
      ${workerId},
      ${source},
      ${status},
      now(),
      ${JSON.stringify(safeDetailsRecord(params.details ?? {}))}::text::jsonb
    )
    on conflict (worker_id)
    do update set
      source = excluded.source,
      status = excluded.status,
      last_seen_at = now(),
      details = excluded.details
    returning *
  `.execute(db);
  return mapWorkerHeartbeatRow(result.rows[0]);
}

export async function getIngestProcessingWorkerLiveness(input: {
  source?: string | null;
  staleAfterSeconds?: number | null;
  ensureSchema?: boolean;
} = {}): Promise<IngestProcessingWorkerLiveness> {
  if (input.ensureSchema !== false) await ensureIngestProcessingQueueSchema();
  const staleAfterSeconds = normalizeStaleAfterSeconds(input.staleAfterSeconds);
  const source = input.source ? sanitizeToken(input.source, "source", "") : null;
  const result = await sql<WorkerHeartbeatRow>`
    select *
    from public.ingest_processing_worker_heartbeat
    where (${source}::text is null or source = ${source})
    order by last_seen_at desc, worker_id asc
    limit 1
  `.execute(db);
  const heartbeat = result.rows[0] ? mapWorkerHeartbeatRow(result.rows[0]) : null;
  if (!heartbeat) return emptyWorkerLiveness(staleAfterSeconds);

  const checkedAt = new Date();
  const lastSeenMs = Date.parse(heartbeat.lastSeenAt);
  const ageSeconds = Number.isFinite(lastSeenMs)
    ? Math.max(0, Math.floor((checkedAt.getTime() - lastSeenMs) / 1000))
    : null;
  const stale = ageSeconds === null || ageSeconds > staleAfterSeconds;
  return {
    checkedAt: checkedAt.toISOString(),
    staleAfterSeconds,
    hasRecentHeartbeat: !stale,
    stale,
    ageSeconds,
    workerId: heartbeat.workerId,
    source: heartbeat.source,
    status: heartbeat.status,
    lastSeenAt: heartbeat.lastSeenAt,
  };
}

export async function getIngestProcessingWorkerLivenessReadOnly(input: {
  source?: string | null;
  staleAfterSeconds?: number | null;
} = {}): Promise<IngestProcessingWorkerLiveness> {
  try {
    return await getIngestProcessingWorkerLiveness({
      source: input.source,
      staleAfterSeconds: input.staleAfterSeconds,
      ensureSchema: false,
    });
  } catch (error) {
    if (isMissingQueueTable(error)) return emptyWorkerLiveness(normalizeStaleAfterSeconds(input.staleAfterSeconds));
    throw error;
  }
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

export async function listIngestProcessingJobsForRemediation(
  input: ListIngestProcessingJobsInput = {},
): Promise<ListIngestProcessingJobsResult> {
  await ensureIngestProcessingQueueSchema();
  const jobId = input.jobId === undefined || input.jobId === null ? null : requiredNumber(input.jobId, "jobId");
  const status = normalizeStatusFilter(input.status);
  const limit = normalizeLimit(input.limit, 25, 100);
  const offset = normalizeOffset(input.offset);
  const includeEvents = input.includeEvents === true;

  const totalResult = await sql<Record<string, unknown>>`
    select count(*)::int as total
    from public.ingest_processing_job
    where (${jobId}::bigint is null or id = ${jobId})
      and (${status}::text is null or status = ${status})
  `.execute(db);
  const jobsResult = await sql<QueueRow>`
    select *
    from public.ingest_processing_job
    where (${jobId}::bigint is null or id = ${jobId})
      and (${status}::text is null or status = ${status})
    order by created_at desc, id desc
    limit ${limit}
    offset ${offset}
  `.execute(db);

  const jobs = jobsResult.rows.map(mapJobRow);
  const eventMap = await loadEventsForJobs(jobs.map((job) => job.id));
  return {
    total: Number(rowValue(totalResult.rows[0] ?? {}, "total") ?? 0),
    jobs: jobs.map((job) => buildInspection(job, eventMap.get(job.id) ?? [], includeEvents)),
  };
}

export async function remediateIngestProcessingJob(
  input: RemediateIngestProcessingJobInput,
): Promise<RemediateIngestProcessingJobResult> {
  await ensureIngestProcessingQueueSchema();
  const jobId = requiredNumber(input.jobId, "jobId");
  const actorUserId = requiredNumber(input.actorUserId, "actorUserId");
  const action = normalizeRemediationAction(input.action);
  const reviewNote = normalizeReviewNote(input.reviewNote);

  return db.transaction().execute(async (trx) => {
    const locked = await sql<QueueRow>`
      select *
      from public.ingest_processing_job
      where id = ${jobId}
      for update
    `.execute(trx);
    const previous = locked.rows[0] ? mapJobRow(locked.rows[0]) : null;
    if (!previous) throw new IngestProcessingQueueError("JOB_NOT_FOUND", "Ingest processing job not found.");

    if (action === "mark_reviewed") {
      if (input.confirmReview !== true) {
        throw new IngestProcessingQueueError("REMEDIATION_CONFIRMATION_REQUIRED", "Ingest queue review requires explicit confirmation.");
      }
      if (previous.status !== "dead_lettered" && !isJobStaleRunning(previous)) {
        throw new IngestProcessingQueueError("JOB_REMEDIATION_UNSAFE", "Only dead-lettered or stale running ingest jobs can be marked reviewed.");
      }
      const eventType: IngestProcessingJobEventType = previous.status === "dead_lettered"
        ? "dead_letter_acknowledged"
        : "stale_running_reviewed";
      await appendJobEvent(trx as typeof db, {
        jobId: previous.id,
        eventType,
        previousStatus: previous.status,
        nextStatus: previous.status,
        attemptCount: previous.attemptCount,
        actorUserId,
        details: {
          remediationAction: action,
          reviewNotePresent: Boolean(reviewNote),
          autoReclaimed: false,
          rawReportBytesLogged: false,
          extractedReportTextLogged: false,
          destructiveDeletionUsed: false,
        },
      });
      await appendJobEvent(trx as typeof db, {
        jobId: previous.id,
        eventType: "operator_remediation_action",
        previousStatus: previous.status,
        nextStatus: previous.status,
        attemptCount: previous.attemptCount,
        actorUserId,
        details: {
          remediationAction: action,
          lifecycleEventType: eventType,
          reviewNotePresent: Boolean(reviewNote),
          rawReportBytesLogged: false,
          extractedReportTextLogged: false,
          destructiveDeletionUsed: false,
        },
      });
      return {
        status: "reviewed",
        job: await loadJobInspection(previous.id, trx as typeof db),
        replacementJob: null,
      };
    }

    if (action === "cancel_job") {
      if (input.confirmCancel !== true) {
        throw new IngestProcessingQueueError("REMEDIATION_CONFIRMATION_REQUIRED", "Ingest job cancellation requires explicit confirmation.");
      }
      if (previous.status !== "queued" && previous.status !== "failed") {
        throw new IngestProcessingQueueError("JOB_REMEDIATION_UNSAFE", "Only queued or failed ingest jobs can be canceled.");
      }
      const updated = await sql<QueueRow>`
        update public.ingest_processing_job
        set
          status = 'canceled',
          finished_at = now(),
          updated_at = now(),
          locked_by = null,
          locked_at = null,
          locked_until = null
        where id = ${previous.id}
          and status in ('queued', 'failed')
        returning *
      `.execute(trx);
      const row = updated.rows[0] ? mapJobRow(updated.rows[0]) : null;
      if (!row) throw new IngestProcessingQueueError("JOB_REMEDIATION_CONFLICT", "Ingest job cancellation was not applied.");
      await appendJobEvent(trx as typeof db, {
        jobId: row.id,
        eventType: "canceled",
        previousStatus: previous.status,
        nextStatus: "canceled",
        attemptCount: row.attemptCount,
        actorUserId,
        details: {
          remediationAction: action,
          reviewNotePresent: Boolean(reviewNote),
          rawReportBytesLogged: false,
          extractedReportTextLogged: false,
          destructiveDeletionUsed: false,
        },
      });
      await appendJobEvent(trx as typeof db, {
        jobId: row.id,
        eventType: "operator_remediation_action",
        previousStatus: previous.status,
        nextStatus: "canceled",
        attemptCount: row.attemptCount,
        actorUserId,
        details: {
          remediationAction: action,
          lifecycleEventType: "canceled",
          reviewNotePresent: Boolean(reviewNote),
          rawReportBytesLogged: false,
          extractedReportTextLogged: false,
          destructiveDeletionUsed: false,
        },
      });
      return {
        status: "canceled",
        job: await loadJobInspection(row.id, trx as typeof db),
        replacementJob: null,
      };
    }

    if (input.confirmRetry !== true) {
      throw new IngestProcessingQueueError("REMEDIATION_CONFIRMATION_REQUIRED", "Dead-letter retry requires explicit confirmation.");
    }
    if (previous.status !== "dead_lettered") {
      throw new IngestProcessingQueueError("JOB_REMEDIATION_UNSAFE", "Only dead-lettered ingest jobs can be retried through this remediation action.");
    }

    const existingReplacement = await findActiveReplacementByIdempotencyKey(previous.idempotencyKey, previous.id, trx);
    if (existingReplacement) {
      await appendJobEvent(trx as typeof db, {
        jobId: previous.id,
        eventType: "operator_remediation_action",
        previousStatus: "dead_lettered",
        nextStatus: "dead_lettered",
        attemptCount: previous.attemptCount,
        actorUserId,
        details: {
          remediationAction: action,
          replacementJobId: existingReplacement.id,
          duplicateReplacementPrevented: true,
          terminalJobMutated: false,
          idempotencyKeyReused: true,
          reviewNotePresent: Boolean(reviewNote),
          rawReportBytesLogged: false,
          extractedReportTextLogged: false,
          destructiveDeletionUsed: false,
        },
      });
      return {
        status: "replacement_queued",
        job: await loadJobInspection(previous.id, trx as typeof db),
        replacementJob: await loadJobInspection(existingReplacement.id, trx as typeof db),
      };
    }

    const replacement = await sql<QueueRow>`
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
        ${previous.jobType},
        'queued',
        ${previous.reportArtifactId},
        ${previous.userId},
        ${previous.organizationId},
        ${JSON.stringify(normalizePayload(previous.payload))}::text::jsonb,
        ${previous.idempotencyKey},
        ${actorUserId},
        'operator_remediation',
        now(),
        ${previous.maxAttempts}
      )
      returning *
    `.execute(trx);
    const replacementJob = mapJobRow(replacement.rows[0]);
    await appendJobEvent(trx as typeof db, {
      jobId: replacementJob.id,
      eventType: "queued",
      nextStatus: "queued",
      attemptCount: 0,
      actorUserId,
      details: {
        jobType: replacementJob.jobType,
        source: replacementJob.source,
        replacementForJobId: previous.id,
        queueVersion: INGEST_PROCESSING_QUEUE_VERSION,
        idempotencyKeyReused: true,
        rawReportBytesStored: false,
        extractedReportTextStored: false,
      },
    });
    await appendJobEvent(trx as typeof db, {
      jobId: previous.id,
      eventType: "operator_retry_requested",
      previousStatus: "dead_lettered",
      nextStatus: "dead_lettered",
      attemptCount: previous.attemptCount,
      actorUserId,
      details: {
        remediationAction: action,
        replacementJobId: replacementJob.id,
        terminalJobMutated: false,
        idempotencyKeyReused: true,
        reviewNotePresent: Boolean(reviewNote),
        rawReportBytesLogged: false,
        extractedReportTextLogged: false,
        destructiveDeletionUsed: false,
      },
    });
    await appendJobEvent(trx as typeof db, {
      jobId: previous.id,
      eventType: "operator_remediation_action",
      previousStatus: "dead_lettered",
      nextStatus: "dead_lettered",
      attemptCount: previous.attemptCount,
      actorUserId,
      details: {
        remediationAction: action,
        lifecycleEventType: "operator_retry_requested",
        replacementJobId: replacementJob.id,
        terminalJobMutated: false,
        idempotencyKeyReused: true,
        reviewNotePresent: Boolean(reviewNote),
        rawReportBytesLogged: false,
        extractedReportTextLogged: false,
        destructiveDeletionUsed: false,
      },
    });
    return {
      status: "replacement_queued",
      job: await loadJobInspection(previous.id, trx as typeof db),
      replacementJob: await loadJobInspection(replacementJob.id, trx as typeof db),
    };
  });
}

export async function getIngestProcessingQueueMetrics(
  options: { ensureSchema?: boolean } = {},
): Promise<IngestProcessingQueueMetrics> {
  if (options.ensureSchema !== false) {
    await ensureIngestProcessingQueueSchema();
  }
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
      count(*) filter (where event_type = 'duplicate_enqueue')::int as duplicate_enqueue_attempts,
      count(*) filter (where event_type = 'cleanup_attempted')::int as cleanup_attempted_events,
      count(*) filter (where event_type = 'cleanup_failed')::int as cleanup_failed_events,
      count(distinct job_id) filter (where event_type = 'cleanup_failed')::int as cleanup_failed_jobs,
      count(*) filter (where event_type = 'operator_remediation_action')::int as operator_remediation_events,
      count(distinct job_id) filter (where event_type = 'dead_letter_acknowledged')::int as dead_letter_reviewed_jobs,
      count(distinct job_id) filter (where event_type = 'stale_running_reviewed')::int as stale_running_reviewed_jobs
    from public.ingest_processing_job_event
  `.execute(db);
  const recentRemediation = await sql<Record<string, unknown>>`
    select event_type, created_at
    from public.ingest_processing_job_event
    where event_type in ('operator_remediation_action', 'operator_retry_requested', 'dead_letter_acknowledged', 'stale_running_reviewed', 'canceled')
    order by created_at desc, id desc
    limit 1
  `.execute(db);
  const row = counts.rows[0] ?? {};
  const events = eventCounts.rows[0] ?? {};
  const remediation = recentRemediation.rows[0] ?? {};
  const workerLiveness = await getIngestProcessingWorkerLiveness({ ensureSchema: false });
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
    cleanupAttemptedEvents: Number(rowValue(events, "cleanup_attempted_events") ?? 0),
    cleanupFailedEvents: Number(rowValue(events, "cleanup_failed_events") ?? 0),
    cleanupFailedJobs: Number(rowValue(events, "cleanup_failed_jobs") ?? 0),
    operatorRemediationEvents: Number(rowValue(events, "operator_remediation_events") ?? 0),
    deadLetterReviewedJobs: Number(rowValue(events, "dead_letter_reviewed_jobs") ?? 0),
    staleRunningReviewedJobs: Number(rowValue(events, "stale_running_reviewed_jobs") ?? 0),
    lastRemediationStatus: rowValue(remediation, "event_type") ? String(rowValue(remediation, "event_type")) : null,
    lastRemediationAt: rowValue(remediation, "created_at") ? toIso(rowValue(remediation, "created_at")) : null,
    workerLiveness,
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
      endpointCutoverEnabled: true,
    },
  };
}
