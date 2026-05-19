import { sql } from "kysely";

import { db } from "./db";
import { ensureResponseDocumentSchema } from "./responseDocumentSchema";
import { processNextResponseProcessingJob } from "./responseProcessingQueueService";
import type { Json } from "./schema";

export const RESPONSE_WORKER_ORCHESTRATION_VERSION = "response-worker-orchestration-2026-05-19" as const;
export const DEFAULT_RESPONSE_WORKER_ORCHESTRATION_LOCK_SCOPE = "response_processing_worker" as const;

export type ResponseWorkerOrchestrationStatus = "running" | "succeeded" | "failed" | "skipped";
export type ResponseWorkerOrchestrationMode = "dry_run" | "bounded_once" | "bounded_batch" | "scheduled_bounded";
export type ResponseWorkerOrchestrationEventType =
  | "started"
  | "succeeded"
  | "failed"
  | "skipped_overlap"
  | "skipped_stale_lock";

export type ResponseWorkerOrchestrationRun = {
  id: number;
  lockScope: string;
  status: ResponseWorkerOrchestrationStatus;
  mode: ResponseWorkerOrchestrationMode;
  workerId: string;
  source: string | null;
  maxJobs: number;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string | null;
  lockedUntil: string;
  processedCount: number;
  failureCount: number;
  skippedReason: string | null;
  lastErrorCode: string | null;
  lastErrorReason: string | null;
  resultSummary: Record<string, Json>;
  createdAt: string;
  updatedAt: string;
};

export type RunResponseWorkerOrchestrationInput = {
  dryRun?: boolean;
  maxJobs?: number | null;
  workerId?: string | null;
  source?: string | null;
  lockScope?: string | null;
  lockTtlSeconds?: number | null;
  scheduled?: boolean;
};

export type ResponseWorkerOrchestrationResult = {
  status: "dry_run_preview" | "succeeded" | "failed" | "skipped";
  dryRun: boolean;
  workerId: string;
  run: ResponseWorkerOrchestrationRun | null;
  processed: number;
  failureCount: number;
  skippedReason: string | null;
  iterations: Array<{
    status: string;
    jobId: number | null;
    jobType: string | null;
    jobStatus: string | null;
  }>;
  boundaries: {
    bounded: true;
    noDaemon: true;
    overlapPrevented: boolean;
    noRawResponseText: true;
    externalAlertDeliveryUsed: false;
    liveMailboxIntegrationUsed: false;
    canonicalFactsMutated: false;
    violationTruthMutated: false;
    packetReadinessMutated: false;
  };
};

export type ResponseWorkerOrchestrationMetrics = {
  generatedAt: string;
  orchestrationVersion: typeof RESPONSE_WORKER_ORCHESTRATION_VERSION;
  totalRuns: number;
  runningRuns: number;
  staleRunningRuns: number;
  succeededRuns: number;
  failedRuns: number;
  skippedRuns: number;
  skippedOverlapRuns: number;
  recentFailedRuns: number;
  lastRunStatus: ResponseWorkerOrchestrationStatus | null;
  lastRunAt: string | null;
  lastSuccessfulRunAt: string | null;
  lastFailedRunAt: string | null;
  activeLock: {
    runId: number;
    lockScope: string;
    lockedUntil: string;
    stale: boolean;
  } | null;
  boundaries: {
    bounded: true;
    noDaemon: true;
    overlapPreventionEnabled: true;
    noRawResponseText: true;
    externalAlertDeliveryUsed: false;
    liveMailboxIntegrationUsed: false;
  };
};

type OrchestrationRunRow = {
  id?: unknown;
  lock_scope?: unknown;
  lockScope?: unknown;
  status?: unknown;
  mode?: unknown;
  worker_id?: unknown;
  workerId?: unknown;
  source?: unknown;
  max_jobs?: unknown;
  maxJobs?: unknown;
  dry_run?: unknown;
  dryRun?: unknown;
  started_at?: unknown;
  startedAt?: unknown;
  finished_at?: unknown;
  finishedAt?: unknown;
  locked_until?: unknown;
  lockedUntil?: unknown;
  processed_count?: unknown;
  processedCount?: unknown;
  failure_count?: unknown;
  failureCount?: unknown;
  skipped_reason?: unknown;
  skippedReason?: unknown;
  last_error_code?: unknown;
  lastErrorCode?: unknown;
  last_error_reason?: unknown;
  lastErrorReason?: unknown;
  result_summary?: unknown;
  resultSummary?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
  updated_at?: unknown;
  updatedAt?: unknown;
};

