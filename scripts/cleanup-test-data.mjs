import "../loadEnv.js";

import postgres from "postgres";
import { fileURLToPath } from "node:url";

export const DEFAULT_RETENTION_DAYS = 5;
export const MIN_RETENTION_DAYS = 5;

export const TEST_MARKER_REGEX =
  "(^|[^a-z0-9])(test|demo|seed|fixture|mock|synthetic|smoke|parser[-_ ]lab|lifecycle[-_ ]test|beta[-_ ]test|development[-_ ]only|example[.]test|example[.]invalid|auth[.]workflow|ingest[-_ ]queue[-_ ]test|response[-_ ]auth[-_ ]smoke|response[-_ ]queue[-_ ]load|response[-_ ]soak|response[-_ ]worker[-_ ]orchestration|outcome[-_ ]smoke)([^a-z0-9]|$)";

const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const ENVIRONMENT_KEYS = ["CRP_ENV", "APP_ENV", "FLOOT_ENV", "DEPLOYMENT_ENV", "ENVIRONMENT", "VERCEL_ENV"];
const DATABASE_URL_KEYS = ["FLOOT_DATABASE_URL", "DATABASE_URL", "DATABASE_PRIVATE_URL", "POSTGRES_URL", "CRP_DATABASE_URL"];
const TERMINAL_INGEST_STATUSES = ["succeeded", "failed", "dead_lettered", "canceled"];
const TERMINAL_RESPONSE_STATUSES = ["succeeded", "failed", "dead_lettered"];
const TERMINAL_ORCHESTRATION_STATUSES = ["succeeded", "failed", "skipped"];

function fail(message) {
  throw new Error(message);
}

function parsePositiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    fail(`${flag} requires a positive integer.`);
  }
  return parsed;
}

function nextValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
  return value;
}

