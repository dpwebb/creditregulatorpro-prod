import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_SCAN_ROOTS = ["helpers", "scripts", "endpoints/migration"];
export const DEFAULT_LEDGER_DIR = "migrations";

export const EXPECTED_SCHEMA_SOURCES = [
  {
    path: "scripts/bootstrap-local-auth-schema.ts",
    kind: "bootstrap",
    description: "Local auth/session/account bootstrap DDL.",
  },
  {
    path: "scripts/bootstrap-local-app-fixtures.ts",
    kind: "bootstrap",
    description: "Local app fixture and core table bootstrap DDL.",
  },
  {
    path: "helpers/aiAssistRunStore.ts",
    kind: "runtime-ensure",
    description: "AI assist run audit table ensure.",
  },
  {
    path: "helpers/consumerIdentification.ts",
    kind: "runtime-ensure",
    description: "Consumer identification document table ensure.",
  },
  {
    path: "helpers/disputePacketFindingsSchema.tsx",
    kind: "runtime-ensure",
    description: "Dispute packet findings table/index ensure.",
  },
  {
    path: "helpers/ingestProcessingQueueSchema.ts",
    kind: "runtime-ensure",
    description: "Ingest processing job and event table/index ensure.",
  },
  {
    path: "helpers/outcomeTrackingSchema.ts",
    kind: "runtime-ensure",
    description: "Outcome comparison and finding outcome table/index ensure.",
  },
  {
    path: "helpers/parserRulePromotionSchema.tsx",
    kind: "runtime-ensure",
    description: "Parser rule promotion table/index ensure.",
  },
  {
    path: "helpers/parserTestAdjudicationSchema.tsx",
    kind: "runtime-ensure",
    description: "Parser test adjudication table/index ensure.",
  },
  {
    path: "helpers/parserTestTrainingArchive.tsx",
    kind: "runtime-ensure",
    description: "Parser training archive table/index ensure.",
  },
  {
    path: "helpers/regulationReconciliationCandidateService.ts",
    kind: "runtime-ensure",
    description: "Regulation reconciliation candidate table/index ensure.",
  },
  {
    path: "helpers/regulationRegistrySchema.ts",
    kind: "runtime-ensure",
    description: "Regulation registry and mapping table/index ensure.",
  },
  {
    path: "helpers/regulationRuntimeBridgeMappingService.ts",
    kind: "runtime-ensure",
    description: "Regulation runtime bridge mapping table/index ensure.",
  },
  {
    path: "helpers/responseDocumentSchema.ts",
    kind: "runtime-ensure",
    description: "Response document, queue, orchestration, and lifecycle table/index ensure.",
  },
  {
    path: "helpers/violationCorrectionSchema.tsx",
    kind: "runtime-ensure",
    description: "Violation correction and regulation reference table/index ensure.",
  },
  {
    path: "endpoints/migration/create_POST.ts",
    kind: "migration-metadata-endpoint",
    description: "Admin metadata endpoint for recording migration entries; does not execute DDL.",
  },
  {
    path: "endpoints/migration/list_GET.ts",
    kind: "migration-metadata-endpoint",
    description: "Admin metadata endpoint for listing migration entries; does not execute DDL.",
  },
  {
    path: "endpoints/migration/update_POST.ts",
    kind: "migration-metadata-endpoint",
    description: "Admin metadata endpoint for updating migration status; does not execute DDL.",
  },
];

const DEFAULT_IGNORED_RELATIVE_PATHS = new Set([
  normalizeRelativePath("scripts/check-migrations.mjs"),
]);

const SCHEMA_MUTATION_PATTERNS = [
  { name: "create table", regex: /\bcreate\s+table\b/i },
  { name: "alter table", regex: /\balter\s+table\b/i },
  { name: "create index", regex: /\bcreate\s+(?:unique\s+)?index\b/i },
  { name: "drop table/index", regex: /\bdrop\s+(?:table|index)\b/i },
  { name: "db.schema", regex: /\bdb\.schema\b/i },
];