const SAFE_TOKEN_PATTERN = /^[a-zA-Z0-9_.:-]{1,120}$/;
const SAFE_KEY_PATTERN = /^[a-zA-Z0-9_.:-]{1,64}$/;
const MAX_SAFE_STRING_LENGTH = 500;
const MAX_MAX_JOBS = 100;
const DEFAULT_LOCK_TTL_SECONDS = 900;
const FORBIDDEN_KEY_PATTERN =
  /(^|[_.:-])(raw.?text|response.?text|extracted.?text|plain.?text|body|html|content|subject|from|to|cc|bcc|sender|recipient|email|mailbox|oauth|access.?token|refresh.?token|client.?secret|password|token|secret|authorization|cookie|session|api.?key|private.?key|database.?url|connection.?string)($|[_.:-])/i;
const FORBIDDEN_VALUE_PATTERN =
  /(raw report text|raw pdf text|full email body|email body dump|database_url|postgres:\/\/|mysql:\/\/|mongodb:\/\/|bearer\s+[a-z0-9._-]+|basic\s+[a-z0-9+/=._-]+|sk-[a-z0-9_-]{10,}|ghp_[a-z0-9_]{10,}|github_pat_[a-z0-9_]+|xox[baprs]-[a-z0-9-]+|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private key|password\s*[:=]|secret\s*[:=]|mailbox password|imap password|smtp password|oauth refresh token|session=|cookie=)/i;
const FULL_SIN_PATTERN = /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/;
const FULL_ACCOUNT_PATTERN = /\b(?:account|acct|member)\s*(?:number|no\.?|#)?\s*[:#-]?\s*[A-Z0-9][A-Z0-9 -]{9,}\b|\b\d{10,}\b/i;
const EMAIL_ADDRESS_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

export class ResponseWorkerOrchestrationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ResponseWorkerOrchestrationError";
    this.code = code;
  }
}

function rowValue(row: OrchestrationRunRow | Record<string, unknown>, snakeCaseKey: string): unknown {
  if (Object.prototype.hasOwnProperty.call(row, snakeCaseKey)) return row[snakeCaseKey as keyof typeof row];
  const camelCaseKey = snakeCaseKey.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
  return (row as Record<string, unknown>)[camelCaseKey];
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

function safeDetailsValue(value: unknown, depth = 0): Json {
  if (depth > 4) return "[redacted]";
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (
      trimmed.length > MAX_SAFE_STRING_LENGTH ||
      FORBIDDEN_VALUE_PATTERN.test(trimmed) ||
      FULL_SIN_PATTERN.test(trimmed) ||
      FULL_ACCOUNT_PATTERN.test(trimmed) ||
      EMAIL_ADDRESS_PATTERN.test(trimmed)
    ) {
      return "[redacted]";
    }
    return trimmed;
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => safeDetailsValue(item, depth + 1));
  if (typeof value === "object") {
    const output: Record<string, Json> = {};
    let redacted = 0;
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
      if (!SAFE_KEY_PATTERN.test(key) || FORBIDDEN_KEY_PATTERN.test(key)) {
        redacted += 1;
        output[`redacted_key_${redacted}`] = "[redacted]";
        continue;
      }
      output[key] = safeDetailsValue(item, depth + 1);
    }
    return output;
  }
  return "[redacted]";
}

function safeDetailsRecord(value: unknown): Record<string, Json> {
  const safe = safeDetailsValue(jsonRecord(value));
  return safe && typeof safe === "object" && !Array.isArray(safe) ? safe as Record<string, Json> : {};
}

