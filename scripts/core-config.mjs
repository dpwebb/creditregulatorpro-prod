import "../loadEnv.js";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import postgres from "postgres";

export const CORE_CONFIG_SCHEMA_VERSION = 1;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const DEFAULT_OUTPUT_DIR = ".local/core-config";
const DEFAULT_REMOTE_APP_DIR = "/opt/creditregulatorpro-staging/app";
const DEFAULT_REMOTE_APP_CONTAINER = "creditregulatorpro-staging";
const DEFAULT_STAGING_ONLY_ROLE = "user";
const LOCAL_BOOTSTRAP_SYSTEM_SETTING_KEYS = new Set([
  "DOMAIN_GUARD_MODE",
  "production_mode",
  "terms_version",
]);
const LOGICAL_DUPLICATE_CHECK_TABLES = new Set([
  "dynamic_scanning_rule",
  "enforcement_mechanism",
  "obligation",
  "parser_field_mapping",
  "parser_extraction_rule",
]);

const CORE_TABLE_SPECS = [
  {
    name: "system_settings",
    key: ["key"],
    columns: ["key", "value", "description"],
    excludeKeys: LOCAL_BOOTSTRAP_SYSTEM_SETTING_KEYS,
  },
  {
    name: "feature_flag",
    key: ["key"],
    columns: ["key", "label", "description", "enabled", "min_version", "max_version", "scope"],
  },
  {
    name: "compliance_config",
    key: ["violation_category"],
    columns: [
      "violation_category",
      "enabled",
      "confidence_threshold",
      "user_explanation_template",
      "recommended_action_template",
    ],
  },
  {
    name: "bureau",
    key: ["name", "region"],
    columns: [
      "name",
      "region",
      "contact_email",
      "contact_phone",
      "address",
      "address_line1",
      "address_line2",
      "city",
      "province",
      "postal_code",
    ],
  },
  {
    name: "letter_template",
    key: ["category", "template_key"],
    columns: [
      "category",
      "template_key",
      "label",
      "subject",
      "introduction",
      "statutory_grounds",
      "requested_action",
      "statutory_timeframe",
      "consumer_statement_right",
      "certification",
      "closing",
      "statutory_reference",
      "source_url",
      "full_body_override",
      "is_active",
    ],
  },
  {
    name: "parser_bureau_detection_config",
    key: ["bureau", "marker"],
    columns: ["bureau", "marker", "weight", "is_active"],
  },
  {
    name: "parser_field_mapping",
    key: ["bureau", "section", "source_path", "target_field"],
    columns: [
      "bureau",
      "source_path",
      "target_field",
      "section",
      "transform_type",
      "transform_config",
      "is_active",
      "priority",
      "description",
    ],
  },
  {
    name: "parser_known_entity",
    key: ["entity_type", "value"],
    columns: ["entity_type", "value", "description"],
  },
  {
    name: "parser_extraction_rule",
    key: ["bureau", "rule_type", "field_path", "target_field"],
    columns: [
      "bureau",
      "rule_type",
      "field_path",
      "target_field",
      "config",
      "is_active",
      "priority",
      "description",
    ],
  },
  {
    name: "dynamic_scanning_rule",
    key: ["title", "violation_category"],
    columns: [
      "title",
      "description",
      "rule_definition",
      "violation_category",
      "severity",
      "confidence_score",
      "user_explanation_template",
      "recommended_action_template",
      "statutory_basis",
      "status",
    ],
  },
  {
    name: "statute",
    key: ["jurisdiction", "code"],
    columns: ["jurisdiction", "code", "region"],
  },
  {
    name: "statute_version",
    key: ["statute_jurisdiction", "statute_code", "version"],
    physicalTable: "statute_version",
    columns: [
      "statute_jurisdiction",
      "statute_code",
      "version",
      "description",
      "response_clock_days",
      "effective_date",
      "superseded_date",
      "source_url",
      "section_reference",
      "region",
    ],
    customSnapshot: snapshotStatuteVersion,
    customApply: applyStatuteVersion,
  },
  {
    name: "disclosure_requirement",
    key: ["statute_jurisdiction", "statute_code", "statute_version", "category", "requirement_code"],
    physicalTable: "disclosure_requirement",
    columns: [
      "statute_jurisdiction",
      "statute_code",
      "statute_version",
      "category",
      "requirement_code",
      "field_path",
      "description",
      "section_reference",
      "severity",
      "metadata",
    ],
    customSnapshot: snapshotDisclosureRequirement,
    customApply: applyDisclosureRequirement,
  },
  {
    name: "federal_guidance",
    key: ["guidance_code", "version"],
    columns: [
      "guidance_code",
      "title",
      "description",
      "version",
      "effective_date",
      "superseded_date",
      "source_url",
      "section_reference",
      "region",
      "metadata",
    ],
  },
  {
    name: "industry_standard",
    key: ["standard_code", "version"],
    columns: [
      "standard_code",
      "standard_name",
      "description",
      "version",
      "effective_date",
      "superseded_date",
      "source_url",
      "documentation_url",
      "region",
      "segment_definitions",
      "field_mappings",
      "validation_rules",
      "metadata",
    ],
  },
  {
    name: "enforcement_mechanism",
    key: ["jurisdiction", "mechanism_type", "name"],
    columns: [
      "jurisdiction",
      "region",
      "mechanism_type",
      "name",
      "description",
      "statutory_reference",
      "penalty_amount",
      "contact_info",
      "website_url",
      "filing_deadline_days",
      "notes",
    ],
  },
  {
    name: "obligation",
    key: ["section", "obligation_type", "statutory_reference", "description"],
    columns: [
      "description",
      "obligation_type",
      "section",
      "jurisdiction",
      "statutory_reference",
      "timeframe_days",
      "notes",
      "region",
      "duty_type",
      "is_statutory",
    ],
  },
  {
    name: "privileged_user_roles",
    key: ["email"],
    columns: ["email", "display_name", "user_role", "email_verified", "account_role"],
    virtual: true,
    exactTarget: true,
    customSnapshot: snapshotPrivilegedUserRoles,
    customApply: applyPrivilegedUserRoles,
  },
];

