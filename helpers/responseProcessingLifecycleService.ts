import { sql } from "kysely";

import { db } from "./db";
import { ensureResponseDocumentSchema } from "./responseDocumentSchema";
import { getResponseReplayReadinessMetrics } from "./responseReplayService";
import type { Json } from "./schema";

export const RESPONSE_PROCESSING_LIFECYCLE_VERSION = "response-processing-lifecycle-2026-05-19" as const;

export type ResponseProcessingLifecycleEventType =
  | "retention_previewed"
  | "retention_cleanup_marked"
  | "drift_reported"
  | "soak_check_completed";

export type ResponseProcessingLifecycleTargetType =
  | "response_processing_job"
  | "response_worker_orchestration_run"
  | "response_processing_event"
  | "internal_alert"
  | "summary";

export type ResponseProcessingRetentionPreviewInput = {
  olderThanDays?: number | null;
  limit?: number | null;
  source?: string | null;
};

export type ResponseProcessingRetentionCleanupInput = ResponseProcessingRetentionPreviewInput & {
  dryRun?: boolean;
  confirmCleanup?: boolean | null;
  actorUserId?: number | null;
};

export type ResponseProcessingRetentionBucket = {
  eligibleRecords: number;
  previewedRecordIds: number[];
  blockedActiveRecords: number;
  blockedStaleRecords: number;
  blockedFailedRecords: number;
  blockedDeadLetterRecords: number;
  eventRowsCovered: number;
  destructiveDeleteUsed: false;
};

export type ResponseProcessingRetentionPreview = {
  generatedAt: string;
  lifecycleVersion: typeof RESPONSE_PROCESSING_LIFECYCLE_VERSION;
  dryRun: true;
  olderThanDays: number;
  limit: number;
  source: string | null;
  queueJobs: ResponseProcessingRetentionBucket;
  orchestrationRuns: ResponseProcessingRetentionBucket;
  replayAuditHistory: {
    recordsOlderThanRetention: number;
    eligibleRecords: 0;
    reason: "append_only_replay_audit_retained";
  };
  internalAlertHistory: {
    recordsOlderThanRetention: number;
    eligibleRecords: 0;
    reason: "append_only_internal_alert_history_retained";
  };
  cleanupAlreadyMarkedRecords: number;
  oldestTerminalJobAgeSeconds: number | null;
  oldestDeadLetterAgeSeconds: number | null;
  oldestTerminalOrchestrationAgeSeconds: number | null;
  boundaries: {
    noDestructiveCleanupByDefault: true;
    explicitOperatorControlRequired: true;
    activeJobsProtected: true;
    runningJobsProtected: true;
    staleJobsProtected: true;
    deadLetterJobsProtected: true;
    appendOnlyLifecycleEvents: true;
    rawResponseTextStored: false;
    canonicalFactsMutated: false;
    violationTruthMutated: false;
    packetReadinessMutated: false;
  };
};

export type ResponseProcessingRetentionCleanupResult = {
  generatedAt: string;
  lifecycleVersion: typeof RESPONSE_PROCESSING_LIFECYCLE_VERSION;
  dryRun: boolean;
  actorUserId: number | null;
  markedQueueJobs: number;
  markedOrchestrationRuns: number;
  summaryEventWritten: boolean;
  preview: ResponseProcessingRetentionPreview;
  boundaries: ResponseProcessingRetentionPreview["boundaries"] & {
    destructiveDeleteUsed: false;
    payloadsMutated: false;
    jobEventsDeleted: false;
    orchestrationEventsDeleted: false;
  };
};

export type ResponseProcessingDriftSeverity = "info" | "warning" | "critical";
export type ResponseProcessingDriftKey =
  | "queue_growth_trend"
  | "dead_letter_growth_trend"
  | "retry_backlog_growth"
  | "stale_running_accumulation"
  | "replay_non_replayable_growth"
  | "orchestration_overlap_frequency"
  | "repeated_worker_failures"
  | "orphaned_replacement_chains"
  | "orphaned_remediation_references"
  | "old_queued_jobs"
  | "old_dead_letter_jobs";

export type ResponseProcessingDriftThresholds = Partial<{
  queueGrowthDelta: number;
  deadLetterGrowthDelta: number;
  retryBacklogJobs: number;
  staleRunningJobs: number;
  replayNonReplayableRecords: number;
  orchestrationOverlapSkips: number;
  repeatedWorkerFailures: number;
  orphanedReplacementChains: number;
  orphanedRemediationReferences: number;
  oldestQueuedAgeSeconds: number;
  oldestDeadLetterAgeSeconds: number;
}>;

export type ResponseProcessingDriftCheck = {
  key: ResponseProcessingDriftKey;
  severity: ResponseProcessingDriftSeverity;
  active: boolean;
  count: number;
  threshold: number;
  message: string;
  remediationTarget: "queue_remediation" | "replay" | "worker_orchestration" | "lifecycle_retention";
};

export type ResponseProcessingDriftReport = {
  generatedAt: string;
  lifecycleVersion: typeof RESPONSE_PROCESSING_LIFECYCLE_VERSION;
  source: string | null;
  lookbackHours: number;
  checks: ResponseProcessingDriftCheck[];
  activeChecks: number;
  criticalChecks: number;
  thresholds: Required<ResponseProcessingDriftThresholds>;
  trendWindow: {
    currentQueuedJobsCreated: number;
    previousQueuedJobsCreated: number;
    currentDeadLetteredJobs: number;
    previousDeadLetteredJobs: number;
  };
  boundaries: {
    operatorVisibleOnly: true;
    noExternalAlerts: true;
    noAutoRemediation: true;
    noRawResponseText: true;
    liveMailboxIntegrationUsed: false;
  };
};

