import { createHash } from "node:crypto";
import { sql } from "kysely";

import { logAudit, type AuditLogResult } from "./auditLogger";
import { db, dbPoolConfig } from "./db";
import { getIngestProcessingQueueMetrics } from "./ingestProcessingQueueService";
import type { Json } from "./schema";

export type ThresholdStatus = "OK" | "Warning" | "Critical";

export const PACKET_PDF_CACHE_HIT_EVENT = "PACKET_PDF_CACHE_HIT";
export const PACKET_PDF_RENDER_ATTEMPT_EVENT = "PACKET_PDF_RENDER_ATTEMPT";
export const PACKET_PDF_RENDER_SUCCEEDED_EVENT = "PACKET_PDF_RENDER_SUCCEEDED";
export const PACKET_PDF_RENDER_FAILED_EVENT = "PACKET_PDF_RENDER_FAILED";

export const PRODUCTION_OBSERVABILITY_THRESHOLDS = {
  ingestQueuedJobs: { warning: 25, critical: 100 },
  ingestFailedJobs: { warning: 3, critical: 10 },
  ingestDeadLetteredJobs: { warning: 1, critical: 1 },
  ingestStaleRunningJobs: { warning: 1, critical: 1 },
  ingestOldestQueuedAgeSeconds: { warning: 3600, critical: 14400 },
  ocrFailures: { warning: 1, critical: 3 },
  parserFailures: { warning: 1, critical: 3 },
  parserUncertainty: { warning: 5, critical: 20 },
  packetPdfFailures: { warning: 1, critical: 3 },
  storageFailures: { warning: 1, critical: 3 },
  authFailures: { warning: 10, critical: 25 },
  rateLimitActiveEntries: { warning: 50, critical: 200 },
  rateLimitMaxCount: { warning: 100, critical: 500 },
  dbLatencyMs: { warning: 250, critical: 1000 },
  dbActiveConnections: { warning: 20, critical: 50 },
} as const;

export type ProductionObservabilityThreshold = {
  key: string;
  label: string;
  status: ThresholdStatus;
  value: number;
  warning: number;
  critical: number;
};

export type ProductionObservabilityMetrics = {
  generatedAt: string;
  lookbackHours: number;
  ingest: {
    available: boolean;
    queuedJobs: number;
    runningJobs: number;
    succeededJobs: number;
    failedJobs: number;
    deadLetteredJobs: number;
    staleRunningJobs: number;
    retryBacklogJobs: number;
    oldestQueuedAgeSeconds: number | null;
    ocrParsingStartedEvents: number;
    complianceScanStartedEvents: number;
    averageOcrParsingDurationMs: number | null;
    totalOcrPageCount: number;
  };
  ocrParser: {
    artifactsObserved: number;
    ocrSucceededArtifacts: number;
    ocrFailureCount: number;
    parserFailureCount: number;
    parserUncertaintyCount: number;
    parserIssueCount: number;
  };
  packetPdf: {
    renderAttemptEvents: number;
    renderSucceededEvents: number;
    renderFailedEvents: number;
    cacheHitEvents: number;
  };
  storage: {
    failureEvents: number;
    readFailures: number;
    writeFailures: number;
    deleteFailures: number;
    latestFailureAt: string | null;
  };
  auth: {
    loginSuccessEvents: number;
    loginFailureEvents: number;
    loginAttemptFailures: number;
  };
  db: {
    poolMax: number;
    idleTimeoutSeconds: number;
    latencyMs: number | null;
    activeConnections: number | null;
  };
  rateLimit: {
    activeEntries: number;
    maxObservedCount: number;
  };
  thresholds: ProductionObservabilityThreshold[];
  boundaries: {
    noRawPdfBytes: true;
    noRawExtractedText: true;
    noFullConsumerPii: true;
    noSecretsTokensOrCookies: true;
    aggregateCountsOnly: true;
    storageObjectNamesHashed: true;
    businessLogicMutated: false;
    parserOutputMutated: false;
    violationTruthMutated: false;
    packetReadinessMutated: false;
    responseQueueSemanticsMutated: false;
  };
};

type Row = Record<string, unknown>;

