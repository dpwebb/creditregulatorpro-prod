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
  | "requeued"
  | "operator_retry_requested"
  | "dead_letter_acknowledged"
  | "stale_running_reviewed"
  | "replacement_enqueued"
  | "duplicate_remediation_request";

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
  deadLetterAcknowledgedJobs: number;
  staleRunningReviewedJobs: number;
  replacementJobs: number;
  replayFailureJobs: number;
  remediationFailureJobs: number;
  lastRemediationStatus: string | null;
  lastRemediationAt: string | null;
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

export type ResponseProcessingQueueEventRecord = {
  id: number;
  jobId: number;
  eventType: ResponseProcessingJobEventType;
  previousStatus: ResponseProcessingJobStatus | null;
  nextStatus: ResponseProcessingJobStatus;
  attemptCount: number;
  workerId: string | null;
  actorUserId: number | null;
  details: Record<string, Json>;
  errorCode: string | null;
  errorReason: string | null;
  createdAt: string;
};

export type ResponseProcessingQueuePayloadSummary = {
  responseId: number | null;
  sourceType: string | null;
  filterKeys: string[];
  classification: string | null;
  manualReviewRequired: boolean | null;
  metadataKeys: string[];
  messageReferenceHashPresent: boolean;
  sourceMessageHashPresent: boolean;
  confirmApply: boolean;
  dryRunOnly: boolean;
  rawResponseTextStored: false;
  liveMailboxIntegrationUsed: false;
};

export type ResponseProcessingJobInspection = Omit<ResponseProcessingJobRecord, "payload" | "resultSummary"> & {
  payloadSummary: ResponseProcessingQueuePayloadSummary;
  resultSummary: Record<string, Json>;
  staleRunning: boolean;
  retryEligible: boolean;
  acknowledgeEligible: boolean;
  staleReviewEligible: boolean;
  remediationStatus: {
    deadLetterAcknowledgedAt: string | null;
    staleRunningReviewedAt: string | null;
    replacementJobId: number | null;
  };
  lastEvent: ResponseProcessingQueueEventRecord | null;
  events?: ResponseProcessingQueueEventRecord[];
};

export type ListResponseProcessingJobsInput = {
  jobId?: number | null;
  status?: ResponseProcessingJobStatus | null;
  limit?: number | null;
  offset?: number | null;
  includeEvents?: boolean;
};

export type ListResponseProcessingJobsResult = {
  jobs: ResponseProcessingJobInspection[];
  total: number;
};

export type ResponseProcessingRemediationAction =
  | "retry_job"
  | "acknowledge_dead_letter"
  | "mark_stale_reviewed";

export type RemediateResponseProcessingJobInput = {
  jobId: number;
  action: ResponseProcessingRemediationAction;
  actorUserId: number;
  confirmRetry?: boolean | null;
  confirmReview?: boolean | null;
  reviewNote?: string | null;
};

