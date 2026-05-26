import "../loadEnv.js";

import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rm, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const ENVIRONMENT_KEYS = ["CRP_ENV", "APP_ENV", "FLOOT_ENV", "DEPLOYMENT_ENV", "ENVIRONMENT", "VERCEL_ENV"];
const URL_ENVIRONMENT_KEYS = [
  "APP_BASE_URL",
  "PUBLIC_APP_URL",
  "SITE_URL",
  "BASE_URL",
  "VITE_APP_URL",
  "CRP_APP_URL",
  "PRODUCTION_APP_URL",
  "STAGING_APP_URL",
];
const CONTAINER_ENVIRONMENT_KEYS = ["CONTAINER_NAME", "DOCKER_CONTAINER_NAME", "CRP_CONTAINER_NAME", "SERVICE_NAME", "HOSTNAME"];
const DATABASE_URL_KEYS = ["FLOOT_DATABASE_URL", "DATABASE_URL", "DATABASE_PRIVATE_URL", "POSTGRES_URL", "CRP_DATABASE_URL"];
const PRODUCTION_DOMAIN_HOSTS = new Set(["creditregulatorpro.com", "www.creditregulatorpro.com"]);
const STAGING_DOMAIN_HOSTS = new Set(["staging.creditregulatorpro.com"]);
const ADMIN_PRESERVE_ROLES = ["admin", "super_admin"];
const LOCAL_NODE_ENV_VALUES = new Set(["development", "dev", "test"]);
const USER_REPORT_LIMIT = 200;
export const PLATFORM_RESET_CONFIRMATION_PHRASE = "RESET STAGING PLATFORM";
export const PLATFORM_RESET_PRODUCTION_DISABLED_MESSAGE = "Production environment detected. Platform reset is disabled in production.";

export const PRESERVED_SUBSYSTEMS = [
  "migrations and version metadata",
  "laws, regulations, statutes, obligations, rule definitions, and legal references",
  "parser mappings, parser training/corrections, parser rules, known entities, and canonical extraction intelligence",
  "exactly one configured admin/super_admin user and its password record in hard mode",
  "system settings, feature flags, and deterministic OCR/runtime configuration",
  "supported bureau and licensed collection agency reference mappings",
  "letter templates and platform content/configuration",
];

export const PRESERVED_TABLES = [
  "bureau",
  "creditor",
  "creditor_validation_requirement",
  "disclosure_requirement",
  "dynamic_scanning_rule",
  "enforcement_mechanism",
  "feature_flag",
  "federal_guidance",
  "industry_standard",
  "letter_template",
  "licensed_collection_agency",
  "obligation",
  "parser_bureau_detection_config",
  "parser_extraction_rule",
  "parser_field_mapping",
  "parser_known_entity",
  "parser_mapping_version",
  "parser_rule_candidate",
  "parser_test_case",
  "parser_test_training_archive",
  "regulation_reconciliation_candidate",
  "regulation_registry",
  "regulation_runtime_bridge_mapping",
  "regulation_source_scan",
  "regulation_update_candidate",
  "regulation_update_source",
  "regulation_violation_mapping",
  "regulatory_update_log",
  "software_version",
  "statute",
  "statute_version",
  "system_settings",
  "version_migration",
];

const SOFT_RESET_TABLES = [
  "response_admin_review_event",
  "response_processing_event",
  "bureau_response_event",
  "response_processing_job_event",
  "response_processing_job",
  "response_worker_orchestration_event",
  "response_worker_orchestration_run",
  "response_processing_lifecycle_event",
  "compliance_config",
  "ingest_processing_job_event",
  "ingest_processing_job",
  "ingest_processing_worker_heartbeat",
  "finding_outcome",
  "outcome_comparison_run",
  "packet_compliance_audit",
  "packet_impact_assessment",
  "deadline_event",
  "evidence_attachment",
  "evidence_event",
  "postal_transaction",
  "obligation_challenge_log",
  "discrimination_claim",
  "success_metric",
  "metro2_validation_log",
  "violation_training_example",
  "violation_regulation_reference",
  "violation_correction_evidence",
  "violation_correction",
  "dispute_packet_findings",
  "packet",
  "creditor_obligation_test",
  "obligation_instance",
  "bankruptcy_record",
  "identity_theft_freeze",
  "pass_a_edit_log",
  "pass_extraction",
  "report_consumer_statement",
  "report_consumer_info",
  "report_credit_score",
  "report_employment_info",
  "report_inquiry",
  "report_public_record",
  "tradeline_payment_history_detail",
  "tradeline_payment_history",
  "tradeline_artifact_presence",
  "tradeline_snapshot",
  "tradeline",
  "report_artifact",
  "parser_test_run",
  "beta_issue_report",
  "lead_reminder",
  "ai_assist_run",
  "support_ticket_message",
  "support_ticket",
  "regulatory_notification",
  "suspicious_activity_log",
  "audit_log",
  "sessions",
  "email_verification_tokens",
  "password_reset_tokens",
  "oauth_accounts",
  "oauth_states",
  "login_attempts",
  "rate_limit_entry",
];

const HARD_RESET_TABLES = [
  { table: "consumer_identification_document", where: `user_id in (select id from public.users where ${buildDeletedUserPredicate("hard", [])})` },
  { table: "consumer_signature", where: `user_id in (select id from public.users where ${buildDeletedUserPredicate("hard", [])})` },
  { table: "subscriptions", where: `user_id in (select id from public.users where ${buildDeletedUserPredicate("hard", [])})` },
  { table: "user_account", where: `user_id in (select id from public.users where ${buildDeletedUserPredicate("hard", [])})` },
  { table: "user_passwords", where: `user_id in (select id from public.users where ${buildDeletedUserPredicate("hard", [])})` },
  { table: "users", where: buildDeletedUserPredicate("hard", []) },
  {
    table: "organizations",
    where: `not exists (select 1 from public.users where users.organization_id = organizations.id and (${buildPreservedUserPredicate("hard", [])}))`,
  },
];

const RESET_FILE_TARGETS = [
  { id: "local_report_artifacts", relativePath: ".local/document-storage/report-artifacts" },
  { id: "local_packet_pdfs", relativePath: ".local/document-storage/packet-pdfs" },
  { id: "local_packet_exports", relativePath: ".local/document-storage/packets" },
  { id: "default_report_artifacts", relativePath: "document-storage/report-artifacts" },
  { id: "default_packet_pdfs", relativePath: "document-storage/packet-pdfs" },
  { id: "default_packet_exports", relativePath: "document-storage/packets" },
  { id: "generated_pdf_output", relativePath: "output/pdf" },
  { id: "mock_lifecycle_runs", relativePath: ".local/test-runs" },
  { id: "beta_testing_hub_logs", relativePath: ".local/beta-testing-hub" },
  { id: "ocr_temp", relativePath: ".local/ocr-temp" },
  { id: "parser_temp", relativePath: ".local/parser-temp" },
  { id: "upload_cache", relativePath: ".local/upload-cache" },
];

const STORAGE_REFERENCE_COLUMNS = [
  { table: "report_artifact", column: "storage_url", area: "report_artifact" },
  { table: "evidence_attachment", column: "storage_url", area: "evidence_attachment" },
  { table: "packet", column: "pdf_storage_url", area: "packet_pdf" },
  { table: "consumer_identification_document", column: "storage_url", area: "consumer_identification_document" },
];

const REQUIRED_RULE_TABLES = [
  "system_settings",
  "software_version",
  "statute",
  "statute_version",
  "obligation",
  "disclosure_requirement",
  "dynamic_scanning_rule",
  "feature_flag",
  "licensed_collection_agency",
];

function fail(message) {
  throw new Error(message);
}

function isSafeIdentifier(identifier) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier);
}