export type ResponseProcessingLifecycleMetrics = {
  generatedAt: string;
  lifecycleVersion: typeof RESPONSE_PROCESSING_LIFECYCLE_VERSION;
  retentionPreview: ResponseProcessingRetentionPreview;
  driftReport: ResponseProcessingDriftReport;
  cleanupEligibleRecords: number;
  cleanupMarkedRecords: number;
  activeDriftAlerts: number;
  criticalDriftAlerts: number;
  lastCleanupAt: string | null;
  lastDriftReportAt: string | null;
  lastSoakCheckAt: string | null;
  lastSoakCheckStatus: string | null;
  boundaries: {
    appendOnlyLifecycleEvents: true;
    destructiveDeleteUsed: false;
    noRawResponseText: true;
    externalAlertDeliveryUsed: false;
    liveMailboxIntegrationUsed: false;
  };
};

type Row = Record<string, unknown>;

const DEFAULT_RETENTION_OLDER_THAN_DAYS = 90;
const MAX_RETENTION_LIMIT = 500;
const SAFE_TOKEN_PATTERN = /^[a-zA-Z0-9_.:-]{1,120}$/;
const SAFE_KEY_PATTERN = /^[a-zA-Z0-9_.:-]{1,80}$/;
const MAX_SAFE_STRING_LENGTH = 500;
const FORBIDDEN_KEY_PATTERN =
  /(^|[_.:-])(raw.?text|response.?text|extracted.?text|plain.?text|body|html|content|subject|from|to|cc|bcc|sender|recipient|email|mailbox|oauth|access.?token|refresh.?token|client.?secret|password|token|secret|authorization|cookie|session|api.?key|private.?key|database.?url|connection.?string)($|[_.:-])/i;
const FORBIDDEN_VALUE_PATTERN =
  /(raw report text|raw pdf text|full email body|email body dump|database_url|postgres:\/\/|mysql:\/\/|mongodb:\/\/|bearer\s+[a-z0-9._-]+|basic\s+[a-z0-9+/=._-]+|sk-[a-z0-9_-]{10,}|ghp_[a-z0-9_]{10,}|github_pat_[a-z0-9_]+|xox[baprs]-[a-z0-9-]+|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private key|password\s*[:=]|secret\s*[:=]|mailbox password|imap password|smtp password|oauth refresh token|session=|cookie=)/i;
const FULL_SIN_PATTERN = /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/;
const FULL_ACCOUNT_PATTERN = /\b(?:account|acct|member)\s*(?:number|no\.?|#)?\s*[:#-]?\s*[A-Z0-9][A-Z0-9 -]{9,}\b|\b\d{10,}\b/i;
const EMAIL_ADDRESS_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

const DEFAULT_DRIFT_THRESHOLDS: Required<ResponseProcessingDriftThresholds> = {
  queueGrowthDelta: 100,
  deadLetterGrowthDelta: 1,
  retryBacklogJobs: 5,
  staleRunningJobs: 1,
  replayNonReplayableRecords: 25,
  orchestrationOverlapSkips: 3,
  repeatedWorkerFailures: 2,
  orphanedReplacementChains: 1,
  orphanedRemediationReferences: 1,
  oldestQueuedAgeSeconds: 3600,
  oldestDeadLetterAgeSeconds: 7 * 24 * 60 * 60,
};

export class ResponseProcessingLifecycleError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ResponseProcessingLifecycleError";
    this.code = code;
  }
}

function rowValue(row: Row, snakeCaseKey: string): unknown {
  if (Object.prototype.hasOwnProperty.call(row, snakeCaseKey)) return row[snakeCaseKey];
  const camelCaseKey = snakeCaseKey.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
  return row[camelCaseKey];
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizePositiveInteger(value: unknown, fieldName: string, fallback: number, max: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > max) {
    throw new ResponseProcessingLifecycleError("INVALID_LIFECYCLE_LIMIT", `${fieldName} must be an integer from 1 to ${max}.`);
  }
  return parsed;
}

function sanitizeToken(value: string | null | undefined, fieldName: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  const token = String(value).trim();
  if (
    !SAFE_TOKEN_PATTERN.test(token) ||
    FORBIDDEN_KEY_PATTERN.test(token) ||
    FORBIDDEN_VALUE_PATTERN.test(token) ||
    FULL_SIN_PATTERN.test(token) ||
    FULL_ACCOUNT_PATTERN.test(token) ||
    EMAIL_ADDRESS_PATTERN.test(token)
  ) {
    throw new ResponseProcessingLifecycleError("UNSAFE_LIFECYCLE_TOKEN", `${fieldName} must be a safe internal token.`);
  }
  return token;
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
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => safeDetailsValue(item, depth + 1));
  if (typeof value === "object") {
    const output: Record<string, Json> = {};
    let redacted = 0;
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
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
  const safe = safeDetailsValue(value);
  return safe && typeof safe === "object" && !Array.isArray(safe) ? safe as Record<string, Json> : {};
}

export function sanitizeResponseProcessingLifecycleError(error: unknown): { code: string; reason: string } {
  const code = error instanceof ResponseProcessingLifecycleError ? error.code : "RESPONSE_LIFECYCLE_FAILED";
  const reason = error instanceof Error ? error.message : String(error);
  const safeReason = safeDetailsValue(reason);
  return {
    code: sanitizeToken(code, "errorCode") ?? "RESPONSE_LIFECYCLE_FAILED",
    reason: typeof safeReason === "string" && safeReason !== "[redacted]"
      ? safeReason.slice(0, 240)
      : "Response-processing lifecycle command failed with a sanitized operational error.",
  };
}