export const CORE_CONFIG_TABLES = CORE_TABLE_SPECS.map((spec) => spec.name);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function usage() {
  console.log(`Usage:
  pnpm run core-config:export -- --target local
  pnpm run core-config:diff
  pnpm run core-config:verify
  pnpm run core-config:apply:staging
  pnpm run core-config:apply:staging -- --confirm

Commands:
  export          Export a core-config snapshot from local or staging.
  diff            Compare localhost core config to staging. Exits 1 on drift.
  verify          Same comparison as diff; intended for gates.
  apply-staging   Apply localhost core config to staging. Dry-run unless --confirm is set.
  remote-snapshot Internal staging command. Outputs a snapshot to stdout.
  remote-apply    Internal staging command. Reads a snapshot from stdin.

Options:
  --target local|staging        Export source. Default: local.
  --output PATH                 Snapshot output path. Default: ${DEFAULT_OUTPUT_DIR}/core-config.<target>.json
  --from PATH                   Snapshot file for apply-staging instead of live localhost.
  --allow-drift                 Let diff/verify exit 0 even when drift is found.
  --confirm                     Required for mutating staging.
  --remote-app-dir PATH         Staging app path. Default: ${DEFAULT_REMOTE_APP_DIR}
  --remote-app-container NAME   Staging app container. Default: ${DEFAULT_REMOTE_APP_CONTAINER}
  --help                        Show this help.
`);
}

function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const options = {
    command,
    target: "local",
    output: "",
    from: "",
    allowDrift: false,
    confirm: false,
    remoteAppDir: DEFAULT_REMOTE_APP_DIR,
    remoteAppContainer: process.env.STAGING_APP_CONTAINER || DEFAULT_REMOTE_APP_CONTAINER,
  };

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      options.command = "help";
      continue;
    }
    if (arg === "--allow-drift") {
      options.allowDrift = true;
      continue;
    }
    if (arg === "--confirm") {
      options.confirm = true;
      continue;
    }
    if (["--target", "--output", "--from", "--remote-app-dir", "--remote-app-container"].includes(arg)) {
      const value = rest[i + 1];
      if (!value) fail(`missing value for ${arg}`);
      i += 1;
      if (arg === "--target") options.target = value;
      if (arg === "--output") options.output = value;
      if (arg === "--from") options.from = value;
      if (arg === "--remote-app-dir") options.remoteAppDir = value;
      if (arg === "--remote-app-container") options.remoteAppContainer = value;
      continue;
    }
    if (arg.startsWith("--target=")) {
      options.target = arg.slice("--target=".length);
      continue;
    }
    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
      continue;
    }
    if (arg.startsWith("--from=")) {
      options.from = arg.slice("--from=".length);
      continue;
    }
    if (arg.startsWith("--remote-app-dir=")) {
      options.remoteAppDir = arg.slice("--remote-app-dir=".length);
      continue;
    }
    if (arg.startsWith("--remote-app-container=")) {
      options.remoteAppContainer = arg.slice("--remote-app-container=".length);
      continue;
    }
    fail(`unknown option '${arg}'`);
  }

  if (!["local", "staging"].includes(options.target)) {
    fail("--target must be local or staging");
  }

  return options;
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function tableName(spec) {
  return spec.physicalTable || spec.name;
}

function tableRef(spec) {
  return `public.${quoteIdentifier(tableName(spec))}`;
}

function normalizeValue(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry));
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((accumulator, key) => {
        accumulator[key] = normalizeValue(value[key]);
        return accumulator;
      }, {});
  }
  return value ?? null;
}

function normalizeRow(row, columns) {
  const normalized = {};
  for (const column of columns) {
    normalized[column] = normalizeValue(row[column]);
  }
  return normalized;
}

function canonicalString(value) {
  return JSON.stringify(normalizeValue(value));
}

function keyParts(spec, row) {
  return spec.key.map((column) => normalizeValue(row[column]));
}

function keyValue(spec, row) {
  return JSON.stringify(keyParts(spec, row));
}

function keyLabel(spec, row) {
  return spec.key.map((column) => `${column}=${String(normalizeValue(row[column]))}`).join(", ");
}

function sortRows(spec, rows) {
  return [...rows].sort((left, right) => keyValue(spec, left).localeCompare(keyValue(spec, right)));
}

function mapRows(spec, rows) {
  const map = new Map();
  const duplicates = [];
  for (const row of rows) {
    const key = keyValue(spec, row);
    if (map.has(key)) {
      duplicates.push(keyLabel(spec, row));
      continue;
    }
    map.set(key, row);
  }
  return { map, duplicates };
}

async function tableExists(sql, name) {
  const rows = await sql`select to_regclass(${`public.${name}`}) as table_name`;
  return Boolean(rows[0]?.table_name);
}

async function assertTableExists(sql, spec) {
  if (spec.virtual) return;
  if (!(await tableExists(sql, tableName(spec)))) {
    throw new Error(`Required core config table is missing: ${tableName(spec)}`);
  }
}