function quoteIdentifier(identifier) {
  if (!isSafeIdentifier(identifier)) fail(`Unsafe SQL identifier: ${identifier}`);
  return `"${identifier}"`;
}

function tableRef(table) {
  return `public.${quoteIdentifier(table)}`;
}

function sqlStringLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlInList(values) {
  const normalized = normalizeEmailList(values);
  if (normalized.length === 0) return null;
  return normalized.map(sqlStringLiteral).join(", ");
}

export function parseEmailAllowlist(value) {
  if (Array.isArray(value)) return normalizeEmailList(value);
  return normalizeEmailList(String(value ?? "").split(/[,\s;]+/u));
}

function normalizeEmailList(values) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => String(value ?? "").split(/[,\s;]+/u))
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function rolePredicate(roles) {
  const normalizedRoles = roles.map((role) => String(role).toLowerCase());
  return `lower(coalesce(role::text, '')) in (${normalizedRoles.map(sqlStringLiteral).join(", ")})`;
}

function buildAllowedEmailPredicate(emails) {
  const emailList = sqlInList(emails);
  return emailList ? `lower(email) in (${emailList})` : null;
}

export function buildPreservedUserPredicate(scope = "soft", preserveAdminEmails = []) {
  if (scope === "soft") return "true";
  const emailPredicate = buildAllowedEmailPredicate(preserveAdminEmails);
  if (!emailPredicate) return "false";
  return `(${rolePredicate(ADMIN_PRESERVE_ROLES)}) and (${emailPredicate})`;
}

export function buildDeletedUserPredicate(scope = "soft", preserveAdminEmails = []) {
  return `not (${buildPreservedUserPredicate(scope, preserveAdminEmails)})`;
}

function userSubquery(scope, preserveAdminEmails) {
  return `select id from public.users where ${buildDeletedUserPredicate(scope, preserveAdminEmails)}`;
}

function buildUserCleanupTableSteps(scope, preserveAdminEmails) {
  const deletedUsers = userSubquery(scope, preserveAdminEmails);
  const preservedUsers = buildPreservedUserPredicate(scope, preserveAdminEmails);
  return [
    { table: "consumer_identification_document", where: `user_id in (${deletedUsers})`, action: "delete_deleted_user_related", resetIdentity: true },
    { table: "consumer_signature", where: `user_id in (${deletedUsers})`, action: "delete_deleted_user_related", resetIdentity: true },
    { table: "subscriptions", where: `user_id in (${deletedUsers})`, action: "delete_deleted_user_related", resetIdentity: true },
    { table: "user_account", where: `user_id in (${deletedUsers})`, action: "delete_deleted_user_related", resetIdentity: true },
    { table: "user_passwords", where: `user_id in (${deletedUsers})`, action: "delete_deleted_user_auth", resetIdentity: false },
    { table: "users", where: buildDeletedUserPredicate(scope, preserveAdminEmails), action: "delete_deleted_users", resetIdentity: true },
    {
      table: "organizations",
      where: `not exists (select 1 from public.users where users.organization_id = organizations.id and (${preservedUsers}))`,
      action: "delete_unowned_organizations",
      resetIdentity: true,
    },
  ];
}

export function parseResetArgs(args) {
  const options = {
    execution: "dry-run",
    resetScope: "soft",
    confirm: false,
    confirmEnv: null,
    json: false,
    baseUrl: process.env.CRP_PLATFORM_RESET_BASE_URL || "http://localhost:5175",
    requireHttpValidation: false,
    preserveAdminEmails: parseEmailAllowlist(process.env.RESET_PRESERVE_ADMIN_EMAILS || ""),
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") return { ...options, help: true };
    if (arg === "--dry-run") {
      options.execution = "dry-run";
      continue;
    }
    if (arg === "--soft") {
      options.execution = "apply";
      options.resetScope = "soft";
      continue;
    }
    if (arg === "--hard") {
      options.execution = "apply";
      options.resetScope = "hard";
      continue;
    }
    if (arg === "--preview-hard") {
      options.execution = "dry-run";
      options.resetScope = "hard";
      continue;
    }
    if (arg === "--confirm-env") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) fail("--confirm-env requires local or staging.");
      options.confirmEnv = value.trim().toLowerCase();
      index += 1;
      continue;
    }
    if (arg === "--confirm") {
      options.confirm = true;
      continue;
    }
    if (arg === "--preserve-admin-email") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) fail("--preserve-admin-email requires an email address.");
      options.preserveAdminEmails = normalizeEmailList([...options.preserveAdminEmails, value]);
      index += 1;
      continue;
    }
    if (arg === "--base-url") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) fail("--base-url requires a URL.");
      options.baseUrl = value;
      index += 1;
      continue;
    }
    if (arg === "--require-http-validation") {
      options.requireHttpValidation = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    fail(`Unknown option: ${arg}`);
  }

  if (!["local", "staging"].includes(options.confirmEnv || "")) {
    fail("Explicit environment confirmation is required: --confirm-env local or --confirm-env staging.");
  }
  if (options.execution === "apply" && !options.confirm) {
    fail("Destructive platform reset requires --confirm.");
  }

  return options;
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

function normalizedSignalValues(env, keys) {
  return keys
    .map((key) => ({ key, value: String(env[key] ?? "").trim().toLowerCase() }))
    .filter((entry) => entry.value);
}

function normalizedNodeEnv(env) {
  return String(env.NODE_ENV ?? "").trim().toLowerCase();
}

function signatureIncludesProduction(value) {
  const lowered = String(value ?? "").toLowerCase();
  if (lowered.includes("staging")) return false;
  return lowered.includes("creditregulatorpro-prod") || lowered.includes("production") || /(^|[^a-z])prod([^a-z]|$)/.test(lowered);
}

function signatureIncludesStaging(value) {
  return String(value ?? "").toLowerCase().includes("staging");
}

