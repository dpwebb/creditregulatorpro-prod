import "../loadEnv.js";

import postgres from "postgres";

import {
  buildMachineEvidence,
  writeMachineEvidenceOutputs,
} from "./lib/productionEvidenceSchema.mjs";
import {
  buildAttestedMachineProofReport,
  isMain,
  parseMachineProofArgs,
} from "./lib/machineProofScript.mjs";
import { machineProofBlockerIdForConfig } from "./lib/productionMachineProofPolicy.mjs";
import { findSensitiveEvidenceValues } from "./lib/sanitizeProductionEvidence.mjs";

export const RAW_REPORT_MACHINE_PROOF_JSON_PATH = "docs/production-scale/evidence/latest-storage-raw-report-machine-proof.json";
export const RAW_REPORT_MACHINE_PROOF_MD_PATH = "docs/production-scale/evidence/latest-storage-raw-report-machine-proof.md";
export const RAW_REPORT_MACHINE_PROOF_EVIDENCE_TYPE = "RAW_REPORT_BYTE_REMEDIATION_MACHINE_PROOF";
export const RAW_REPORT_DATABASE_ACCESS_INPUT = "CRP_RAW_REPORT_DATABASE_ACCESS";
export const RAW_REPORT_MACHINE_PROOF_RUNTIME_INPUTS = [
  RAW_REPORT_DATABASE_ACCESS_INPUT,
  "CRP_RAW_REPORT_MACHINE_REMEDIATION_ATTESTATION_JSON",
];

const RAW_REPORT_DATABASE_URL_ENV_NAMES = [
  "FLOOT_DATABASE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "CRP_DATABASE_URL",
  "VITE_DATABASE_URL",
];

export const RAW_REPORT_MACHINE_PROOF_CONFIG = {
  title: "Raw Report Byte Remediation Machine Proof",
  evidenceType: RAW_REPORT_MACHINE_PROOF_EVIDENCE_TYPE,
  jsonPath: RAW_REPORT_MACHINE_PROOF_JSON_PATH,
  markdownPath: RAW_REPORT_MACHINE_PROOF_MD_PATH,
  generatorScript: "scripts/storage-raw-report-machine-proof.mjs",
  command: "pnpm run storage:raw-report-machine-proof",
  attestationEnv: "CRP_RAW_REPORT_MACHINE_REMEDIATION_ATTESTATION_JSON",
  productionMutation: "none",
  blockerIdsClosedWhenCertifying: ["L10-P1-004"],
  requiredChecks: [
    "db-connectivity-reliable",
    "sanitized-inventory-accepted",
    "remediation-policy-verified",
    "unresolved-count-zero-or-policy-accepted",
    "remediated-count-recorded",
    "opaque-hashes-only",
    "no-raw-bytes-or-pii-printed",
    "rollback-recovery-notes-recorded",
  ],
};

