import "../loadEnv.js";

import { rm, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const ENVIRONMENT_KEYS = ["CRP_ENV", "APP_ENV", "FLOOT_ENV", "DEPLOYMENT_ENV", "ENVIRONMENT", "VERCEL_ENV"];
const DATABASE_URL_KEYS = ["FLOOT_DATABASE_URL", "DATABASE_URL", "DATABASE_PRIVATE_URL", "POSTGRES_URL", "CRP_DATABASE_URL"];

export const PRESERVED_SUBSYSTEMS = [
  "migrations and version metadata",
  "laws, regulations, statutes, obligations, rule definitions, and legal references",
  "parser mappings, parser training/corrections, parser rules, known entities, and canonical extraction intelligence",
  "admin users and admin password records",
  "system settings, compliance configuration, feature flags, and deterministic OCR/runtime configuration",
  "supported bureau and licensed collection agency reference mappings",
  "letter templates and platform content/configuration",
];

export const PRESERVED_TABLES = [
  "bureau",
  "compliance_config",
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
  { table: "consumer_identification_document", where: "user_id in (select id from public.users where role <> 'admin')" },
  { table: "consumer_signature", where: "user_id in (select id from public.users where role <> 'admin')" },
  { table: "subscriptions", where: "user_id in (select id from public.users where role <> 'admin')" },
  { table: "user_account", where: "user_id in (select id from public.users where role <> 'admin')" },
  { table: "user_passwords", where: "user_id in (select id from public.users where role <> 'admin')" },
  { table: "users", where: "role <> 'admin'" },
  {
    table: "organizations",
    where: "not exists (select 1 from public.users where users.organization_id = organizations.id and users.role = 'admin')",
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

export function parseResetArgs(args) {
  const options = {
    execution: "dry-run",
    resetScope: "soft",
    confirmEnv: null,
    json: false,
    baseUrl: process.env.CRP_PLATFORM_RESET_BASE_URL || "http://localhost:5175",
    requireHttpValidation: false,
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

function signatureIncludesProduction(value) {
  const lowered = String(value ?? "").toLowerCase();
  if (lowered.includes("staging")) return false;
  return lowered.includes("creditregulatorpro-prod") || lowered.includes("production") || /(^|[^a-z])prod([^a-z]|$)/.test(lowered);
}

export function resolveResetEnvironment(env = process.env, databaseUrl = "") {
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

export function assertResetSafety({ environment, confirmEnv }) {
  if (environment.kind === "production") fail(`Refusing platform reset against production: ${environment.reason}`);
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

export function buildResetPlan(scope = "soft") {
  const tableSteps = SOFT_RESET_TABLES.map((table) => ({
    table,
    where: null,
    action: "delete_all",
    resetIdentity: true,
  }));

  if (scope === "hard") {
    tableSteps.push(...HARD_RESET_TABLES.map((step) => ({
      ...step,
      action: step.table === "users" ? "delete_non_admin" : "delete_non_admin_related",
      resetIdentity: true,
    })));
  }

  return {
    scope,
    tableSteps,
    fileTargets: RESET_FILE_TARGETS,
    preservedTables: PRESERVED_TABLES,
    preservedSubsystems: PRESERVED_SUBSYSTEMS,
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

async function resolveAdminUser(sql) {
  if (!(await tableExists(sql, "users"))) return null;
  const rows = await sql`
    select id::bigint as id, email
    from public.users
    where role = 'admin'
    order by id asc
    limit 1
  `;
  return rows[0] ? { id: Number(rows[0].id), email: rows[0].email } : null;
}

async function assertAdminAccessRows(sql) {
  const admin = await resolveAdminUser(sql);
  if (!admin) fail("Platform reset requires at least one admin user before and after reset.");

  if (await tableExists(sql, "user_passwords")) {
    const rows = await sql`
      select count(*)::int as count
      from public.user_passwords
      where user_id = ${admin.id}
    `;
    if (Number(rows[0]?.count ?? 0) < 1) {
      fail(`Admin user ${admin.email} has no user_passwords row; refusing reset because admin login may not work.`);
    }
  }

  return admin;
}

async function hardModeUserReferenceUpdates(sql, resetTables) {
  const admin = await resolveAdminUser(sql);
  if (!admin) fail("Hard reset requires an admin user to preserve/reassign protected references.");

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
  const resetSet = new Set(resetTables);

  for (const ref of refs) {
    const table = ref.table_name;
    const column = ref.column_name;
    if (table === "users" || resetSet.has(table)) continue;

    const predicate = `${quoteIdentifier(column)} in (select id from public.users where role <> 'admin')`;
    if (ref.is_nullable === "YES") {
      updates.push({
        table,
        column,
        action: "nullify_non_admin_user_reference",
        countSql: `select count(*)::int as count from ${tableRef(table)} where ${predicate}`,
        runSql: `with updated as (update ${tableRef(table)} set ${quoteIdentifier(column)} = null where ${predicate} returning 1) select count(*)::int as count from updated`,
      });
      continue;
    }

    if (table === "parser_test_case" && column === "created_by") {
      updates.push({
        table,
        column,
        action: "reassign_non_admin_user_reference_to_admin",
        countSql: `select count(*)::int as count from ${tableRef(table)} where ${predicate}`,
        runSql: `with updated as (update ${tableRef(table)} set ${quoteIdentifier(column)} = ${admin.id} where ${predicate} returning 1) select count(*)::int as count from updated`,
      });
      continue;
    }

    blockers.push(`${table}.${column}`);
  }

  if (blockers.length > 0) {
    fail(`Hard reset would leave protected non-null user references unresolved: ${blockers.join(", ")}`);
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

async function runValidation({ sql, baseUrl, requireHttpValidation }) {
  const checks = [];

  try {
    await sql`select 1`;
    checks.push({ name: "db_connects", status: "pass" });
  } catch (error) {
    checks.push({ name: "db_connects", status: "fail", detail: error instanceof Error ? error.message : String(error) });
  }

  try {
    const admin = await assertAdminAccessRows(sql);
    checks.push({ name: "admin_login_rows", status: "pass", detail: `admin=${admin.email}` });
  } catch (error) {
    checks.push({ name: "admin_login_rows", status: "fail", detail: error instanceof Error ? error.message : String(error) });
  }

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

  if (baseUrl) {
    const probes = [
      { name: "app_boots", path: "/", method: "GET" },
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
  assertResetSafety({ environment, confirmEnv: options.confirmEnv });

  const dryRun = options.execution === "dry-run";
  const plan = buildResetPlan(options.resetScope);
  const rootDir = process.cwd();
  const sql = postgres(databaseUrl, { prepare: false, max: 1, onnotice: () => undefined });

  try {
    await assertAdminAccessRows(sql);
    const updateStatements = [
      { table: "report_artifact", column: "tradeline_id", action: "nullify_report_artifact_tradeline_back_reference" },
    ];
    const resetTables = new Set(plan.tableSteps.map((step) => step.table));
    const hardReferenceUpdates = options.resetScope === "hard"
      ? await hardModeUserReferenceUpdates(sql, resetTables)
      : [];

    let updateResults = [];
    let tableResults = [];
    let identityResults = [];

    if (dryRun) {
      updateResults = [
        ...(await Promise.all(updateStatements.map((statement) => countUpdate(sql, statement)))),
        ...(await runDynamicUpdates(sql, hardReferenceUpdates, true)),
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
        updateResults.push(...(await runDynamicUpdates(trx, hardReferenceUpdates, false)));

        tableResults = [];
        for (const step of plan.tableSteps) {
          tableResults.push(await deleteRows(trx, step));
        }

        identityResults = [];
        for (const step of plan.tableSteps) {
          if (step.resetIdentity) identityResults.push(await resetIdentity(trx, step.table, false));
        }
      });
    }

    const fileResults = await runFilePlan({ rootDir, targets: plan.fileTargets, dryRun });
    const validation = dryRun
      ? []
      : await runValidation({ sql, baseUrl: options.baseUrl, requireHttpValidation: options.requireHttpValidation });

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
      updateResults,
      rowsByTable: tableResults,
      identityResults,
      filesByTarget: fileResults,
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
    "  pnpm reset:platform --soft --confirm-env local",
    "  pnpm reset:platform --hard --confirm-env staging",
    "",
    "Options:",
    "  --dry-run                    Preview soft reset by default.",
    "  --preview-hard               Preview hard reset without deleting data.",
    "  --soft                       Delete operational data, preserve users.",
    "  --hard                       Delete operational data and non-admin users.",
    "  --confirm-env <local|staging> Required environment confirmation.",
    "  --base-url <url>             App URL for post-reset endpoint probes; default http://localhost:5175.",
    "  --require-http-validation    Fail validation if app/endpoint probes are unreachable.",
    "  --json                       Print machine-readable JSON.",
  ].join("\n"));
}

function printHuman(result) {
  console.log(`Platform reset ${result.mode}`);
  console.log(`Environment: ${result.environment.kind} (${result.environment.reason})`);
  console.log(`Database: host=${result.database.host} port=${result.database.port} name=${result.database.database}`);
  console.log(`Total matched rows: ${result.totalRowsMatched}`);
  console.log(`Total matched update rows: ${result.totalUpdatesMatched}`);
  console.log(`Total matched files: ${result.totalFilesMatched}`);
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
  if (result.validation.length > 0) {
    console.log("");
    console.log("Validation:");
    for (const check of result.validation) {
      console.log(`- ${check.name}: ${check.status}${check.detail ? ` (${check.detail})` : ""}`);
    }
  }
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
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
