import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sql } from "kysely";

import { db } from "../helpers/db";

export const DEFAULT_STORAGE_RAW_REPORT_INVENTORY_EVIDENCE_DIR = "docs/production-scale/evidence";
export const STORAGE_RAW_REPORT_INVENTORY_MD_PATH =
  "docs/production-scale/evidence/latest-storage-raw-report-inventory.md";
export const STORAGE_RAW_REPORT_INVENTORY_JSON_PATH =
  "docs/production-scale/evidence/latest-storage-raw-report-inventory.json";

const PRODUCTION_ENV_KEYS = ["NODE_ENV", "CRP_ENV", "FLOOT_ENV", "APP_ENV", "VERCEL_ENV", "DEPLOYMENT_ENV", "ENVIRONMENT"];
const PRODUCTION_SECRET_KEYS = ["FLOOT_DATABASE_URL", "DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "CRP_DATABASE_URL"];

export type StorageInventoryCounts = {
  totalRows: number;
  storageUrlRows: number;
  localReferenceRows: number;
  possibleInlineBase64Rows: number;
  dataUrlBase64Rows: number;
  nonLocalReferenceRows: number;
  nullStorageRows: number;
};

export type StorageRawReportInventoryValidation = {
  accepted: boolean;
  certifying: boolean;
  status: "accepted-reliable-inventory" | "failed";
  errors: string[];
  sensitiveFindings: string[];
};

type RawCountRow = {
  totalRows: number | string | bigint | null;
  storageUrlRows: number | string | bigint | null;
  localReferenceRows: number | string | bigint | null;
  possibleInlineBase64Rows: number | string | bigint | null;
  dataUrlBase64Rows: number | string | bigint | null;
  nonLocalReferenceRows: number | string | bigint | null;
  nullStorageRows: number | string | bigint | null;
};

function normalizeRelativePath(value: string) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir: string, relativePath: string) {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
}