const FORBIDDEN_METRIC_VALUE_PATTERN =
  /(%PDF|JVBERi0|data:application\/pdf;base64|raw report text|raw pdf text|full credit report|full report text|storage\.googleapis\.com|x-goog-signature|x-amz-signature|signedurl|signed_url|postgres:\/\/|mysql:\/\/|mongodb:\/\/|database_url|bearer\s+[a-z0-9._-]+|basic\s+[a-z0-9+/=._-]+|sk-[a-z0-9_-]{10,}|ghp_[a-z0-9_]{10,}|github_pat_[a-z0-9_]+|xox[baprs]-[a-z0-9-]+|akia[0-9a-z]{16}|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private key|password\s*[:=]|secret\s*[:=]|session=|cookie=)/i;
const FORBIDDEN_METRIC_KEY_PATTERN =
  /(raw|bytes|base64|pdf|text|body|content|storageurl|signedurl|password|token|secret|authorization|cookie|session|api.?key|private.?key|database.?url|connection.?string|sin|ssn|account.?number|email)/i;
const ALLOWED_BOUNDARY_KEYS = new Set([
  "rawpdfbyteslogged",
  "rawextractedtextlogged",
  "fullconsumerpiilogged",
  "secretstokensorcookieslogged",
]);

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function rowValue(row: Row | undefined, snakeCaseKey: string): unknown {
  if (!row) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, snakeCaseKey)) return row[snakeCaseKey];
  const camelCaseKey = snakeCaseKey.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
  return row[camelCaseKey];
}

export function thresholdStatus(value: number, warning: number, critical: number): ThresholdStatus {
  if (critical <= warning) return value >= critical ? "Critical" : "OK";
  if (value >= critical) return "Critical";
  if (value >= warning) return "Warning";
  return "OK";
}

function threshold(
  key: string,
  label: string,
  value: number,
  limits: { warning: number; critical: number },
): ProductionObservabilityThreshold {
  return {
    key,
    label,
    value,
    warning: limits.warning,
    critical: limits.critical,
    status: thresholdStatus(value, limits.warning, limits.critical),
  };
}

export function buildProductionObservabilityThresholds(
  metrics: Omit<ProductionObservabilityMetrics, "thresholds">,
): ProductionObservabilityThreshold[] {
  const t = PRODUCTION_OBSERVABILITY_THRESHOLDS;
  return [
    threshold("ingest_queued_jobs", "Ingest queued jobs", metrics.ingest.queuedJobs, t.ingestQueuedJobs),
    threshold("ingest_failed_jobs", "Ingest failed jobs", metrics.ingest.failedJobs, t.ingestFailedJobs),
    threshold("ingest_dead_letters", "Ingest dead letters", metrics.ingest.deadLetteredJobs, t.ingestDeadLetteredJobs),
    threshold("ingest_stale_running", "Ingest stale running jobs", metrics.ingest.staleRunningJobs, t.ingestStaleRunningJobs),
    threshold(
      "ingest_oldest_queued_age",
      "Oldest queued ingest age seconds",
      metrics.ingest.oldestQueuedAgeSeconds ?? 0,
      t.ingestOldestQueuedAgeSeconds,
    ),
    threshold("ocr_failures", "OCR failures", metrics.ocrParser.ocrFailureCount, t.ocrFailures),
    threshold("parser_failures", "Parser failures", metrics.ocrParser.parserFailureCount, t.parserFailures),
    threshold("parser_uncertainty", "Parser uncertainty/manual review", metrics.ocrParser.parserUncertaintyCount, t.parserUncertainty),
    threshold("packet_pdf_failures", "Packet PDF failures", metrics.packetPdf.renderFailedEvents, t.packetPdfFailures),
    threshold("storage_failures", "Storage failures", metrics.storage.failureEvents, t.storageFailures),
    threshold("auth_failures", "Auth failures", metrics.auth.loginFailureEvents + metrics.auth.loginAttemptFailures, t.authFailures),
    threshold("rate_limit_active_entries", "Rate-limit active entries", metrics.rateLimit.activeEntries, t.rateLimitActiveEntries),
    threshold("rate_limit_max_count", "Rate-limit max observed count", metrics.rateLimit.maxObservedCount, t.rateLimitMaxCount),
    threshold("db_latency_ms", "DB latency proxy ms", metrics.db.latencyMs ?? 0, t.dbLatencyMs),
    threshold(
      "db_active_connections",
      "DB active connections",
      metrics.db.activeConnections ?? 0,
      t.dbActiveConnections,
    ),
  ];
}

function objectHash(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  return createHash("sha256").update(normalized).digest("hex").slice(0, 24);
}