export function parseCleanupArgs(args) {
  const options = {
    dryRun: false,
    confirm: false,
    olderThanDays: DEFAULT_RETENTION_DAYS,
    dangerouslyAllowProduction: false,
    json: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      return { ...options, help: true };
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--confirm") {
      options.confirm = true;
      continue;
    }
    if (arg === "--older-than-days") {
      options.olderThanDays = parsePositiveInteger(nextValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--dangerously-allow-production") {
      options.dangerouslyAllowProduction = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    fail(`Unknown option: ${arg}`);
  }

  if (options.dryRun === options.confirm) {
    fail("Specify exactly one of --dry-run or --confirm.");
  }
  if (options.olderThanDays < MIN_RETENTION_DAYS) {
    fail(`--older-than-days must be ${MIN_RETENTION_DAYS} or greater.`);
  }

  return options;
}

export function hasTestMarker(value) {
  return new RegExp(TEST_MARKER_REGEX, "i").test(String(value ?? ""));
}

export function isOlderThanCutoff(record, cutoff, timestampFields = ["createdAt", "created_at", "updatedAt", "updated_at"]) {
  for (const field of timestampFields) {
    const raw = record?.[field];
    if (!raw) continue;
    const date = raw instanceof Date ? raw : new Date(String(raw));
    if (!Number.isNaN(date.getTime())) return date.getTime() < cutoff.getTime();
  }
  return false;
}

export function shouldCleanupMarkedRecord(record, cutoff) {
  return isOlderThanCutoff(record, cutoff) && hasTestMarker(record?.markerText ?? record?.source ?? record?.name ?? "");
}

export function resolveDatabaseUrl(env = process.env) {
  for (const key of DATABASE_URL_KEYS) {
    const value = String(env[key] ?? "").trim();
    if (!value) continue;
    try {
      new URL(value);
      return { key, value };
    } catch {
      fail(`${key} is set but is not a valid URL.`);
    }
  }
  fail("FLOOT_DATABASE_URL, DATABASE_URL, DATABASE_PRIVATE_URL, POSTGRES_URL, or CRP_DATABASE_URL is required.");
}

export function describeDatabaseTarget(databaseUrl) {
  const parsed = new URL(databaseUrl);
  return {
    host: parsed.hostname,
    port: parsed.port || "(default)",
    database: parsed.pathname.replace(/^\//, "") || "(none)",
  };
}

function normalizedEnvironmentValues(env) {
  return ENVIRONMENT_KEYS
    .map((key) => ({ key, value: String(env[key] ?? "").trim().toLowerCase() }))
    .filter((entry) => entry.value);
}

function signatureIncludesProduction(value) {
  const lowered = String(value ?? "").toLowerCase();
  if (lowered.includes("staging")) return false;
  return lowered.includes("creditregulatorpro-prod") || lowered.includes("production") || /(^|[^a-z])prod([^a-z]|$)/.test(lowered);
}

export function resolveCleanupEnvironment(env = process.env, databaseUrl = "") {
  const target = databaseUrl ? describeDatabaseTarget(databaseUrl) : null;
  const dbSignature = target ? `${target.host} ${target.database}`.toLowerCase() : "";
  const environmentValues = normalizedEnvironmentValues(env);

  if (signatureIncludesProduction(dbSignature)) {
    return { kind: "production", reason: "Database host or name appears production-like." };
  }

  for (const { key, value } of environmentValues) {
    if (value === "production" || value === "prod" || signatureIncludesProduction(value)) {
      return { kind: "production", reason: `${key} indicates production.` };
    }
  }

  if (dbSignature.includes("staging") || environmentValues.some(({ value }) => value.includes("staging"))) {
    return { kind: "staging", reason: "Environment or database target indicates staging." };
  }

  if (target && LOCAL_DB_HOSTS.has(target.host.toLowerCase())) {
    return { kind: "local", reason: "Database host is local." };
  }

  if (environmentValues.some(({ value }) => ["local", "development", "dev", "test"].includes(value))) {
    return { kind: "local", reason: "Environment indicates local/development/test." };
  }

  return { kind: "unknown", reason: "Unable to determine local, staging, or production from environment and database target." };
}

export function assertCleanupSafety({ environment, dangerouslyAllowProduction }) {
  if (environment.kind === "production" && dangerouslyAllowProduction !== true) {
    fail(`Refusing to run test-data cleanup against production: ${environment.reason}`);
  }
  if (environment.kind === "unknown") {
    fail(`Refusing to run test-data cleanup because the environment is unknown: ${environment.reason}`);
  }
}

function cutoffFromDays(days, now = new Date()) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

async function tableExists(sql, tableName) {
  const rows = await sql`select to_regclass(${`public.${tableName}`})::text as name`;
  return Boolean(rows[0]?.name);
}

function rowCount(rows) {
  return Number(rows?.[0]?.count ?? 0);
}

async function countOrDeleteTarget(sql, target, cutoff, mode) {
  const exists = await tableExists(sql, target.table);
  if (!exists) {
    return { table: target.table, id: target.id, skipped: true, count: 0, criteria: target.criteria };
  }

  const rows = mode === "delete"
    ? await target.delete(sql, cutoff, TEST_MARKER_REGEX)
    : await target.count(sql, cutoff, TEST_MARKER_REGEX);
  return {
    table: target.table,
    id: target.id,
    skipped: false,
    count: rowCount(rows),
    criteria: target.criteria,
  };
}

const targets = [
  {
    id: "ingest_processing_job_event",
    table: "ingest_processing_job_event",
    criteria: "Event is older than cutoff, parent ingest job is terminal and older than cutoff, and parent/event fields contain an explicit test marker.",
    count: (sql, cutoff, marker) => sql`
      select count(*)::int as count
      from public.ingest_processing_job_event event
      join public.ingest_processing_job job on job.id = event.job_id
      where event.created_at < ${cutoff}
        and coalesce(job.finished_at, job.updated_at, job.created_at) < ${cutoff}
        and job.status in ${sql(TERMINAL_INGEST_STATUSES)}
        and (
          coalesce(job.source, '') ~* ${marker}
          or coalesce(job.idempotency_key, '') ~* ${marker}
          or coalesce(job.locked_by, '') ~* ${marker}
          or coalesce(job.last_error_reason, '') ~* ${marker}
          or coalesce(job.payload::text, '') ~* ${marker}
          or coalesce(job.result_summary::text, '') ~* ${marker}
          or coalesce(event.worker_id, '') ~* ${marker}
          or coalesce(event.error_reason, '') ~* ${marker}
          or coalesce(event.details::text, '') ~* ${marker}
        )
    `,
    delete: (sql, cutoff, marker) => sql`
      with deleted as (
        delete from public.ingest_processing_job_event event
        using public.ingest_processing_job job
        where event.job_id = job.id
          and event.created_at < ${cutoff}
          and coalesce(job.finished_at, job.updated_at, job.created_at) < ${cutoff}
          and job.status in ${sql(TERMINAL_INGEST_STATUSES)}
          and (
            coalesce(job.source, '') ~* ${marker}
            or coalesce(job.idempotency_key, '') ~* ${marker}
            or coalesce(job.locked_by, '') ~* ${marker}
            or coalesce(job.last_error_reason, '') ~* ${marker}
            or coalesce(job.payload::text, '') ~* ${marker}
            or coalesce(job.result_summary::text, '') ~* ${marker}
            or coalesce(event.worker_id, '') ~* ${marker}
            or coalesce(event.error_reason, '') ~* ${marker}
            or coalesce(event.details::text, '') ~* ${marker}
          )
        returning 1
      )
      select count(*)::int as count from deleted
    `,
  },
  {
    id: "ingest_processing_job",
    table: "ingest_processing_job",
    criteria: "Ingest job is terminal, older than cutoff, explicitly test-marked, and has no remaining child events.",
    count: (sql, cutoff, marker) => sql`
      select count(*)::int as count
      from public.ingest_processing_job job
      where coalesce(job.finished_at, job.updated_at, job.created_at) < ${cutoff}
        and job.status in ${sql(TERMINAL_INGEST_STATUSES)}
        and (
          coalesce(job.source, '') ~* ${marker}
          or coalesce(job.idempotency_key, '') ~* ${marker}
          or coalesce(job.locked_by, '') ~* ${marker}
          or coalesce(job.last_error_reason, '') ~* ${marker}
          or coalesce(job.payload::text, '') ~* ${marker}
          or coalesce(job.result_summary::text, '') ~* ${marker}
        )
        and not exists (
          select 1
          from public.ingest_processing_job_event event
          where event.job_id = job.id
            and not (
              event.created_at < ${cutoff}
              and (
                coalesce(job.source, '') ~* ${marker}
                or coalesce(job.idempotency_key, '') ~* ${marker}
                or coalesce(job.locked_by, '') ~* ${marker}
                or coalesce(job.last_error_reason, '') ~* ${marker}
                or coalesce(job.payload::text, '') ~* ${marker}
                or coalesce(job.result_summary::text, '') ~* ${marker}
                or coalesce(event.worker_id, '') ~* ${marker}
                or coalesce(event.error_reason, '') ~* ${marker}
                or coalesce(event.details::text, '') ~* ${marker}
              )
            )
        )
    `,
    delete: (sql, cutoff, marker) => sql`
      with deleted as (
        delete from public.ingest_processing_job job
        where coalesce(job.finished_at, job.updated_at, job.created_at) < ${cutoff}
          and job.status in ${sql(TERMINAL_INGEST_STATUSES)}
          and (
            coalesce(job.source, '') ~* ${marker}
            or coalesce(job.idempotency_key, '') ~* ${marker}
            or coalesce(job.locked_by, '') ~* ${marker}
            or coalesce(job.last_error_reason, '') ~* ${marker}
            or coalesce(job.payload::text, '') ~* ${marker}
            or coalesce(job.result_summary::text, '') ~* ${marker}
          )
          and not exists (
            select 1
            from public.ingest_processing_job_event event
            where event.job_id = job.id
          )
        returning 1
      )
      select count(*)::int as count from deleted
    `,
  },
  {
    id: "ingest_processing_worker_heartbeat",
    table: "ingest_processing_worker_heartbeat",
    criteria: "Heartbeat last_seen_at is older than cutoff and worker/source/details contain an explicit test marker.",
    count: (sql, cutoff, marker) => sql`
      select count(*)::int as count
      from public.ingest_processing_worker_heartbeat heartbeat
      where heartbeat.last_seen_at < ${cutoff}
        and (
          coalesce(heartbeat.worker_id, '') ~* ${marker}
          or coalesce(heartbeat.source, '') ~* ${marker}
          or coalesce(heartbeat.details::text, '') ~* ${marker}
        )
    `,
    delete: (sql, cutoff, marker) => sql`
      with deleted as (
        delete from public.ingest_processing_worker_heartbeat heartbeat
        where heartbeat.last_seen_at < ${cutoff}
          and (
            coalesce(heartbeat.worker_id, '') ~* ${marker}
            or coalesce(heartbeat.source, '') ~* ${marker}
            or coalesce(heartbeat.details::text, '') ~* ${marker}
          )
        returning 1
      )
      select count(*)::int as count from deleted
    `,
  },
  {
    id: "response_processing_job_event",
    table: "response_processing_job_event",
    criteria: "Event is older than cutoff, parent response job is terminal and older than cutoff, and parent/event fields contain an explicit test marker.",
    count: (sql, cutoff, marker) => sql`
      select count(*)::int as count
      from public.response_processing_job_event event
      join public.response_processing_job job on job.id = event.job_id
      where event.created_at < ${cutoff}
        and coalesce(job.finished_at, job.updated_at, job.created_at) < ${cutoff}
        and job.status in ${sql(TERMINAL_RESPONSE_STATUSES)}
        and (
          coalesce(job.source, '') ~* ${marker}
          or coalesce(job.idempotency_key, '') ~* ${marker}
          or coalesce(job.locked_by, '') ~* ${marker}
          or coalesce(job.last_error_reason, '') ~* ${marker}
          or coalesce(job.payload::text, '') ~* ${marker}
          or coalesce(job.result_summary::text, '') ~* ${marker}
          or coalesce(event.worker_id, '') ~* ${marker}
          or coalesce(event.error_reason, '') ~* ${marker}
          or coalesce(event.details::text, '') ~* ${marker}
        )
    `,
    delete: (sql, cutoff, marker) => sql`
      with deleted as (
        delete from public.response_processing_job_event event
        using public.response_processing_job job
        where event.job_id = job.id
          and event.created_at < ${cutoff}
          and coalesce(job.finished_at, job.updated_at, job.created_at) < ${cutoff}
          and job.status in ${sql(TERMINAL_RESPONSE_STATUSES)}
          and (
            coalesce(job.source, '') ~* ${marker}
            or coalesce(job.idempotency_key, '') ~* ${marker}
            or coalesce(job.locked_by, '') ~* ${marker}
            or coalesce(job.last_error_reason, '') ~* ${marker}
            or coalesce(job.payload::text, '') ~* ${marker}
            or coalesce(job.result_summary::text, '') ~* ${marker}
            or coalesce(event.worker_id, '') ~* ${marker}
            or coalesce(event.error_reason, '') ~* ${marker}
            or coalesce(event.details::text, '') ~* ${marker}
          )
        returning 1
      )
      select count(*)::int as count from deleted
    `,
  },
  {
    id: "response_processing_job",
    table: "response_processing_job",
    criteria: "Response job is terminal, older than cutoff, explicitly test-marked, and has no remaining child events.",
    count: (sql, cutoff, marker) => sql`
      select count(*)::int as count
      from public.response_processing_job job
      where coalesce(job.finished_at, job.updated_at, job.created_at) < ${cutoff}
        and job.status in ${sql(TERMINAL_RESPONSE_STATUSES)}
        and (
          coalesce(job.source, '') ~* ${marker}
          or coalesce(job.idempotency_key, '') ~* ${marker}
          or coalesce(job.locked_by, '') ~* ${marker}
          or coalesce(job.last_error_reason, '') ~* ${marker}
          or coalesce(job.payload::text, '') ~* ${marker}
          or coalesce(job.result_summary::text, '') ~* ${marker}
        )
        and not exists (
          select 1
          from public.response_processing_job_event event
          where event.job_id = job.id
            and not (
              event.created_at < ${cutoff}
              and (
                coalesce(job.source, '') ~* ${marker}
                or coalesce(job.idempotency_key, '') ~* ${marker}
                or coalesce(job.locked_by, '') ~* ${marker}
                or coalesce(job.last_error_reason, '') ~* ${marker}
                or coalesce(job.payload::text, '') ~* ${marker}
                or coalesce(job.result_summary::text, '') ~* ${marker}
                or coalesce(event.worker_id, '') ~* ${marker}
                or coalesce(event.error_reason, '') ~* ${marker}
                or coalesce(event.details::text, '') ~* ${marker}
              )
            )
        )
    `,
    delete: (sql, cutoff, marker) => sql`
      with deleted as (
        delete from public.response_processing_job job
        where coalesce(job.finished_at, job.updated_at, job.created_at) < ${cutoff}
          and job.status in ${sql(TERMINAL_RESPONSE_STATUSES)}
          and (
            coalesce(job.source, '') ~* ${marker}
            or coalesce(job.idempotency_key, '') ~* ${marker}
            or coalesce(job.locked_by, '') ~* ${marker}
            or coalesce(job.last_error_reason, '') ~* ${marker}
            or coalesce(job.payload::text, '') ~* ${marker}
            or coalesce(job.result_summary::text, '') ~* ${marker}
          )
          and not exists (
            select 1
            from public.response_processing_job_event event
            where event.job_id = job.id
          )
        returning 1
      )
      select count(*)::int as count from deleted
    `,
  },
  {
    id: "response_worker_orchestration_event",
    table: "response_worker_orchestration_event",
    criteria: "Event is older than cutoff, parent orchestration run is terminal and older than cutoff, and parent/event fields contain an explicit test marker.",
    count: (sql, cutoff, marker) => sql`
      select count(*)::int as count
      from public.response_worker_orchestration_event event
      join public.response_worker_orchestration_run run on run.id = event.run_id
      where event.created_at < ${cutoff}
        and coalesce(run.finished_at, run.updated_at, run.created_at) < ${cutoff}
        and run.status in ${sql(TERMINAL_ORCHESTRATION_STATUSES)}
        and (
          coalesce(run.source, '') ~* ${marker}
          or coalesce(run.lock_scope, '') ~* ${marker}
          or coalesce(run.worker_id, '') ~* ${marker}
          or coalesce(run.last_error_reason, '') ~* ${marker}
          or coalesce(run.result_summary::text, '') ~* ${marker}
          or coalesce(event.worker_id, '') ~* ${marker}
          or coalesce(event.error_reason, '') ~* ${marker}
          or coalesce(event.details::text, '') ~* ${marker}
        )
    `,
    delete: (sql, cutoff, marker) => sql`
      with deleted as (
        delete from public.response_worker_orchestration_event event
        using public.response_worker_orchestration_run run
        where event.run_id = run.id
          and event.created_at < ${cutoff}
          and coalesce(run.finished_at, run.updated_at, run.created_at) < ${cutoff}
          and run.status in ${sql(TERMINAL_ORCHESTRATION_STATUSES)}
          and (
            coalesce(run.source, '') ~* ${marker}
            or coalesce(run.lock_scope, '') ~* ${marker}
            or coalesce(run.worker_id, '') ~* ${marker}
            or coalesce(run.last_error_reason, '') ~* ${marker}
            or coalesce(run.result_summary::text, '') ~* ${marker}
            or coalesce(event.worker_id, '') ~* ${marker}
            or coalesce(event.error_reason, '') ~* ${marker}
            or coalesce(event.details::text, '') ~* ${marker}
          )
        returning 1
      )
      select count(*)::int as count from deleted
    `,
  },
  {
    id: "response_worker_orchestration_run",
    table: "response_worker_orchestration_run",
    criteria: "Orchestration run is terminal, older than cutoff, explicitly test-marked, and has no remaining child events.",
    count: (sql, cutoff, marker) => sql`
      select count(*)::int as count
      from public.response_worker_orchestration_run run
      where coalesce(run.finished_at, run.updated_at, run.created_at) < ${cutoff}
        and run.status in ${sql(TERMINAL_ORCHESTRATION_STATUSES)}
        and (
          coalesce(run.source, '') ~* ${marker}
          or coalesce(run.lock_scope, '') ~* ${marker}
          or coalesce(run.worker_id, '') ~* ${marker}
          or coalesce(run.last_error_reason, '') ~* ${marker}
          or coalesce(run.result_summary::text, '') ~* ${marker}
        )
        and not exists (
          select 1
          from public.response_worker_orchestration_event event
          where event.run_id = run.id
            and not (
              event.created_at < ${cutoff}
              and (
                coalesce(run.source, '') ~* ${marker}
                or coalesce(run.lock_scope, '') ~* ${marker}
                or coalesce(run.worker_id, '') ~* ${marker}
                or coalesce(run.last_error_reason, '') ~* ${marker}
                or coalesce(run.result_summary::text, '') ~* ${marker}
                or coalesce(event.worker_id, '') ~* ${marker}
                or coalesce(event.error_reason, '') ~* ${marker}
                or coalesce(event.details::text, '') ~* ${marker}
              )
            )
        )
    `,
    delete: (sql, cutoff, marker) => sql`
      with deleted as (
        delete from public.response_worker_orchestration_run run
        where coalesce(run.finished_at, run.updated_at, run.created_at) < ${cutoff}
          and run.status in ${sql(TERMINAL_ORCHESTRATION_STATUSES)}
          and (
            coalesce(run.source, '') ~* ${marker}
            or coalesce(run.lock_scope, '') ~* ${marker}
            or coalesce(run.worker_id, '') ~* ${marker}
            or coalesce(run.last_error_reason, '') ~* ${marker}
            or coalesce(run.result_summary::text, '') ~* ${marker}
          )
          and not exists (
            select 1
            from public.response_worker_orchestration_event event
            where event.run_id = run.id
          )
        returning 1
      )
      select count(*)::int as count from deleted
    `,
  },
  {
    id: "response_processing_lifecycle_event",
    table: "response_processing_lifecycle_event",
    criteria: "Lifecycle event is older than cutoff and source/details contain an explicit test marker.",
    count: (sql, cutoff, marker) => sql`
      select count(*)::int as count
      from public.response_processing_lifecycle_event lifecycle
      where lifecycle.created_at < ${cutoff}
        and (
          coalesce(lifecycle.source, '') ~* ${marker}
          or coalesce(lifecycle.details::text, '') ~* ${marker}
        )
    `,
    delete: (sql, cutoff, marker) => sql`
      with deleted as (
        delete from public.response_processing_lifecycle_event lifecycle
        where lifecycle.created_at < ${cutoff}
          and (
            coalesce(lifecycle.source, '') ~* ${marker}
            or coalesce(lifecycle.details::text, '') ~* ${marker}
          )
        returning 1
      )
      select count(*)::int as count from deleted
    `,
  },
  {
    id: "response_admin_review_event",
    table: "response_admin_review_event",
    criteria: "Response admin review event is older than cutoff and its parent response timeline row or owner is explicitly test-marked.",
    count: (sql, cutoff, marker) => sql`
      select count(*)::int as count
      from public.response_admin_review_event review
      join public.bureau_response_event response on response.id = review.response_event_id
      join public.users user_row on user_row.id = response.user_id
      where review.created_at < ${cutoff}
        and coalesce(response.created_at, response.response_received_at) < ${cutoff}
        and (
          coalesce(response.response_subject, '') ~* ${marker}
          or coalesce(response.response_reference_id, '') ~* ${marker}
          or coalesce(response.response_summary, '') ~* ${marker}
          or coalesce(response.raw_artifact_metadata::text, '') ~* ${marker}
          or coalesce(response.normalized_response_metadata::text, '') ~* ${marker}
          or lower(coalesce(response.response_sender_domain, '')) in ('example.test', 'example.invalid')
          or (
            lower(user_row.email) like 'response-auth-smoke-%@example.test'
            and (
              lower(coalesce(user_row.display_name, '')) = lower(user_row.email)
              or coalesce(user_row.display_name, '') ilike 'Synthetic Response Auth Smoke%'
              or lower(coalesce(user_row.display_name, '')) like 'response-auth-smoke-%@example.test'
            )
          )
        )
    `,
    delete: (sql, cutoff, marker) => sql`
      with deleted as (
        delete from public.response_admin_review_event review
        using public.bureau_response_event response, public.users user_row
        where response.id = review.response_event_id
          and user_row.id = response.user_id
          and review.created_at < ${cutoff}
          and coalesce(response.created_at, response.response_received_at) < ${cutoff}
          and (
            coalesce(response.response_subject, '') ~* ${marker}
            or coalesce(response.response_reference_id, '') ~* ${marker}
            or coalesce(response.response_summary, '') ~* ${marker}
            or coalesce(response.raw_artifact_metadata::text, '') ~* ${marker}
            or coalesce(response.normalized_response_metadata::text, '') ~* ${marker}
            or lower(coalesce(response.response_sender_domain, '')) in ('example.test', 'example.invalid')
            or (
              lower(user_row.email) like 'response-auth-smoke-%@example.test'
              and (
                lower(coalesce(user_row.display_name, '')) = lower(user_row.email)
                or coalesce(user_row.display_name, '') ilike 'Synthetic Response Auth Smoke%'
                or lower(coalesce(user_row.display_name, '')) like 'response-auth-smoke-%@example.test'
              )
            )
          )
        returning 1
      )
      select count(*)::int as count from deleted
    `,
  },
  {
    id: "response_processing_event",
    table: "response_processing_event",
    criteria: "Response processing event is older than cutoff and its parent response timeline row, event metadata, or owner is explicitly test-marked.",
    count: (sql, cutoff, marker) => sql`
      select count(*)::int as count
      from public.response_processing_event event
      join public.bureau_response_event response on response.id = event.response_event_id
      join public.users user_row on user_row.id = response.user_id
      where event.created_at < ${cutoff}
        and coalesce(response.created_at, response.response_received_at) < ${cutoff}
        and (
          coalesce(response.response_subject, '') ~* ${marker}
          or coalesce(response.response_reference_id, '') ~* ${marker}
          or coalesce(response.response_summary, '') ~* ${marker}
          or coalesce(response.raw_artifact_metadata::text, '') ~* ${marker}
          or coalesce(response.normalized_response_metadata::text, '') ~* ${marker}
          or coalesce(event.idempotency_key, '') ~* ${marker}
          or coalesce(event.raw_artifact_metadata::text, '') ~* ${marker}
          or coalesce(event.normalized_response_metadata::text, '') ~* ${marker}
          or coalesce(event.deterministic_extraction::text, '') ~* ${marker}
          or lower(coalesce(response.response_sender_domain, '')) in ('example.test', 'example.invalid')
          or (
            lower(user_row.email) like 'response-auth-smoke-%@example.test'
            and (
              lower(coalesce(user_row.display_name, '')) = lower(user_row.email)
              or coalesce(user_row.display_name, '') ilike 'Synthetic Response Auth Smoke%'
              or lower(coalesce(user_row.display_name, '')) like 'response-auth-smoke-%@example.test'
            )
          )
        )
    `,
    delete: (sql, cutoff, marker) => sql`
      with deleted as (
        delete from public.response_processing_event event
        using public.bureau_response_event response, public.users user_row
        where response.id = event.response_event_id
          and user_row.id = response.user_id
          and event.created_at < ${cutoff}
          and coalesce(response.created_at, response.response_received_at) < ${cutoff}
          and (
            coalesce(response.response_subject, '') ~* ${marker}
            or coalesce(response.response_reference_id, '') ~* ${marker}
            or coalesce(response.response_summary, '') ~* ${marker}
            or coalesce(response.raw_artifact_metadata::text, '') ~* ${marker}
            or coalesce(response.normalized_response_metadata::text, '') ~* ${marker}
            or coalesce(event.idempotency_key, '') ~* ${marker}
            or coalesce(event.raw_artifact_metadata::text, '') ~* ${marker}
            or coalesce(event.normalized_response_metadata::text, '') ~* ${marker}
            or coalesce(event.deterministic_extraction::text, '') ~* ${marker}
            or lower(coalesce(response.response_sender_domain, '')) in ('example.test', 'example.invalid')
            or (
              lower(user_row.email) like 'response-auth-smoke-%@example.test'
              and (
                lower(coalesce(user_row.display_name, '')) = lower(user_row.email)
                or coalesce(user_row.display_name, '') ilike 'Synthetic Response Auth Smoke%'
                or lower(coalesce(user_row.display_name, '')) like 'response-auth-smoke-%@example.test'
              )
            )
          )
        returning 1
      )
      select count(*)::int as count from deleted
    `,
  },
  {
    id: "bureau_response_event",
    table: "bureau_response_event",
    criteria: "Response timeline row is older than cutoff, explicitly test-marked, and has no non-eligible response processing/review children.",
    count: (sql, cutoff, marker) => sql`
      select count(*)::int as count
      from public.bureau_response_event response
      join public.users user_row on user_row.id = response.user_id
      where coalesce(response.created_at, response.response_received_at) < ${cutoff}
        and (
          coalesce(response.response_subject, '') ~* ${marker}
          or coalesce(response.response_reference_id, '') ~* ${marker}
          or coalesce(response.response_summary, '') ~* ${marker}
          or coalesce(response.raw_artifact_metadata::text, '') ~* ${marker}
          or coalesce(response.normalized_response_metadata::text, '') ~* ${marker}
          or lower(coalesce(response.response_sender_domain, '')) in ('example.test', 'example.invalid')
          or (
            lower(user_row.email) like 'response-auth-smoke-%@example.test'
            and (
              lower(coalesce(user_row.display_name, '')) = lower(user_row.email)
              or coalesce(user_row.display_name, '') ilike 'Synthetic Response Auth Smoke%'
              or lower(coalesce(user_row.display_name, '')) like 'response-auth-smoke-%@example.test'
            )
          )
        )
        and not exists (
          select 1
          from public.response_processing_event event
          where event.response_event_id = response.id
            and event.created_at >= ${cutoff}
        )
        and not exists (
          select 1
          from public.response_admin_review_event review
          where review.response_event_id = response.id
            and review.created_at >= ${cutoff}
        )
    `,
    delete: (sql, cutoff, marker) => sql`
      with deleted as (
        delete from public.bureau_response_event response
        using public.users user_row
        where user_row.id = response.user_id
          and coalesce(response.created_at, response.response_received_at) < ${cutoff}
          and (
            coalesce(response.response_subject, '') ~* ${marker}
            or coalesce(response.response_reference_id, '') ~* ${marker}
            or coalesce(response.response_summary, '') ~* ${marker}
            or coalesce(response.raw_artifact_metadata::text, '') ~* ${marker}
            or coalesce(response.normalized_response_metadata::text, '') ~* ${marker}
            or lower(coalesce(response.response_sender_domain, '')) in ('example.test', 'example.invalid')
            or (
              lower(user_row.email) like 'response-auth-smoke-%@example.test'
              and (
                lower(coalesce(user_row.display_name, '')) = lower(user_row.email)
                or coalesce(user_row.display_name, '') ilike 'Synthetic Response Auth Smoke%'
                or lower(coalesce(user_row.display_name, '')) like 'response-auth-smoke-%@example.test'
              )
            )
          )
          and not exists (select 1 from public.response_processing_event event where event.response_event_id = response.id)
          and not exists (select 1 from public.response_admin_review_event review where review.response_event_id = response.id)
        returning 1
      )
      select count(*)::int as count from deleted
    `,
  },
  {
    id: "response_auth_smoke_finding_outcome",
    table: "finding_outcome",
    criteria: "Response-auth-smoke finding outcome is older than cutoff, response-only, unlinked from packet/findings/tradelines, and backed by storage-less synthetic OUTCOME_SMOKE artifacts.",
    count: (sql, cutoff) => sql`
      select count(*)::int as count
      from public.finding_outcome outcome
      join public.users user_row on user_row.id = outcome.user_id
      join public.outcome_comparison_run run on run.id = outcome.comparison_run_id
      where outcome.created_at < ${cutoff}
        and lower(user_row.email) like 'response-auth-smoke-%@example.test'
        and (
          lower(coalesce(user_row.display_name, '')) = lower(user_row.email)
          or coalesce(user_row.display_name, '') ilike 'Synthetic Response Auth Smoke%'
          or lower(coalesce(user_row.display_name, '')) like 'response-auth-smoke-%@example.test'
        )
        and run.comparison_scope = 'response_only'
        and run.packet_id is null
        and outcome.dispute_packet_id is null
        and outcome.dispute_packet_finding_id is null
        and outcome.creditor_obligation_test_id is null
        and outcome.previous_tradeline_id is null
        and outcome.later_tradeline_id is null
        and exists (
          select 1
          from public.report_artifact artifact
          where artifact.id in (run.previous_report_artifact_id, run.later_report_artifact_id)
            and artifact.storage_url is null
            and artifact.data @> '{"syntheticOutcomeSmoke":{"syntheticOnly":true,"containsRealConsumerData":false}}'::jsonb
            and coalesce(artifact.data -> 'syntheticOutcomeSmoke' ->> 'marker', '') ilike 'OUTCOME_SMOKE_%'
        )
    `,
    delete: (sql, cutoff) => sql`
      with deleted as (
        delete from public.finding_outcome outcome
        using public.users user_row, public.outcome_comparison_run run
        where user_row.id = outcome.user_id
          and run.id = outcome.comparison_run_id
          and outcome.created_at < ${cutoff}
          and lower(user_row.email) like 'response-auth-smoke-%@example.test'
          and (
            lower(coalesce(user_row.display_name, '')) = lower(user_row.email)
            or coalesce(user_row.display_name, '') ilike 'Synthetic Response Auth Smoke%'
            or lower(coalesce(user_row.display_name, '')) like 'response-auth-smoke-%@example.test'
          )
          and run.comparison_scope = 'response_only'
          and run.packet_id is null
          and outcome.dispute_packet_id is null
          and outcome.dispute_packet_finding_id is null
          and outcome.creditor_obligation_test_id is null
          and outcome.previous_tradeline_id is null
          and outcome.later_tradeline_id is null
          and exists (
            select 1
            from public.report_artifact artifact
            where artifact.id in (run.previous_report_artifact_id, run.later_report_artifact_id)
              and artifact.storage_url is null
              and artifact.data @> '{"syntheticOutcomeSmoke":{"syntheticOnly":true,"containsRealConsumerData":false}}'::jsonb
              and coalesce(artifact.data -> 'syntheticOutcomeSmoke' ->> 'marker', '') ilike 'OUTCOME_SMOKE_%'
          )
        returning 1
      )
      select count(*)::int as count from deleted
    `,
  },
  {
    id: "response_auth_smoke_outcome_comparison_run",
    table: "outcome_comparison_run",
    criteria: "Response-auth-smoke outcome comparison run is older than cutoff, response-only, packet-unlinked, backed by storage-less synthetic OUTCOME_SMOKE artifacts, and has no remaining outcome/response children.",
    count: (sql, cutoff) => sql`
      select count(*)::int as count
      from public.outcome_comparison_run run
      join public.users user_row on user_row.id = run.user_id
      where run.created_at < ${cutoff}
        and lower(user_row.email) like 'response-auth-smoke-%@example.test'
        and (
          lower(coalesce(user_row.display_name, '')) = lower(user_row.email)
          or coalesce(user_row.display_name, '') ilike 'Synthetic Response Auth Smoke%'
          or lower(coalesce(user_row.display_name, '')) like 'response-auth-smoke-%@example.test'
        )
        and run.comparison_scope = 'response_only'
        and run.packet_id is null
        and exists (
          select 1
          from public.report_artifact artifact
          where artifact.id in (run.previous_report_artifact_id, run.later_report_artifact_id)
            and artifact.storage_url is null
            and artifact.data @> '{"syntheticOutcomeSmoke":{"syntheticOnly":true,"containsRealConsumerData":false}}'::jsonb
            and coalesce(artifact.data -> 'syntheticOutcomeSmoke' ->> 'marker', '') ilike 'OUTCOME_SMOKE_%'
        )
        and not exists (
          select 1 from public.finding_outcome outcome
          where outcome.comparison_run_id = run.id
            and outcome.created_at >= ${cutoff}
        )
        and not exists (
          select 1 from public.bureau_response_event response
          where response.comparison_run_id = run.id
            and coalesce(response.created_at, response.response_received_at) >= ${cutoff}
        )
        and not exists (
          select 1 from public.response_processing_event event
          where event.comparison_run_id = run.id
            and event.created_at >= ${cutoff}
        )
        and not exists (
          select 1 from public.response_admin_review_event review
          where review.comparison_run_id = run.id
            and review.created_at >= ${cutoff}
        )
    `,
    delete: (sql, cutoff) => sql`
      with deleted as (
        delete from public.outcome_comparison_run run
        using public.users user_row
        where user_row.id = run.user_id
          and run.created_at < ${cutoff}
          and lower(user_row.email) like 'response-auth-smoke-%@example.test'
          and (
            lower(coalesce(user_row.display_name, '')) = lower(user_row.email)
            or coalesce(user_row.display_name, '') ilike 'Synthetic Response Auth Smoke%'
            or lower(coalesce(user_row.display_name, '')) like 'response-auth-smoke-%@example.test'
          )
          and run.comparison_scope = 'response_only'
          and run.packet_id is null
          and exists (
            select 1
            from public.report_artifact artifact
            where artifact.id in (run.previous_report_artifact_id, run.later_report_artifact_id)
              and artifact.storage_url is null
              and artifact.data @> '{"syntheticOutcomeSmoke":{"syntheticOnly":true,"containsRealConsumerData":false}}'::jsonb
              and coalesce(artifact.data -> 'syntheticOutcomeSmoke' ->> 'marker', '') ilike 'OUTCOME_SMOKE_%'
          )
          and not exists (select 1 from public.finding_outcome outcome where outcome.comparison_run_id = run.id)
          and not exists (select 1 from public.bureau_response_event response where response.comparison_run_id = run.id)
          and not exists (select 1 from public.response_processing_event event where event.comparison_run_id = run.id)
          and not exists (select 1 from public.response_admin_review_event review where review.comparison_run_id = run.id)
        returning 1
      )
      select count(*)::int as count from deleted
    `,
  },
  {
    id: "response_auth_smoke_report_artifact",
    table: "report_artifact",
    criteria: "Report artifact is older than cutoff, storage-less, syntheticOutcomeSmoke marks it synthetic-only/no-real-consumer-data, and owner is a response-auth-smoke example.test user.",
    count: (sql, cutoff) => sql`
      select count(*)::int as count
      from public.report_artifact artifact
      join public.users user_row on user_row.id = artifact.user_id
      where artifact.created_at < ${cutoff}
        and artifact.storage_url is null
        and lower(user_row.email) like 'response-auth-smoke-%@example.test'
        and (
          lower(coalesce(user_row.display_name, '')) = lower(user_row.email)
          or coalesce(user_row.display_name, '') ilike 'Synthetic Response Auth Smoke%'
          or lower(coalesce(user_row.display_name, '')) like 'response-auth-smoke-%@example.test'
        )
        and artifact.data @> '{"syntheticOutcomeSmoke":{"syntheticOnly":true,"containsRealConsumerData":false}}'::jsonb
        and coalesce(artifact.data -> 'syntheticOutcomeSmoke' ->> 'marker', '') ilike 'OUTCOME_SMOKE_%'
        and not exists (
          select 1
          from public.outcome_comparison_run run
          where artifact.id in (run.previous_report_artifact_id, run.later_report_artifact_id)
            and run.created_at >= ${cutoff}
        )
    `,
    delete: (sql, cutoff) => sql`
      with deleted as (
        delete from public.report_artifact artifact
        using public.users user_row
        where user_row.id = artifact.user_id
          and artifact.created_at < ${cutoff}
          and artifact.storage_url is null
          and lower(user_row.email) like 'response-auth-smoke-%@example.test'
          and (
            lower(coalesce(user_row.display_name, '')) = lower(user_row.email)
            or coalesce(user_row.display_name, '') ilike 'Synthetic Response Auth Smoke%'
            or lower(coalesce(user_row.display_name, '')) like 'response-auth-smoke-%@example.test'
          )
          and artifact.data @> '{"syntheticOutcomeSmoke":{"syntheticOnly":true,"containsRealConsumerData":false}}'::jsonb
          and coalesce(artifact.data -> 'syntheticOutcomeSmoke' ->> 'marker', '') ilike 'OUTCOME_SMOKE_%'
          and not exists (
            select 1
            from public.outcome_comparison_run run
            where artifact.id in (run.previous_report_artifact_id, run.later_report_artifact_id)
          )
        returning 1
      )
      select count(*)::int as count from deleted
    `,
  },
  {
    id: "response_auth_smoke_audit_log",
    table: "audit_log",
    criteria: "Audit row is older than cutoff and belongs to an explicitly marked response-auth-smoke example.test user.",
    count: (sql, cutoff) => sql`
      select count(*)::int as count
      from public.audit_log audit
      join public.users user_row on user_row.id = audit.user_id
      where audit.timestamp < ${cutoff}
        and lower(user_row.email) like 'response-auth-smoke-%@example.test'
        and (
          lower(coalesce(user_row.display_name, '')) = lower(user_row.email)
          or coalesce(user_row.display_name, '') ilike 'Synthetic Response Auth Smoke%'
          or lower(coalesce(user_row.display_name, '')) like 'response-auth-smoke-%@example.test'
        )
    `,
    delete: (sql, cutoff) => sql`
      with deleted as (
        delete from public.audit_log audit
        using public.users user_row
        where user_row.id = audit.user_id
          and audit.timestamp < ${cutoff}
          and lower(user_row.email) like 'response-auth-smoke-%@example.test'
          and (
            lower(coalesce(user_row.display_name, '')) = lower(user_row.email)
            or coalesce(user_row.display_name, '') ilike 'Synthetic Response Auth Smoke%'
            or lower(coalesce(user_row.display_name, '')) like 'response-auth-smoke-%@example.test'
          )
        returning 1
      )
      select count(*)::int as count from deleted
    `,
  },
  {
    id: "response_auth_smoke_user",
    table: "users",
    criteria: "User is an older neutralized response-auth-smoke example.test account and has no remaining protected product, admin, parser, regulation, packet, finding, report, response, or audit references.",
    count: (sql, cutoff) => sql`
      select count(*)::int as count
      from public.users user_row
      where user_row.created_at < ${cutoff}
        and user_row.role = 'user'
        and lower(user_row.email) like 'response-auth-smoke-%@example.test'
        and (
          lower(coalesce(user_row.display_name, '')) = lower(user_row.email)
          or coalesce(user_row.display_name, '') ilike 'Synthetic Response Auth Smoke%'
          or lower(coalesce(user_row.display_name, '')) like 'response-auth-smoke-%@example.test'
        )
        and not exists (select 1 from public.audit_log audit where audit.user_id = user_row.id and audit.timestamp >= ${cutoff})
        and not exists (select 1 from public.bureau_response_event response where user_row.id in (response.user_id, response.created_by, response.reviewed_by) and coalesce(response.created_at, response.response_received_at) >= ${cutoff})
        and not exists (select 1 from public.response_processing_event event where user_row.id in (event.user_id, event.created_by) and event.created_at >= ${cutoff})
        and not exists (select 1 from public.response_admin_review_event review where user_row.id in (review.user_id, review.actor_admin_id, review.created_by) and review.created_at >= ${cutoff})
        and not exists (select 1 from public.finding_outcome outcome where user_row.id in (outcome.user_id, outcome.reviewed_by) and outcome.created_at >= ${cutoff})
        and not exists (select 1 from public.outcome_comparison_run run where user_row.id in (run.user_id, run.created_by, run.reviewed_by) and run.created_at >= ${cutoff})
        and not exists (select 1 from public.report_artifact artifact where artifact.user_id = user_row.id and not (artifact.created_at < ${cutoff} and artifact.storage_url is null and artifact.data @> '{"syntheticOutcomeSmoke":{"syntheticOnly":true,"containsRealConsumerData":false}}'::jsonb))
        and not exists (select 1 from public.packet packet where packet.user_id = user_row.id)
        and not exists (select 1 from public.tradeline tradeline where tradeline.user_id = user_row.id)
        and not exists (select 1 from public.dispute_packet_findings finding where user_row.id in (finding.user_id, finding.created_by))
        and not exists (select 1 from public.ingest_processing_job job where user_row.id in (job.user_id, job.actor_user_id))
        and not exists (select 1 from public.ingest_processing_job_event event where event.actor_user_id = user_row.id)
        and not exists (select 1 from public.response_processing_job job where job.actor_user_id = user_row.id)
        and not exists (select 1 from public.response_processing_job_event event where event.actor_user_id = user_row.id)
        and not exists (select 1 from public.response_processing_lifecycle_event lifecycle where lifecycle.actor_user_id = user_row.id)
        and not exists (select 1 from public.ai_assist_run run where run.user_id = user_row.id)
        and not exists (select 1 from public.beta_issue_report report where report.user_id = user_row.id)
        and not exists (select 1 from public.compliance_config config where config.updated_by_user_id = user_row.id)
        and not exists (select 1 from public.consumer_identification_document document where document.user_id = user_row.id)
        and not exists (select 1 from public.consumer_signature signature where user_row.id in (signature.user_id, signature.verified_by))
        and not exists (select 1 from public.dynamic_scanning_rule rule where rule.approved_by = user_row.id)
        and not exists (select 1 from public.evidence_attachment attachment where attachment.uploaded_by = user_row.id)
        and not exists (select 1 from public.identity_theft_freeze freeze_row where freeze_row.user_id = user_row.id)
        and not exists (select 1 from public.letter_template template where template.updated_by = user_row.id)
        and not exists (select 1 from public.obligation_instance instance where instance.user_id = user_row.id)
        and not exists (select 1 from public.parser_bureau_detection_config config where config.created_by = user_row.id)
        and not exists (select 1 from public.parser_extraction_rule rule where rule.created_by = user_row.id)
        and not exists (select 1 from public.parser_field_mapping mapping where mapping.created_by = user_row.id)
        and not exists (select 1 from public.parser_known_entity entity where entity.created_by = user_row.id)
        and not exists (select 1 from public.parser_mapping_version version where version.changed_by = user_row.id)
        and not exists (select 1 from public.parser_rule_candidate candidate where candidate.created_by = user_row.id)
        and not exists (select 1 from public.parser_test_case test_case where test_case.created_by = user_row.id)
        and not exists (select 1 from public.parser_test_training_archive archive where archive.created_by_admin_id = user_row.id)
        and not exists (select 1 from public.postal_transaction tx where tx.user_id = user_row.id)
        and not exists (select 1 from public.regulation_reconciliation_candidate candidate where user_row.id in (candidate.created_by, candidate.reviewed_by))
        and not exists (select 1 from public.regulation_registry registry where registry.approved_by = user_row.id)
        and not exists (select 1 from public.regulation_runtime_bridge_mapping mapping where user_row.id in (mapping.approved_by, mapping.activated_by, mapping.deactivated_by, mapping.rollback_by))
        and not exists (select 1 from public.regulation_source_scan scan where scan.triggered_by = user_row.id)
        and not exists (select 1 from public.regulation_update_candidate candidate where candidate.reviewed_by = user_row.id)
        and not exists (select 1 from public.regulation_violation_mapping mapping where mapping.approved_by = user_row.id)
        and not exists (select 1 from public.regulatory_notification notification where notification.user_id = user_row.id)
        and not exists (select 1 from public.software_version version where version.created_by = user_row.id)
        and not exists (select 1 from public.subscriptions subscription where subscription.user_id = user_row.id)
        and not exists (select 1 from public.support_ticket ticket where user_row.id in (ticket.user_id, ticket.assigned_agent_id))
        and not exists (select 1 from public.support_ticket_message message where message.sender_id = user_row.id)
        and not exists (select 1 from public.system_settings setting where setting.updated_by_user_id = user_row.id)
        and not exists (select 1 from public.user_account account where account.user_id = user_row.id)
        and not exists (select 1 from public.violation_correction correction where user_row.id in (correction.created_by_admin_id, correction.finalized_by_admin_id))
    `,
    delete: (sql, cutoff) => sql`
      with deleted as (
        delete from public.users user_row
        where user_row.created_at < ${cutoff}
          and user_row.role = 'user'
          and lower(user_row.email) like 'response-auth-smoke-%@example.test'
          and (
            lower(coalesce(user_row.display_name, '')) = lower(user_row.email)
            or coalesce(user_row.display_name, '') ilike 'Synthetic Response Auth Smoke%'
            or lower(coalesce(user_row.display_name, '')) like 'response-auth-smoke-%@example.test'
          )
          and not exists (select 1 from public.audit_log audit where audit.user_id = user_row.id)
          and not exists (select 1 from public.bureau_response_event response where user_row.id in (response.user_id, response.created_by, response.reviewed_by))
          and not exists (select 1 from public.response_processing_event event where user_row.id in (event.user_id, event.created_by))
          and not exists (select 1 from public.response_admin_review_event review where user_row.id in (review.user_id, review.actor_admin_id, review.created_by))
          and not exists (select 1 from public.finding_outcome outcome where user_row.id in (outcome.user_id, outcome.reviewed_by))
          and not exists (select 1 from public.outcome_comparison_run run where user_row.id in (run.user_id, run.created_by, run.reviewed_by))
          and not exists (select 1 from public.report_artifact artifact where artifact.user_id = user_row.id)
          and not exists (select 1 from public.packet packet where packet.user_id = user_row.id)
          and not exists (select 1 from public.tradeline tradeline where tradeline.user_id = user_row.id)
          and not exists (select 1 from public.dispute_packet_findings finding where user_row.id in (finding.user_id, finding.created_by))
          and not exists (select 1 from public.ingest_processing_job job where user_row.id in (job.user_id, job.actor_user_id))
          and not exists (select 1 from public.ingest_processing_job_event event where event.actor_user_id = user_row.id)
          and not exists (select 1 from public.response_processing_job job where job.actor_user_id = user_row.id)
          and not exists (select 1 from public.response_processing_job_event event where event.actor_user_id = user_row.id)
          and not exists (select 1 from public.response_processing_lifecycle_event lifecycle where lifecycle.actor_user_id = user_row.id)
          and not exists (select 1 from public.ai_assist_run run where run.user_id = user_row.id)
          and not exists (select 1 from public.beta_issue_report report where report.user_id = user_row.id)
          and not exists (select 1 from public.compliance_config config where config.updated_by_user_id = user_row.id)
          and not exists (select 1 from public.consumer_identification_document document where document.user_id = user_row.id)
          and not exists (select 1 from public.consumer_signature signature where user_row.id in (signature.user_id, signature.verified_by))
          and not exists (select 1 from public.dynamic_scanning_rule rule where rule.approved_by = user_row.id)
          and not exists (select 1 from public.evidence_attachment attachment where attachment.uploaded_by = user_row.id)
          and not exists (select 1 from public.identity_theft_freeze freeze_row where freeze_row.user_id = user_row.id)
          and not exists (select 1 from public.letter_template template where template.updated_by = user_row.id)
          and not exists (select 1 from public.obligation_instance instance where instance.user_id = user_row.id)
          and not exists (select 1 from public.parser_bureau_detection_config config where config.created_by = user_row.id)
          and not exists (select 1 from public.parser_extraction_rule rule where rule.created_by = user_row.id)
          and not exists (select 1 from public.parser_field_mapping mapping where mapping.created_by = user_row.id)
          and not exists (select 1 from public.parser_known_entity entity where entity.created_by = user_row.id)
          and not exists (select 1 from public.parser_mapping_version version where version.changed_by = user_row.id)
          and not exists (select 1 from public.parser_rule_candidate candidate where candidate.created_by = user_row.id)
          and not exists (select 1 from public.parser_test_case test_case where test_case.created_by = user_row.id)
          and not exists (select 1 from public.parser_test_training_archive archive where archive.created_by_admin_id = user_row.id)
          and not exists (select 1 from public.postal_transaction tx where tx.user_id = user_row.id)
          and not exists (select 1 from public.regulation_reconciliation_candidate candidate where user_row.id in (candidate.created_by, candidate.reviewed_by))
          and not exists (select 1 from public.regulation_registry registry where registry.approved_by = user_row.id)
          and not exists (select 1 from public.regulation_runtime_bridge_mapping mapping where user_row.id in (mapping.approved_by, mapping.activated_by, mapping.deactivated_by, mapping.rollback_by))
          and not exists (select 1 from public.regulation_source_scan scan where scan.triggered_by = user_row.id)
          and not exists (select 1 from public.regulation_update_candidate candidate where candidate.reviewed_by = user_row.id)
          and not exists (select 1 from public.regulation_violation_mapping mapping where mapping.approved_by = user_row.id)
          and not exists (select 1 from public.regulatory_notification notification where notification.user_id = user_row.id)
          and not exists (select 1 from public.software_version version where version.created_by = user_row.id)
          and not exists (select 1 from public.subscriptions subscription where subscription.user_id = user_row.id)
          and not exists (select 1 from public.support_ticket ticket where user_row.id in (ticket.user_id, ticket.assigned_agent_id))
          and not exists (select 1 from public.support_ticket_message message where message.sender_id = user_row.id)
          and not exists (select 1 from public.system_settings setting where setting.updated_by_user_id = user_row.id)
          and not exists (select 1 from public.user_account account where account.user_id = user_row.id)
          and not exists (select 1 from public.violation_correction correction where user_row.id in (correction.created_by_admin_id, correction.finalized_by_admin_id))
        returning 1
      )
      select count(*)::int as count from deleted
    `,
  },
  {
    id: "outcome_smoke_tradeline_artifact_presence",
    table: "tradeline_artifact_presence",
    criteria: "Join row points at an OUTCOME_SMOKE tradeline or storage-less OUTCOME_SMOKE report artifact older than cutoff.",
    count: (sql, cutoff) => sql`
      select count(*)::int as count
      from public.tradeline_artifact_presence presence
      where exists (
        select 1
        from public.tradeline tradeline
        where tradeline.id = presence.tradeline_id
          and tradeline.created_at < ${cutoff}
          and coalesce(tradeline.notes, '') ~* '(^|[^a-z0-9])outcome[-_ ]smoke([^a-z0-9]|$)'
          and coalesce(tradeline.account_number, '') ilike 'OUTCOME-SMOKE-ACCT-%'
      )
      or exists (
        select 1
        from public.report_artifact artifact
        where artifact.id = presence.report_artifact_id
          and artifact.created_at < ${cutoff}
          and artifact.storage_url is null
          and artifact.data @> '{"syntheticOutcomeSmoke":{"syntheticOnly":true,"containsRealConsumerData":false}}'::jsonb
      )
    `,
    delete: (sql, cutoff) => sql`
      with deleted as (
        delete from public.tradeline_artifact_presence presence
        where exists (
          select 1
          from public.tradeline tradeline
          where tradeline.id = presence.tradeline_id
            and tradeline.created_at < ${cutoff}
            and coalesce(tradeline.notes, '') ~* '(^|[^a-z0-9])outcome[-_ ]smoke([^a-z0-9]|$)'
            and coalesce(tradeline.account_number, '') ilike 'OUTCOME-SMOKE-ACCT-%'
        )
        or exists (
          select 1
          from public.report_artifact artifact
          where artifact.id = presence.report_artifact_id
            and artifact.created_at < ${cutoff}
            and artifact.storage_url is null
            and artifact.data @> '{"syntheticOutcomeSmoke":{"syntheticOnly":true,"containsRealConsumerData":false}}'::jsonb
        )
        returning 1
      )
      select count(*)::int as count from deleted
    `,
  },
  {
    id: "outcome_smoke_tradeline",
    table: "tradeline",
    criteria: "Tradeline is older than cutoff, has OUTCOME_SMOKE marker fields, and belongs to an OUTCOME_SMOKE example.test synthetic user.",
    count: (sql, cutoff) => sql`
      select count(*)::int as count
      from public.tradeline tradeline
      join public.users user_row on user_row.id = tradeline.user_id
      where tradeline.created_at < ${cutoff}
        and lower(user_row.email) like 'outcome_smoke_%@example.test'
        and coalesce(user_row.display_name, '') ilike 'Synthetic OUTCOME_SMOKE_%'
        and coalesce(tradeline.notes, '') ~* '(^|[^a-z0-9])outcome[-_ ]smoke([^a-z0-9]|$)'
        and coalesce(tradeline.account_number, '') ilike 'OUTCOME-SMOKE-ACCT-%'
    `,
    delete: (sql, cutoff) => sql`
      with deleted as (
        delete from public.tradeline tradeline
        using public.users user_row
        where user_row.id = tradeline.user_id
          and tradeline.created_at < ${cutoff}
          and lower(user_row.email) like 'outcome_smoke_%@example.test'
          and coalesce(user_row.display_name, '') ilike 'Synthetic OUTCOME_SMOKE_%'
          and coalesce(tradeline.notes, '') ~* '(^|[^a-z0-9])outcome[-_ ]smoke([^a-z0-9]|$)'
          and coalesce(tradeline.account_number, '') ilike 'OUTCOME-SMOKE-ACCT-%'
        returning 1
      )
      select count(*)::int as count from deleted
    `,
  },
  {
    id: "outcome_smoke_report_artifact",
    table: "report_artifact",
    criteria: "Report artifact is older than cutoff, storage_url is null, syntheticOutcomeSmoke marks it synthetic-only/no-real-consumer-data, and owner is an OUTCOME_SMOKE example.test user.",
    count: (sql, cutoff) => sql`
      select count(*)::int as count
      from public.report_artifact artifact
      join public.users user_row on user_row.id = artifact.user_id
      where artifact.created_at < ${cutoff}
        and artifact.storage_url is null
        and lower(user_row.email) like 'outcome_smoke_%@example.test'
        and coalesce(user_row.display_name, '') ilike 'Synthetic OUTCOME_SMOKE_%'
        and artifact.data @> '{"syntheticOutcomeSmoke":{"syntheticOnly":true,"containsRealConsumerData":false}}'::jsonb
        and coalesce(artifact.data -> 'syntheticOutcomeSmoke' ->> 'marker', '') ilike 'OUTCOME_SMOKE_%'
    `,
    delete: (sql, cutoff) => sql`
      with deleted as (
        delete from public.report_artifact artifact
        using public.users user_row
        where user_row.id = artifact.user_id
          and artifact.created_at < ${cutoff}
          and artifact.storage_url is null
          and lower(user_row.email) like 'outcome_smoke_%@example.test'
          and coalesce(user_row.display_name, '') ilike 'Synthetic OUTCOME_SMOKE_%'
          and artifact.data @> '{"syntheticOutcomeSmoke":{"syntheticOnly":true,"containsRealConsumerData":false}}'::jsonb
          and coalesce(artifact.data -> 'syntheticOutcomeSmoke' ->> 'marker', '') ilike 'OUTCOME_SMOKE_%'
        returning 1
      )
      select count(*)::int as count from deleted
    `,
  },
  {
    id: "outcome_smoke_creditor",
    table: "creditor",
    criteria: "Creditor is older than cutoff, has an OUTCOME_SMOKE_CREDITOR_ name, and is no longer referenced by tradelines.",
    count: (sql, cutoff) => sql`
      select count(*)::int as count
      from public.creditor creditor
      where creditor.created_at < ${cutoff}
        and creditor.name ilike 'OUTCOME_SMOKE_CREDITOR_%'
        and not exists (select 1 from public.tradeline tradeline where tradeline.creditor_id = creditor.id)
    `,
    delete: (sql, cutoff) => sql`
      with deleted as (
        delete from public.creditor creditor
        where creditor.created_at < ${cutoff}
          and creditor.name ilike 'OUTCOME_SMOKE_CREDITOR_%'
          and not exists (select 1 from public.tradeline tradeline where tradeline.creditor_id = creditor.id)
        returning 1
      )
      select count(*)::int as count from deleted
    `,
  },
  {
    id: "outcome_smoke_bureau",
    table: "bureau",
    criteria: "Bureau is older than cutoff, has an OUTCOME_SMOKE_BUREAU_ name, and is no longer referenced by tradelines.",
    count: (sql, cutoff) => sql`
      select count(*)::int as count
      from public.bureau bureau
      where bureau.created_at < ${cutoff}
        and bureau.name ilike 'OUTCOME_SMOKE_BUREAU_%'
        and not exists (select 1 from public.tradeline tradeline where tradeline.bureau_id = bureau.id)
    `,
    delete: (sql, cutoff) => sql`
      with deleted as (
        delete from public.bureau bureau
        where bureau.created_at < ${cutoff}
          and bureau.name ilike 'OUTCOME_SMOKE_BUREAU_%'
          and not exists (select 1 from public.tradeline tradeline where tradeline.bureau_id = bureau.id)
        returning 1
      )
      select count(*)::int as count from deleted
    `,
  },
];

export const CLEANUP_TARGET_SUMMARY = targets.map(({ id, table, criteria }) => ({ id, table, criteria }));

async function runCleanup(options, env = process.env) {
  const { value: databaseUrl, key: databaseUrlKey } = resolveDatabaseUrl(env);
  const databaseTarget = describeDatabaseTarget(databaseUrl);
  const environment = resolveCleanupEnvironment(env, databaseUrl);
  assertCleanupSafety({ environment, dangerouslyAllowProduction: options.dangerouslyAllowProduction });

  const cutoff = cutoffFromDays(options.olderThanDays);
  const mode = options.confirm ? "delete" : "count";
  const sql = postgres(databaseUrl, { prepare: false, max: 1, onnotice: () => undefined });

  try {
    const results = [];
    for (const target of targets) {
      results.push(await countOrDeleteTarget(sql, target, cutoff, mode));
    }

    const total = results.reduce((sum, result) => sum + result.count, 0);
    return {
      event: "test_data_cleanup",
      mode: options.confirm ? "confirmed-delete" : "dry-run",
      generatedAt: new Date().toISOString(),
      olderThanDays: options.olderThanDays,
      cutoff: cutoff.toISOString(),
      environment,
      database: {
        source: databaseUrlKey,
        host: databaseTarget.host,
        port: databaseTarget.port,
        database: databaseTarget.database,
      },
      totalMatchedRows: total,
      rowsByTable: results,
      protectedData: [
        "real user accounts",
        "real uploaded reports",
        "real dispute packets",
        "real findings",
        "audit/security/compliance logs unless explicitly test-marked",
        "legal/regulatory/rule/reference/admin configuration data",
        "parser mappings and rule definitions",
      ],
    };
  } finally {
    await sql.end({ timeout: 1 });
  }
}

function printHelp() {
  console.log([
    "Usage:",
    "  pnpm cleanup:test-data --dry-run",
    "  pnpm cleanup:test-data --confirm",
    "",
    "Options:",
    "  --dry-run                         Count rows only; no deletes.",
    "  --confirm                         Delete matching rows.",
    "  --older-than-days <days>           Minimum age; default and minimum is 10.",
    "  --dangerously-allow-production     Required even for dry-run if target appears production-like.",
    "  --json                            Print machine-readable JSON.",
    "",
    "Scope:",
    "  Deletes only explicitly test-marked operational queue rows and storage-less OUTCOME_SMOKE fixtures.",
    "  Does not delete real users, real uploaded reports, packets, findings, rules, parser mappings, or admin settings.",
  ].join("\n"));
}

function printHuman(result) {
  console.log(`Test data cleanup ${result.mode}`);
  console.log(`Environment: ${result.environment.kind} (${result.environment.reason})`);
  console.log(`Database: host=${result.database.host} port=${result.database.port} name=${result.database.database}`);
  console.log(`Cutoff: ${result.cutoff} (older than ${result.olderThanDays} days)`);
  console.log(`Total matched rows: ${result.totalMatchedRows}`);
  console.log("");
  console.log("Rows by table:");
  for (const row of result.rowsByTable) {
    const suffix = row.skipped ? " (table missing; skipped)" : "";
    console.log(`- ${row.table}: ${row.count}${suffix}`);
  }
}

async function main() {
  const options = parseCleanupArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const result = await runCleanup(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }
}

export { runCleanup };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