function normalizeRetentionInput(input: ResponseProcessingRetentionPreviewInput | undefined) {
  return {
    olderThanDays: normalizePositiveInteger(input?.olderThanDays, "olderThanDays", DEFAULT_RETENTION_OLDER_THAN_DAYS, 3650),
    limit: normalizePositiveInteger(input?.limit, "limit", 100, MAX_RETENTION_LIMIT),
    source: sanitizeToken(input?.source ?? null, "source"),
  };
}

function emptyRetentionBucket(): ResponseProcessingRetentionBucket {
  return {
    eligibleRecords: 0,
    previewedRecordIds: [],
    blockedActiveRecords: 0,
    blockedStaleRecords: 0,
    blockedFailedRecords: 0,
    blockedDeadLetterRecords: 0,
    eventRowsCovered: 0,
    destructiveDeleteUsed: false,
  };
}

function retentionBoundaries(): ResponseProcessingRetentionPreview["boundaries"] {
  return {
    noDestructiveCleanupByDefault: true,
    explicitOperatorControlRequired: true,
    activeJobsProtected: true,
    runningJobsProtected: true,
    staleJobsProtected: true,
    deadLetterJobsProtected: true,
    appendOnlyLifecycleEvents: true,
    rawResponseTextStored: false,
    canonicalFactsMutated: false,
    violationTruthMutated: false,
    packetReadinessMutated: false,
  };
}

async function loadEligibleIds(params: {
  table: "response_processing_job" | "response_worker_orchestration_run";
  olderThanDays: number;
  source: string | null;
  limit: number;
}): Promise<number[]> {
  if (params.table === "response_processing_job") {
    const result = await sql<{ id: string }>`
      select job.id::text as id
      from public.response_processing_job job
      where job.status = 'succeeded'
        and coalesce(job.finished_at, job.updated_at, job.created_at) < now() - make_interval(days => ${params.olderThanDays})
        and (${params.source}::text is null or job.source = ${params.source})
        and not exists (
          select 1
          from public.response_processing_lifecycle_event lifecycle
          where lifecycle.event_type = 'retention_cleanup_marked'
            and lifecycle.target_type = 'response_processing_job'
            and lifecycle.target_id = job.id
        )
      order by coalesce(job.finished_at, job.updated_at, job.created_at) asc, job.id asc
      limit ${params.limit}
    `.execute(db);
    return result.rows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);
  }

  const result = await sql<{ id: string }>`
    select run.id::text as id
    from public.response_worker_orchestration_run run
    where run.status in ('succeeded', 'skipped')
      and coalesce(run.finished_at, run.updated_at, run.created_at) < now() - make_interval(days => ${params.olderThanDays})
      and (${params.source}::text is null or run.source = ${params.source})
      and not exists (
        select 1
        from public.response_processing_lifecycle_event lifecycle
        where lifecycle.event_type = 'retention_cleanup_marked'
          and lifecycle.target_type = 'response_worker_orchestration_run'
          and lifecycle.target_id = run.id
      )
    order by coalesce(run.finished_at, run.updated_at, run.created_at) asc, run.id asc
    limit ${params.limit}
  `.execute(db);
  return result.rows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);
}