const TEXT_EXTENSIONS = new Set([".js", ".mjs", ".ts", ".tsx", ".sql", ".md"]);

function normalizeRelativePath(value) {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/"));
}

function safeReadFile(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function listFiles(rootDir, relativeRoot) {
  const absoluteRoot = repoPath(rootDir, relativeRoot);
  if (!existsSync(absoluteRoot)) return [];

  const files = [];
  const stack = [absoluteRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      const relativePath = normalizeRelativePath(path.relative(rootDir, absolutePath));
      if (entry.isDirectory()) {
        if ([".git", "node_modules", "dist", "coverage"].includes(entry.name)) continue;
        stack.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!TEXT_EXTENSIONS.has(path.extname(entry.name))) continue;
      if (DEFAULT_IGNORED_RELATIVE_PATHS.has(relativePath)) continue;
      files.push(relativePath);
    }
  }
  return files.sort();
}

function mutationMatches(source) {
  const matches = [];
  const lines = source.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    for (const pattern of SCHEMA_MUTATION_PATTERNS) {
      if (pattern.regex.test(line)) {
        matches.push({
          line: index + 1,
          pattern: pattern.name,
          excerpt: line.trim().slice(0, 160),
        });
      }
    }
  }
  return matches;
}

export function findSchemaMutationSources({
  rootDir = process.cwd(),
  scanRoots = DEFAULT_SCAN_ROOTS,
} = {}) {
  const files = scanRoots.flatMap((scanRoot) => listFiles(rootDir, scanRoot));
  return files
    .map((relativePath) => ({
      path: relativePath,
      matches: mutationMatches(safeReadFile(repoPath(rootDir, relativePath))),
    }))
    .filter((entry) => entry.matches.length > 0)
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function readMigrationLedgerEntries({
  rootDir = process.cwd(),
  ledgerDir = DEFAULT_LEDGER_DIR,
} = {}) {
  const absoluteLedgerDir = repoPath(rootDir, ledgerDir);
  if (!existsSync(absoluteLedgerDir)) return [];

  return readdirSync(absoluteLedgerDir)
    .filter((entry) => entry.toLowerCase() !== "readme.md")
    .map((entry) => {
      const absolutePath = path.join(absoluteLedgerDir, entry);
      const stats = statSync(absolutePath);
      if (!stats.isFile()) return null;
      const relativePath = normalizeRelativePath(path.relative(rootDir, absolutePath));
      return {
        path: relativePath,
        bytes: stats.size,
        content: safeReadFile(absolutePath),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.path.localeCompare(b.path));
}

function sourceMentionedByLedger(ledgerEntries, sourcePath) {
  const normalized = normalizeRelativePath(sourcePath);
  return ledgerEntries.some((entry) => normalizeRelativePath(entry.content).includes(normalized));
}

export function scanMigrationState({
  rootDir = process.cwd(),
  scanRoots = DEFAULT_SCAN_ROOTS,
  ledgerDir = DEFAULT_LEDGER_DIR,
  expectedSources = EXPECTED_SCHEMA_SOURCES,
} = {}) {
  const expected = expectedSources.map((source) => ({
    ...source,
    path: normalizeRelativePath(source.path),
    exists: existsSync(repoPath(rootDir, source.path)),
  }));
  const expectedPaths = new Set(expected.map((source) => source.path));
  const detectedSchemaMutationSources = findSchemaMutationSources({ rootDir, scanRoots });
  const detectedPaths = detectedSchemaMutationSources.map((source) => source.path);
  const migrationLedgerEntries = readMigrationLedgerEntries({ rootDir, ledgerDir });

  const unknownSchemaMutationSources = detectedSchemaMutationSources
    .filter((source) => !expectedPaths.has(source.path))
    .map((source) => source.path);
  const unledgeredSchemaMutationSources = detectedSchemaMutationSources
    .filter((source) => !sourceMentionedByLedger(migrationLedgerEntries, source.path))
    .map((source) => source.path);
  const missingExpectedSources = expected
    .filter((source) => !source.exists)
    .map((source) => source.path);

  const hasOpenInventoryRisk =
    unknownSchemaMutationSources.length > 0 ||
    unledgeredSchemaMutationSources.length > 0 ||
    missingExpectedSources.length > 0 ||
    migrationLedgerEntries.length === 0;

  return {
    safety: {
      nonMutating: true,
      requiresDatabase: false,
      mutatesDatabase: false,
      executesDdl: false,
      readsCredentials: false,
    },
    scanRoots,
    ledgerDir,
    expectedSchemaSources: expected,
    runtimeEnsureFunctions: expected.filter((source) => source.kind === "runtime-ensure"),
    bootstrapScripts: expected.filter((source) => source.kind === "bootstrap"),
    migrationMetadataEndpoints: expected.filter((source) => source.kind === "migration-metadata-endpoint"),
    detectedSchemaMutationSources,
    detectedSchemaMutationSourcePaths: detectedPaths,
    migrationLedgerEntries: migrationLedgerEntries.map(({ content, ...entry }) => entry),
    unknownSchemaMutationSources,
    unledgeredSchemaMutationSources,
    missingExpectedSources,
    deployGateRecommendation: hasOpenInventoryRisk
      ? "Run check:migrations as a non-blocking informational report only; resolve missing, unknown, or unledgered schema mutation sources before enabling a hard deployment gate."
      : "Run check:migrations as a non-blocking informational report only until a later audited task explicitly wires a stable hard deployment gate.",
  };
}

export function renderMigrationReport(report) {
  const lines = [
    "# Migration Inventory And Drift Checker",
    "",
    "Safety: non-mutating static source scan only; no database connection, credentials, DDL, or schema mutation.",
    `Scan roots: ${report.scanRoots.join(", ")}`,
    `Ledger directory: ${report.ledgerDir}`,
    "",
    "## Runtime Ensure Functions",
    ...report.runtimeEnsureFunctions.map((source) =>
      `- ${source.path} (${source.exists ? "present" : "missing"}): ${source.description}`,
    ),
    "",
    "## Bootstrap Scripts",
    ...report.bootstrapScripts.map((source) =>
      `- ${source.path} (${source.exists ? "present" : "missing"}): ${source.description}`,
    ),
    "",
    "## Migration Metadata Endpoints",
    ...report.migrationMetadataEndpoints.map((source) =>
      `- ${source.path} (${source.exists ? "present" : "missing"}): ${source.description}`,
    ),
    "",
    "## Migration Ledger Entries",
    ...(report.migrationLedgerEntries.length > 0
      ? report.migrationLedgerEntries.map((entry) => `- ${entry.path} (${entry.bytes} bytes)`)
      : ["- None found."]),
    "",
    "## Detected Schema Mutation Sources",
    ...(report.detectedSchemaMutationSources.length > 0
      ? report.detectedSchemaMutationSources.map((source) =>
          `- ${source.path}: ${source.matches.length} matched schema mutation pattern(s)`,
        )
      : ["- None detected."]),
    "",
    "## Unknown Or Unledgered Schema Mutation Points",
    ...(report.unknownSchemaMutationSources.length > 0
      ? report.unknownSchemaMutationSources.map((source) => `- Unknown source: ${source}`)
      : ["- Unknown source: none."]),
    ...(report.unledgeredSchemaMutationSources.length > 0
      ? report.unledgeredSchemaMutationSources.map((source) => `- Unledgered source: ${source}`)
      : ["- Unledgered source: none."]),
    ...(report.missingExpectedSources.length > 0
      ? report.missingExpectedSources.map((source) => `- Missing expected source: ${source}`)
      : ["- Missing expected source: none."]),
    "",
    "## Deploy Gate Recommendation",
    report.deployGateRecommendation,
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const report = scanMigrationState();
  if (args.has("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderMigrationReport(report));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