function safeToken(value: string | null | undefined, fallback: string): string {
  const normalized = String(value ?? fallback).trim().toLowerCase().replace(/[^a-z0-9_.:-]+/g, "_").slice(0, 80);
  return normalized || fallback;
}

function storageFailureCategory(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  const combined = `${code} ${message}`.toLowerCase();
  if (/enoent|not found/.test(combined)) return "not_found";
  if (/eacces|eperm|permission/.test(combined)) return "permission_denied";
  if (/invalid.*path|path traversal/.test(combined)) return "invalid_path";
  if (/timeout|etimedout|econn|network|unavailable/.test(combined)) return "io_unavailable";
  return "io_error";
}

function sanitizeMetricDetails(value: Record<string, Json>): Record<string, Json> {
  const output: Record<string, Json> = {};
  for (const [key, item] of Object.entries(value)) {
    const safeKey = safeToken(key, "metric_key");
    if (!ALLOWED_BOUNDARY_KEYS.has(safeKey) && FORBIDDEN_METRIC_KEY_PATTERN.test(safeKey)) {
      output.redactedKey = "[redacted]";
      continue;
    }
    if (typeof item === "string" && FORBIDDEN_METRIC_VALUE_PATTERN.test(item)) {
      output[safeKey] = "[redacted]";
      continue;
    }
    output[safeKey] = item;
  }
  return output;
}

export async function recordStorageFailureMetric(input: {
  operation: "read" | "write" | "delete";
  provider: string;
  storageArea: string;
  objectName?: string | null;
  storageUrl?: string | null;
  error: unknown;
}): Promise<AuditLogResult> {
  const category = storageFailureCategory(input.error);
  const code = typeof input.error === "object" && input.error !== null && "code" in input.error
    ? safeToken(String((input.error as { code?: unknown }).code ?? ""), "unknown")
    : "unknown";
  const details = sanitizeMetricDetails({
    metric: "storage_failure",
    operation: input.operation,
    provider: safeToken(input.provider, "unknown_provider"),
    storageArea: safeToken(input.storageArea, "unknown_storage_area"),
    objectReferenceHash: objectHash(input.objectName ?? input.storageUrl),
    failureCategory: category,
    errorCode: code,
    rawPdfBytesLogged: false,
    rawExtractedTextLogged: false,
    fullConsumerPiiLogged: false,
    secretsTokensOrCookiesLogged: false,
  });

  return logAudit({
    action: "SYSTEM_CHANGE",
    entityType: "SYSTEM",
    status: "FAILURE",
    details,
    errorMessage: `storage_${input.operation}_failed:${category}`,
  });
}

async function loadIngestMetrics(): Promise<ProductionObservabilityMetrics["ingest"]> {
  const queueMetrics = await getIngestProcessingQueueMetrics({ ensureSchema: false });
  const row = (await sql<Row>`
    select
      count(*) filter (where event_type = 'ocr_parsing_started')::int as ocr_parsing_started_events,
      count(*) filter (where event_type = 'compliance_scan_started')::int as compliance_scan_started_events,
      avg(
        case
          when job.result_summary ->> 'ocrParsingDurationMs' ~ '^[0-9]+$'
          then (job.result_summary ->> 'ocrParsingDurationMs')::numeric
          else null
        end
      )::int as average_ocr_parsing_duration_ms,
      coalesce(sum(
        case
          when job.result_summary ->> 'ocrPageCount' ~ '^[0-9]+$'
          then (job.result_summary ->> 'ocrPageCount')::int
          else 0
        end
      ), 0)::int as total_ocr_page_count
    from public.ingest_processing_job_event event
    left join public.ingest_processing_job job on job.id = event.job_id
  `.execute(db)).rows[0] ?? {};

  return {
    available: true,
    queuedJobs: queueMetrics.queuedJobs,
    runningJobs: queueMetrics.runningJobs,
    succeededJobs: queueMetrics.succeededJobs,
    failedJobs: queueMetrics.failedJobs,
    deadLetteredJobs: queueMetrics.deadLetteredJobs,
    staleRunningJobs: queueMetrics.staleRunningJobs,
    retryBacklogJobs: queueMetrics.retryBacklogJobs,
    oldestQueuedAgeSeconds: queueMetrics.oldestQueuedAgeSeconds,
    ocrParsingStartedEvents: toNumber(rowValue(row, "ocr_parsing_started_events")),
    complianceScanStartedEvents: toNumber(rowValue(row, "compliance_scan_started_events")),
    averageOcrParsingDurationMs: toNullableNumber(rowValue(row, "average_ocr_parsing_duration_ms")),
    totalOcrPageCount: toNumber(rowValue(row, "total_ocr_page_count")),
  };
}