export async function getResponseProcessingRetentionPreview(
  input: ResponseProcessingRetentionPreviewInput = {},
): Promise<ResponseProcessingRetentionPreview> {
  await ensureResponseDocumentSchema();
  const normalized = normalizeRetentionInput(input);
  const [queueCounts, orchestrationCounts, replayCounts, alertCounts, cleanupCounts, eligibleJobIds, eligibleRunIds] = await Promise.all([
    sql<Row>`
      with scoped as (
        select *
        from public.response_processing_job job
        where (${normalized.source}::text is null or job.source = ${normalized.source})
      ),
      eligible as (
        select id
        from scoped job
        where job.status = 'succeeded'
          and coalesce(job.finished_at, job.updated_at, job.created_at) < now() - make_interval(days => ${normalized.olderThanDays})
          and not exists (
            select 1
            from public.response_processing_lifecycle_event lifecycle
            where lifecycle.event_type = 'retention_cleanup_marked'
              and lifecycle.target_type = 'response_processing_job'
              and lifecycle.target_id = job.id
          )
      )
      select
        (select count(*)::int from eligible) as eligible_records,
        coalesce(sum(case when status in ('queued', 'running') then 1 else 0 end), 0)::int as blocked_active_records,
        coalesce(sum(case when status = 'running' and locked_until is not null and locked_until < now() then 1 else 0 end), 0)::int as blocked_stale_records,
        coalesce(sum(case when status = 'failed' then 1 else 0 end), 0)::int as blocked_failed_records,
        coalesce(sum(case when status = 'dead_lettered' then 1 else 0 end), 0)::int as blocked_dead_letter_records,
        extract(epoch from (now() - min(case when status in ('succeeded', 'failed', 'dead_lettered') then coalesce(finished_at, updated_at, created_at) else null end)))::int as oldest_terminal_job_age_seconds,
        extract(epoch from (now() - min(case when status = 'dead_lettered' then coalesce(finished_at, updated_at, created_at) else null end)))::int as oldest_dead_letter_age_seconds
      from scoped
    `.execute(db),
    sql<Row>`
      with scoped as (
        select *
        from public.response_worker_orchestration_run run
        where (${normalized.source}::text is null or run.source = ${normalized.source})
      ),
      eligible as (
        select id
        from scoped run
        where run.status in ('succeeded', 'skipped')
          and coalesce(run.finished_at, run.updated_at, run.created_at) < now() - make_interval(days => ${normalized.olderThanDays})
          and not exists (
            select 1
            from public.response_processing_lifecycle_event lifecycle
            where lifecycle.event_type = 'retention_cleanup_marked'
              and lifecycle.target_type = 'response_worker_orchestration_run'
              and lifecycle.target_id = run.id
          )
      )
      select
        (select count(*)::int from eligible) as eligible_records,
        coalesce(sum(case when status = 'running' then 1 else 0 end), 0)::int as blocked_active_records,
        coalesce(sum(case when status = 'running' and locked_until < now() then 1 else 0 end), 0)::int as blocked_stale_records,
        coalesce(sum(case when status = 'failed' then 1 else 0 end), 0)::int as blocked_failed_records,
        0::int as blocked_dead_letter_records,
        extract(epoch from (now() - min(case when status in ('succeeded', 'skipped', 'failed') then coalesce(finished_at, updated_at, created_at) else null end)))::int as oldest_terminal_orchestration_age_seconds
      from scoped
    `.execute(db),
    sql<Row>`
      select count(*)::int as records_older_than_retention
      from public.response_processing_event event
      where event.created_at < now() - make_interval(days => ${normalized.olderThanDays})
    `.execute(db),
    sql<Row>`
      select count(*)::int as records_older_than_retention
      from public.response_processing_lifecycle_event lifecycle
      where lifecycle.event_type in ('drift_reported', 'soak_check_completed')
        and lifecycle.created_at < now() - make_interval(days => ${normalized.olderThanDays})
        and (${normalized.source}::text is null or lifecycle.source = ${normalized.source})
    `.execute(db),
    sql<Row>`
      select count(*)::int as cleanup_marked_records
      from public.response_processing_lifecycle_event lifecycle
      where lifecycle.event_type = 'retention_cleanup_marked'
        and (${normalized.source}::text is null or lifecycle.source = ${normalized.source})
    `.execute(db),
    loadEligibleIds({ table: "response_processing_job", ...normalized }),
    loadEligibleIds({ table: "response_worker_orchestration_run", ...normalized }),
  ]);

  const jobEventRows = eligibleJobIds.length > 0
    ? await sql<Row>`
        select count(*)::int as count
        from public.response_processing_job_event
        where job_id in (${sql.join(eligibleJobIds)})
      `.execute(db)
    : { rows: [{ count: 0 }] };
  const runEventRows = eligibleRunIds.length > 0
    ? await sql<Row>`
        select count(*)::int as count
        from public.response_worker_orchestration_event
        where run_id in (${sql.join(eligibleRunIds)})
      `.execute(db)
    : { rows: [{ count: 0 }] };

  const queueRow = queueCounts.rows[0] ?? {};
  const orchestrationRow = orchestrationCounts.rows[0] ?? {};
  return {
    generatedAt: new Date().toISOString(),
    lifecycleVersion: RESPONSE_PROCESSING_LIFECYCLE_VERSION,
    dryRun: true,
    olderThanDays: normalized.olderThanDays,
    limit: normalized.limit,
    source: normalized.source,
    queueJobs: {
      ...emptyRetentionBucket(),
      eligibleRecords: toNumber(rowValue(queueRow, "eligible_records")),
      previewedRecordIds: eligibleJobIds,
      blockedActiveRecords: toNumber(rowValue(queueRow, "blocked_active_records")),
      blockedStaleRecords: toNumber(rowValue(queueRow, "blocked_stale_records")),
      blockedFailedRecords: toNumber(rowValue(queueRow, "blocked_failed_records")),
      blockedDeadLetterRecords: toNumber(rowValue(queueRow, "blocked_dead_letter_records")),
      eventRowsCovered: toNumber(rowValue(jobEventRows.rows[0] ?? {}, "count")),
    },
    orchestrationRuns: {
      ...emptyRetentionBucket(),
      eligibleRecords: toNumber(rowValue(orchestrationRow, "eligible_records")),
      previewedRecordIds: eligibleRunIds,
      blockedActiveRecords: toNumber(rowValue(orchestrationRow, "blocked_active_records")),
      blockedStaleRecords: toNumber(rowValue(orchestrationRow, "blocked_stale_records")),
      blockedFailedRecords: toNumber(rowValue(orchestrationRow, "blocked_failed_records")),
      blockedDeadLetterRecords: toNumber(rowValue(orchestrationRow, "blocked_dead_letter_records")),
      eventRowsCovered: toNumber(rowValue(runEventRows.rows[0] ?? {}, "count")),
    },
    replayAuditHistory: {
      recordsOlderThanRetention: toNumber(rowValue(replayCounts.rows[0] ?? {}, "records_older_than_retention")),
      eligibleRecords: 0,
      reason: "append_only_replay_audit_retained",
    },
    internalAlertHistory: {
      recordsOlderThanRetention: toNumber(rowValue(alertCounts.rows[0] ?? {}, "records_older_than_retention")),
      eligibleRecords: 0,
      reason: "append_only_internal_alert_history_retained",
    },
    cleanupAlreadyMarkedRecords: toNumber(rowValue(cleanupCounts.rows[0] ?? {}, "cleanup_marked_records")),
    oldestTerminalJobAgeSeconds: toNullableNumber(rowValue(queueRow, "oldest_terminal_job_age_seconds")),
    oldestDeadLetterAgeSeconds: toNullableNumber(rowValue(queueRow, "oldest_dead_letter_age_seconds")),
    oldestTerminalOrchestrationAgeSeconds: toNullableNumber(rowValue(orchestrationRow, "oldest_terminal_orchestration_age_seconds")),
    boundaries: retentionBoundaries(),
  };
}