function safeGit(args: string[], rootDir: string, fallback = "unknown") {
  try {
    const output = execFileSync("git", args, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return output.length > 0 ? output : fallback;
  } catch {
    return fallback;
  }
}

function countValue(value: RawCountRow[keyof RawCountRow]) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCounts(row: RawCountRow | undefined): StorageInventoryCounts {
  return {
    totalRows: countValue(row?.totalRows),
    storageUrlRows: countValue(row?.storageUrlRows),
    localReferenceRows: countValue(row?.localReferenceRows),
    possibleInlineBase64Rows: countValue(row?.possibleInlineBase64Rows),
    dataUrlBase64Rows: countValue(row?.dataUrlBase64Rows),
    nonLocalReferenceRows: countValue(row?.nonLocalReferenceRows),
    nullStorageRows: countValue(row?.nullStorageRows),
  };
}

function resolveInventoryEnvironment(env: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  const value = String(
    env.CRP_ENV ?? env.APP_ENV ?? env.DEPLOYMENT_ENV ?? env.ENVIRONMENT ?? env.NODE_ENV ?? "local"
  )
    .trim()
    .toLowerCase();
  if (value === "stage") return "staging";
  if (value === "prod") return "production";
  return value || "local";
}

export function scanStorageRawReportInventorySensitiveContent(text: string) {
  const findings: string[] = [];
  const patterns: Array<[string, RegExp]> = [
    ["database-url", /\b(?:postgres|postgresql|mysql|mongodb):\/\/[^\s)]+/i],
    ["private-key-block", /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i],
    ["api-token", /\b(?:sk|ghp|github_pat|xox[baprs])[_-][A-Za-z0-9_-]{12,}\b/i],
    ["bearer-token", /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/i],
    ["access-key", /\bAKIA[0-9A-Z]{16}\b/i],
    ["session-cookie", /\b(?:session|cookie|floot_built_app_session)=\S{12,}/i],
    ["raw-pdf-bytes", /(?:%PDF-|JVBERi0|data:application\/pdf;base64,)/i],
    ["raw-report-text", /\b(?:rawExtractedText|raw\s+report\s+text|raw\s+pdf\s+text|full\s+credit\s+report\s+text)\s*[:=]/i],
    ["long-base64-blob", /\b[A-Za-z0-9+/]{160,}={0,2}\b/],
    ["signed-url", /https?:\/\/[^\s]+(?:X-Amz-Signature|X-Goog-Signature|GoogleAccessId|Signature=|[?&]sig=|[?&]sv=)[^\s]*/i],
    ["ssn-or-sin", /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/],
    ["obvious-email-pii", /\b[A-Z0-9._%+-]+@(?!example\.test\b|example\.invalid\b|example\.com\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
    ["account-number-label", /\b(?:accountNumber|account_number|account\s+number)\s*[:=]\s*["']?[A-Za-z0-9-]{4,}/i],
    ["address-label", /\b(?:streetAddress|street_address|addressLine|address_line|mailingAddress|mailing_address)\s*[:=]/i],
    ["full-name-label", /\b(?:fullName|full_name|consumerName|consumer_name)\s*[:=]/i],
  ];
  for (const [name, pattern] of patterns) {
    if (pattern.test(text)) findings.push(name);
  }
  return findings;
}

function validateCountsObject(value: unknown, label: string) {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [`${label} counts must be present.`];
  }
  for (const key of [
    "totalRows",
    "storageUrlRows",
    "localReferenceRows",
    "possibleInlineBase64Rows",
    "dataUrlBase64Rows",
    "nonLocalReferenceRows",
    "nullStorageRows",
  ]) {
    const raw = (value as Record<string, unknown>)[key];
    if (!Number.isInteger(raw) || Number(raw) < 0) {
      errors.push(`${label}.${key} must be a non-negative integer.`);
    }
  }
  return errors;
}

export function validateStorageRawReportInventoryEvidence(evidence: unknown): StorageRawReportInventoryValidation {
  const errors: string[] = [];
  const serialized = JSON.stringify(evidence ?? {});
  const sensitiveFindings = scanStorageRawReportInventorySensitiveContent(serialized);
  const report = evidence as Record<string, any> | null;

  if (!report || typeof report !== "object" || Array.isArray(report)) {
    errors.push("Inventory evidence must be a JSON object.");
  } else {
    if (report.evidenceType !== "SANITIZED_READ_ONLY_INVENTORY") {
      errors.push("evidenceType must be SANITIZED_READ_ONLY_INVENTORY.");
    }
    if (report.status !== "completed") {
      errors.push("Inventory status must be completed.");
    }
    if (report.databaseReachable !== true || report.countsReliable !== true) {
      errors.push("Reliable database connectivity is required before inventory can certify.");
    }
    if (!report.environment) errors.push("environment is required.");
    if (!report.generatedAt) errors.push("generatedAt is required.");
    if (report.inventoryMethod !== "read-only-aggregate-sql-counts") {
      errors.push("inventoryMethod must be read-only-aggregate-sql-counts.");
    }
    if (report.dataSource?.kind !== "database" || report.dataSource?.reliable !== true) {
      errors.push("dataSource must record a reliable database source.");
    }
    if (report.confidence?.level !== "high" || report.confidence?.countsReliable !== true) {
      errors.push("confidence must be high with reliable counts.");
    }
    if (report.rawValuesPrinted !== false || report.rawBytesPrinted !== false || report.signedUrlsPrinted !== false) {
      errors.push("Inventory must not print raw values, raw bytes, or signed URLs.");
    }
    if (report.productionDataMutated !== false || report.historicalRowsMigrated !== false) {
      errors.push("Inventory must be non-mutating and must not migrate historical rows.");
    }
    errors.push(...validateCountsObject(report.tables?.reportArtifact, "tables.reportArtifact"));
    errors.push(...validateCountsObject(report.tables?.evidenceAttachment, "tables.evidenceAttachment"));
    errors.push(...validateCountsObject(report.recordCounts?.reportArtifact, "recordCounts.reportArtifact"));
    errors.push(...validateCountsObject(report.recordCounts?.evidenceAttachment, "recordCounts.evidenceAttachment"));
    if (!report.unresolvedCounts || typeof report.unresolvedCounts !== "object") {
      errors.push("unresolvedCounts must be present.");
    }
    if (!report.remediationCandidateCounts || typeof report.remediationCandidateCounts !== "object") {
      errors.push("remediationCandidateCounts must be present.");
    }
  }

  if (sensitiveFindings.length > 0) {
    errors.push(`Sensitive content detected: ${sensitiveFindings.join(", ")}.`);
  }

  const accepted = errors.length === 0;
  return {
    accepted,
    certifying: accepted,
    status: accepted ? "accepted-reliable-inventory" : "failed",
    errors,
    sensitiveFindings,
  };
}

export function detectStorageInventoryProductionEnvironment(env = process.env) {
  for (const key of PRODUCTION_ENV_KEYS) {
    const value = String(env[key] ?? "").trim().toLowerCase();
    if (value === "production" || value === "prod" || value.includes("production")) {
      return { productionLike: true, reason: `${key} indicates a production environment.` };
    }
  }
  for (const key of PRODUCTION_SECRET_KEYS) {
    const value = String(env[key] ?? "").trim().toLowerCase();
    if (!value) continue;
    if (value.includes("creditregulatorpro-prod") || value.includes("production") || value.includes("/prod") || value.includes("prod.")) {
      return { productionLike: true, reason: `${key} appears to reference a production database target.` };
    }
  }
  return { productionLike: false, reason: "" };
}

async function readReportArtifactCounts(): Promise<StorageInventoryCounts> {
  const result = await sql<RawCountRow>`
    select
      count(*)::int as "totalRows",
      count(*) filter (where storage_url is not null)::int as "storageUrlRows",
      count(*) filter (where storage_url like 'local:%')::int as "localReferenceRows",
      count(*) filter (
        where storage_url is not null
          and storage_url not like 'local:%'
          and storage_url not like 's3:%'
          and storage_url not like 'gs:%'
          and storage_url not like 'http%'
          and length(storage_url) >= 64
      )::int as "possibleInlineBase64Rows",
      count(*) filter (where storage_url like 'data:%;base64,%')::int as "dataUrlBase64Rows",
      count(*) filter (
        where storage_url is not null
          and storage_url not like 'local:%'
          and (
            storage_url like 's3:%'
            or storage_url like 'gs:%'
            or storage_url like 'http%'
          )
      )::int as "nonLocalReferenceRows",
      count(*) filter (where storage_url is null)::int as "nullStorageRows"
    from public.report_artifact
  `.execute(db);
  return normalizeCounts(result.rows[0]);
}

async function readEvidenceAttachmentCounts(): Promise<StorageInventoryCounts> {
  const result = await sql<RawCountRow>`
    select
      count(*)::int as "totalRows",
      count(*) filter (where storage_url is not null)::int as "storageUrlRows",
      count(*) filter (where storage_url like 'local:%')::int as "localReferenceRows",
      count(*) filter (
        where storage_url is not null
          and storage_url not like 'local:%'
          and storage_url not like 's3:%'
          and storage_url not like 'gs:%'
          and storage_url not like 'http%'
          and length(storage_url) >= 64
      )::int as "possibleInlineBase64Rows",
      count(*) filter (where storage_url like 'data:%;base64,%')::int as "dataUrlBase64Rows",
      count(*) filter (
        where storage_url is not null
          and storage_url not like 'local:%'
          and (
            storage_url like 's3:%'
            or storage_url like 'gs:%'
            or storage_url like 'http%'
          )
      )::int as "nonLocalReferenceRows",
      count(*) filter (where storage_url is null)::int as "nullStorageRows"
    from public.evidence_attachment
  `.execute(db);
  return normalizeCounts(result.rows[0]);
}

export async function collectStorageRawReportInventoryCounts() {
  return {
    reportArtifact: await readReportArtifactCounts(),
    evidenceAttachment: await readEvidenceAttachmentCounts(),
  };
}

function unavailableCounts(): StorageInventoryCounts {
  return {
    totalRows: 0,
    storageUrlRows: 0,
    localReferenceRows: 0,
    possibleInlineBase64Rows: 0,
    dataUrlBase64Rows: 0,
    nonLocalReferenceRows: 0,
    nullStorageRows: 0,
  };
}

function sanitizeCollectionError(error: unknown) {
  if (error instanceof Error && /authentication|password|connect|database|ECONNREFUSED|ENOTFOUND|timeout/i.test(error.message)) {
    return "database unavailable; raw connection details and database targets are not stored";
  }
  return "inventory collection unavailable; raw error details are not stored";
}

export function buildStorageRawReportInventoryReport({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  env = process.env,
  counts,
  databaseReachable = true,
  collectionError = null,
}: {
  rootDir?: string;
  generatedAt?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  databaseReachable?: boolean;
  collectionError?: string | null;
  counts: {
    reportArtifact: StorageInventoryCounts;
    evidenceAttachment: StorageInventoryCounts;
  };
}) {
  const productionEnvironment = detectStorageInventoryProductionEnvironment(env);
  if (productionEnvironment.productionLike) {
    throw new Error(`Refusing raw report inventory in a production-like environment: ${productionEnvironment.reason}`);
  }
  const environment = resolveInventoryEnvironment(env);
  const totalUnresolvedRows =
    counts.reportArtifact.possibleInlineBase64Rows +
    counts.reportArtifact.dataUrlBase64Rows +
    counts.evidenceAttachment.possibleInlineBase64Rows +
    counts.evidenceAttachment.dataUrlBase64Rows;
  const report = {
    reportName: "storage-raw-report-inventory",
    generatedAt,
    timestamp: generatedAt,
    environment,
    branch: safeGit(["branch", "--show-current"], rootDir),
    commit: safeGit(["rev-parse", "HEAD"], rootDir),
    evidenceType: "SANITIZED_READ_ONLY_INVENTORY",
    status: databaseReachable ? "completed" : "database-unavailable",
    databaseReachable,
    countsReliable: databaseReachable,
    CERTIFYING: databaseReachable,
    collectionError,
    dataSource: {
      kind: "database",
      environment,
      reliable: databaseReachable,
      access: databaseReachable ? "connected-read-only-aggregate-counts" : "unavailable",
      rawConnectionDetailsStored: false,
    },
    inventoryMethod: "read-only-aggregate-sql-counts",
    nonDestructive: true,
    historicalRowsMigrated: false,
    rawValuesPrinted: false,
    rawBytesPrinted: false,
    rawReportTextPrinted: false,
    fullNamesPrinted: false,
    addressesPrinted: false,
    accountNumbersPrinted: false,
    signedUrlsPrinted: false,
    storageSecretsPrinted: false,
    productionDataMutated: false,
    liveExternalProvidersConnected: false,
    safety: {
      productionEnvironmentDetected: false,
      productionMutationForbidden: true,
      realConsumerPiiUsed: false,
      rawReportBytesExposed: false,
      storageSecretsExposed: false,
      signedUrlsExposed: false,
      silentHistoricalMigrationPerformed: false,
      databaseUnavailableDoesNotImplyZeroInlineRows: databaseReachable ? null : true,
    },
    tables: {
      reportArtifact: counts.reportArtifact,
      evidenceAttachment: counts.evidenceAttachment,
    },
    recordCounts: {
      reportArtifact: counts.reportArtifact,
      evidenceAttachment: counts.evidenceAttachment,
    },
    unresolvedCounts: {
      reportArtifact: {
        possibleInlineBase64Rows: databaseReachable ? counts.reportArtifact.possibleInlineBase64Rows : null,
        dataUrlBase64Rows: databaseReachable ? counts.reportArtifact.dataUrlBase64Rows : null,
      },
      evidenceAttachment: {
        possibleInlineBase64Rows: databaseReachable ? counts.evidenceAttachment.possibleInlineBase64Rows : null,
        dataUrlBase64Rows: databaseReachable ? counts.evidenceAttachment.dataUrlBase64Rows : null,
      },
      totalRows: databaseReachable ? totalUnresolvedRows : null,
    },
    remediationCandidateCounts: {
      reportArtifact: databaseReachable
        ? counts.reportArtifact.possibleInlineBase64Rows + counts.reportArtifact.dataUrlBase64Rows
        : null,
      evidenceAttachment: databaseReachable
        ? counts.evidenceAttachment.possibleInlineBase64Rows + counts.evidenceAttachment.dataUrlBase64Rows
        : null,
      totalRows: databaseReachable ? totalUnresolvedRows : null,
    },
    confidence: {
      level: databaseReachable ? "high" : "unreliable",
      countsReliable: databaseReachable,
      reason: databaseReachable
        ? "Read-only aggregate SQL counts completed against the configured staging-safe database."
        : "Database connectivity was unavailable; evidence cannot certify historical raw report byte state.",
    },
    privacyValidation: {
      accepted: true,
      rawBytesPrinted: false,
      rawReportTextPrinted: false,
      signedUrlsPrinted: false,
      secretsPrinted: false,
      piiPrinted: false,
      sensitiveFindings: [],
    },
    statements: [
      "This inventory is non-destructive and sanitized.",
      databaseReachable
        ? "Possible inline base64 rows are counted, not printed."
        : "The local database was unavailable; possible inline base64 rows were not counted and must not be treated as zero.",
      "No historical raw report rows are migrated or deleted by this command.",
      "This report does not claim production-at-scale readiness.",
    ],
    recommendedNextAction:
      databaseReachable
        ? "Review possible inline counts and create a separate approved remediation plan before migrating or deleting any historical rows."
        : "Run this command again with a staging-safe local database connection before relying on inventory counts.",
  };
  const validation = validateStorageRawReportInventoryEvidence(report);

  return {
    ...report,
    validation,
  };
}

function renderCount(value: number, reliable: boolean) {
  return reliable ? String(value) : "unavailable";
}

function renderCountsTable(title: string, counts: StorageInventoryCounts, reliable = true) {
  return [
    `### ${title}`,
    "",
    "| Metric | Count |",
    "| --- | ---: |",
    `| Total rows | ${renderCount(counts.totalRows, reliable)} |`,
    `| Rows with storageUrl | ${renderCount(counts.storageUrlRows, reliable)} |`,
    `| local: storage references | ${renderCount(counts.localReferenceRows, reliable)} |`,
    `| Possible inline base64 rows | ${renderCount(counts.possibleInlineBase64Rows, reliable)} |`,
    `| data:*;base64 rows | ${renderCount(counts.dataUrlBase64Rows, reliable)} |`,
    `| Non-local external-style references | ${renderCount(counts.nonLocalReferenceRows, reliable)} |`,
    `| Null storage rows | ${renderCount(counts.nullStorageRows, reliable)} |`,
  ].join("\n");
}

export function renderStorageRawReportInventoryMarkdown(report: ReturnType<typeof buildStorageRawReportInventoryReport>) {
  const lines = [
    "# Storage Raw Report Inventory",
    "",
    "Sanitized read-only inventory. No raw report bytes, inline base64 values, signed URLs, storage secrets, real consumer PII, or production database dumps are printed.",
    "",
    `Generated at: ${report.generatedAt}`,
    `Branch: \`${report.branch}\``,
    `Commit: \`${report.commit}\``,
    `Environment: ${report.environment}`,
    `Evidence type: ${report.evidenceType}`,
    `Status: ${report.status}`,
    `CERTIFYING:${report.CERTIFYING ? "true" : "false"}`,
    `Database reachable: ${report.databaseReachable ? "yes" : "no"}`,
    `Counts reliable: ${report.countsReliable ? "yes" : "no"}`,
    `Inventory method: ${report.inventoryMethod}`,
    `Confidence: ${report.confidence.level}`,
    `Non-destructive: ${report.nonDestructive ? "yes" : "no"}`,
    `Historical rows migrated: ${report.historicalRowsMigrated ? "yes" : "no"}`,
    `Raw storageUrl values printed: ${report.rawValuesPrinted ? "yes" : "no"}`,
    "",
    "## Counts",
    "",
    report.countsReliable
      ? "Possible inline rows are aggregate counts only; raw values are not printed."
      : "Counts are unavailable because the local database connection was unavailable. Do not treat unavailable counts as zero.",
    "",
    renderCountsTable("reportArtifact.storageUrl", report.tables.reportArtifact, report.countsReliable),
    "",
    renderCountsTable("evidenceAttachment.storageUrl", report.tables.evidenceAttachment, report.countsReliable),
    "",
    "## Remediation Candidates",
    "",
    `- reportArtifact candidates: ${report.remediationCandidateCounts.reportArtifact ?? "unavailable"}`,
    `- evidenceAttachment candidates: ${report.remediationCandidateCounts.evidenceAttachment ?? "unavailable"}`,
    `- Total candidates: ${report.remediationCandidateCounts.totalRows ?? "unavailable"}`,
    "",
    "## Safety",
    "",
    "- Production data mutated: no",
    "- Live external providers connected: no",
    "- Real consumer PII used: no",
    "- Raw report bytes printed: no",
    "- Raw report text, names, addresses, account numbers, and signed URLs printed: no",
    "- Storage secrets or signed URLs printed: no",
    "- Silent historical migration performed: no",
    "",
    "## Remaining Work",
    "",
    report.recommendedNextAction,
  ];
  return `${lines.join("\n")}\n`;
}

export function writeStorageRawReportInventoryEvidence(
  report: ReturnType<typeof buildStorageRawReportInventoryReport>,
  {
    rootDir = process.cwd(),
    evidenceDir = DEFAULT_STORAGE_RAW_REPORT_INVENTORY_EVIDENCE_DIR,
  } = {}
) {
  const absoluteEvidenceDir = repoPath(rootDir, evidenceDir);
  mkdirSync(absoluteEvidenceDir, { recursive: true });
  const markdownPath = normalizeRelativePath(path.join(evidenceDir, "latest-storage-raw-report-inventory.md"));
  const jsonPath = normalizeRelativePath(path.join(evidenceDir, "latest-storage-raw-report-inventory.json"));
  writeFileSync(repoPath(rootDir, markdownPath), renderStorageRawReportInventoryMarkdown(report), "utf8");
  writeFileSync(repoPath(rootDir, jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { markdownPath, jsonPath };
}

function parseArgs(args: string[]) {
  const options = {
    rootDir: process.cwd(),
    evidenceDir: DEFAULT_STORAGE_RAW_REPORT_INVENTORY_EVIDENCE_DIR,
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const nextValue = () => {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    if (arg === "--help" || arg === "-h") {
      console.log([
        "Usage: pnpm run storage:raw-report-inventory -- [options]",
        "",
        "Creates a sanitized, non-destructive inventory of possible inline report and attachment storage rows.",
        "The command prints counts only and never prints raw storageUrl values, raw bytes, signed URLs, secrets, or PII.",
        "",
        "Options:",
        "  --json                    Also print JSON evidence to stdout.",
        "  --root <path>             Project root. Defaults to current working directory.",
        "  --evidence-dir <path>     Output directory. Defaults to docs/production-scale/evidence.",
      ].join("\n"));
      process.exit(0);
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--root") {
      options.rootDir = path.resolve(nextValue());
      continue;
    }
    if (arg === "--evidence-dir") {
      options.evidenceDir = normalizeRelativePath(nextValue());
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const productionEnvironment = detectStorageInventoryProductionEnvironment(process.env);
  if (productionEnvironment.productionLike) {
    throw new Error(`Refusing raw report inventory in a production-like environment: ${productionEnvironment.reason}`);
  }
  let databaseReachable = true;
  let collectionError: string | null = null;
  let counts: Awaited<ReturnType<typeof collectStorageRawReportInventoryCounts>>;
  try {
    counts = await collectStorageRawReportInventoryCounts();
  } catch (error) {
    databaseReachable = false;
    collectionError = sanitizeCollectionError(error);
    counts = {
      reportArtifact: unavailableCounts(),
      evidenceAttachment: unavailableCounts(),
    };
  }
  const report = buildStorageRawReportInventoryReport({
    rootDir: options.rootDir,
    counts,
    databaseReachable,
    collectionError,
  });
  const outputs = writeStorageRawReportInventoryEvidence(report, {
    rootDir: options.rootDir,
    evidenceDir: options.evidenceDir,
  });
  console.log("Sanitized storage raw report inventory generated.");
  console.log("No raw storageUrl values, raw bytes, signed URLs, secrets, or PII were printed.");
  console.log(`Markdown: ${outputs.markdownPath}`);
  console.log(`JSON: ${outputs.jsonPath}`);
  if (report.countsReliable) {
    console.log(`Possible inline reportArtifact rows: ${report.tables.reportArtifact.possibleInlineBase64Rows}`);
    console.log(`Possible inline evidenceAttachment rows: ${report.tables.evidenceAttachment.possibleInlineBase64Rows}`);
  } else {
    console.log("Local database unavailable; counts are not reliable and must not be treated as zero.");
  }
  if (options.json) console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .catch((error) => {
      console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.destroy().catch(() => undefined);
    });
}