export function sanitizeWorkerOrchestrationError(error: unknown): { code: string; reason: string } {
  const code = error instanceof ResponseWorkerOrchestrationError ? error.code : "WORKER_ORCHESTRATION_FAILED";
  const reason = error instanceof Error ? error.message : String(error);
  const safeReason = safeDetailsValue(reason);
  return {
    code: sanitizeToken(code, "errorCode", "WORKER_ORCHESTRATION_FAILED").slice(0, 80),
    reason: typeof safeReason === "string" && safeReason !== "[redacted]"
      ? safeReason.slice(0, 240)
      : "Response worker orchestration failed with a sanitized operational error.",
  };
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
    throw new ResponseWorkerOrchestrationError("UNSAFE_WORKER_ORCHESTRATION_TOKEN", `${fieldName} must be a safe internal token.`);
  }
  return token;
}

function normalizePositiveInteger(value: unknown, fieldName: string, fallback: number, max: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > max) {
    throw new ResponseWorkerOrchestrationError("INVALID_WORKER_ORCHESTRATION_LIMIT", `${fieldName} must be an integer from 1 to ${max}.`);
  }
  return parsed;
}

function mapRunRow(row: OrchestrationRunRow): ResponseWorkerOrchestrationRun {
  return {
    id: Number(rowValue(row, "id") ?? 0),
    lockScope: String(rowValue(row, "lock_scope") ?? DEFAULT_RESPONSE_WORKER_ORCHESTRATION_LOCK_SCOPE),
    status: String(rowValue(row, "status") ?? "running") as ResponseWorkerOrchestrationStatus,
    mode: String(rowValue(row, "mode") ?? "bounded_once") as ResponseWorkerOrchestrationMode,
    workerId: String(rowValue(row, "worker_id") ?? "response-worker-orchestrator"),
    source: rowValue(row, "source") ? String(rowValue(row, "source")) : null,
    maxJobs: Number(rowValue(row, "max_jobs") ?? 1),
    dryRun: Boolean(rowValue(row, "dry_run")),
    startedAt: toIso(rowValue(row, "started_at")),
    finishedAt: rowValue(row, "finished_at") ? toIso(rowValue(row, "finished_at")) : null,
    lockedUntil: toIso(rowValue(row, "locked_until")),
    processedCount: Number(rowValue(row, "processed_count") ?? 0),
    failureCount: Number(rowValue(row, "failure_count") ?? 0),
    skippedReason: rowValue(row, "skipped_reason") ? String(rowValue(row, "skipped_reason")) : null,
    lastErrorCode: rowValue(row, "last_error_code") ? String(rowValue(row, "last_error_code")) : null,
    lastErrorReason: rowValue(row, "last_error_reason") ? String(rowValue(row, "last_error_reason")) : null,
    resultSummary: safeDetailsRecord(rowValue(row, "result_summary")),
    createdAt: toIso(rowValue(row, "created_at")),
    updatedAt: toIso(rowValue(row, "updated_at")),
  };
}

async function appendRunEvent(
  executor: any,
  params: {
    runId: number;
    eventType: ResponseWorkerOrchestrationEventType;
    previousStatus?: ResponseWorkerOrchestrationStatus | null;
    nextStatus: ResponseWorkerOrchestrationStatus;
    workerId?: string | null;
    details?: Record<string, Json>;
    errorCode?: string | null;
    errorReason?: string | null;
  },
): Promise<void> {
  await sql`
    insert into public.response_worker_orchestration_event (
      run_id,
      event_type,
      previous_status,
      next_status,
      worker_id,
      details,
      error_code,
      error_reason
    ) values (
      ${params.runId},
      ${params.eventType},
      ${params.previousStatus ?? null},
      ${params.nextStatus},
      ${params.workerId ?? null},
      ${JSON.stringify(safeDetailsRecord(params.details ?? {}))}::text::jsonb,
      ${params.errorCode ?? null},
      ${params.errorReason ?? null}
    )
  `.execute(executor);
}

function hasUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: unknown; constraint?: unknown; message?: unknown };
  return candidate?.code === "23505" || String(candidate?.message ?? "").includes("idx_response_worker_orchestration_active_lock_unique");
}