async function insertLifecycleEvent(params: {
  eventType: ResponseProcessingLifecycleEventType;
  targetType?: ResponseProcessingLifecycleTargetType | null;
  targetId?: number | null;
  source?: string | null;
  actorUserId?: number | null;
  dryRun?: boolean;
  details?: Record<string, Json>;
}): Promise<boolean> {
  const result = await sql<{ id: string }>`
    insert into public.response_processing_lifecycle_event (
      event_type,
      target_type,
      target_id,
      source,
      actor_user_id,
      dry_run,
      details
    ) values (
      ${params.eventType},
      ${params.targetType ?? null},
      ${params.targetId ?? null},
      ${sanitizeToken(params.source ?? "operator", "source") ?? "operator"},
      ${params.actorUserId ?? null},
      ${params.dryRun ?? true},
      ${JSON.stringify(safeDetailsRecord(params.details ?? {}))}::text::jsonb
    )
    on conflict do nothing
    returning id::text as id
  `.execute(db);
  return result.rows.length > 0;
}

export async function applyResponseProcessingRetentionCleanup(
  input: ResponseProcessingRetentionCleanupInput = {},
): Promise<ResponseProcessingRetentionCleanupResult> {
  await ensureResponseDocumentSchema();
  const dryRun = input.dryRun !== false;
  const preview = await getResponseProcessingRetentionPreview(input);
  if (dryRun) {
    return {
      generatedAt: new Date().toISOString(),
      lifecycleVersion: RESPONSE_PROCESSING_LIFECYCLE_VERSION,
      dryRun: true,
      actorUserId: null,
      markedQueueJobs: 0,
      markedOrchestrationRuns: 0,
      summaryEventWritten: false,
      preview,
      boundaries: {
        ...retentionBoundaries(),
        destructiveDeleteUsed: false,
        payloadsMutated: false,
        jobEventsDeleted: false,
        orchestrationEventsDeleted: false,
      },
    };
  }

  if (input.confirmCleanup !== true) {
    throw new ResponseProcessingLifecycleError("RETENTION_CLEANUP_CONFIRMATION_REQUIRED", "Retention cleanup apply requires explicit confirmCleanup true.");
  }
  const actorUserId = normalizePositiveInteger(input.actorUserId, "actorUserId", 0, Number.MAX_SAFE_INTEGER);
  if (!actorUserId) {
    throw new ResponseProcessingLifecycleError("RETENTION_CLEANUP_ACTOR_REQUIRED", "Retention cleanup apply requires actorUserId.");
  }

  let markedQueueJobs = 0;
  let markedOrchestrationRuns = 0;
  for (const jobId of preview.queueJobs.previewedRecordIds) {
    const inserted = await insertLifecycleEvent({
      eventType: "retention_cleanup_marked",
      targetType: "response_processing_job",
      targetId: jobId,
      source: preview.source ?? "operator",
      actorUserId,
      dryRun: false,
      details: {
        cleanupAction: "retention_mark_only",
        retentionOlderThanDays: preview.olderThanDays,
        destructiveDeleteUsed: false,
        payloadsMutated: false,
        jobEventsDeleted: false,
        activeJobsProtected: true,
        deadLetterJobsProtected: true,
        rawResponseTextStored: false,
      },
    });
    if (inserted) markedQueueJobs += 1;
  }
  for (const runId of preview.orchestrationRuns.previewedRecordIds) {
    const inserted = await insertLifecycleEvent({
      eventType: "retention_cleanup_marked",
      targetType: "response_worker_orchestration_run",
      targetId: runId,
      source: preview.source ?? "operator",
      actorUserId,
      dryRun: false,
      details: {
        cleanupAction: "retention_mark_only",
        retentionOlderThanDays: preview.olderThanDays,
        destructiveDeleteUsed: false,
        orchestrationEventsDeleted: false,
        runningRunsProtected: true,
        staleLocksProtected: true,
        rawResponseTextStored: false,
      },
    });
    if (inserted) markedOrchestrationRuns += 1;
  }
  await insertLifecycleEvent({
    eventType: "retention_cleanup_marked",
    targetType: "summary",
    source: preview.source ?? "operator",
    actorUserId,
    dryRun: false,
    details: {
      cleanupAction: "retention_mark_only",
      markedQueueJobs,
      markedOrchestrationRuns,
      eligibleQueueJobs: preview.queueJobs.eligibleRecords,
      eligibleOrchestrationRuns: preview.orchestrationRuns.eligibleRecords,
      destructiveDeleteUsed: false,
      rawResponseTextStored: false,
      canonicalFactsMutated: false,
      violationTruthMutated: false,
      packetReadinessMutated: false,
    },
  });

  return {
    generatedAt: new Date().toISOString(),
    lifecycleVersion: RESPONSE_PROCESSING_LIFECYCLE_VERSION,
    dryRun: false,
    actorUserId,
    markedQueueJobs,
    markedOrchestrationRuns,
    summaryEventWritten: true,
    preview,
    boundaries: {
      ...retentionBoundaries(),
      destructiveDeleteUsed: false,
      payloadsMutated: false,
      jobEventsDeleted: false,
      orchestrationEventsDeleted: false,
    },
  };
}