function urlHostFromSignal(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return parsed.hostname.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function urlSignalIndicatesProduction(entry) {
  const host = urlHostFromSignal(entry.value);
  return PRODUCTION_DOMAIN_HOSTS.has(host) || signatureIncludesProduction(entry.value) || signatureIncludesProduction(host);
}

function urlSignalIndicatesStaging(entry) {
  const host = urlHostFromSignal(entry.value);
  return STAGING_DOMAIN_HOSTS.has(host) || signatureIncludesStaging(entry.value) || signatureIncludesStaging(host);
}

function containerSignalIndicatesProduction(entry) {
  const value = String(entry.value ?? "").toLowerCase();
  if (!value || signatureIncludesStaging(value)) return false;
  return value === "creditregulatorpro-app" || signatureIncludesProduction(value);
}

function containerSignalIndicatesStaging(entry) {
  return signatureIncludesStaging(entry.value);
}

export function resolveResetEnvironment(env = process.env, databaseUrl = "") {
  const target = databaseUrl ? describeDatabaseTarget(databaseUrl) : null;
  const dbSignature = target ? `${target.host} ${target.database}`.toLowerCase() : "";
  const environmentValues = normalizedEnvironmentValues(env);
  const urlValues = normalizedSignalValues(env, URL_ENVIRONMENT_KEYS);
  const containerValues = normalizedSignalValues(env, CONTAINER_ENVIRONMENT_KEYS);
  const nodeEnv = normalizedNodeEnv(env);
  const isLocalDatabase = target ? LOCAL_DB_HOSTS.has(target.host.toLowerCase()) : false;

  if (signatureIncludesProduction(dbSignature)) {
    return { kind: "production", reason: "Database host or name appears production-like." };
  }

  for (const { key, value } of environmentValues) {
    if (value === "production" || value === "prod" || signatureIncludesProduction(value)) {
      return { kind: "production", reason: `${key} indicates production.` };
    }
  }

  const productionUrl = urlValues.find(urlSignalIndicatesProduction);
  if (productionUrl) {
    return { kind: "production", reason: `${productionUrl.key} points to the production domain.` };
  }

  const productionContainer = containerValues.find(containerSignalIndicatesProduction);
  if (productionContainer) {
    return { kind: "production", reason: `${productionContainer.key} indicates the production container.` };
  }

  const stagingEnvironment = environmentValues.find(({ value }) => signatureIncludesStaging(value));
  if (stagingEnvironment) {
    return { kind: "staging", reason: `${stagingEnvironment.key} indicates staging.` };
  }

  if (environmentValues.some(({ value }) => ["local", "development", "dev", "test"].includes(value))) {
    return { kind: "local", reason: "Environment indicates local/development/test." };
  }

  if (isLocalDatabase && LOCAL_NODE_ENV_VALUES.has(nodeEnv)) {
    return { kind: "local", reason: "Database host is local and NODE_ENV indicates development/test." };
  }

  const stagingUrl = urlValues.find(urlSignalIndicatesStaging);
  if (stagingUrl) {
    return { kind: "staging", reason: `${stagingUrl.key} points to staging.` };
  }

  const stagingContainer = containerValues.find(containerSignalIndicatesStaging);
  if (stagingContainer) {
    return { kind: "staging", reason: `${stagingContainer.key} indicates staging.` };
  }

  if (dbSignature.includes("staging")) {
    return { kind: "staging", reason: "Database target indicates staging." };
  }

  if (isLocalDatabase) {
    return { kind: "local", reason: "Database host is local." };
  }

  if (nodeEnv === "staging") {
    return { kind: "staging", reason: "NODE_ENV indicates staging." };
  }

  if (nodeEnv === "production") {
    return { kind: "production", reason: "NODE_ENV indicates production and no staging/local signal was detected." };
  }

  return { kind: "unknown", reason: "Unable to determine local, staging, or production from environment and database target." };
}

export function assertResetSafety({ environment, confirmEnv, allowProductionDangerousOverride = false }) {
  if (environment.kind === "production" && !allowProductionDangerousOverride) {
    fail(`${PLATFORM_RESET_PRODUCTION_DISABLED_MESSAGE} ${environment.reason}`);
  }
  if (environment.kind === "unknown") fail(`Refusing platform reset because the environment is unknown: ${environment.reason}`);
  if (environment.kind !== confirmEnv) {
    fail(`Environment confirmation mismatch: detected ${environment.kind}, received ${confirmEnv}.`);
  }
}

function resolveDatabaseUrl(env = process.env) {
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

export function buildResetRuntimeDiagnostics(runtime, reason = "") {
  const storageProvider =
    typeof runtime?.storage?.provider === "string"
      ? runtime.storage.provider
      : String(runtime?.storage?.provider?.provider ?? "(unknown)");
  const storageRoot = String(runtime?.storage?.root ?? runtime?.storage?.configuredPath ?? "(unknown)");
  return {
    detectedEnvironment: String(runtime?.environment?.kind ?? "unknown"),
    databaseHost: String(runtime?.database?.host ?? "(unknown)"),
    databaseName: String(runtime?.database?.database ?? "(unknown)"),
    storageProvider,
    storageRoot,
    reason: String(reason || runtime?.environment?.reason || ""),
  };
}

export function detectResetRuntimeContext(env = process.env) {
  const { key: databaseUrlKey, value: databaseUrl } = resolveDatabaseUrl(env);
  const database = describeDatabaseTarget(databaseUrl);
  const environment = resolveResetEnvironment(env, databaseUrl);
  const context = {
    database: {
      source: databaseUrlKey,
      host: database.host,
      port: database.port,
      database: database.database,
    },
    environment,
    storage: storageProviderSummary(env),
  };
  return {
    ...context,
    diagnostics: buildResetRuntimeDiagnostics(context),
  };
}

function assertExpectedDatabaseTarget(actual, expected) {
  if (!expected) return;
  const mismatches = [];
  for (const key of ["source", "host", "database"]) {
    if (expected[key] && String(expected[key]) !== String(actual[key])) {
      mismatches.push(`${key}: expected ${expected[key]}, actual ${actual[key]}`);
    }
  }
  if (expected.port && String(expected.port) !== String(actual.port)) {
    mismatches.push(`port: expected ${expected.port}, actual ${actual.port}`);
  }
  if (mismatches.length > 0) {
    fail(`Platform reset database target changed since dry-run: ${mismatches.join("; ")}`);
  }
}

function auditLogWhereClause(preserveAuditLogIds = []) {
  const ids = preserveAuditLogIds
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return null;
  return `id not in (${ids.join(", ")})`;
}

export function buildResetPlan(scope = "soft", options = {}) {
  if (!["soft", "hard"].includes(scope)) fail(`Unsupported reset scope: ${scope}`);
  const preserveAdminEmails = normalizeEmailList(options.preserveAdminEmails ?? []);
  const preserveAuditLogIds = options.preserveAuditLogIds ?? [];
  const auditWhere = auditLogWhereClause(preserveAuditLogIds);
  const tableSteps = SOFT_RESET_TABLES.map((table) => ({
    table,
    where: table === "audit_log" ? auditWhere : null,
    action: table === "audit_log" && auditWhere ? "delete_all_except_platform_reset_audit" : "delete_all",
    resetIdentity: true,
  }));

  if (scope === "hard") {
    tableSteps.push(...buildUserCleanupTableSteps(scope, preserveAdminEmails));
  }

  return {
    scope,
    tableSteps,
    fileTargets: RESET_FILE_TARGETS,
    preservedTables: PRESERVED_TABLES,
    preservedSubsystems: PRESERVED_SUBSYSTEMS,
    preserveAdminEmails,
    preserveAuditLogIds,
    userPreservePredicate: buildPreservedUserPredicate(scope, preserveAdminEmails),
    userDeletePredicate: buildDeletedUserPredicate(scope, preserveAdminEmails),
    deletesUsers: scope === "hard",
  };
}

async function tableExists(sql, table) {
  const rows = await sql`select to_regclass(${`public.${table}`})::text as name`;
  return Boolean(rows[0]?.name);
}

async function hasColumn(sql, table, column) {
  const rows = await sql`
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${table}
      and column_name = ${column}
    limit 1
  `;
  return rows.length > 0;
}

async function countRows(sql, step) {
  if (!(await tableExists(sql, step.table))) {
    return { table: step.table, skipped: true, count: 0, reason: "table missing" };
  }
  const query = step.where
    ? `select count(*)::int as count from ${tableRef(step.table)} where ${step.where}`
    : `select count(*)::int as count from ${tableRef(step.table)}`;
  const rows = await sql.unsafe(query);
  return { table: step.table, skipped: false, count: Number(rows[0]?.count ?? 0), action: step.action };
}

async function deleteRows(sql, step) {
  if (!(await tableExists(sql, step.table))) {
    return { table: step.table, skipped: true, count: 0, reason: "table missing" };
  }
  const query = step.where
    ? `with deleted as (delete from ${tableRef(step.table)} where ${step.where} returning 1) select count(*)::int as count from deleted`
    : `with deleted as (delete from ${tableRef(step.table)} returning 1) select count(*)::int as count from deleted`;
  const rows = await sql.unsafe(query);
  return { table: step.table, skipped: false, count: Number(rows[0]?.count ?? 0), action: step.action };
}

async function countUpdate(sql, statement) {
  if (!(await tableExists(sql, statement.table))) {
    return { table: statement.table, column: statement.column, skipped: true, count: 0, reason: "table missing" };
  }
  if (!(await hasColumn(sql, statement.table, statement.column))) {
    return { table: statement.table, column: statement.column, skipped: true, count: 0, reason: "column missing" };
  }
  const rows = await sql.unsafe(
    `select count(*)::int as count from ${tableRef(statement.table)} where ${quoteIdentifier(statement.column)} is not null`,
  );
  return { table: statement.table, column: statement.column, skipped: false, count: Number(rows[0]?.count ?? 0), action: statement.action };
}

async function runUpdate(sql, statement) {
  if (!(await tableExists(sql, statement.table))) {
    return { table: statement.table, column: statement.column, skipped: true, count: 0, reason: "table missing" };
  }
  if (!(await hasColumn(sql, statement.table, statement.column))) {
    return { table: statement.table, column: statement.column, skipped: true, count: 0, reason: "column missing" };
  }
  const rows = await sql.unsafe(
    `with updated as (update ${tableRef(statement.table)} set ${quoteIdentifier(statement.column)} = null where ${quoteIdentifier(statement.column)} is not null returning 1) select count(*)::int as count from updated`,
  );
  return { table: statement.table, column: statement.column, skipped: false, count: Number(rows[0]?.count ?? 0), action: statement.action };
}

function allowMultiplePreservedAdminsFromEnv(env = process.env) {
  return String(env.RESET_ALLOW_MULTIPLE_PRESERVED_ADMINS ?? "").trim().toLowerCase() === "true";
}

export function validateCanonicalAdminPreservationSummary({
  scope = "soft",
  usersTableMissing = false,
  preserveAdminEmails = [],
  preservedAdminCount = 0,
  preservedUserCount = 0,
  allowMultiplePreservedAdmins = false,
} = {}) {
  if (scope !== "hard") return;
  if (usersTableMissing) fail("Hard platform reset requires a users table to preserve exactly one admin.");
  if (normalizeEmailList(preserveAdminEmails).length < 1) {
    fail("Hard platform reset requires RESET_PRESERVE_ADMIN_EMAILS to identify exactly one admin email.");
  }
  if (preservedAdminCount < 1) {
    fail("Hard platform reset would leave zero admins from RESET_PRESERVE_ADMIN_EMAILS.");
  }
  if (preservedAdminCount > 1 && !allowMultiplePreservedAdmins) {
    fail(
      "Hard platform reset would preserve more than one admin; configure exactly one RESET_PRESERVE_ADMIN_EMAILS value or set RESET_ALLOW_MULTIPLE_PRESERVED_ADMINS=true.",
    );
  }
  if (!allowMultiplePreservedAdmins && preservedUserCount !== 1) {
    fail(`Hard platform reset must preserve exactly one user row; planned preserved users=${preservedUserCount}.`);
  }
  if (allowMultiplePreservedAdmins && preservedUserCount !== preservedAdminCount) {
    fail("Hard platform reset would preserve non-admin or non-allowlisted user rows.");
  }
}

async function resolveAdminUsers(sql, preserveAdminEmails = []) {
  if (!(await tableExists(sql, "users"))) return null;
  const emailPredicate = buildAllowedEmailPredicate(preserveAdminEmails);
  const predicate = emailPredicate
    ? `(${rolePredicate(ADMIN_PRESERVE_ROLES)}) and (${emailPredicate})`
    : rolePredicate(ADMIN_PRESERVE_ROLES);
  const rows = await sql.unsafe(`
    select id::bigint as id, email, role::text as role
    from public.users
    where ${predicate}
    order by
      case when lower(coalesce(role::text, '')) in (${ADMIN_PRESERVE_ROLES.map(sqlStringLiteral).join(", ")}) then 0 else 1 end,
      id asc
  `);
  return rows.map((row) => ({ id: Number(row.id), email: row.email, role: row.role }));
}

async function assertAdminAccessRows(sql, preserveAdminEmails = []) {
  const admins = await resolveAdminUsers(sql, preserveAdminEmails);
  if (!admins || admins.length < 1) fail("Platform reset requires at least one preserved admin user before and after reset.");

  if (await tableExists(sql, "user_passwords")) {
    for (const admin of admins) {
      const rows = await sql`
        select count(*)::int as count
        from public.user_passwords
        where user_id = ${admin.id}
      `;
      if (Number(rows[0]?.count ?? 0) < 1) {
        fail(`Admin user ${admin.email} has no user_passwords row; refusing reset because admin login may not work.`);
      }
    }
  }

  return admins;
}

async function userReferenceUpdates(sql, resetSteps, deleteUserWhere, preserveAdminEmails) {
  const admins = await resolveAdminUsers(sql, preserveAdminEmails);
  const admin = admins?.[0] ?? null;
  if (!admin) fail("Reset requires an admin user to preserve/reassign protected references.");

  const refs = await sql`
    select
      tc.table_name,
      kcu.column_name,
      cols.is_nullable
    from information_schema.table_constraints as tc
    join information_schema.key_column_usage as kcu
      on tc.constraint_name = kcu.constraint_name
      and tc.table_schema = kcu.table_schema
    join information_schema.constraint_column_usage as ccu
      on ccu.constraint_name = tc.constraint_name
      and ccu.table_schema = tc.table_schema
    join information_schema.columns as cols
      on cols.table_schema = tc.table_schema
      and cols.table_name = tc.table_name
      and cols.column_name = kcu.column_name
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and ccu.table_name = 'users'
    order by tc.table_name, kcu.column_name
  `;

  const updates = [];
  const blockers = [];
  const resetStepByTable = new Map(resetSteps.map((step) => [step.table, step]));

  for (const ref of refs) {
    const table = ref.table_name;
    const column = ref.column_name;
    if (table === "users") continue;

    const resetStep = resetStepByTable.get(table);
    const predicate = `${quoteIdentifier(column)} in (select id from public.users where ${deleteUserWhere})`;
    const stepDeletesAllRows = resetStep && !resetStep.where;
    const stepDeletesThisUserColumn = Boolean(
      resetStep?.where && resetStep.where.includes(`${column} in (select id from public.users where`),
    );
    if (stepDeletesAllRows || stepDeletesThisUserColumn) continue;

    if (ref.is_nullable === "YES") {
      updates.push({
        table,
        column,
        action: "nullify_deleted_user_reference",
        countSql: `select count(*)::int as count from ${tableRef(table)} where ${predicate}`,
        runSql: `with updated as (update ${tableRef(table)} set ${quoteIdentifier(column)} = null where ${predicate} returning 1) select count(*)::int as count from updated`,
      });
      continue;
    }

    if (table === "parser_test_case" && column === "created_by") {
      updates.push({
        table,
        column,
        action: "reassign_deleted_user_reference_to_admin",
        countSql: `select count(*)::int as count from ${tableRef(table)} where ${predicate}`,
        runSql: `with updated as (update ${tableRef(table)} set ${quoteIdentifier(column)} = ${admin.id} where ${predicate} returning 1) select count(*)::int as count from updated`,
      });
      continue;
    }

    blockers.push(`${table}.${column}`);
  }

  if (blockers.length > 0) {
    fail(`Reset would leave protected non-null user references unresolved: ${blockers.join(", ")}`);
  }

  return updates;
}

async function runDynamicUpdates(sql, updates, dryRun) {
  const results = [];
  for (const update of updates) {
    const rows = await sql.unsafe(dryRun ? update.countSql : update.runSql);
    results.push({
      table: update.table,
      column: update.column,
      action: update.action,
      count: Number(rows[0]?.count ?? 0),
      skipped: false,
    });
  }
  return results;
}

function userReason(user, scope, preserveAdminEmails, preserved) {
  const role = String(user.role ?? "").toLowerCase();
  const email = String(user.email ?? "").toLowerCase();
  if (preserved) {
    if (scope === "soft") return "soft_mode_preserves_users";
    if (ADMIN_PRESERVE_ROLES.includes(role) && preserveAdminEmails.includes(email)) return "configured_admin_email";
    return "preserved_by_predicate";
  }
  if (scope === "hard" && ADMIN_PRESERVE_ROLES.includes(role)) return "admin_not_in_reset_allowlist";
  return scope === "hard" ? "non_preserved_user" : "non_admin_operational_user";
}

function serializeUserRow(row, scope, preserveAdminEmails, preserved) {
  return {
    id: Number(row.id),
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at,
    reason: userReason(row, scope, preserveAdminEmails, preserved),
  };
}

async function buildUserPlan(sql, plan) {
  if (!(await tableExists(sql, "users"))) {
    return {
      usersTableMissing: true,
      preservedUsers: [],
      deletedUsers: [],
      preservedCount: 0,
      deletedCount: 0,
      reportLimit: USER_REPORT_LIMIT,
    };
  }

  const preservedCountRows = await sql.unsafe(`select count(*)::int as count from public.users where ${plan.userPreservePredicate}`);
  const deletedCountRows = await sql.unsafe(`select count(*)::int as count from public.users where ${plan.userDeletePredicate}`);
  const columns = `id::bigint as id, email, display_name, role::text as role, created_at::text as created_at`;
  const preservedRows = await sql.unsafe(`
    select ${columns}
    from public.users
    where ${plan.userPreservePredicate}
    order by lower(coalesce(role::text, '')), lower(email)
    limit ${USER_REPORT_LIMIT}
  `);
  const deletedRows = await sql.unsafe(`
    select ${columns}
    from public.users
    where ${plan.userDeletePredicate}
    order by lower(coalesce(role::text, '')), lower(email)
    limit ${USER_REPORT_LIMIT}
  `);

  return {
    usersTableMissing: false,
    preservedUsers: preservedRows.map((row) => serializeUserRow(row, plan.scope, plan.preserveAdminEmails, true)),
    deletedUsers: deletedRows.map((row) => serializeUserRow(row, plan.scope, plan.preserveAdminEmails, false)),
    preservedCount: Number(preservedCountRows[0]?.count ?? 0),
    deletedCount: Number(deletedCountRows[0]?.count ?? 0),
    reportLimit: USER_REPORT_LIMIT,
  };
}

async function buildAdminPreservationPlan(sql, plan, userPlan, allowMultiplePreservedAdmins) {
  const empty = {
    configuredAdminEmails: plan.preserveAdminEmails,
    allowMultiplePreservedAdmins,
    preservedAdminCount: 0,
    preservedAdminEmails: [],
    requiresExactlyOneAdmin: plan.scope === "hard" && !allowMultiplePreservedAdmins,
  };
  if (plan.scope !== "hard" || userPlan.usersTableMissing) return empty;
  const emailPredicate = buildAllowedEmailPredicate(plan.preserveAdminEmails);
  if (!emailPredicate || !(await tableExists(sql, "users"))) return empty;
  const rows = await sql.unsafe(`
    select id::bigint as id, email, role::text as role
    from public.users
    where (${rolePredicate(ADMIN_PRESERVE_ROLES)}) and (${emailPredicate})
    order by lower(email), id asc
  `);
  return {
    ...empty,
    preservedAdminCount: rows.length,
    preservedAdminEmails: rows.map((row) => String(row.email ?? "").toLowerCase()),
  };
}

async function countOperationalRows(sql, tables) {
  const results = [];
  for (const table of tables) {
    if (!(await tableExists(sql, table))) {
      results.push({ table, skipped: true, count: 0, reason: "table missing" });
      continue;
    }
    const rows = await sql.unsafe(`select count(*)::int as count from ${tableRef(table)}`);
    results.push({ table, skipped: false, count: Number(rows[0]?.count ?? 0) });
  }
  return results;
}

function getStorageRoot(env = process.env) {
  return path.resolve(
    process.cwd(),
    env.LOCAL_DOCUMENT_STORAGE_PATH ||
      env.DOCUMENT_STORAGE_PATH ||
      "document-storage",
  );
}

function storageProviderSummary(env = process.env) {
  const configured = env.LOCAL_DOCUMENT_STORAGE_PATH || env.DOCUMENT_STORAGE_PATH || "document-storage";
  return {
    provider: "local_file_storage",
    configuredPath: configured,
    root: getStorageRoot(env),
  };
}

function objectNameFromLocalStorageUrl(storageUrl) {
  if (typeof storageUrl !== "string" || !storageUrl.startsWith("local:")) return null;
  const objectName = storageUrl.slice("local:".length);
  return objectName || null;
}

function safeStorageObjectPath(storageRoot, objectName) {
  const normalizedName = objectName.replace(/\\/g, "/");
  const relativePath = path.normalize(normalizedName);
  if (
    path.isAbsolute(relativePath) ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`)
  ) {
    fail(`Unsafe storage object path: ${objectName}`);
  }
  const fullPath = path.resolve(storageRoot, relativePath);
  if (fullPath !== storageRoot && !fullPath.startsWith(`${storageRoot}${path.sep}`)) {
    fail(`Unsafe storage object path: ${objectName}`);
  }
  return fullPath;
}

async function collectStorageReferences(sql, plan) {
  const references = [];
  const resetStepByTable = new Map(plan.tableSteps.map((step) => [step.table, step]));
  for (const ref of STORAGE_REFERENCE_COLUMNS) {
    const resetStep = resetStepByTable.get(ref.table);
    if (!resetStep) continue;
    if (!(await tableExists(sql, ref.table))) continue;
    if (!(await hasColumn(sql, ref.table, ref.column))) continue;
    const rowScope = resetStep.where ? `and (${resetStep.where})` : "";
    const rows = await sql.unsafe(`
      select ${quoteIdentifier(ref.column)} as storage_url, count(*)::int as count
      from ${tableRef(ref.table)}
      where ${quoteIdentifier(ref.column)} is not null
        and ${quoteIdentifier(ref.column)} <> ''
        ${rowScope}
      group by ${quoteIdentifier(ref.column)}
      order by count(*) desc
    `);
    for (const row of rows) {
      references.push({
        table: ref.table,
        column: ref.column,
        area: ref.area,
        storageUrl: row.storage_url,
        count: Number(row.count ?? 0),
      });
    }
  }
  return references;
}

async function inspectStorageReferences(references, env = process.env) {
  const provider = storageProviderSummary(env);
  const byArea = new Map();
  const notFound = [];
  const unsupported = [];
  const readable = [];
  const failures = [];

  for (const reference of references) {
    const current = byArea.get(reference.area) ?? { area: reference.area, references: 0, rows: 0 };
    current.references += 1;
    current.rows += reference.count;
    byArea.set(reference.area, current);

    const objectName = objectNameFromLocalStorageUrl(reference.storageUrl);
    if (!objectName) {
      unsupported.push({ ...reference, reason: "unsupported_storage_reference" });
      continue;
    }

    try {
      await access(safeStorageObjectPath(provider.root, objectName));
      readable.push({ ...reference, objectName });
    } catch (error) {
      if (error?.code === "ENOENT") {
        notFound.push({ ...reference, objectName, status: "storage_read_failed:not_found" });
      } else {
        failures.push({
          ...reference,
          objectName,
          status: "storage_read_failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {
    provider,
    byArea: Array.from(byArea.values()),
    totalReferences: references.length,
    totalRows: references.reduce((sum, reference) => sum + reference.count, 0),
    localReadable: readable.length,
    localReferences: readable,
    unsupportedReferences: unsupported,
    notFoundReferences: notFound,
    failedReferences: failures,
  };
}

async function runStorageHealthCheck(env = process.env) {
  const provider = storageProviderSummary(env);
  const objectName = `.platform-reset-health/${randomUUID()}.txt`;
  const filePath = safeStorageObjectPath(provider.root, objectName);
  const payload = Buffer.from(`platform-reset-health:${new Date().toISOString()}`, "utf8");
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, payload);
  const readBack = await readFile(filePath);
  if (!readBack.equals(payload)) {
    throw new Error("Storage health check read did not match written sentinel.");
  }
  await unlink(filePath);
  return {
    provider: provider.provider,
    root: provider.root,
    status: "pass",
    operations: ["write", "read", "delete"],
  };
}

async function deleteInspectedStorageReferences(storageReferences, env = process.env) {
  const provider = storageProviderSummary(env);
  const deleted = [];
  const notFound = [];
  const failures = [];
  const unsupported = [];

  for (const reference of storageReferences) {
    const objectName = objectNameFromLocalStorageUrl(reference.storageUrl);
    if (!objectName) {
      unsupported.push({ ...reference, status: "storage_delete_skipped:unsupported_reference" });
      continue;
    }
    try {
      await unlink(safeStorageObjectPath(provider.root, objectName));
      deleted.push({ ...reference, objectName, status: "deleted" });
    } catch (error) {
      if (error?.code === "ENOENT") {
        notFound.push({ ...reference, objectName, status: "storage_read_failed:not_found" });
      } else {
        failures.push({
          ...reference,
          objectName,
          status: "storage_delete_failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {
    deletedCount: deleted.length,
    deleted,
    notFoundReferences: notFound,
    unsupportedReferences: unsupported,
    failedReferences: failures,
  };
}

async function resetIdentity(sql, table, dryRun) {
  if (!(await tableExists(sql, table))) return { table, skipped: true, reason: "table missing" };
  if (!(await hasColumn(sql, table, "id"))) return { table, skipped: true, reason: "id column missing" };

  const sequenceRows = await sql`select pg_get_serial_sequence(${`public.${table}`}, 'id') as sequence_name`;
  const sequenceName = sequenceRows[0]?.sequence_name;
  if (!sequenceName) return { table, skipped: true, reason: "no serial identity sequence" };

  const maxRows = await sql.unsafe(`select coalesce(max(id), 0)::bigint as max_id from ${tableRef(table)}`);
  const nextValue = Math.max(Number(maxRows[0]?.max_id ?? 0) + 1, 1);
  if (!dryRun) {
    await sql`select setval(${sequenceName}::regclass, ${nextValue}, false)`;
  }
  return { table, skipped: false, nextValue, action: dryRun ? "would_reset_identity" : "reset_identity" };
}

async function collectFiles(targetPath) {
  const files = [];
  async function walk(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const info = await stat(fullPath);
        files.push({ path: fullPath, bytes: info.size });
      }
    }
  }
  await walk(targetPath);
  return files;
}

function resolveSafeFileTarget(rootDir, target) {
  const absoluteRoot = path.resolve(rootDir);
  const absoluteTarget = path.resolve(rootDir, target.relativePath);
  if (absoluteTarget === absoluteRoot || !absoluteTarget.startsWith(`${absoluteRoot}${path.sep}`)) {
    fail(`Unsafe reset file target: ${target.relativePath}`);
  }
  return absoluteTarget;
}

async function runFilePlan({ rootDir, targets, dryRun }) {
  const results = [];
  for (const target of targets) {
    const absolutePath = resolveSafeFileTarget(rootDir, target);
    const files = await collectFiles(absolutePath);
    const bytes = files.reduce((sum, file) => sum + file.bytes, 0);
    if (!dryRun && files.length > 0) {
      const entries = await readdir(absolutePath, { withFileTypes: true }).catch((error) => {
        if (error?.code === "ENOENT") return [];
        throw error;
      });
      for (const entry of entries) {
        await rm(path.join(absolutePath, entry.name), { recursive: true, force: true });
      }
    }
    results.push({
      id: target.id,
      relativePath: target.relativePath,
      absolutePath,
      fileCount: files.length,
      bytes,
      action: dryRun ? "would_delete_contents" : "deleted_contents",
    });
  }
  return results;
}

async function runValidation({
  sql,
  baseUrl,
  requireHttpValidation,
  preserveAdminEmails,
  resetScope,
  allowMultiplePreservedAdmins,
  deletedUserEmails,
  deletedUserPredicate,
  storageHealth,
  storageInspection,
}) {
  const checks = [];

  try {
    await sql`select 1`;
    checks.push({ name: "db_connects", status: "pass" });
  } catch (error) {
    checks.push({ name: "db_connects", status: "fail", detail: error instanceof Error ? error.message : String(error) });
  }

  try {
    const admins = await assertAdminAccessRows(sql, resetScope === "hard" ? preserveAdminEmails : []);
    const adminEmails = admins.map((admin) => admin.email).join(", ");
    checks.push({ name: "preserved_admin_login_rows", status: "pass", detail: `admin=${adminEmails}` });
  } catch (error) {
    checks.push({ name: "preserved_admin_login_rows", status: "fail", detail: error instanceof Error ? error.message : String(error) });
  }

  const deletedEmails = normalizeEmailList(deletedUserEmails ?? []);
  const usersTableExists = await tableExists(sql, "users");
  if (usersTableExists && resetScope === "hard") {
    const adminRows = await sql.unsafe(`
      select count(*)::int as count
      from public.users
      where ${rolePredicate(ADMIN_PRESERVE_ROLES)}
    `);
    const userRows = await sql`select count(*)::int as count from public.users`;
    const adminCount = Number(adminRows[0]?.count ?? 0);
    const userCount = Number(userRows[0]?.count ?? 0);
    checks.push({
      name: "remaining_admin_user_count",
      status: allowMultiplePreservedAdmins ? (adminCount >= 1 ? "pass" : "fail") : (adminCount === 1 ? "pass" : "fail"),
      detail: `admins=${adminCount}`,
    });
    checks.push({
      name: "remaining_user_count",
      status: allowMultiplePreservedAdmins ? (userCount === adminCount ? "pass" : "fail") : (userCount === 1 ? "pass" : "fail"),
      detail: `users=${userCount}`,
    });
  }

  if (deletedEmails.length > 0 && usersTableExists) {
    const emailList = sqlInList(deletedEmails);
    const remainingRows = await sql.unsafe(`select count(*)::int as count from public.users where lower(email) in (${emailList})`);
    const remaining = Number(remainingRows[0]?.count ?? 0);
    checks.push({
      name: "deleted_test_user_login_fails",
      status: remaining === 0 ? "pass" : "fail",
      detail: remaining === 0 ? "deleted user auth rows absent" : `remaining users=${remaining}`,
    });
  } else {
    checks.push({ name: "deleted_test_user_login_fails", status: "warn", detail: "no deleted users sampled" });
  }

  if (usersTableExists && deletedUserPredicate) {
    const remainingRows = await sql.unsafe(`select count(*)::int as count from public.users where ${deletedUserPredicate}`);
    const remaining = Number(remainingRows[0]?.count ?? 0);
    checks.push({
      name: "user_list_no_deleted_test_users",
      status: remaining === 0 ? "pass" : "fail",
      detail: remaining === 0 ? "no reset-deletable users remain" : `remaining reset-deletable users=${remaining}`,
    });
  } else {
    checks.push({ name: "user_list_no_deleted_test_users", status: "warn", detail: "users table unavailable" });
  }

  const operationalCounts = await countOperationalRows(sql, [
    "report_artifact",
    "tradeline",
    "creditor_obligation_test",
    "packet",
    "ingest_processing_job",
  ]);
  const remainingOperationalRows = operationalCounts.reduce((sum, row) => sum + row.count, 0);
  checks.push({
    name: "ingestion_can_start_fresh",
    status: remainingOperationalRows === 0 ? "pass" : "warn",
    detail: operationalCounts.map((row) => `${row.table}=${row.count}${row.skipped ? `:${row.reason}` : ""}`).join(", "),
  });

  for (const table of REQUIRED_RULE_TABLES) {
    if (!(await tableExists(sql, table))) {
      checks.push({ name: `rules_load:${table}`, status: "fail", detail: "table missing" });
      continue;
    }
    const rows = await sql.unsafe(`select count(*)::int as count from ${tableRef(table)}`);
    checks.push({
      name: `rules_load:${table}`,
      status: Number(rows[0]?.count ?? 0) > 0 ? "pass" : "warn",
      detail: `rows=${Number(rows[0]?.count ?? 0)}`,
    });
  }

  for (const table of ["parser_field_mapping", "parser_extraction_rule", "parser_known_entity"]) {
    if (!(await tableExists(sql, table))) {
      checks.push({ name: `parser_mappings_load:${table}`, status: "fail", detail: "table missing" });
      continue;
    }
    const rows = await sql.unsafe(`select count(*)::int as count from ${tableRef(table)}`);
    checks.push({
      name: `parser_mappings_load:${table}`,
      status: Number(rows[0]?.count ?? 0) > 0 ? "pass" : "warn",
      detail: `rows=${Number(rows[0]?.count ?? 0)}`,
    });
  }

  if (storageHealth) {
    checks.push({
      name: "storage_write_read_delete",
      status: storageHealth.status === "pass" ? "pass" : "warn",
      detail: `${storageHealth.provider ?? "storage"} ${storageHealth.status}`,
    });
  }

  if (storageInspection) {
    const staleCount = storageInspection.notFoundReferences.length;
    checks.push({
      name: "stale_storage_read_failed_not_found",
      status: staleCount === 0 ? "pass" : "warn",
      detail: staleCount === 0 ? "none" : `${staleCount} pre-existing orphaned reference(s) reported`,
    });
  }

  if (baseUrl) {
    const probes = [
      { name: "app_boots", path: "/", method: "GET" },
      { name: "admin_pages_render", path: "/admin-security", method: "GET" },
      { name: "ingestion_endpoint_reachable", path: "/_api/ingest/report", method: "POST" },
      { name: "packet_list_endpoint_reachable", path: "/_api/packet/list", method: "GET" },
      { name: "packet_build_endpoint_reachable", path: "/_api/packet/build", method: "POST" },
    ];
    for (const probe of probes) {
      try {
        const response = await fetch(new URL(probe.path, baseUrl), {
          method: probe.method,
          headers: probe.method === "POST" ? { "Content-Type": "application/json" } : undefined,
          body: probe.method === "POST" ? "{}" : undefined,
          signal: AbortSignal.timeout(3000),
        });
        checks.push({
          name: probe.name,
          status: response.status < 500 && response.status !== 404 ? "pass" : "warn",
          detail: `${probe.method} ${probe.path} -> HTTP ${response.status}`,
        });
      } catch (error) {
        checks.push({
          name: probe.name,
          status: requireHttpValidation ? "fail" : "warn",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return checks;
}

async function runReset(options, env = process.env) {
  const { key: databaseUrlKey, value: databaseUrl } = resolveDatabaseUrl(env);
  const database = describeDatabaseTarget(databaseUrl);
  const environment = resolveResetEnvironment(env, databaseUrl);
  const runtimeContext = {
    database: {
      source: databaseUrlKey,
      host: database.host,
      port: database.port,
      database: database.database,
    },
    environment,
    storage: storageProviderSummary(env),
  };
  const allowProductionDangerousOverride =
    options.allowProductionDangerousOverride === true &&
    String(env.RESET_ALLOW_PRODUCTION_PLATFORM_RESET ?? "").toLowerCase() === "true";
  try {
    assertResetSafety({ environment, confirmEnv: options.confirmEnv, allowProductionDangerousOverride });
  } catch (error) {
    if (error instanceof Error) {
      error.resetDiagnostics = buildResetRuntimeDiagnostics(runtimeContext, error.message);
    }
    throw error;
  }
  assertExpectedDatabaseTarget(
    {
      source: databaseUrlKey,
      host: database.host,
      port: database.port,
      database: database.database,
    },
    options.expectedDatabase,
  );

  const dryRun = options.execution === "dry-run";
  if (!dryRun && !options.confirm) fail("Destructive platform reset requires --confirm.");
  const preserveAdminEmails = normalizeEmailList(
    options.preserveAdminEmails ?? parseEmailAllowlist(env.RESET_PRESERVE_ADMIN_EMAILS || ""),
  );
  const allowMultiplePreservedAdmins =
    options.allowMultiplePreservedAdmins === true || allowMultiplePreservedAdminsFromEnv(env);
  const plan = buildResetPlan(options.resetScope, {
    preserveAdminEmails,
    preserveAuditLogIds: options.preserveAuditLogIds,
  });
  const rootDir = process.cwd();
  const sql = postgres(databaseUrl, { prepare: false, max: 1, onnotice: () => undefined });

  try {
    const userPlan = await buildUserPlan(sql, plan);
    const adminPreservation = await buildAdminPreservationPlan(sql, plan, userPlan, allowMultiplePreservedAdmins);
    validateCanonicalAdminPreservationSummary({
      scope: plan.scope,
      usersTableMissing: userPlan.usersTableMissing,
      preserveAdminEmails: plan.preserveAdminEmails,
      preservedAdminCount: adminPreservation.preservedAdminCount,
      preservedUserCount: userPlan.preservedCount,
      allowMultiplePreservedAdmins,
    });
    await assertAdminAccessRows(sql, plan.scope === "hard" ? plan.preserveAdminEmails : []);
    const updateStatements = [
      { table: "report_artifact", column: "tradeline_id", action: "nullify_report_artifact_tradeline_back_reference" },
    ];
    const referenceUpdates = plan.deletesUsers
      ? await userReferenceUpdates(sql, plan.tableSteps, plan.userDeletePredicate, plan.preserveAdminEmails)
      : [];
    const storageReferences = await collectStorageReferences(sql, plan);
    const storageInspection = await inspectStorageReferences(storageReferences, env);
    if (storageInspection.failedReferences.length > 0) {
      fail(`Platform reset storage inspection failed for ${storageInspection.failedReferences.length} reference(s).`);
    }

    let updateResults = [];
    let tableResults = [];
    let identityResults = [];
    let storageHealth = dryRun
      ? { status: "not_run_dry_run", reason: "dry-run", provider: storageInspection.provider.provider, root: storageInspection.provider.root }
      : await runStorageHealthCheck(env);
    let storageDeletion = dryRun
      ? {
        action: "would_delete_local_storage_references",
        deletedCount: 0,
        deleted: [],
        notFoundReferences: storageInspection.notFoundReferences,
        unsupportedReferences: storageInspection.unsupportedReferences,
        failedReferences: [],
      }
      : null;

    if (dryRun) {
      updateResults = [
        ...(await Promise.all(updateStatements.map((statement) => countUpdate(sql, statement)))),
        ...(await runDynamicUpdates(sql, referenceUpdates, true)),
      ];
      tableResults = [];
      for (const step of plan.tableSteps) {
        tableResults.push(await countRows(sql, step));
      }
      for (const step of plan.tableSteps) {
        if (step.resetIdentity) identityResults.push(await resetIdentity(sql, step.table, true));
      }
    } else {
      await sql.begin(async (trx) => {
        updateResults = [];
        for (const statement of updateStatements) {
          updateResults.push(await runUpdate(trx, statement));
        }
        updateResults.push(...(await runDynamicUpdates(trx, referenceUpdates, false)));

        tableResults = [];
        for (const step of plan.tableSteps) {
          tableResults.push(await deleteRows(trx, step));
        }

        identityResults = [];
        for (const step of plan.tableSteps) {
          if (step.resetIdentity) identityResults.push(await resetIdentity(trx, step.table, false));
        }
      });
      storageDeletion = await deleteInspectedStorageReferences(storageInspection.localReferences, env);
      if (storageDeletion.failedReferences.length > 0) {
        fail(`Platform reset storage deletion failed for ${storageDeletion.failedReferences.length} reference(s).`);
      }
    }

    const fileResults = await runFilePlan({ rootDir, targets: plan.fileTargets, dryRun });
    const validation = dryRun
      ? []
      : await runValidation({
        sql,
        baseUrl: options.baseUrl,
        requireHttpValidation: options.requireHttpValidation,
        preserveAdminEmails: plan.preserveAdminEmails,
        resetScope: plan.scope,
        allowMultiplePreservedAdmins,
        deletedUserEmails: userPlan.deletedUsers.map((user) => user.email),
        deletedUserPredicate: plan.userDeletePredicate,
        storageHealth,
        storageInspection,
      });

    const totalRows = tableResults.reduce((sum, row) => sum + row.count, 0);
    const totalUpdates = updateResults.reduce((sum, row) => sum + row.count, 0);
    const totalFiles = fileResults.reduce((sum, row) => sum + row.fileCount, 0);

    return {
      event: "platform_reset",
      mode: dryRun ? "dry-run" : options.resetScope,
      resetScope: options.resetScope,
      generatedAt: new Date().toISOString(),
      environment,
      database: {
        source: databaseUrlKey,
        host: database.host,
        port: database.port,
        database: database.database,
      },
      preservedSubsystems: plan.preservedSubsystems,
      preservedTables: plan.preservedTables,
      adminPreservation,
      userPlan,
      updateResults,
      rowsByTable: tableResults,
      identityResults,
      filesByTarget: fileResults,
      storage: {
        provider: storageInspection.provider,
        health: storageHealth,
        references: storageInspection,
        deletion: storageDeletion,
      },
      totalRowsMatched: totalRows,
      totalUpdatesMatched: totalUpdates,
      totalFilesMatched: totalFiles,
      validation,
    };
  } finally {
    await sql.end({ timeout: 1 });
  }
}

function printHelp() {
  console.log([
    "Usage:",
    "  pnpm reset:platform --dry-run --confirm-env local",
    "  pnpm reset:platform --dry-run --preview-hard --confirm-env staging",
    "  pnpm reset:platform --soft --confirm-env local --confirm",
    "  pnpm reset:platform --hard --confirm-env staging --confirm",
    "",
    "Options:",
    "  --dry-run                    Preview soft reset by default.",
    "  --preview-hard               Preview hard reset without deleting data.",
    "  --soft                       Delete operational data while preserving all users.",
    "  --hard                       Delete operational data and users except configured admin/super_admin email.",
    "  --confirm                    Required with --soft or --hard.",
    "  --confirm-env <local|staging> Required environment confirmation.",
    "  --preserve-admin-email <email> Preserve an explicit admin email in hard mode. Also reads RESET_PRESERVE_ADMIN_EMAILS.",
    "  --base-url <url>             App URL for post-reset endpoint probes; default http://localhost:5175.",
    "  --require-http-validation    Fail validation if app/endpoint probes are unreachable.",
    "  --json                       Print machine-readable JSON.",
  ].join("\n"));
}

function printHuman(result) {
  console.log(`Platform reset ${result.mode}`);
  console.log(`Environment: ${result.environment.kind} (${result.environment.reason})`);
  console.log(`Database: source=${result.database.source} host=${result.database.host} port=${result.database.port} name=${result.database.database}`);
  console.log(`Total matched rows: ${result.totalRowsMatched}`);
  console.log(`Total matched update rows: ${result.totalUpdatesMatched}`);
  console.log(`Total matched files: ${result.totalFilesMatched}`);
  if (result.storage) {
    console.log(`Storage: provider=${result.storage.provider.provider} root=${result.storage.provider.root}`);
    console.log(`Storage references: ${result.storage.references.totalReferences} reference(s), ${result.storage.references.totalRows} row(s)`);
    console.log(`Storage not found references: ${result.storage.references.notFoundReferences.length}`);
  }
  console.log("");
  console.log("Users:");
  if (result.adminPreservation) {
    console.log(
      `- preserved admin policy: admins=${result.adminPreservation.preservedAdminCount} exact_one=${result.adminPreservation.requiresExactlyOneAdmin}`,
    );
    if (result.adminPreservation.configuredAdminEmails.length > 0) {
      console.log(`  - configured: ${result.adminPreservation.configuredAdminEmails.join(", ")}`);
    }
  }
  if (result.userPlan.usersTableMissing) {
    console.log("- users table missing");
  } else {
    console.log(`- preserve: ${result.userPlan.preservedCount}`);
    for (const user of result.userPlan.preservedUsers) {
      console.log(`  - ${user.email} role=${user.role} reason=${user.reason}`);
    }
    if (result.userPlan.preservedCount > result.userPlan.preservedUsers.length) {
      console.log(`  - ... ${result.userPlan.preservedCount - result.userPlan.preservedUsers.length} more`);
    }
    console.log(`- delete: ${result.userPlan.deletedCount}`);
    for (const user of result.userPlan.deletedUsers) {
      console.log(`  - ${user.email} role=${user.role} reason=${user.reason}`);
    }
    if (result.userPlan.deletedCount > result.userPlan.deletedUsers.length) {
      console.log(`  - ... ${result.userPlan.deletedCount - result.userPlan.deletedUsers.length} more`);
    }
  }
  console.log("");
  console.log("Rows by table:");
  for (const row of result.rowsByTable) {
    const suffix = row.skipped ? ` (${row.reason})` : "";
    console.log(`- ${row.table}: ${row.count}${suffix}`);
  }
  console.log("");
  console.log("Generated files:");
  for (const row of result.filesByTarget) {
    console.log(`- ${row.relativePath}: ${row.fileCount} file(s), ${row.bytes} byte(s)`);
  }
  if (result.storage?.deletion) {
    console.log("");
    console.log("Storage cleanup:");
    console.log(`- ${result.storage.deletion.action ?? "delete_local_storage_references"}: ${result.storage.deletion.deletedCount} object(s)`);
    console.log(`- storage_read_failed:not_found: ${result.storage.deletion.notFoundReferences.length} reference(s)`);
    console.log(`- unsupported references: ${result.storage.deletion.unsupportedReferences.length}`);
  }
  if (result.validation.length > 0) {
    console.log("");
    console.log("Validation:");
    for (const check of result.validation) {
      console.log(`- ${check.name}: ${check.status}${check.detail ? ` (${check.detail})` : ""}`);
    }
  }
}

function printResetDiagnostics(diagnostics, writeLine = console.error) {
  if (!diagnostics) return;
  writeLine("Reset diagnostics:");
  writeLine(`- detected environment: ${diagnostics.detectedEnvironment}`);
  writeLine(`- database host: ${diagnostics.databaseHost}`);
  writeLine(`- database name: ${diagnostics.databaseName}`);
  writeLine(`- storage provider: ${diagnostics.storageProvider}`);
  writeLine(`- storage root: ${diagnostics.storageRoot}`);
  writeLine(`- reason: ${diagnostics.reason}`);
}

function resetDiagnosticsFromError(error) {
  if (!error || typeof error !== "object") return null;
  return error.resetDiagnostics ?? null;
}

async function main() {
  const options = parseResetArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const result = await runReset(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }
}

export {
  HARD_RESET_TABLES,
  RESET_FILE_TARGETS,
  SOFT_RESET_TABLES,
  runReset,
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    const diagnostics = resetDiagnosticsFromError(error);
    if (process.argv.includes("--json")) {
      console.error(JSON.stringify({ success: false, error: message, diagnostics }, null, 2));
    } else {
      console.error(message);
      printResetDiagnostics(diagnostics);
    }
    process.exit(1);
  });
}