async function insertSkippedRun(params: {
  lockScope: string;
  workerId: string;
  source: string | null;
  maxJobs: number;
  dryRun: boolean;
  mode: ResponseWorkerOrchestrationMode;
  skippedReason: "overlap_active" | "stale_lock_present";
}): Promise<ResponseWorkerOrchestrationRun> {
  const result = await db.transaction().execute(async (trx) => {
    const inserted = await sql<OrchestrationRunRow>`
      insert into public.response_worker_orchestration_run (
        lock_scope,
        status,
        mode,
        worker_id,
        source,
        max_jobs,
        dry_run,
        locked_until,
        finished_at,
        skipped_reason,
        result_summary
      ) values (
        ${params.lockScope},
        'skipped',
        ${params.mode},
        ${params.workerId},
        ${params.source},
        ${params.maxJobs},
        ${params.dryRun},
        now(),
        now(),
        ${params.skippedReason},
        ${JSON.stringify({
          skippedReason: params.skippedReason,
          overlapPrevented: true,
          rawResponseTextLogged: false,
          externalAlertDeliveryUsed: false,
        })}::text::jsonb
      )
      returning *
    `.execute(trx);
    const row = mapRunRow(inserted.rows[0]);
    await appendRunEvent(trx as typeof db, {
      runId: row.id,
      eventType: params.skippedReason === "stale_lock_present" ? "skipped_stale_lock" : "skipped_overlap",
      nextStatus: "skipped",
      workerId: params.workerId,
      details: {
        skippedReason: params.skippedReason,
        overlapPrevented: true,
        noWorkerJobClaimed: true,
        rawResponseTextLogged: false,
        externalAlertDeliveryUsed: false,
        liveMailboxIntegrationUsed: false,
      },
    });
    return row;
  });
  return result;
}

async function startRun(params: {
  lockScope: string;
  workerId: string;
  source: string | null;
  maxJobs: number;
  dryRun: boolean;
  mode: ResponseWorkerOrchestrationMode;
  lockTtlSeconds: number;
}): Promise<ResponseWorkerOrchestrationRun | { skipped: ResponseWorkerOrchestrationRun }> {
  const active = await sql<OrchestrationRunRow>`
    select *
    from public.response_worker_orchestration_run
    where lock_scope = ${params.lockScope}
      and status = 'running'
    order by started_at desc, id desc
    limit 1
  `.execute(db);
  if (active.rows[0]) {
    const run = mapRunRow(active.rows[0]);
    const skippedReason = new Date(run.lockedUntil).getTime() < Date.now() ? "stale_lock_present" : "overlap_active";
    return {
      skipped: await insertSkippedRun({
        lockScope: params.lockScope,
        workerId: params.workerId,
        source: params.source,
        maxJobs: params.maxJobs,
        dryRun: params.dryRun,
        mode: params.mode,
        skippedReason,
      }),
    };
  }

  try {
    return await db.transaction().execute(async (trx) => {
      const inserted = await sql<OrchestrationRunRow>`
        insert into public.response_worker_orchestration_run (
          lock_scope,
          status,
          mode,
          worker_id,
          source,
          max_jobs,
          dry_run,
          locked_until,
          result_summary
        ) values (
          ${params.lockScope},
          'running',
          ${params.mode},
          ${params.workerId},
          ${params.source},
          ${params.maxJobs},
          ${params.dryRun},
          now() + make_interval(secs => ${params.lockTtlSeconds}),
          ${JSON.stringify({
            orchestrationVersion: RESPONSE_WORKER_ORCHESTRATION_VERSION,
            bounded: true,
            noDaemon: true,
            rawResponseTextLogged: false,
          })}::text::jsonb
        )
        returning *
      `.execute(trx);
      const row = mapRunRow(inserted.rows[0]);
      await appendRunEvent(trx as typeof db, {
        runId: row.id,
        eventType: "started",
        nextStatus: "running",
        workerId: params.workerId,
        details: {
          mode: params.mode,
          maxJobs: params.maxJobs,
          source: params.source ?? "all",
          bounded: true,
          noDaemon: true,
          rawResponseTextLogged: false,
          externalAlertDeliveryUsed: false,
          liveMailboxIntegrationUsed: false,
        },
      });
      return row;
    });
  } catch (error) {
    if (!hasUniqueViolation(error)) throw error;
    return {
      skipped: await insertSkippedRun({
        lockScope: params.lockScope,
        workerId: params.workerId,
        source: params.source,
        maxJobs: params.maxJobs,
        dryRun: params.dryRun,
        mode: params.mode,
        skippedReason: "overlap_active",
      }),
    };
  }
}