function normalizeDriftThresholds(thresholds?: ResponseProcessingDriftThresholds | null): Required<ResponseProcessingDriftThresholds> {
  return {
    queueGrowthDelta: normalizePositiveInteger(thresholds?.queueGrowthDelta, "queueGrowthDelta", DEFAULT_DRIFT_THRESHOLDS.queueGrowthDelta, 100_000),
    deadLetterGrowthDelta: normalizePositiveInteger(thresholds?.deadLetterGrowthDelta, "deadLetterGrowthDelta", DEFAULT_DRIFT_THRESHOLDS.deadLetterGrowthDelta, 100_000),
    retryBacklogJobs: normalizePositiveInteger(thresholds?.retryBacklogJobs, "retryBacklogJobs", DEFAULT_DRIFT_THRESHOLDS.retryBacklogJobs, 100_000),
    staleRunningJobs: normalizePositiveInteger(thresholds?.staleRunningJobs, "staleRunningJobs", DEFAULT_DRIFT_THRESHOLDS.staleRunningJobs, 100_000),
    replayNonReplayableRecords: normalizePositiveInteger(thresholds?.replayNonReplayableRecords, "replayNonReplayableRecords", DEFAULT_DRIFT_THRESHOLDS.replayNonReplayableRecords, 1_000_000),
    orchestrationOverlapSkips: normalizePositiveInteger(thresholds?.orchestrationOverlapSkips, "orchestrationOverlapSkips", DEFAULT_DRIFT_THRESHOLDS.orchestrationOverlapSkips, 100_000),
    repeatedWorkerFailures: normalizePositiveInteger(thresholds?.repeatedWorkerFailures, "repeatedWorkerFailures", DEFAULT_DRIFT_THRESHOLDS.repeatedWorkerFailures, 100_000),
    orphanedReplacementChains: normalizePositiveInteger(thresholds?.orphanedReplacementChains, "orphanedReplacementChains", DEFAULT_DRIFT_THRESHOLDS.orphanedReplacementChains, 100_000),
    orphanedRemediationReferences: normalizePositiveInteger(thresholds?.orphanedRemediationReferences, "orphanedRemediationReferences", DEFAULT_DRIFT_THRESHOLDS.orphanedRemediationReferences, 100_000),
    oldestQueuedAgeSeconds: normalizePositiveInteger(thresholds?.oldestQueuedAgeSeconds, "oldestQueuedAgeSeconds", DEFAULT_DRIFT_THRESHOLDS.oldestQueuedAgeSeconds, 31_536_000),
    oldestDeadLetterAgeSeconds: normalizePositiveInteger(thresholds?.oldestDeadLetterAgeSeconds, "oldestDeadLetterAgeSeconds", DEFAULT_DRIFT_THRESHOLDS.oldestDeadLetterAgeSeconds, 31_536_000),
  };
}

function driftCheck(params: Omit<ResponseProcessingDriftCheck, "active">): ResponseProcessingDriftCheck {
  return {
    ...params,
    active: params.count >= params.threshold,
  };
}