async function snapshotGenericTable(sql, spec) {
  await assertTableExists(sql, spec);
  const selectList = spec.columns.map(quoteIdentifier).join(", ");
  const orderBy = spec.key.map(quoteIdentifier).join(", ");
  const excludeKeys = spec.excludeKeys ? [...spec.excludeKeys] : [];
  const whereClause = excludeKeys.length
    ? ` where ${quoteIdentifier(spec.key[0])} <> all($1)`
    : "";
  const rows = await sql.unsafe(
    `select ${selectList} from ${tableRef(spec)}${whereClause} order by ${orderBy}`,
    excludeKeys.length ? [excludeKeys] : [],
  );
  return sortRows(spec, rows.map((row) => normalizeRow(row, spec.columns)));
}

async function snapshotStatuteVersion(sql, spec) {
  await assertTableExists(sql, spec);
  const rows = await sql.unsafe(`
    select
      s.jurisdiction as statute_jurisdiction,
      s.code as statute_code,
      sv.version,
      sv.description,
      sv.response_clock_days,
      sv.effective_date,
      sv.superseded_date,
      sv.source_url,
      sv.section_reference,
      sv.region
    from public.statute_version sv
    join public.statute s on s.id = sv.statute_id
    order by s.jurisdiction, s.code, sv.version
  `);
  return sortRows(spec, rows.map((row) => normalizeRow(row, spec.columns)));
}

async function snapshotDisclosureRequirement(sql, spec) {
  await assertTableExists(sql, spec);
  const rows = await sql.unsafe(`
    select
      s.jurisdiction as statute_jurisdiction,
      s.code as statute_code,
      sv.version as statute_version,
      dr.category,
      dr.requirement_code,
      dr.field_path,
      dr.description,
      dr.section_reference,
      dr.severity,
      dr.metadata
    from public.disclosure_requirement dr
    join public.statute_version sv on sv.id = dr.statute_version_id
    join public.statute s on s.id = sv.statute_id
    order by s.jurisdiction, s.code, sv.version, dr.category, dr.requirement_code
  `);
  return sortRows(spec, rows.map((row) => normalizeRow(row, spec.columns)));
}

async function snapshotPrivilegedUserRoles(sql, spec) {
  if (!(await tableExists(sql, "users"))) {
    throw new Error("Required core config table is missing: users");
  }

  const hasUserAccount = await tableExists(sql, "user_account");
  const rows = hasUserAccount
    ? await sql.unsafe(`
        select
          lower(u.email) as email,
          u.display_name,
          u.role as user_role,
          u.email_verified,
          ua.role as account_role
        from public.users u
        left join public.user_account ua on ua.user_id = u.id
        where u.role in ('admin', 'support') or ua.role in ('admin', 'support')
        order by lower(u.email)
      `)
    : await sql.unsafe(`
        select
          lower(u.email) as email,
          u.display_name,
          u.role as user_role,
          u.email_verified,
          null::text as account_role
        from public.users u
        where u.role in ('admin', 'support')
        order by lower(u.email)
      `);

  return sortRows(spec, rows.map((row) => normalizeRow(row, spec.columns)));
}

async function createSnapshot(sql, source) {
  const tables = {};
  for (const spec of CORE_TABLE_SPECS) {
    const rows = spec.customSnapshot
      ? await spec.customSnapshot(sql, spec)
      : await snapshotGenericTable(sql, spec);
    const { duplicates } = mapRows(spec, rows);
    if (duplicates.length > 0) {
      throw new Error(`${spec.name} has duplicate core config keys: ${duplicates.slice(0, 5).join("; ")}`);
    }
    tables[spec.name] = rows;
  }

  return {
    schemaVersion: CORE_CONFIG_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source,
    tables,
  };
}

function resolveDatabaseUrl() {
  const databaseUrl =
    process.env.FLOOT_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.DATABASE_PRIVATE_URL;

  if (!databaseUrl) {
    throw new Error("FLOOT_DATABASE_URL, DATABASE_URL, or DATABASE_PRIVATE_URL is required.");
  }

  try {
    new URL(databaseUrl);
  } catch {
    throw new Error("Resolved database URL is not a valid URL.");
  }

  return databaseUrl;
}

function assertLocalDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`Refusing local snapshot from non-local database host: ${url.hostname}`);
  }
  if (process.env.CRP_LOCAL_DEV !== "true") {
    throw new Error("Refusing local snapshot unless CRP_LOCAL_DEV=true.");
  }
}

async function snapshotLocal() {
  const databaseUrl = resolveDatabaseUrl();
  assertLocalDatabaseUrl(databaseUrl);
  const sql = postgres(databaseUrl, { prepare: false, max: 1 });
  try {
    return await createSnapshot(sql, "local");
  } finally {
    await sql.end({ timeout: 1 });
  }
}