async function finalizeRun(params: {
  run: ResponseWorkerOrchestrationRun;
  status: "succeeded" | "failed";
  processed: number;
  failureCount: number;
  resultSummary: Record<string, Json>;
  error?: unknown;
}): Promise<ResponseWorkerOrchestrationRun> {
  const normalizedError = params.error ? sanitizeWorkerOrchestrationError(params.error) : null;
  const updated = await db.transaction().execute(async (trx) => {
    const result = await sql<OrchestrationRunRow>`
      update public.response_worker_orchestration_run
      set
        status = ${params.status},
        finished_at = now(),
        updated_at = now(),
        processed_count = ${params.processed},
        failure_count = ${params.failureCount},
        last_error_code = ${normalizedError?.code ?? null},
        last_error_reason = ${normalizedError?.reason ?? null},
        result_summary = ${JSON.stringify(safeDetailsRecord(params.resultSummary))}::text::jsonb
      where id = ${params.run.id}
        and status = 'running'
      returning *
    `.execute(trx);
    const row = result.rows[0] ? mapRunRow(result.rows[0]) : null;
    if (!row) {
      throw new ResponseWorkerOrchestrationError(
        "WORKER_ORCHESTRATION_FINALIZE_CONFLICT",
        "Response worker orchestration run could not be finalized because the active lock changed.",
      );
    }
    await appendRunEvent(trx as typeof db, {
      runId: row.id,
      eventType: params.status,
      previousStatus: "running",
      nextStatus: params.status,
      workerId: row.workerId,
      errorCode: normalizedError?.code ?? null,
      errorReason: normalizedError?.reason ?? null,
      details: {
        processed: params.processed,
        failureCount: params.failureCount,
        rawResponseTextLogged: false,
        externalAlertDeliveryUsed: false,
        liveMailboxIntegrationUsed: false,
        canonicalFactsMutated: false,
        violationTruthMutated: false,
        packetReadinessMutated: false,
      },
    });
    return row;
  });
  return updated;
}