export async function getResponseProcessingDriftReport(input: {
  source?: string | null;
  lookbackHours?: number | null;
  thresholds?: ResponseProcessingDriftThresholds | null;
} = {}): Promise<ResponseProcessingDriftReport> {
  await ensureResponseDocumentSchema();
  const source = sanitizeToken(input.source ?? null, "source");
  const lookbackHours = normalizePositiveInteger(input.lookbackHours, "lookbackHours", 24, 720);
  const thresholds = normalizeDriftThresholds(input.thresholds);
  const [queueResult, orchestrationResult, orphanResult, replayReadiness] = await Promise.all([
    sql<Row>`
      with scoped as (
        select *
        from public.response_processing_job job
        where (${source}::text is null or job.source = ${source})
      )
      select
        coalesce(sum(case when status = 'queued' and created_at >= now() - make_interval(hours => ${lookbackHours}) then 1 else 0 end), 0)::int as current_queued_created,
        coalesce(sum(case when status = 'queued' and created_at < now() - make_interval(hours => ${lookbackHours}) and created_at >= now() - make_interval(hours => ${lookbackHours * 2}) then 1 else 0 end), 0)::int as previous_queued_created,
        coalesce(sum(case when status = 'dead_lettered' and updated_at >= now() - make_interval(hours => ${lookbackHours}) then 1 else 0 end), 0)::int as current_dead_lettered,
        coalesce(sum(case when status = 'dead_lettered' and updated_at < now() - make_interval(hours => ${lookbackHours}) and updated_at >= now() - make_interval(hours => ${lookbackHours * 2}) then 1 else 0 end), 0)::int as previous_dead_lettered,
        coalesce(sum(case when status = 'failed' and run_after <= now() and attempt_count < max_attempts then 1 else 0 end), 0)::int as retry_backlog_jobs,
        coalesce(sum(case when status = 'running' and locked_until is not null and locked_until < now() then 1 else 0 end), 0)::int as stale_running_jobs,
        extract(epoch from (now() - min(case when status = 'queued' then created_at else null end)))::int as oldest_queued_age_seconds,
        extract(epoch from (now() - min(case when status = 'dead_lettered' then coalesce(finished_at, updated_at, created_at) else null end)))::int as oldest_dead_letter_age_seconds
      from scoped
    `.execute(db),
    sql<Row>`
      select
        coalesce(sum(case when event.event_type in ('skipped_overlap', 'skipped_stale_lock') and event.created_at >= now() - make_interval(hours => ${lookbackHours}) then 1 else 0 end), 0)::int as overlap_skips,
        coalesce(sum(case when run.status = 'failed' and run.created_at >= now() - make_interval(hours => ${lookbackHours}) then 1 else 0 end), 0)::int as repeated_worker_failures
      from public.response_worker_orchestration_run run
      left join public.response_worker_orchestration_event event on event.run_id = run.id
      where (${source}::text is null or run.source = ${source})
    `.execute(db),
    sql<Row>`
      with replacement_events as (
        select
          event.job_id,
          original.source as original_source,
          (normalized.details ->> 'replacementJobId')::bigint as replacement_job_id
        from public.response_processing_job_event event
        join public.response_processing_job original on original.id = event.job_id
        cross join lateral (
          select case
            when jsonb_typeof(event.details) = 'string' then (event.details #>> '{}')::jsonb
            else event.details
          end as details
        ) normalized
        where event.event_type = 'replacement_enqueued'
          and normalized.details ->> 'replacementJobId' ~ '^[0-9]+$'
          and (${source}::text is null or original.source = ${source})
      ),
      orphaned_chains as (
        select count(*)::int as count
        from replacement_events replacement
        where not exists (
          select 1
          from public.response_processing_job job
          where job.id = replacement.replacement_job_id
        )
      ),
      orphaned_remediation as (
        select count(*)::int as count
        from public.response_processing_job job
        where job.source = 'operator_remediation'
          and (${source}::text is null or exists (
            select 1
            from replacement_events replacement
            where replacement.replacement_job_id = job.id
          ))
          and not exists (
            select 1
            from replacement_events replacement
            where replacement.replacement_job_id = job.id
          )
      )
      select
        (select count from orphaned_chains) as orphaned_replacement_chains,
        (select count from orphaned_remediation) as orphaned_remediation_references
    `.execute(db),
    getResponseReplayReadinessMetrics(),
  ]);

  const queueRow = queueResult.rows[0] ?? {};
  const orchestrationRow = orchestrationResult.rows[0] ?? {};
  const orphanRow = orphanResult.rows[0] ?? {};
  const currentQueued = toNumber(rowValue(queueRow, "current_queued_created"));
  const previousQueued = toNumber(rowValue(queueRow, "previous_queued_created"));
  const currentDeadLetters = toNumber(rowValue(queueRow, "current_dead_lettered"));
  const previousDeadLetters = toNumber(rowValue(queueRow, "previous_dead_lettered"));
  const oldestQueuedAge = toNumber(rowValue(queueRow, "oldest_queued_age_seconds"));
  const oldestDeadLetterAge = toNumber(rowValue(queueRow, "oldest_dead_letter_age_seconds"));
  const checks = [
    driftCheck({
      key: "queue_growth_trend",
      severity: "warning",
      count: Math.max(0, currentQueued - previousQueued),
      threshold: thresholds.queueGrowthDelta,
      message: "Queued response-processing jobs grew beyond the deterministic review threshold.",
      remediationTarget: "queue_remediation",
    }),
    driftCheck({
      key: "dead_letter_growth_trend",
      severity: "critical",
      count: Math.max(0, currentDeadLetters - previousDeadLetters),
      threshold: thresholds.deadLetterGrowthDelta,
      message: "Dead-lettered response-processing jobs increased and require operator review.",
      remediationTarget: "queue_remediation",
    }),
    driftCheck({
      key: "retry_backlog_growth",
      severity: "warning",
      count: toNumber(rowValue(queueRow, "retry_backlog_jobs")),
      threshold: thresholds.retryBacklogJobs,
      message: "Retryable failed response-processing jobs crossed the backlog threshold.",
      remediationTarget: "queue_remediation",
    }),
    driftCheck({
      key: "stale_running_accumulation",
      severity: "critical",
      count: toNumber(rowValue(queueRow, "stale_running_jobs")),
      threshold: thresholds.staleRunningJobs,
      message: "Stale running response-processing jobs require operator review without auto-reclaim.",
      remediationTarget: "queue_remediation",
    }),
    driftCheck({
      key: "replay_non_replayable_growth",
      severity: "warning",
      count: replayReadiness.nonReplayableRecords,
      threshold: thresholds.replayNonReplayableRecords,
      message: "Non-replayable response records crossed the historical backfill review threshold.",
      remediationTarget: "replay",
    }),
    driftCheck({
      key: "orchestration_overlap_frequency",
      severity: "warning",
      count: toNumber(rowValue(orchestrationRow, "overlap_skips")),
      threshold: thresholds.orchestrationOverlapSkips,
      message: "Worker orchestration overlap/stale-lock skips crossed the review threshold.",
      remediationTarget: "worker_orchestration",
    }),
    driftCheck({
      key: "repeated_worker_failures",
      severity: "critical",
      count: toNumber(rowValue(orchestrationRow, "repeated_worker_failures")),
      threshold: thresholds.repeatedWorkerFailures,
      message: "Worker orchestration failed repeatedly in the drift window.",
      remediationTarget: "worker_orchestration",
    }),
    driftCheck({
      key: "orphaned_replacement_chains",
      severity: "critical",
      count: toNumber(rowValue(orphanRow, "orphaned_replacement_chains")),
      threshold: thresholds.orphanedReplacementChains,
      message: "Queue remediation replacement events reference missing replacement jobs.",
      remediationTarget: "queue_remediation",
    }),
    driftCheck({
      key: "orphaned_remediation_references",
      severity: "warning",
      count: toNumber(rowValue(orphanRow, "orphaned_remediation_references")),
      threshold: thresholds.orphanedRemediationReferences,
      message: "Operator-remediation jobs exist without an append-only replacement linkage.",
      remediationTarget: "queue_remediation",
    }),
    driftCheck({
      key: "old_queued_jobs",
      severity: "warning",
      count: oldestQueuedAge,
      threshold: thresholds.oldestQueuedAgeSeconds,
      message: "Oldest queued response-processing job exceeded the age threshold.",
      remediationTarget: "queue_remediation",
    }),
    driftCheck({
      key: "old_dead_letter_jobs",
      severity: "warning",
      count: oldestDeadLetterAge,
      threshold: thresholds.oldestDeadLetterAgeSeconds,
      message: "Oldest dead-lettered response-processing job exceeded the age threshold.",
      remediationTarget: "queue_remediation",
    }),
  ];

  const activeChecks = checks.filter((check) => check.active);
  return {
    generatedAt: new Date().toISOString(),
    lifecycleVersion: RESPONSE_PROCESSING_LIFECYCLE_VERSION,
    source,
    lookbackHours,
    checks,
    activeChecks: activeChecks.length,
    criticalChecks: activeChecks.filter((check) => check.severity === "critical").length,
    thresholds,
    trendWindow: {
      currentQueuedJobsCreated: currentQueued,
      previousQueuedJobsCreated: previousQueued,
      currentDeadLetteredJobs: currentDeadLetters,
      previousDeadLetteredJobs: previousDeadLetters,
    },
    boundaries: {
      operatorVisibleOnly: true,
      noExternalAlerts: true,
      noAutoRemediation: true,
      noRawResponseText: true,
      liveMailboxIntegrationUsed: false,
    },
  };
}