async function snapshotCurrentRuntime(source) {
  const databaseUrl = resolveDatabaseUrl();
  const sql = postgres(databaseUrl, { prepare: false, max: 1 });
  try {
    return await createSnapshot(sql, source);
  } finally {
    await sql.end({ timeout: 1 });
  }
}

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Snapshot must be a JSON object.");
  }
  if (snapshot.schemaVersion !== CORE_CONFIG_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported core config schema version ${snapshot.schemaVersion}; expected ${CORE_CONFIG_SCHEMA_VERSION}.`,
    );
  }
  if (!snapshot.tables || typeof snapshot.tables !== "object") {
    throw new Error("Snapshot is missing tables.");
  }

  for (const spec of CORE_TABLE_SPECS) {
    const rows = snapshot.tables[spec.name];
    if (!Array.isArray(rows)) {
      throw new Error(`Snapshot is missing table '${spec.name}'.`);
    }
    const normalizedRows = rows.map((row) => normalizeRow(row, spec.columns));
    const { duplicates } = mapRows(spec, normalizedRows);
    if (duplicates.length > 0) {
      throw new Error(`${spec.name} snapshot has duplicate keys: ${duplicates.slice(0, 5).join("; ")}`);
    }
    snapshot.tables[spec.name] = sortRows(spec, normalizedRows);
  }
}

function diffSnapshots(sourceSnapshot, targetSnapshot) {
  validateSnapshot(sourceSnapshot);
  validateSnapshot(targetSnapshot);

  const tableSummaries = [];
  let hasDrift = false;

  for (const spec of CORE_TABLE_SPECS) {
    const sourceRows = sourceSnapshot.tables[spec.name];
    const targetRows = targetSnapshot.tables[spec.name];
    const source = mapRows(spec, sourceRows);
    const target = mapRows(spec, targetRows);
    const summary = {
      table: spec.name,
      sourceOnly: [],
      targetOnly: [],
      changed: [],
      unchanged: 0,
      duplicateSourceKeys: source.duplicates,
      duplicateTargetKeys: target.duplicates,
    };

    for (const [key, sourceRow] of source.map.entries()) {
      const targetRow = target.map.get(key);
      if (!targetRow) {
        summary.sourceOnly.push(keyLabel(spec, sourceRow));
        continue;
      }
      if (canonicalString(sourceRow) === canonicalString(targetRow)) {
        summary.unchanged += 1;
      } else {
        summary.changed.push(keyLabel(spec, sourceRow));
      }
    }

    for (const [key, targetRow] of target.map.entries()) {
      if (!source.map.has(key)) {
        summary.targetOnly.push(keyLabel(spec, targetRow));
      }
    }

    if (
      summary.sourceOnly.length > 0 ||
      summary.targetOnly.length > 0 ||
      summary.changed.length > 0 ||
      summary.duplicateSourceKeys.length > 0 ||
      summary.duplicateTargetKeys.length > 0
    ) {
      hasDrift = true;
    }

    tableSummaries.push(summary);
  }

  return { hasDrift, tableSummaries };
}

function printDiffSummary(diff, fromLabel = "local", toLabel = "staging") {
  console.log(`Core config diff: ${fromLabel} -> ${toLabel}`);
  for (const summary of diff.tableSummaries) {
    const parts = [
      `${summary.sourceOnly.length} to add`,
      `${summary.changed.length} to update`,
      `${summary.targetOnly.length} ${toLabel}-only`,
      `${summary.unchanged} unchanged`,
    ];
    if (summary.duplicateSourceKeys.length > 0) parts.push(`${summary.duplicateSourceKeys.length} source duplicates`);
    if (summary.duplicateTargetKeys.length > 0) parts.push(`${summary.duplicateTargetKeys.length} target duplicates`);
    console.log(`- ${summary.table}: ${parts.join(", ")}`);

    const examples = [
      ...summary.sourceOnly.slice(0, 2).map((label) => `add ${label}`),
      ...summary.changed.slice(0, 2).map((label) => `update ${label}`),
      ...summary.targetOnly.slice(0, 2).map((label) => `${toLabel}-only ${label}`),
    ];
    if (examples.length > 0) {
      console.log(`  examples: ${examples.join("; ")}`);
    }
  }
  console.log(diff.hasDrift ? "Core config drift detected." : "Core config is aligned.");
}

function buildWhereClause(columns, startIndex = 1) {
  return columns
    .map((column, index) => `${quoteIdentifier(column)} is not distinct from $${startIndex + index}`)
    .join(" and ");
}

async function findGenericRows(sql, spec, row) {
  const values = spec.key.map((column) => row[column]);
  const selectList = spec.columns.map(quoteIdentifier).join(", ");
  const whereClause = buildWhereClause(spec.key);
  const rows = await sql.unsafe(
    `select ${selectList} from ${tableRef(spec)} where ${whereClause} order by ${spec.key.map(quoteIdentifier).join(", ")}`,
    values,
  );
  return rows.map((existing) => normalizeRow(existing, spec.columns));
}

async function insertGenericRow(sql, spec, row) {
  const columns = spec.columns;
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  const values = columns.map((column) => row[column]);
  await sql.unsafe(
    `insert into ${tableRef(spec)} (${columns.map(quoteIdentifier).join(", ")}) values (${placeholders})`,
    values,
  );
}

async function updateGenericRow(sql, spec, row) {
  const updateColumns = spec.columns.filter((column) => !spec.key.includes(column));
  if (updateColumns.length === 0) return;
  const updateAssignments = updateColumns
    .map((column, index) => `${quoteIdentifier(column)} = $${index + 1}`)
    .join(", ");
  const whereClause = buildWhereClause(spec.key, updateColumns.length + 1);
  const values = [
    ...updateColumns.map((column) => row[column]),
    ...spec.key.map((column) => row[column]),
  ];
  await sql.unsafe(`update ${tableRef(spec)} set ${updateAssignments} where ${whereClause}`, values);
}

async function detectTargetDuplicateKeys(sql, spec) {
  if (!LOGICAL_DUPLICATE_CHECK_TABLES.has(spec.name)) {
    return [];
  }

  const keyList = spec.key.map(quoteIdentifier).join(", ");
  const rows = await sql.unsafe(`
    select ${keyList}, count(*)::int as duplicate_count
    from ${tableRef(spec)}
    group by ${keyList}
    having count(*) > 1
    order by ${keyList}
  `);
  return rows.map((row) => keyLabel(spec, row));
}

async function applyGenericTable(sql, spec, sourceRows, options) {
  await assertTableExists(sql, spec);
  const summary = makeApplySummary(spec.name);
  const duplicateTargetKeys = await detectTargetDuplicateKeys(sql, spec);
  if (duplicateTargetKeys.length > 0) {
    summary.errors.push(`Target has duplicate logical keys: ${duplicateTargetKeys.slice(0, 5).join("; ")}`);
    return summary;
  }

  for (const sourceRow of sourceRows) {
    const existingRows = await findGenericRows(sql, spec, sourceRow);
    if (existingRows.length > 1) {
      summary.errors.push(`Target has duplicate rows for ${keyLabel(spec, sourceRow)}`);
      continue;
    }
    if (existingRows.length === 0) {
      summary.inserted += 1;
      if (!options.dryRun) {
        await insertGenericRow(sql, spec, sourceRow);
      }
      continue;
    }
    if (canonicalString(existingRows[0]) === canonicalString(sourceRow)) {
      summary.unchanged += 1;
      continue;
    }
    summary.updated += 1;
    if (!options.dryRun) {
      await updateGenericRow(sql, spec, sourceRow);
    }
  }

  const targetRows = await (spec.customSnapshot ? spec.customSnapshot(sql, spec) : snapshotGenericTable(sql, spec));
  const sourceMap = mapRows(spec, sourceRows).map;
  summary.targetOnly = targetRows
    .filter((row) => !sourceMap.has(keyValue(spec, row)))
    .map((row) => keyLabel(spec, row));

  return summary;
}

function makeApplySummary(table) {
  return {
    table,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    pruned: 0,
    invalidatedSessions: 0,
    targetOnly: [],
    errors: [],
  };
}

async function findStatuteId(sql, row) {
  const rows = await sql`
    select id from public.statute
    where jurisdiction = ${row.statute_jurisdiction}
      and code = ${row.statute_code}
  `;
  return rows[0]?.id ?? null;
}

async function applyStatuteVersion(sql, spec, sourceRows, options) {
  const summary = makeApplySummary(spec.name);
  for (const sourceRow of sourceRows) {
    const statuteId = await findStatuteId(sql, sourceRow);
    if (!statuteId) {
      summary.errors.push(`Missing statute for ${keyLabel(spec, sourceRow)}`);
      continue;
    }

    const existingRows = await sql`
      select
        s.jurisdiction as statute_jurisdiction,
        s.code as statute_code,
        sv.version,
        sv.description,
        sv.response_clock_days,
        sv.effective_date,
        sv.superseded_date,
        sv.source_url,
        sv.section_reference,
        sv.region
      from public.statute_version sv
      join public.statute s on s.id = sv.statute_id
      where sv.statute_id = ${statuteId} and sv.version = ${sourceRow.version}
    `;
    const normalizedExisting = existingRows.map((row) => normalizeRow(row, spec.columns));
    if (normalizedExisting.length === 0) {
      summary.inserted += 1;
      if (!options.dryRun) {
        await sql`
          insert into public.statute_version (
            statute_id,
            version,
            description,
            response_clock_days,
            effective_date,
            superseded_date,
            source_url,
            section_reference,
            region
          ) values (
            ${statuteId},
            ${sourceRow.version},
            ${sourceRow.description},
            ${sourceRow.response_clock_days},
            ${sourceRow.effective_date},
            ${sourceRow.superseded_date},
            ${sourceRow.source_url},
            ${sourceRow.section_reference},
            ${sourceRow.region}
          )
        `;
      }
      continue;
    }
    if (normalizedExisting.length > 1) {
      summary.errors.push(`Duplicate statute versions for ${keyLabel(spec, sourceRow)}`);
      continue;
    }
    if (canonicalString(normalizedExisting[0]) === canonicalString(sourceRow)) {
      summary.unchanged += 1;
      continue;
    }
    summary.updated += 1;
    if (!options.dryRun) {
      await sql`
        update public.statute_version
        set description = ${sourceRow.description},
            response_clock_days = ${sourceRow.response_clock_days},
            effective_date = ${sourceRow.effective_date},
            superseded_date = ${sourceRow.superseded_date},
            source_url = ${sourceRow.source_url},
            section_reference = ${sourceRow.section_reference},
            region = ${sourceRow.region}
        where statute_id = ${statuteId} and version = ${sourceRow.version}
      `;
    }
  }

  const targetRows = await snapshotStatuteVersion(sql, spec);
  const sourceMap = mapRows(spec, sourceRows).map;
  summary.targetOnly = targetRows
    .filter((row) => !sourceMap.has(keyValue(spec, row)))
    .map((row) => keyLabel(spec, row));
  return summary;
}

async function findStatuteVersionId(sql, row) {
  const rows = await sql`
    select sv.id
    from public.statute_version sv
    join public.statute s on s.id = sv.statute_id
    where s.jurisdiction = ${row.statute_jurisdiction}
      and s.code = ${row.statute_code}
      and sv.version = ${row.statute_version}
  `;
  return rows[0]?.id ?? null;
}

async function applyDisclosureRequirement(sql, spec, sourceRows, options) {
  const summary = makeApplySummary(spec.name);
  for (const sourceRow of sourceRows) {
    const statuteVersionId = await findStatuteVersionId(sql, sourceRow);
    if (!statuteVersionId) {
      summary.errors.push(`Missing statute version for ${keyLabel(spec, sourceRow)}`);
      continue;
    }

    const existingRows = await sql`
      select
        s.jurisdiction as statute_jurisdiction,
        s.code as statute_code,
        sv.version as statute_version,
        dr.category,
        dr.requirement_code,
        dr.field_path,
        dr.description,
        dr.section_reference,
        dr.severity,
        dr.metadata
      from public.disclosure_requirement dr
      join public.statute_version sv on sv.id = dr.statute_version_id
      join public.statute s on s.id = sv.statute_id
      where dr.statute_version_id = ${statuteVersionId}
        and dr.category = ${sourceRow.category}
        and dr.requirement_code = ${sourceRow.requirement_code}
    `;
    const normalizedExisting = existingRows.map((row) => normalizeRow(row, spec.columns));
    if (normalizedExisting.length === 0) {
      summary.inserted += 1;
      if (!options.dryRun) {
        await sql`
          insert into public.disclosure_requirement (
            statute_version_id,
            category,
            requirement_code,
            field_path,
            description,
            section_reference,
            severity,
            metadata
          ) values (
            ${statuteVersionId},
            ${sourceRow.category},
            ${sourceRow.requirement_code},
            ${sourceRow.field_path},
            ${sourceRow.description},
            ${sourceRow.section_reference},
            ${sourceRow.severity},
            ${sourceRow.metadata}
          )
        `;
      }
      continue;
    }
    if (normalizedExisting.length > 1) {
      summary.errors.push(`Duplicate disclosure requirements for ${keyLabel(spec, sourceRow)}`);
      continue;
    }
    if (canonicalString(normalizedExisting[0]) === canonicalString(sourceRow)) {
      summary.unchanged += 1;
      continue;
    }
    summary.updated += 1;
    if (!options.dryRun) {
      await sql`
        update public.disclosure_requirement
        set field_path = ${sourceRow.field_path},
            description = ${sourceRow.description},
            section_reference = ${sourceRow.section_reference},
            severity = ${sourceRow.severity},
            metadata = ${sourceRow.metadata}
        where statute_version_id = ${statuteVersionId}
          and category = ${sourceRow.category}
          and requirement_code = ${sourceRow.requirement_code}
      `;
    }
  }

  const targetRows = await snapshotDisclosureRequirement(sql, spec);
  const sourceMap = mapRows(spec, sourceRows).map;
  summary.targetOnly = targetRows
    .filter((row) => !sourceMap.has(keyValue(spec, row)))
    .map((row) => keyLabel(spec, row));
  return summary;
}

async function applyPrivilegedUserRoles(sql, spec, sourceRows, options) {
  const summary = makeApplySummary(spec.name);
  const hasUserAccount = await tableExists(sql, "user_account");
  const sourceByEmail = mapRows(spec, sourceRows).map;

  for (const sourceRow of sourceRows) {
    const users = await sql`
      select id, lower(email) as email, display_name, role as user_role, email_verified
      from public.users
      where lower(email) = ${sourceRow.email}
    `;
    if (users.length === 0) {
      summary.errors.push(`Missing target user for privileged role: ${sourceRow.email}`);
      continue;
    }
    if (users.length > 1) {
      summary.errors.push(`Duplicate target users for privileged role: ${sourceRow.email}`);
      continue;
    }

    let accountRole = null;
    let accountRows = [];
    if (hasUserAccount) {
      accountRows = await sql`
        select id, role as account_role
        from public.user_account
        where user_id = ${users[0].id}
      `;
      if (accountRows.length === 0) {
        summary.errors.push(`Missing user_account row for privileged role: ${sourceRow.email}`);
        continue;
      }
      if (accountRows.length > 1) {
        summary.errors.push(`Duplicate user_account rows for privileged role: ${sourceRow.email}`);
        continue;
      }
      accountRole = accountRows[0].account_role;
    }

    const existing = normalizeRow(
      {
        email: users[0].email,
        display_name: users[0].display_name,
        user_role: users[0].user_role,
        email_verified: users[0].email_verified,
        account_role: accountRole,
      },
      spec.columns,
    );

    if (canonicalString(existing) === canonicalString(sourceRow)) {
      summary.unchanged += 1;
      continue;
    }

    summary.updated += 1;
    if (!options.dryRun) {
      await sql`
        update public.users
        set display_name = ${sourceRow.display_name},
            role = ${sourceRow.user_role},
            email_verified = ${sourceRow.email_verified}
        where id = ${users[0].id}
      `;
      if (hasUserAccount) {
        await sql`
          update public.user_account
          set role = ${sourceRow.account_role}
          where id = ${accountRows[0].id}
        `;
      }
      const deletedSessions = await sql`delete from public.sessions where user_id = ${users[0].id} returning id`;
      summary.invalidatedSessions += deletedSessions.length;
    } else {
      const sessions = await sql`select count(*)::int as count from public.sessions where user_id = ${users[0].id}`;
      summary.invalidatedSessions += sessions[0]?.count ?? 0;
    }
  }

  const targetPrivilegedRows = await snapshotPrivilegedUserRoles(sql, spec);
  for (const targetRow of targetPrivilegedRows) {
    if (sourceByEmail.has(keyValue(spec, targetRow))) {
      continue;
    }

    const users = await sql`
      select id from public.users
      where lower(email) = ${targetRow.email}
    `;
    if (users.length !== 1) {
      summary.errors.push(`Cannot prune target-only privileged role for ${targetRow.email}`);
      continue;
    }

    summary.pruned += 1;
    summary.targetOnly.push(keyLabel(spec, targetRow));
    if (!options.dryRun) {
      await sql`
        update public.users
        set role = ${DEFAULT_STAGING_ONLY_ROLE}
        where id = ${users[0].id}
      `;
      if (hasUserAccount) {
        await sql`
          update public.user_account
          set role = ${DEFAULT_STAGING_ONLY_ROLE}
          where user_id = ${users[0].id}
        `;
      }
      const deletedSessions = await sql`delete from public.sessions where user_id = ${users[0].id} returning id`;
      summary.invalidatedSessions += deletedSessions.length;
    } else {
      const sessions = await sql`select count(*)::int as count from public.sessions where user_id = ${users[0].id}`;
      summary.invalidatedSessions += sessions[0]?.count ?? 0;
    }
  }

  return summary;
}

async function applySnapshot(sql, snapshot, options) {
  validateSnapshot(snapshot);
  const summaries = [];
  for (const spec of CORE_TABLE_SPECS) {
    const sourceRows = snapshot.tables[spec.name];
    const summary = spec.customApply
      ? await spec.customApply(sql, spec, sourceRows, options)
      : await applyGenericTable(sql, spec, sourceRows, options);
    summaries.push(summary);
  }
  return summaries;
}

function hasApplyErrors(summaries) {
  return summaries.some((summary) => summary.errors.length > 0);
}

function printApplySummary(summaries, dryRun) {
  console.log(`Core config ${dryRun ? "dry-run" : "apply"} summary:`);
  for (const summary of summaries) {
    const parts = [
      `${summary.inserted} insert`,
      `${summary.updated} update`,
      `${summary.unchanged} unchanged`,
      `${summary.targetOnly.length} target-only`,
    ];
    if (summary.pruned) parts.push(`${summary.pruned} privilege pruned`);
    if (summary.invalidatedSessions) parts.push(`${summary.invalidatedSessions} sessions invalidated`);
    if (summary.errors.length) parts.push(`${summary.errors.length} errors`);
    console.log(`- ${summary.table}: ${parts.join(", ")}`);
    if (summary.targetOnly.length > 0) {
      console.log(`  target-only examples: ${summary.targetOnly.slice(0, 3).join("; ")}`);
    }
    if (summary.errors.length > 0) {
      console.log(`  errors: ${summary.errors.slice(0, 3).join("; ")}`);
    }
  }
}

async function writeApplyAudit(sql, snapshot, summaries) {
  if (!(await tableExists(sql, "audit_log"))) {
    return;
  }
  const details = {
    action: "CORE_CONFIG_APPLY_STAGING",
    schemaVersion: snapshot.schemaVersion,
    source: snapshot.source,
    generatedAt: snapshot.generatedAt,
    tables: summaries.map((summary) => ({
      table: summary.table,
      inserted: summary.inserted,
      updated: summary.updated,
      pruned: summary.pruned,
      targetOnly: summary.targetOnly.length,
      invalidatedSessions: summary.invalidatedSessions,
    })),
  };
  await sql`
    insert into public.audit_log (
      action_type,
      entity_type,
      entity_id,
      user_id,
      details,
      status,
      error_message,
      region
    ) values (
      'SYSTEM_CHANGE',
      'SYSTEM',
      null,
      null,
      ${details},
      'SUCCESS',
      null,
      'CA'
    )
  `;
}

async function applySnapshotToCurrentRuntime(snapshot, options) {
  const databaseUrl = resolveDatabaseUrl();
  const sql = postgres(databaseUrl, { prepare: false, max: 1 });
  try {
    if (options.dryRun) {
      return await applySnapshot(sql, snapshot, options);
    }

    let summaries = [];
    await sql.begin(async (tx) => {
      summaries = await applySnapshot(tx, snapshot, options);
      if (hasApplyErrors(summaries)) {
        throw new Error("Core config apply stopped because validation errors were found.");
      }
      await writeApplyAudit(tx, snapshot, summaries);
    });
    return summaries;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

function ensureInsideWorkspace(localPath) {
  const resolved = path.resolve(localPath);
  const workspace = path.resolve(".");
  if (!resolved.startsWith(`${workspace}${path.sep}`) && resolved !== workspace) {
    throw new Error(`Refusing to write outside this workspace: ${resolved}`);
  }
  return resolved;
}

function defaultSnapshotPath(target) {
  return path.join(DEFAULT_OUTPUT_DIR, `core-config.${target}.json`);
}

function writeSnapshotFile(snapshot, outputPath) {
  const resolved = ensureInsideWorkspace(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return resolved;
}

function readSnapshotFile(inputPath) {
  const resolved = path.resolve(inputPath);
  const snapshot = JSON.parse(fs.readFileSync(resolved, "utf8"));
  validateSnapshot(snapshot);
  return snapshot;
}

function normalizePrivateKeyValue(value) {
  const trimmed = value.trim().replace(/\r/g, "");
  if (/-----BEGIN [A-Z0-9 ]+PRIVATE KEY-----/.test(trimmed)) {
    return trimmed.replace(/\\n/g, "\n");
  }

  if (/^[A-Za-z0-9+/=_-]+$/.test(trimmed)) {
    try {
      const decoded = Buffer.from(trimmed, "base64").toString("utf8").trim().replace(/\r/g, "");
      if (/-----BEGIN [A-Z0-9 ]+PRIVATE KEY-----/.test(decoded)) {
        return decoded;
      }
    } catch {
      // Fall through to the raw value.
    }
  }

  return value.replace(/\r/g, "").replace(/\\n/g, "\n");
}

function getCurrentWindowsUser() {
  return process.env.USERDOMAIN && process.env.USERNAME
    ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}`
    : os.userInfo().username;
}