async function loadOcrParserMetrics(lookbackHours: number): Promise<ProductionObservabilityMetrics["ocrParser"]> {
  const row = (await sql<Row>`
    select
      count(*)::int as artifacts_observed,
      count(*) filter (where data ->> 'extractionSource' = 'ocr_text')::int as ocr_succeeded_artifacts,
      count(*) filter (
        where processing_status = 'failed'
          or data ->> 'extractionStatus' = 'failed'
          or data #>> '{ocrDiagnostics,reason}' is not null
          or data #>> '{deterministicPipeline,ocrDiagnostics,reason}' is not null
      )::int as ocr_failure_count,
      count(*) filter (
        where processing_status = 'failed'
          or data ->> 'extractionStatus' = 'failed'
      )::int as parser_failure_count,
      count(*) filter (
        where lower(coalesce(data #>> '{parserQuality,requiresManualReview}', 'false')) = 'true'
      )::int as parser_uncertainty_count,
      coalesce(sum(
        case
          when jsonb_typeof(data -> 'parserQuality' -> 'issues') = 'array'
          then jsonb_array_length(data -> 'parserQuality' -> 'issues')
          else 0
        end
      ), 0)::int as parser_issue_count
    from public.report_artifact
    where created_at >= now() - make_interval(hours => ${lookbackHours})
  `.execute(db)).rows[0] ?? {};

  return {
    artifactsObserved: toNumber(rowValue(row, "artifacts_observed")),
    ocrSucceededArtifacts: toNumber(rowValue(row, "ocr_succeeded_artifacts")),
    ocrFailureCount: toNumber(rowValue(row, "ocr_failure_count")),
    parserFailureCount: toNumber(rowValue(row, "parser_failure_count")),
    parserUncertaintyCount: toNumber(rowValue(row, "parser_uncertainty_count")),
    parserIssueCount: toNumber(rowValue(row, "parser_issue_count")),
  };
}

async function loadPacketPdfMetrics(lookbackHours: number): Promise<ProductionObservabilityMetrics["packetPdf"]> {
  const row = (await sql<Row>`
    select
      count(*) filter (where event_type = ${PACKET_PDF_RENDER_ATTEMPT_EVENT})::int as render_attempt_events,
      count(*) filter (where event_type = ${PACKET_PDF_RENDER_SUCCEEDED_EVENT})::int as render_succeeded_events,
      count(*) filter (where event_type = ${PACKET_PDF_RENDER_FAILED_EVENT})::int as render_failed_events,
      count(*) filter (where event_type = ${PACKET_PDF_CACHE_HIT_EVENT})::int as cache_hit_events
    from public.evidence_event
    where at >= now() - make_interval(hours => ${lookbackHours})
  `.execute(db)).rows[0] ?? {};

  return {
    renderAttemptEvents: toNumber(rowValue(row, "render_attempt_events")),
    renderSucceededEvents: toNumber(rowValue(row, "render_succeeded_events")),
    renderFailedEvents: toNumber(rowValue(row, "render_failed_events")),
    cacheHitEvents: toNumber(rowValue(row, "cache_hit_events")),
  };
}

async function loadStorageMetrics(lookbackHours: number): Promise<ProductionObservabilityMetrics["storage"]> {
  const row = (await sql<Row>`
    select
      count(*)::int as failure_events,
      count(*) filter (where details ->> 'operation' = 'read')::int as read_failures,
      count(*) filter (where details ->> 'operation' = 'write')::int as write_failures,
      count(*) filter (where details ->> 'operation' = 'delete')::int as delete_failures,
      max(timestamp) as latest_failure_at
    from public.audit_log
    where action_type = 'SYSTEM_CHANGE'
      and entity_type = 'SYSTEM'
      and status = 'FAILURE'
      and details ->> 'metric' = 'storage_failure'
      and timestamp >= now() - make_interval(hours => ${lookbackHours})
  `.execute(db)).rows[0] ?? {};

  return {
    failureEvents: toNumber(rowValue(row, "failure_events")),
    readFailures: toNumber(rowValue(row, "read_failures")),
    writeFailures: toNumber(rowValue(row, "write_failures")),
    deleteFailures: toNumber(rowValue(row, "delete_failures")),
    latestFailureAt: toIso(rowValue(row, "latest_failure_at")),
  };
}