export async function recordResponseProcessingDriftReport(
  report: ResponseProcessingDriftReport,
  actorUserId?: number | null,
): Promise<void> {
  await ensureResponseDocumentSchema();
  await insertLifecycleEvent({
    eventType: "drift_reported",
    targetType: "summary",
    source: report.source ?? "operator",
    actorUserId: actorUserId ?? null,
    dryRun: false,
    details: {
      activeChecks: report.activeChecks,
      criticalChecks: report.criticalChecks,
      checkKeys: report.checks.filter((check) => check.active).map((check) => check.key),
      operatorVisibleOnly: true,
      noExternalAlerts: true,
      noAutoRemediation: true,
      rawResponseTextStored: false,
    },
  });
}

export async function recordResponseProcessingSoakCheckResult(details: Record<string, Json>): Promise<void> {
  await ensureResponseDocumentSchema();
  await insertLifecycleEvent({
    eventType: "soak_check_completed",
    targetType: "summary",
    source: "response_soak_check",
    dryRun: false,
    details: {
      ...safeDetailsRecord(details),
      rawResponseTextStored: false,
      liveMailboxIntegrationUsed: false,
      externalAlertDeliveryUsed: false,
    },
  });
}

export async function getResponseProcessingLifecycleMetrics(): Promise<ResponseProcessingLifecycleMetrics> {
  await ensureResponseDocumentSchema();
  const [retentionPreview, driftReport, eventResult] = await Promise.all([
    getResponseProcessingRetentionPreview(),
    getResponseProcessingDriftReport(),
    sql<Row>`
      select
        max(case when event_type = 'retention_cleanup_marked' then created_at else null end) as last_cleanup_at,
        max(case when event_type = 'drift_reported' then created_at else null end) as last_drift_report_at,
        max(case when event_type = 'soak_check_completed' then created_at else null end) as last_soak_check_at,
        count(case when event_type = 'retention_cleanup_marked' and target_type in ('response_processing_job', 'response_worker_orchestration_run') then 1 else null end)::int as cleanup_marked_records
      from public.response_processing_lifecycle_event
    `.execute(db),
  ]);
  const soakResult = await sql<Row>`
    select details
    from public.response_processing_lifecycle_event
    where event_type = 'soak_check_completed'
    order by created_at desc, id desc
    limit 1
  `.execute(db);
  const eventRow = eventResult.rows[0] ?? {};
  const soakDetails = safeDetailsRecord(soakResult.rows[0]?.details ?? {});
  const lastSoakStatus = typeof soakDetails.status === "string" ? soakDetails.status : null;
  return {
    generatedAt: new Date().toISOString(),
    lifecycleVersion: RESPONSE_PROCESSING_LIFECYCLE_VERSION,
    retentionPreview,
    driftReport,
    cleanupEligibleRecords: retentionPreview.queueJobs.eligibleRecords + retentionPreview.orchestrationRuns.eligibleRecords,
    cleanupMarkedRecords: toNumber(rowValue(eventRow, "cleanup_marked_records")),
    activeDriftAlerts: driftReport.activeChecks,
    criticalDriftAlerts: driftReport.criticalChecks,
    lastCleanupAt: toIso(rowValue(eventRow, "last_cleanup_at")),
    lastDriftReportAt: toIso(rowValue(eventRow, "last_drift_report_at")),
    lastSoakCheckAt: toIso(rowValue(eventRow, "last_soak_check_at")),
    lastSoakCheckStatus: lastSoakStatus,
    boundaries: {
      appendOnlyLifecycleEvents: true,
      destructiveDeleteUsed: false,
      noRawResponseText: true,
      externalAlertDeliveryUsed: false,
      liveMailboxIntegrationUsed: false,
    },
  };
}