export type RemediateResponseProcessingJobResult = {
  status: "retry_queued" | "replacement_queued" | "dead_letter_acknowledged" | "stale_running_reviewed";
  job: ResponseProcessingJobInspection;
  replacementJob: ResponseProcessingJobInspection | null;
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

export class ResponseProcessingQueueError extends Error {
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
  /(^|[_.:-])(raw.?text|response.?text|extracted.?text|plain.?text|body|body.?text|html|content|subject|from|to|cc|bcc|sender|recipient|sender.?email|recipient.?email|email.?address|email.?body|full.?email|message.?body|mailbox.?credential|mailbox.?password|imap|smtp|pop3|oauth|oauth.?token|access.?token|refresh.?token|client.?secret|password|token|secret|authorization|cookie|session|api.?key|private.?key|database.?url|connection.?string|storage.?url|signed.?url)($|[_.:-])/i;
const FORBIDDEN_VALUE_PATTERN =
  /(raw report text|raw pdf text|full email body|email body dump|packet body|storage\.googleapis\.com|x-goog-signature|x-amz-signature|signedurl|signed_url|database_url|postgres:\/\/|mysql:\/\/|mongodb:\/\/|bearer\s+[a-z0-9._-]+|basic\s+[a-z0-9+/=._-]+|sk-[a-z0-9_-]{10,}|ghp_[a-z0-9_]{10,}|github_pat_[a-z0-9_]+|xox[baprs]-[a-z0-9-]+|akia[0-9a-z]{16}|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private key|password\s*[:=]|secret\s*[:=]|mailbox password|imap password|smtp password|oauth refresh token|email auth token|session=|cookie=)/i;
const FULL_SIN_PATTERN = /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/;
const FULL_ACCOUNT_PATTERN = /\b(?:account|acct|member)\s*(?:number|no\.?|#)?\s*[:#-]?\s*[A-Z0-9][A-Z0-9 -]{9,}\b|\b\d{10,}\b/i;
const EMAIL_ADDRESS_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

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
  const raw = jsonRecord(value);
  const safe = safeDetailsValue(raw, "details", 0);
  return safe && typeof safe === "object" && !Array.isArray(safe) ? safe as Record<string, Json> : {};
}

function mapEventRow(row: QueueEventRow): ResponseProcessingQueueEventRecord {
  return {
    id: requiredNumber(rowValue(row, "id"), "event.id"),
    jobId: requiredNumber(rowValue(row, "job_id"), "event.jobId"),
    eventType: String(rowValue(row, "event_type")) as ResponseProcessingJobEventType,
    previousStatus: rowValue(row, "previous_status") ? String(rowValue(row, "previous_status")) as ResponseProcessingJobStatus : null,
    nextStatus: String(rowValue(row, "next_status")) as ResponseProcessingJobStatus,
    attemptCount: Number(rowValue(row, "attempt_count") ?? 0),
    workerId: rowValue(row, "worker_id") ? String(rowValue(row, "worker_id")) : null,
    actorUserId: toNumber(rowValue(row, "actor_user_id")),
    details: safeDetailsRecord(rowValue(row, "details")),
    errorCode: rowValue(row, "error_code") ? sanitizeErrorString(rowValue(row, "error_code"), "QUEUE_ERROR", 80) : null,
    errorReason: rowValue(row, "error_reason") ? sanitizeErrorString(rowValue(row, "error_reason"), "Response processing event error.") : null,
    createdAt: toIso(rowValue(row, "created_at")),
  };
}

function summarizePayload(payload: ResponseProcessingQueuePayload): ResponseProcessingQueuePayloadSummary {
  const filterEntries = payload.filters ? Object.entries(payload.filters) : [];
  const metadataEntries = payload.metadata ? Object.entries(payload.metadata) : [];
  return {
    responseId: payload.responseId ?? (typeof payload.filters?.responseId === "number" ? payload.filters.responseId : null),
    sourceType: payload.sourceType ?? (typeof payload.filters?.sourceType === "string" ? payload.filters.sourceType : null),
    filterKeys: filterEntries.map(([key]) => key).sort(),
    classification: typeof payload.filters?.classification === "string" ? payload.filters.classification : null,
    manualReviewRequired: typeof payload.filters?.manualReviewRequired === "boolean" ? payload.filters.manualReviewRequired : null,
    metadataKeys: metadataEntries.map(([key]) => key).sort(),
    messageReferenceHashPresent: Boolean(payload.messageReferenceHash),
    sourceMessageHashPresent: Boolean(payload.sourceMessageHash),
    confirmApply: payload.confirmApply === true,
    dryRunOnly: payload.dryRunOnly === true,
    rawResponseTextStored: false,
    liveMailboxIntegrationUsed: false,
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
  if (
    !SAFE_TOKEN_PATTERN.test(token) ||
    FORBIDDEN_KEY_PATTERN.test(token) ||
    FORBIDDEN_VALUE_PATTERN.test(token) ||
    FULL_SIN_PATTERN.test(token) ||
    FULL_ACCOUNT_PATTERN.test(token) ||
    EMAIL_ADDRESS_PATTERN.test(token)
  ) {
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
    if (
      FORBIDDEN_VALUE_PATTERN.test(trimmed) ||
      FULL_SIN_PATTERN.test(trimmed) ||
      FULL_ACCOUNT_PATTERN.test(trimmed) ||
      EMAIL_ADDRESS_PATTERN.test(trimmed)
    ) {
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
  const withoutSecrets = (
    FORBIDDEN_VALUE_PATTERN.test(raw) ||
    FULL_SIN_PATTERN.test(raw) ||
    FULL_ACCOUNT_PATTERN.test(raw) ||
    EMAIL_ADDRESS_PATTERN.test(raw)
  )
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
      ${JSON.stringify(params.details ?? {})}::text::jsonb,
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

function normalizeJobStatus(value: ResponseProcessingJobStatus | null | undefined): ResponseProcessingJobStatus | null {
  if (!value) return null;
  if (!["queued", "running", "succeeded", "failed", "dead_lettered"].includes(value)) {
    throw new ResponseProcessingQueueError("INVALID_QUEUE_STATUS", "Unsupported response processing job status filter.");
  }
  return value;
}

function normalizeRemediationAction(value: ResponseProcessingRemediationAction): ResponseProcessingRemediationAction {
  if (!["retry_job", "acknowledge_dead_letter", "mark_stale_reviewed"].includes(value)) {
    throw new ResponseProcessingQueueError("UNSUPPORTED_REMEDIATION_ACTION", "Unsupported response processing queue remediation action.");
  }
  return value;
}

function normalizeLimit(value: number | null | undefined, fallback: number, max: number): number {
  if (value === undefined || value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > max) {
    throw new ResponseProcessingQueueError("INVALID_QUEUE_LIMIT", `limit must be an integer from 1 to ${max}.`);
  }
  return parsed;
}

function normalizeOffset(value: number | null | undefined): number {
  if (value === undefined || value === null) return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ResponseProcessingQueueError("INVALID_QUEUE_OFFSET", "offset must be a non-negative integer.");
  }
  return parsed;
}

function normalizeReviewNote(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const safe = safeDetailsValue(value, "reviewNote", 0);
  if (typeof safe !== "string" || safe === "[redacted]") {
    throw new ResponseProcessingQueueError("UNSAFE_REMEDIATION_NOTE", "reviewNote includes unsafe content.");
  }
  return safe.slice(0, 500);
}

function isJobStaleRunning(job: ResponseProcessingJobRecord): boolean {
  return job.status === "running" && Boolean(job.lockedUntil) && new Date(job.lockedUntil as string).getTime() < Date.now();
}

function buildInspection(job: ResponseProcessingJobRecord, events: ResponseProcessingQueueEventRecord[]): ResponseProcessingJobInspection {
  const sortedEvents = [...events].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id - right.id);
  const lastEvent = sortedEvents[sortedEvents.length - 1] ?? null;
  const acknowledgedEvent = [...sortedEvents].reverse().find((event) => event.eventType === "dead_letter_acknowledged") ?? null;
  const staleReviewedEvent = [...sortedEvents].reverse().find((event) => event.eventType === "stale_running_reviewed") ?? null;
  const replacementEvent = [...sortedEvents].reverse().find((event) => event.eventType === "replacement_enqueued") ?? null;
  const replacementJobId = replacementEvent?.details.replacementJobId;
  const staleRunning = isJobStaleRunning(job);
  return {
    id: job.id,
    jobType: job.jobType,
    status: job.status,
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
    lastErrorCode: job.lastErrorCode ? sanitizeErrorString(job.lastErrorCode, "QUEUE_ERROR", 80) : null,
    lastErrorReason: job.lastErrorReason ? sanitizeErrorString(job.lastErrorReason, "Response processing job error.") : null,
    payloadSummary: summarizePayload(job.payload),
    resultSummary: safeDetailsRecord(job.resultSummary),
    staleRunning,
    retryEligible: job.status === "failed" || (job.status === "dead_lettered" && !replacementEvent),
    acknowledgeEligible: job.status === "dead_lettered" && !acknowledgedEvent,
    staleReviewEligible: staleRunning && !staleReviewedEvent,
    remediationStatus: {
      deadLetterAcknowledgedAt: acknowledgedEvent?.createdAt ?? null,
      staleRunningReviewedAt: staleReviewedEvent?.createdAt ?? null,
      replacementJobId: typeof replacementJobId === "number" ? replacementJobId : null,
    },
    lastEvent,
    events: sortedEvents,
  };
}

async function loadEventsForJobs(jobIds: number[]): Promise<Map<number, ResponseProcessingQueueEventRecord[]>> {
  if (jobIds.length === 0) return new Map();
  const result = await sql<QueueEventRow>`
    select *
    from public.response_processing_job_event
    where job_id in (${sql.join(jobIds)})
    order by job_id asc, created_at asc, id asc
  `.execute(db);
  const eventsByJob = new Map<number, ResponseProcessingQueueEventRecord[]>();
  for (const row of result.rows) {
    const event = mapEventRow(row);
    const events = eventsByJob.get(event.jobId) ?? [];
    events.push(event);
    eventsByJob.set(event.jobId, events);
  }
  return eventsByJob;
}

export async function listResponseProcessingJobsForRemediation(
  input: ListResponseProcessingJobsInput = {},
): Promise<ListResponseProcessingJobsResult> {
  await ensureResponseDocumentSchema();
  const jobId = input.jobId === null || input.jobId === undefined ? null : requiredNumber(input.jobId, "jobId");
  const status = normalizeJobStatus(input.status ?? null);
  const limit = normalizeLimit(input.limit, 25, 100);
  const offset = normalizeOffset(input.offset);

  const rows = await sql<QueueRow>`
    select *
    from public.response_processing_job
    where (${jobId}::bigint is null or id = ${jobId})
      and (${status}::text is null or status = ${status})
    order by
      case
        when status = 'dead_lettered' then 1
        when status = 'running' and locked_until is not null and locked_until < now() then 2
        when status = 'failed' then 3
        when status = 'queued' then 4
        when status = 'running' then 5
        else 6
      end,
      updated_at desc,
      id desc
    limit ${limit}
    offset ${offset}
  `.execute(db);
  const totalResult = await sql<{ count: string }>`
    select count(*)::text as count
    from public.response_processing_job
    where (${jobId}::bigint is null or id = ${jobId})
      and (${status}::text is null or status = ${status})
  `.execute(db);
  const jobs = rows.rows.map(mapJobRow);
  const eventsByJob = await loadEventsForJobs(jobs.map((job) => job.id));
  return {
    jobs: jobs.map((job) => {
      const inspection = buildInspection(job, eventsByJob.get(job.id) ?? []);
      if (!input.includeEvents) delete inspection.events;
      return inspection;
    }),
    total: Number(totalResult.rows[0]?.count ?? 0),
  };
}

async function loadJobInspection(jobId: number, executor: typeof db = db): Promise<ResponseProcessingJobInspection> {
  const jobResult = await sql<QueueRow>`
    select *
    from public.response_processing_job
    where id = ${jobId}
  `.execute(executor);
  const job = jobResult.rows[0] ? mapJobRow(jobResult.rows[0]) : null;
  if (!job) throw new ResponseProcessingQueueError("JOB_NOT_FOUND", "Response processing job not found.");
  const events = await sql<QueueEventRow>`
    select *
    from public.response_processing_job_event
    where job_id = ${jobId}
    order by created_at asc, id asc
  `.execute(executor);
  return buildInspection(job, events.rows.map(mapEventRow));
}

async function findReplacementJobIdForDeadLetter(jobId: number, executor: typeof db = db): Promise<number | null> {
  const result = await sql<QueueEventRow>`
    select *
    from public.response_processing_job_event
    where job_id = ${jobId}
      and event_type = 'replacement_enqueued'
    order by created_at desc, id desc
    limit 1
  `.execute(executor);
  const event = result.rows[0] ? mapEventRow(result.rows[0]) : null;
  const replacementJobId = event?.details.replacementJobId;
  return typeof replacementJobId === "number" && Number.isInteger(replacementJobId) && replacementJobId > 0
    ? replacementJobId
    : null;
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

async function peekNextResponseProcessingJob(sourceFilter?: string | null): Promise<ResponseProcessingJobRecord | null> {
  await ensureResponseDocumentSchema();
  const source = sourceFilter ? sanitizeToken(sourceFilter, "source", "") : null;
  const result = await sql<QueueRow>`
    select *
    from public.response_processing_job
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

export async function claimNextResponseProcessingJob(input: {
  workerId: string;
  leaseSeconds?: number;
  source?: string | null;
}): Promise<ResponseProcessingJobRecord | null> {
  await ensureResponseDocumentSchema();
  const workerId = sanitizeToken(input.workerId, "workerId", "response-worker");
  const source = input.source ? sanitizeToken(input.source, "source", "") : null;
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
        result_summary = ${JSON.stringify(resultSummary)}::text::jsonb
      where id = ${job.id}
        and status = 'running'
        and locked_by = ${workerId}
        and attempt_count = ${job.attemptCount}
      returning *
    `.execute(trx);
    if (!updated.rows[0]) {
      throw new ResponseProcessingQueueError(
        "JOB_FINALIZE_CONFLICT",
        "Response processing job was not finalized because the worker no longer held the active lease.",
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
  const workerId = sanitizeToken(params.workerId, "workerId", "response-worker");
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
        })}::text::jsonb
      where id = ${params.job.id}
        and status = 'running'
        and locked_by = ${workerId}
        and attempt_count = ${params.job.attemptCount}
      returning *
    `.execute(trx);
    if (!updated.rows[0]) {
      throw new ResponseProcessingQueueError(
        "JOB_FINALIZE_CONFLICT",
        "Response processing job was not failed because the worker no longer held the active lease.",
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
  source?: string | null;
} = {}): Promise<ProcessResponseProcessingJobResult> {
  const workerId = sanitizeToken(input.workerId, "workerId", `response-worker-${process.pid}`);
  const source = input.source ? sanitizeToken(input.source, "source", "") : null;
  if (input.dryRun === true) {
    const job = await peekNextResponseProcessingJob(source);
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

  const job = await claimNextResponseProcessingJob({ workerId, leaseSeconds: input.leaseSeconds, source });
  if (!job) return { status: "idle", workerId, dryRun: false, job: null };

  let resultSummary: Record<string, Json>;
  try {
    resultSummary = await executeResponseProcessingJob(job);
  } catch (error) {
    const failed = await markResponseProcessingJobFailed({ job, workerId, error });
    return { status: failed.status === "dead_lettered" ? "dead_lettered" : "failed", workerId, dryRun: false, job: failed };
  }

  const succeeded = await markJobSucceeded(job, workerId, resultSummary);
  return { status: "succeeded", workerId, dryRun: false, job: succeeded };
}

export async function requeueDeadLetteredResponseProcessingJob(input: {
  jobId: number;
  actorUserId: number;
}): Promise<ResponseProcessingJobInspection> {
  const result = await remediateResponseProcessingJob({
    jobId: input.jobId,
    actorUserId: input.actorUserId,
    action: "retry_job",
    confirmRetry: true,
  });
  if (!result.replacementJob) {
    throw new ResponseProcessingQueueError("JOB_REQUEUE_UNSAFE", "Dead-letter retry did not create a replacement job.");
  }
  return result.replacementJob;
}

export async function remediateResponseProcessingJob(
  input: RemediateResponseProcessingJobInput,
): Promise<RemediateResponseProcessingJobResult> {
  await ensureResponseDocumentSchema();
  const jobId = requiredNumber(input.jobId, "jobId");
  const actorUserId = requiredNumber(input.actorUserId, "actorUserId");
  const action = normalizeRemediationAction(input.action);
  const reviewNote = normalizeReviewNote(input.reviewNote);

  return db.transaction().execute(async (trx) => {
    const locked = await sql<QueueRow>`
      select *
      from public.response_processing_job
      where id = ${jobId}
      for update
    `.execute(trx);
    const previous = locked.rows[0] ? mapJobRow(locked.rows[0]) : null;
    if (!previous) throw new ResponseProcessingQueueError("JOB_NOT_FOUND", "Response processing job not found.");

    if (action === "acknowledge_dead_letter") {
      if (input.confirmReview !== true) {
        throw new ResponseProcessingQueueError("REMEDIATION_CONFIRMATION_REQUIRED", "Dead-letter acknowledgement requires explicit confirmation.");
      }
      if (previous.status !== "dead_lettered") {
        throw new ResponseProcessingQueueError("JOB_REMEDIATION_UNSAFE", "Only dead-lettered jobs can be acknowledged.");
      }
      await appendJobEvent(trx as typeof db, {
        jobId: previous.id,
        eventType: "dead_letter_acknowledged",
        previousStatus: previous.status,
        nextStatus: previous.status,
        attemptCount: previous.attemptCount,
        actorUserId,
        details: {
          remediationAction: action,
          reviewNotePresent: Boolean(reviewNote),
          rawResponseTextLogged: false,
          destructiveDeletionUsed: false,
          liveMailboxIntegrationUsed: false,
        },
      });
      return {
        status: "dead_letter_acknowledged",
        job: await loadJobInspection(previous.id, trx as typeof db),
        replacementJob: null,
      };
    }

    if (action === "mark_stale_reviewed") {
      if (input.confirmReview !== true) {
        throw new ResponseProcessingQueueError("REMEDIATION_CONFIRMATION_REQUIRED", "Stale-running review requires explicit confirmation.");
      }
      if (!isJobStaleRunning(previous)) {
        throw new ResponseProcessingQueueError("JOB_REMEDIATION_UNSAFE", "Only stale running jobs can be marked reviewed.");
      }
      await appendJobEvent(trx as typeof db, {
        jobId: previous.id,
        eventType: "stale_running_reviewed",
        previousStatus: previous.status,
        nextStatus: previous.status,
        attemptCount: previous.attemptCount,
        actorUserId,
        details: {
          remediationAction: action,
          staleRunningReviewed: true,
          autoReclaimed: false,
          reviewNotePresent: Boolean(reviewNote),
          rawResponseTextLogged: false,
          destructiveDeletionUsed: false,
          liveMailboxIntegrationUsed: false,
        },
      });
      return {
        status: "stale_running_reviewed",
        job: await loadJobInspection(previous.id, trx as typeof db),
        replacementJob: null,
      };
    }

    if (input.confirmRetry !== true) {
      throw new ResponseProcessingQueueError("REMEDIATION_CONFIRMATION_REQUIRED", "Queue retry requires explicit confirmation.");
    }
    if (previous.status !== "failed" && previous.status !== "dead_lettered") {
      throw new ResponseProcessingQueueError("JOB_REMEDIATION_UNSAFE", "Only failed or dead-lettered jobs can be retried.");
    }

    if (previous.status === "failed") {
      const updated = await sql<QueueRow>`
        update public.response_processing_job
        set
          status = 'queued',
          run_after = now(),
          updated_at = now(),
          finished_at = null,
          locked_by = null,
          locked_at = null,
          locked_until = null
        where id = ${previous.id}
          and status = 'failed'
        returning *
      `.execute(trx);
      const row = updated.rows[0] ? mapJobRow(updated.rows[0]) : null;
      if (!row) throw new ResponseProcessingQueueError("JOB_REMEDIATION_CONFLICT", "Response processing job retry was not applied.");
      await appendJobEvent(trx as typeof db, {
        jobId: row.id,
        eventType: "operator_retry_requested",
        previousStatus: "failed",
        nextStatus: "queued",
        attemptCount: row.attemptCount,
        actorUserId,
        details: {
          remediationAction: action,
          retryQueuedByActorUserId: actorUserId,
          reviewNotePresent: Boolean(reviewNote),
          rawResponseTextLogged: false,
          destructiveDeletionUsed: false,
          liveMailboxIntegrationUsed: false,
        },
      });
      return {
        status: "retry_queued",
        job: await loadJobInspection(row.id, trx as typeof db),
        replacementJob: null,
      };
    }

    const existingReplacementJobId = await findReplacementJobIdForDeadLetter(previous.id, trx as typeof db);
    if (existingReplacementJobId) {
      await appendJobEvent(trx as typeof db, {
        jobId: previous.id,
        eventType: "duplicate_remediation_request",
        previousStatus: "dead_lettered",
        nextStatus: "dead_lettered",
        attemptCount: previous.attemptCount,
        actorUserId,
        details: {
          remediationAction: action,
          replacementJobId: existingReplacementJobId,
          duplicateReplacementPrevented: true,
          reviewNotePresent: Boolean(reviewNote),
          terminalJobMutated: false,
          rawResponseTextLogged: false,
          destructiveDeletionUsed: false,
          liveMailboxIntegrationUsed: false,
        },
      });
      return {
        status: "replacement_queued",
        job: await loadJobInspection(previous.id, trx as typeof db),
        replacementJob: await loadJobInspection(existingReplacementJobId, trx as typeof db),
      };
    }

    const replacementPayload = normalizePayload(previous.jobType, previous.payload);
    const replacementActorUserId = previous.jobType === "response_replay_apply"
      ? previous.actorUserId ?? actorUserId
      : previous.actorUserId;
    if (previous.jobType === "response_replay_apply" && !replacementActorUserId) {
      throw new ResponseProcessingQueueError("REPLAY_APPLY_ACTOR_REQUIRED", "response_replay_apply replacement requires actorUserId.");
    }
    const replacementIdempotencyKey = `remediation:${previous.id}:${sha256(stableJsonStringify({
      action,
      actorUserId,
      createdAt: new Date().toISOString(),
      previousAttemptCount: previous.attemptCount,
    })).slice(0, 48)}`;
    const replacement = await sql<QueueRow>`
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
        ${previous.jobType},
        'queued',
        ${JSON.stringify(replacementPayload)}::text::jsonb,
        ${replacementIdempotencyKey},
        ${replacementActorUserId ?? actorUserId},
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
        queueVersion: RESPONSE_PROCESSING_QUEUE_VERSION,
        rawResponseTextStored: false,
        rawResponseTextLogged: false,
        liveMailboxIntegrationUsed: false,
      },
    });
    await appendJobEvent(trx as typeof db, {
      jobId: previous.id,
      eventType: "replacement_enqueued",
      previousStatus: "dead_lettered",
      nextStatus: "dead_lettered",
      attemptCount: previous.attemptCount,
      actorUserId,
      details: {
        remediationAction: action,
        replacementJobId: replacementJob.id,
        reviewNotePresent: Boolean(reviewNote),
        terminalJobMutated: false,
        rawResponseTextLogged: false,
        destructiveDeletionUsed: false,
        liveMailboxIntegrationUsed: false,
      },
    });
    return {
      status: "replacement_queued",
      job: await loadJobInspection(previous.id, trx as typeof db),
      replacementJob: await loadJobInspection(replacementJob.id, trx as typeof db),
    };
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
    remediation as (
      select
        coalesce(count(distinct case when event_type = 'dead_letter_acknowledged' then job_id else null end), 0)::int as dead_letter_acknowledged_jobs,
        coalesce(count(distinct case when event_type = 'stale_running_reviewed' then job_id else null end), 0)::int as stale_running_reviewed_jobs,
        coalesce(count(distinct case when event_type = 'replacement_enqueued' then job_id else null end), 0)::int as replacement_jobs
      from public.response_processing_job_event
      where event_type in ('operator_retry_requested', 'dead_letter_acknowledged', 'stale_running_reviewed', 'replacement_enqueued', 'duplicate_remediation_request')
    ),
    replay_failures as (
      select count(*)::int as replay_failure_jobs
      from public.response_processing_job
      where job_type in ('response_replay_apply', 'response_replay_dry_run')
        and status in ('failed', 'dead_lettered')
    ),
    remediation_failures as (
      select count(*)::int as remediation_failure_jobs
      from public.response_processing_job
      where source = 'operator_remediation'
        and status in ('failed', 'dead_lettered')
    ),
    recent_remediation as (
      select event_type, created_at
      from public.response_processing_job_event
      where event_type in ('operator_retry_requested', 'dead_letter_acknowledged', 'stale_running_reviewed', 'replacement_enqueued', 'duplicate_remediation_request')
      order by created_at desc, id desc
      limit 1
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
      remediation.dead_letter_acknowledged_jobs,
      remediation.stale_running_reviewed_jobs,
      remediation.replacement_jobs,
      replay_failures.replay_failure_jobs,
      remediation_failures.remediation_failure_jobs,
      recent_remediation.event_type as last_remediation_status,
      recent_remediation.created_at as last_remediation_at,
      recent_worker.event_type as recent_worker_run_status,
      recent_worker.created_at as recent_worker_run_at
    from counts
    cross join duplicate_attempts
    cross join remediation
    cross join replay_failures
    cross join remediation_failures
    left join recent_remediation on true
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
    deadLetterAcknowledgedJobs: Number(rowValue(row, "dead_letter_acknowledged_jobs") ?? 0),
    staleRunningReviewedJobs: Number(rowValue(row, "stale_running_reviewed_jobs") ?? 0),
    replacementJobs: Number(rowValue(row, "replacement_jobs") ?? 0),
    replayFailureJobs: Number(rowValue(row, "replay_failure_jobs") ?? 0),
    remediationFailureJobs: Number(rowValue(row, "remediation_failure_jobs") ?? 0),
    lastRemediationStatus: rowValue(row, "last_remediation_status") ? String(rowValue(row, "last_remediation_status")) : null,
    lastRemediationAt: rowValue(row, "last_remediation_at") ? toIso(rowValue(row, "last_remediation_at")) : null,
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