export async function runResponseWorkerOrchestration(
  input: RunResponseWorkerOrchestrationInput = {},
): Promise<ResponseWorkerOrchestrationResult> {
  await ensureResponseDocumentSchema();
  const dryRun = input.dryRun !== false;
  const maxJobs = normalizePositiveInteger(input.maxJobs, "maxJobs", 1, MAX_MAX_JOBS);
  const workerId = sanitizeToken(input.workerId, "workerId", `response-worker-orchestrator-${process.pid}`);
  const source = input.source ? sanitizeToken(input.source, "source", "") : null;
  const lockScope = sanitizeToken(input.lockScope, "lockScope", DEFAULT_RESPONSE_WORKER_ORCHESTRATION_LOCK_SCOPE);
  const lockTtlSeconds = normalizePositiveInteger(input.lockTtlSeconds, "lockTtlSeconds", DEFAULT_LOCK_TTL_SECONDS, 3600);
  const mode: ResponseWorkerOrchestrationMode = dryRun
    ? "dry_run"
    : input.scheduled === true
      ? "scheduled_bounded"
      : maxJobs === 1
        ? "bounded_once"
        : "bounded_batch";

  if (dryRun) {
    const preview = await processNextResponseProcessingJob({ workerId, dryRun: true, source });
    return {
      status: "dry_run_preview",
      dryRun: true,
      workerId,
      run: null,
      processed: 0,
      failureCount: 0,
      skippedReason: null,
      iterations: [{
        status: preview.status,
        jobId: preview.job?.id ?? null,
        jobType: preview.job?.jobType ?? null,
        jobStatus: preview.job?.status ?? null,
      }],
      boundaries: {
        bounded: true,
        noDaemon: true,
        overlapPrevented: true,
        noRawResponseText: true,
        externalAlertDeliveryUsed: false,
        liveMailboxIntegrationUsed: false,
        canonicalFactsMutated: false,
        violationTruthMutated: false,
        packetReadinessMutated: false,
      },
    };
  }

  const started = await startRun({ lockScope, workerId, source, maxJobs, dryRun, mode, lockTtlSeconds });
  if ("skipped" in started) {
    return {
      status: "skipped",
      dryRun: false,
      workerId,
      run: started.skipped,
      processed: 0,
      failureCount: 0,
      skippedReason: started.skipped.skippedReason,
      iterations: [],
      boundaries: {
        bounded: true,
        noDaemon: true,
        overlapPrevented: true,
        noRawResponseText: true,
        externalAlertDeliveryUsed: false,
        liveMailboxIntegrationUsed: false,
        canonicalFactsMutated: false,
        violationTruthMutated: false,
        packetReadinessMutated: false,
      },
    };
  }

  const iterations: ResponseWorkerOrchestrationResult["iterations"] = [];
  let processed = 0;
  let failureCount = 0;
  try {
    for (let index = 0; index < maxJobs; index += 1) {
      const result = await processNextResponseProcessingJob({ workerId, dryRun: false, source });
      iterations.push({
        status: result.status,
        jobId: result.job?.id ?? null,
        jobType: result.job?.jobType ?? null,
        jobStatus: result.job?.status ?? null,
      });
      if (result.status === "idle") break;
      processed += 1;
      if (result.status === "failed" || result.status === "dead_lettered") failureCount += 1;
    }

    const status = failureCount > 0 ? "failed" : "succeeded";
    const run = await finalizeRun({
      run: started,
      status,
      processed,
      failureCount,
      resultSummary: {
        iterations,
        processed,
        failureCount,
        maxJobs,
        bounded: true,
        noDaemon: true,
        rawResponseTextLogged: false,
        externalAlertDeliveryUsed: false,
        liveMailboxIntegrationUsed: false,
        canonicalFactsMutated: false,
        violationTruthMutated: false,
        packetReadinessMutated: false,
      },
    });
    return {
      status,
      dryRun: false,
      workerId,
      run,
      processed,
      failureCount,
      skippedReason: null,
      iterations,
      boundaries: {
        bounded: true,
        noDaemon: true,
        overlapPrevented: true,
        noRawResponseText: true,
        externalAlertDeliveryUsed: false,
        liveMailboxIntegrationUsed: false,
        canonicalFactsMutated: false,
        violationTruthMutated: false,
        packetReadinessMutated: false,
      },
    };
  } catch (error) {
    const run = await finalizeRun({
      run: started,
      status: "failed",
      processed,
      failureCount: failureCount + 1,
      error,
      resultSummary: {
        iterations,
        processed,
        failureCount: failureCount + 1,
        bounded: true,
        noDaemon: true,
        rawResponseTextLogged: false,
        externalAlertDeliveryUsed: false,
        liveMailboxIntegrationUsed: false,
      },
    });
    return {
      status: "failed",
      dryRun: false,
      workerId,
      run,
      processed,
      failureCount: failureCount + 1,
      skippedReason: null,
      iterations,
      boundaries: {
        bounded: true,
        noDaemon: true,
        overlapPrevented: true,
        noRawResponseText: true,
        externalAlertDeliveryUsed: false,
        liveMailboxIntegrationUsed: false,
        canonicalFactsMutated: false,
        violationTruthMutated: false,
        packetReadinessMutated: false,
      },
    };
  }
}