async function loadAuthMetrics(lookbackHours: number): Promise<ProductionObservabilityMetrics["auth"]> {
  const auditRow = (await sql<Row>`
    select
      count(*) filter (where action_type = 'LOGIN')::int as login_success_events,
      count(*) filter (where action_type = 'LOGIN_FAILED')::int as login_failure_events
    from public.audit_log
    where action_type in ('LOGIN', 'LOGIN_FAILED')
      and timestamp >= now() - make_interval(hours => ${lookbackHours})
  `.execute(db)).rows[0] ?? {};
  const attemptRow = (await sql<Row>`
    select count(*)::int as login_attempt_failures
    from public.login_attempts
    where success = false
      and attempted_at >= now() - make_interval(hours => ${lookbackHours})
  `.execute(db)).rows[0] ?? {};

  return {
    loginSuccessEvents: toNumber(rowValue(auditRow, "login_success_events")),
    loginFailureEvents: toNumber(rowValue(auditRow, "login_failure_events")),
    loginAttemptFailures: toNumber(rowValue(attemptRow, "login_attempt_failures")),
  };
}

async function loadDbMetrics(): Promise<ProductionObservabilityMetrics["db"]> {
  const startedAt = Date.now();
  let latencyMs: number | null = null;
  let activeConnections: number | null = null;

  try {
    await sql`select 1`.execute(db);
    latencyMs = Date.now() - startedAt;
  } catch {
    latencyMs = null;
  }

  try {
    const row = (await sql<Row>`
      select count(*)::int as active_connections
      from pg_stat_activity
      where datname = current_database()
    `.execute(db)).rows[0] ?? {};
    activeConnections = toNullableNumber(rowValue(row, "active_connections"));
  } catch {
    activeConnections = null;
  }

  return {
    poolMax: dbPoolConfig.max,
    idleTimeoutSeconds: dbPoolConfig.idleTimeoutSeconds,
    latencyMs,
    activeConnections,
  };
}

async function loadRateLimitMetrics(): Promise<ProductionObservabilityMetrics["rateLimit"]> {
  const row = (await sql<Row>`
    select
      count(*) filter (where reset_at >= now())::int as active_entries,
      coalesce(max(count), 0)::int as max_observed_count
    from public.rate_limit_entry
  `.execute(db)).rows[0] ?? {};

  return {
    activeEntries: toNumber(rowValue(row, "active_entries")),
    maxObservedCount: toNumber(rowValue(row, "max_observed_count")),
  };
}

export async function getProductionObservabilityMetrics(
  input: { lookbackHours?: number } = {},
): Promise<ProductionObservabilityMetrics> {
  const lookbackHours = Math.min(Math.max(Number(input.lookbackHours ?? 24), 1), 168);
  const [ingest, ocrParser, packetPdf, storage, auth, dbMetrics, rateLimit] = await Promise.all([
    loadIngestMetrics(),
    loadOcrParserMetrics(lookbackHours),
    loadPacketPdfMetrics(lookbackHours),
    loadStorageMetrics(lookbackHours),
    loadAuthMetrics(lookbackHours),
    loadDbMetrics(),
    loadRateLimitMetrics(),
  ]);

  const metricsWithoutThresholds = {
    generatedAt: new Date().toISOString(),
    lookbackHours,
    ingest,
    ocrParser,
    packetPdf,
    storage,
    auth,
    db: dbMetrics,
    rateLimit,
    boundaries: {
      noRawPdfBytes: true,
      noRawExtractedText: true,
      noFullConsumerPii: true,
      noSecretsTokensOrCookies: true,
      aggregateCountsOnly: true,
      storageObjectNamesHashed: true,
      businessLogicMutated: false,
      parserOutputMutated: false,
      violationTruthMutated: false,
      packetReadinessMutated: false,
      responseQueueSemanticsMutated: false,
    },
  } satisfies Omit<ProductionObservabilityMetrics, "thresholds">;

  return {
    ...metricsWithoutThresholds,
    thresholds: buildProductionObservabilityThresholds(metricsWithoutThresholds),
  };
}