function envValue(env, name) {
  const value = env?.[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildDatabaseUrlFromParts(env) {
  const host = envValue(env, "DB_HOST");
  const database = envValue(env, "DB_NAME") ?? envValue(env, "POSTGRES_DB");
  const user = envValue(env, "DB_USER") ?? envValue(env, "POSTGRES_USER");
  const password = envValue(env, "DB_PASSWORD") ?? envValue(env, "POSTGRES_PASSWORD");
  if (!host || !database || !user) return null;
  const port = envValue(env, "DB_PORT") ?? "5432";
  const credentials = password
    ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
    : encodeURIComponent(user);
  return {
    sourceName: "DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD",
    url: `postgresql://${credentials}@${host}:${port}/${database}`,
  };
}

export function resolveRawReportDatabaseAccess(env = process.env) {
  for (const name of RAW_REPORT_DATABASE_URL_ENV_NAMES) {
    const url = envValue(env, name);
    if (url) return { sourceName: name, url };
  }
  return buildDatabaseUrlFromParts(env);
}

function numericCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function makeOpaqueHash(value) {
  return `raw-report-count-${String(value).padStart(8, "0")}`;
}

async function queryRawReportTable(sql, tableName) {
  try {
    const rows = await sql`
      select
        count(*)::int as total_records,
        count(*) filter (
          where storage_url ~ '^(data:|[A-Za-z0-9+/]{80,}={0,2}$|JVBERi0)'
        )::int as unresolved_raw_byte_count,
        count(*) filter (
          where storage_url is not null
            and storage_url !~ '^(data:|[A-Za-z0-9+/]{80,}={0,2}$|JVBERi0)'
        )::int as remediated_count
      from ${sql(tableName)}
    `;
    const row = rows[0] ?? {};
    return {
      tableName,
      available: true,
      totalRecords: numericCount(row.total_records),
      unresolvedRawByteCount: numericCount(row.unresolved_raw_byte_count),
      remediatedCount: numericCount(row.remediated_count),
    };
  } catch (error) {
    return {
      tableName,
      available: false,
      totalRecords: 0,
      unresolvedRawByteCount: 0,
      remediatedCount: 0,
      errorCode: error?.code ?? "query-failed",
    };
  }
}

export async function collectRawReportStorageInventory({ databaseUrl }) {
  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 5,
    connect_timeout: 10,
    onnotice: () => {},
  });

  try {
    await sql`select 1`;
    const tables = await Promise.all([
      queryRawReportTable(sql, "report_artifact"),
      queryRawReportTable(sql, "evidence_attachment"),
    ]);
    const unavailableTables = tables.filter((table) => !table.available);
    const totalRecordsInspected = tables.reduce((sum, table) => sum + table.totalRecords, 0);
    const unresolvedRawByteCount = tables.reduce((sum, table) => sum + table.unresolvedRawByteCount, 0);
    const remediatedCount = tables.reduce((sum, table) => sum + table.remediatedCount, 0);
    return {
      dbConnectivity: unavailableTables.length === 0 ? "reliable" : "unreliable",
      inventoryMethod: "read-only-aggregate-storage-url-scan",
      tableCounts: tables.map((table) => ({
        tableName: table.tableName,
        available: table.available,
        totalRecords: table.totalRecords,
        unresolvedRawByteCount: table.unresolvedRawByteCount,
        remediatedCount: table.remediatedCount,
        ...(table.errorCode ? { errorCode: table.errorCode } : {}),
      })),
      totalRecordsInspected,
      unresolvedRawByteCount,
      remediatedCount,
      opaqueSampleHashes: unresolvedRawByteCount > 0 ? [makeOpaqueHash(unresolvedRawByteCount)] : [],
    };
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

function rawReportChecks({ dbConnectivity, unresolvedRawByteCount, sensitiveFindingCount }) {
  const dbReliable = dbConnectivity === "reliable";
  const remediationSatisfied = dbReliable && unresolvedRawByteCount === 0 && sensitiveFindingCount === 0;
  return [
    {
      name: "db-connectivity-reliable",
      status: dbReliable ? "pass" : "fail",
      summary: dbReliable ? "Database connectivity was reliable." : "Reliable database connectivity was unavailable.",
    },
    {
      name: "sanitized-inventory-accepted",
      status: dbReliable && sensitiveFindingCount === 0 ? "pass" : "fail",
      summary: dbReliable ? "Only sanitized aggregate inventory fields were emitted." : "Sanitized inventory could not be accepted.",
    },
    {
      name: "remediation-policy-verified",
      status: remediationSatisfied ? "pass" : "fail",
      summary: remediationSatisfied ? "Remediation policy is satisfied." : "Remediation policy is not yet satisfied.",
    },
    {
      name: "unresolved-count-zero-or-policy-accepted",
      status: dbReliable && unresolvedRawByteCount === 0 ? "pass" : "fail",
      summary: dbReliable && unresolvedRawByteCount === 0
        ? "No unresolved raw byte records were found."
        : "Unresolved raw byte records remain or could not be measured.",
    },
    {
      name: "remediated-count-recorded",
      status: dbReliable ? "pass" : "fail",
      summary: dbReliable ? "Remediated count was recorded." : "Remediated count could not be recorded.",
    },
    {
      name: "opaque-hashes-only",
      status: sensitiveFindingCount === 0 ? "pass" : "fail",
      summary: sensitiveFindingCount === 0 ? "Only opaque hashes/counts were emitted." : "Sensitive-looking values were detected.",
    },
    {
      name: "no-raw-bytes-or-pii-printed",
      status: sensitiveFindingCount === 0 ? "pass" : "fail",
      summary: sensitiveFindingCount === 0 ? "No sensitive-looking raw values were detected." : "Sensitive-looking output was rejected.",
    },
    {
      name: "rollback-recovery-notes-recorded",
      status: dbReliable ? "pass" : "fail",
      summary: dbReliable
        ? "Rollback/recovery notes recorded: read-only proof, no production mutation."
        : "Rollback/recovery notes could not be certified without reliable inventory.",
    },
  ];
}

export function buildRawReportMachineProofEvidence({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  env = process.env,
  inventory = null,
  dbAccess = null,
  failure = null,
} = {}) {
  const dbConnectivity = inventory?.dbConnectivity ?? "unavailable";
  const unresolvedRawByteCount = numericCount(inventory?.unresolvedRawByteCount);
  const totalRecordsInspected = numericCount(inventory?.totalRecordsInspected);
  const remediatedCount = numericCount(inventory?.remediatedCount);
  const databaseReliable = dbConnectivity === "reliable";
  const missingRuntimeInputs = databaseReliable ? [] : RAW_REPORT_MACHINE_PROOF_RUNTIME_INPUTS;
  const metadata = {
    blockerIdsClosedWhenCertifying: RAW_REPORT_MACHINE_PROOF_CONFIG.blockerIdsClosedWhenCertifying,
    dbConnectivity,
    databaseReliable,
    databaseUrlSource: dbAccess?.sourceName ?? null,
    rawConnectionDetailsStored: false,
    inventoryMethod: inventory?.inventoryMethod ?? "not-run",
    totalRecordsInspected,
    unresolvedRawByteCount,
    remediatedCount,
    opaqueSampleHashes: Array.isArray(inventory?.opaqueSampleHashes) ? inventory.opaqueSampleHashes : [],
    remediationSatisfied: databaseReliable && unresolvedRawByteCount === 0,
    dryRunOnlyRemediationCompletion: false,
    tableCounts: Array.isArray(inventory?.tableCounts) ? inventory.tableCounts : [],
    sanitizerResult: {
      rawReportBytesPrinted: false,
      piiPrinted: false,
      signedUrlsPrinted: false,
      secretsPrinted: false,
    },
  };
  const sensitiveFindings = findSensitiveEvidenceValues(metadata);
  const checks = rawReportChecks({
    dbConnectivity,
    unresolvedRawByteCount,
    sensitiveFindingCount: sensitiveFindings.length,
  });
  const failures = [];
  if (!databaseReliable) {
    failures.push({
      code: failure?.code ?? "raw-report-db-access-missing",
      message: failure?.message ?? "Reliable non-interactive database access is unavailable for raw report byte inventory.",
    });
  }
  if (databaseReliable && unresolvedRawByteCount > 0) {
    failures.push({
      code: "raw-report-unresolved-raw-bytes",
      message: "Reliable inventory found unresolved raw report byte persistence records.",
    });
  }
  if (sensitiveFindings.length > 0) {
    failures.push({
      code: "raw-report-sensitive-value",
      message: "Raw report machine proof metadata contains sensitive-looking values.",
    });
  }

  const certifying = databaseReliable && unresolvedRawByteCount === 0 && failures.length === 0;
  return buildMachineEvidence({
    rootDir,
    evidenceType: RAW_REPORT_MACHINE_PROOF_EVIDENCE_TYPE,
    blockerId: machineProofBlockerIdForConfig(RAW_REPORT_MACHINE_PROOF_CONFIG),
    generatedAt,
    commitHash: env.CRP_MACHINE_EVIDENCE_COMMIT_HASH ?? null,
    generatorScript: RAW_REPORT_MACHINE_PROOF_CONFIG.generatorScript,
    command: RAW_REPORT_MACHINE_PROOF_CONFIG.command,
    productionMutation: RAW_REPORT_MACHINE_PROOF_CONFIG.productionMutation,
    status: certifying ? "pass" : "fail",
    certifying,
    checks,
    failures,
    missingRuntimeInputs,
    sanitizedArtifacts: [
      { path: RAW_REPORT_MACHINE_PROOF_JSON_PATH, type: "machine-proof-output" },
      { path: RAW_REPORT_MACHINE_PROOF_MD_PATH, type: "machine-proof-output" },
    ],
    metadata,
  });
}

export async function buildRawReportMachineProofReport({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  env = process.env,
  argv = [],
} = {}) {
  const options = argv.length > 0 ? parseMachineProofArgs(argv) : { rootDir, attestationPath: null };
  const resolvedRootDir = argv.length > 0 ? options.rootDir : rootDir;
  const attestationPath = options.attestationPath ?? env[RAW_REPORT_MACHINE_PROOF_CONFIG.attestationEnv] ?? null;
  if (attestationPath) {
    return buildAttestedMachineProofReport(RAW_REPORT_MACHINE_PROOF_CONFIG, {
      rootDir: resolvedRootDir,
      generatedAt,
      env,
      attestationPath,
    });
  }

  const dbAccess = resolveRawReportDatabaseAccess(env);
  if (!dbAccess) {
    return buildRawReportMachineProofEvidence({
      rootDir: resolvedRootDir,
      generatedAt,
      env,
      failure: {
        code: "raw-report-db-access-missing",
        message: "No supported non-interactive database access input is configured.",
      },
    });
  }

  try {
    const inventory = await collectRawReportStorageInventory({ databaseUrl: dbAccess.url });
    return buildRawReportMachineProofEvidence({
      rootDir: resolvedRootDir,
      generatedAt,
      env,
      inventory,
      dbAccess: { sourceName: dbAccess.sourceName },
      failure: inventory.dbConnectivity === "reliable"
        ? null
        : {
            code: "raw-report-db-unreliable",
            message: "Database was reachable but required raw-report inventory tables were unavailable or unreliable.",
          },
    });
  } catch {
    return buildRawReportMachineProofEvidence({
      rootDir: resolvedRootDir,
      generatedAt,
      env,
      dbAccess: { sourceName: dbAccess.sourceName },
      failure: {
        code: "raw-report-db-unavailable",
        message: "Configured database access could not be used for reliable raw-report inventory.",
      },
    });
  }
}

export async function runRawReportMachineProofCli(argv = process.argv.slice(2)) {
  const options = parseMachineProofArgs(argv);
  const report = await buildRawReportMachineProofReport({
    rootDir: options.rootDir,
    env: process.env,
    argv,
  });
  let outputs = null;
  if (options.writeEvidence) {
    outputs = writeMachineEvidenceOutputs(report, {
      rootDir: options.rootDir,
      jsonPath: RAW_REPORT_MACHINE_PROOF_CONFIG.jsonPath,
      markdownPath: RAW_REPORT_MACHINE_PROOF_CONFIG.markdownPath,
      title: RAW_REPORT_MACHINE_PROOF_CONFIG.title,
    });
  }
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`${RAW_REPORT_MACHINE_PROOF_CONFIG.title} generated.`);
    if (outputs) {
      console.log(`Markdown: ${outputs.markdownPath}`);
      console.log(`JSON: ${outputs.jsonPath}`);
    }
    console.log(`CERTIFYING:${report.certifying ? "true" : "false"}`);
    if (report.missingRuntimeInputs.length) {
      console.log(`Missing machine input: ${report.missingRuntimeInputs.join(", ")}`);
    }
  }
  if (!report.certifying) process.exitCode = 1;
}

if (isMain(import.meta.url)) {
  runRawReportMachineProofCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