export async function getResponseWorkerOrchestrationMetrics(): Promise<ResponseWorkerOrchestrationMetrics> {
  await ensureResponseDocumentSchema();
  const result = await sql<any>`
    with counts as (
      select
        count(*)::int as total_runs,
        coalesce(sum(case when status = 'running' then 1 else 0 end), 0)::int as running_runs,
        coalesce(sum(case when status = 'running' and locked_until < now() then 1 else 0 end), 0)::int as stale_running_runs,
        coalesce(sum(case when status = 'succeeded' then 1 else 0 end), 0)::int as succeeded_runs,
        coalesce(sum(case when status = 'failed' then 1 else 0 end), 0)::int as failed_runs,
        coalesce(sum(case when status = 'skipped' then 1 else 0 end), 0)::int as skipped_runs,
        coalesce(sum(case when status = 'failed' and created_at >= now() - interval '24 hours' then 1 else 0 end), 0)::int as recent_failed_runs
      from public.response_worker_orchestration_run
    ),
    skipped_overlap as (
      select count(*)::int as skipped_overlap_runs
      from public.response_worker_orchestration_event
      where event_type in ('skipped_overlap', 'skipped_stale_lock')
        and created_at >= now() - interval '24 hours'
    ),
    last_run as (
      select status, created_at
      from public.response_worker_orchestration_run
      order by created_at desc, id desc
      limit 1
    ),
    last_success as (
      select created_at
      from public.response_worker_orchestration_run
      where status = 'succeeded'
      order by created_at desc, id desc
      limit 1
    ),
    last_failed as (
      select created_at
      from public.response_worker_orchestration_run
      where status = 'failed'
      order by created_at desc, id desc
      limit 1
    ),
    active_lock as (
      select id, lock_scope, locked_until, (locked_until < now()) as stale
      from public.response_worker_orchestration_run
      where status = 'running'
      order by created_at desc, id desc
      limit 1
    )
    select
      counts.*,
      skipped_overlap.skipped_overlap_runs,
      last_run.status as last_run_status,
      last_run.created_at as last_run_at,
      last_success.created_at as last_successful_run_at,
      last_failed.created_at as last_failed_run_at,
      active_lock.id as active_lock_run_id,
      active_lock.lock_scope as active_lock_scope,
      active_lock.locked_until as active_lock_locked_until,
      active_lock.stale as active_lock_stale
    from counts
    cross join skipped_overlap
    left join last_run on true
    left join last_success on true
    left join last_failed on true
    left join active_lock on true
  `.execute(db);
  const row = result.rows[0] ?? {};
  const activeLockRunId = rowValue(row, "active_lock_run_id");
  return {
    generatedAt: new Date().toISOString(),
    orchestrationVersion: RESPONSE_WORKER_ORCHESTRATION_VERSION,
    totalRuns: Number(rowValue(row, "total_runs") ?? 0),
    runningRuns: Number(rowValue(row, "running_runs") ?? 0),
    staleRunningRuns: Number(rowValue(row, "stale_running_runs") ?? 0),
    succeededRuns: Number(rowValue(row, "succeeded_runs") ?? 0),
    failedRuns: Number(rowValue(row, "failed_runs") ?? 0),
    skippedRuns: Number(rowValue(row, "skipped_runs") ?? 0),
    skippedOverlapRuns: Number(rowValue(row, "skipped_overlap_runs") ?? 0),
    recentFailedRuns: Number(rowValue(row, "recent_failed_runs") ?? 0),
    lastRunStatus: rowValue(row, "last_run_status") ? String(rowValue(row, "last_run_status")) as ResponseWorkerOrchestrationStatus : null,
    lastRunAt: rowValue(row, "last_run_at") ? toIso(rowValue(row, "last_run_at")) : null,
    lastSuccessfulRunAt: rowValue(row, "last_successful_run_at") ? toIso(rowValue(row, "last_successful_run_at")) : null,
    lastFailedRunAt: rowValue(row, "last_failed_run_at") ? toIso(rowValue(row, "last_failed_run_at")) : null,
    activeLock: activeLockRunId
      ? {
          runId: Number(activeLockRunId),
          lockScope: String(rowValue(row, "active_lock_scope") ?? DEFAULT_RESPONSE_WORKER_ORCHESTRATION_LOCK_SCOPE),
          lockedUntil: toIso(rowValue(row, "active_lock_locked_until")),
          stale: Boolean(rowValue(row, "active_lock_stale")),
        }
      : null,
    boundaries: {
      bounded: true,
      noDaemon: true,
      overlapPreventionEnabled: true,
      noRawResponseText: true,
      externalAlertDeliveryUsed: false,
      liveMailboxIntegrationUsed: false,
    },
  };
}