function hardenPrivateKeyFile(keyPath) {
  try {
    fs.chmodSync(keyPath, 0o600);
  } catch {
    // Windows ACL hardening is handled below.
  }

  if (process.platform !== "win32") {
    return;
  }

  const removeInheritance = spawnSync("icacls", [keyPath, "/inheritance:r"], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (removeInheritance.status !== 0) {
    throw new Error(`Failed to harden SSH key ACL inheritance: ${removeInheritance.stderr || removeInheritance.stdout}`);
  }

  const grantCurrentUser = spawnSync("icacls", [keyPath, "/grant:r", `${getCurrentWindowsUser()}:R`], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (grantCurrentUser.status !== 0) {
    throw new Error(`Failed to grant current user SSH key read permission: ${grantCurrentUser.stderr || grantCurrentUser.stdout}`);
  }
}

function removeGeneratedSshKeyFile(keyFile, outputDir) {
  const resolvedKey = path.resolve(keyFile);
  const resolvedOutput = path.resolve(outputDir);
  if (!resolvedKey.startsWith(`${resolvedOutput}${path.sep}`)) {
    return;
  }
  if (!path.basename(resolvedKey).startsWith("core_config_staging_ssh_key_")) {
    return;
  }

  try {
    fs.unlinkSync(resolvedKey);
    return;
  } catch (error) {
    if (process.platform !== "win32") {
      throw error;
    }
  }

  const grantCurrentUser = spawnSync("icacls", [resolvedKey, "/grant:r", `${getCurrentWindowsUser()}:F`], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (grantCurrentUser.status !== 0) {
    throw new Error(`Failed to unlock generated SSH key for cleanup: ${grantCurrentUser.stderr || grantCurrentUser.stdout}`);
  }

  fs.unlinkSync(resolvedKey);
}

function resolveSshKeyFile(outputDir) {
  const key = process.env.STAGING_SSH_PRIVATE_KEY;
  if (!key) return null;
  if (fs.existsSync(key)) {
    return path.resolve(key);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const keyPath = path.join(outputDir, `core_config_staging_ssh_key_${process.pid}_${Date.now()}`);
  const keyContents = normalizePrivateKeyValue(key);
  fs.writeFileSync(keyPath, keyContents.endsWith("\n") ? keyContents : `${keyContents}\n`, { mode: 0o600 });
  hardenPrivateKeyFile(keyPath);
  return keyPath;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\"'\"'")}'`;
}

function buildRemoteCommand(options, remoteSubcommand, confirm) {
  const args = [remoteSubcommand];
  if (confirm) args.push("--confirm");
  const argText = args.map(shellQuote).join(" ");
  return `
set -e
APP_DIR=${shellQuote(options.remoteAppDir)}
APP_CONTAINER=${shellQuote(options.remoteAppContainer)}
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -Fx "$APP_CONTAINER" >/dev/null 2>&1; then
  exec docker exec -i "$APP_CONTAINER" node scripts/core-config.mjs ${argText}
fi
cd "$APP_DIR"
exec node scripts/core-config.mjs ${argText}
`.trim();
}

async function runRemoteCoreConfig(options, remoteSubcommand, input = "") {
  const host = process.env.STAGING_HOST;
  const user = process.env.STAGING_USER;
  const port = process.env.STAGING_SSH_PORT || "22";
  const outputDir = ensureInsideWorkspace(DEFAULT_OUTPUT_DIR);
  const keyFile = resolveSshKeyFile(outputDir);

  if (!host || !user || !keyFile) {
    throw new Error("Staging SSH requires STAGING_HOST, STAGING_USER, and STAGING_SSH_PRIVATE_KEY.");
  }

  const args = [
    "-i",
    keyFile,
    "-p",
    String(port),
    "-o",
    "BatchMode=yes",
    "-o",
    "IdentitiesOnly=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    `${user}@${host}`,
    buildRemoteCommand(options, remoteSubcommand, options.confirm),
  ];

  try {
    return await new Promise((resolve, reject) => {
      const child = spawn("ssh", args, { stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }
        reject(new Error(`ssh exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
      });

      if (input) {
        child.stdin.write(input);
      }
      child.stdin.end();
    });
  } finally {
    removeGeneratedSshKeyFile(keyFile, outputDir);
  }
}

async function snapshotStaging(options) {
  const result = await runRemoteCoreConfig(options, "remote-snapshot");
  if (result.stderr.trim()) {
    process.stderr.write(result.stderr);
  }
  const snapshot = JSON.parse(result.stdout);
  validateSnapshot(snapshot);
  return snapshot;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function commandExport(options) {
  const snapshot = options.target === "staging" ? await snapshotStaging(options) : await snapshotLocal();
  const output = options.output || defaultSnapshotPath(options.target);
  const resolved = writeSnapshotFile(snapshot, output);
  console.log(`Exported ${options.target} core config snapshot to ${resolved}`);
}

async function commandDiff(options) {
  const localSnapshot = await snapshotLocal();
  const stagingSnapshot = await snapshotStaging(options);
  const diff = diffSnapshots(localSnapshot, stagingSnapshot);
  printDiffSummary(diff, "local", "staging");
  if (diff.hasDrift && !options.allowDrift) {
    process.exitCode = 1;
  }
}

async function commandApplyStaging(options) {
  const snapshot = options.from ? readSnapshotFile(options.from) : await snapshotLocal();
  const result = await runRemoteCoreConfig(options, "remote-apply", `${JSON.stringify(snapshot)}\n`);
  if (result.stderr.trim()) {
    process.stderr.write(result.stderr);
  }
  process.stdout.write(result.stdout);
}

async function commandRemoteSnapshot() {
  const snapshot = await snapshotCurrentRuntime("staging");
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
}

async function commandRemoteApply(options) {
  const input = await readStdin();
  if (!input.trim()) {
    throw new Error("remote-apply requires a snapshot JSON document on stdin.");
  }
  const snapshot = JSON.parse(input);
  validateSnapshot(snapshot);
  const summaries = await applySnapshotToCurrentRuntime(snapshot, { dryRun: !options.confirm });
  printApplySummary(summaries, !options.confirm);
  if (!options.confirm) {
    console.log("Dry run only. Re-run apply-staging with --confirm to modify staging.");
  }
  if (hasApplyErrors(summaries)) {
    process.exitCode = 1;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "help" || options.command === "--help") {
    usage();
    return;
  }

  if (options.command === "export") {
    await commandExport(options);
    return;
  }
  if (options.command === "diff" || options.command === "verify") {
    await commandDiff(options);
    return;
  }
  if (options.command === "apply-staging") {
    await commandApplyStaging(options);
    return;
  }
  if (options.command === "remote-snapshot") {
    await commandRemoteSnapshot();
    return;
  }
  if (options.command === "remote-apply") {
    await commandRemoteApply(options);
    return;
  }

  fail(`unknown command '${options.command}'`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
