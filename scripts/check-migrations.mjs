import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_SCAN_ROOTS = ["helpers", "scripts", "endpoints/migration"];
export const DEFAULT_LEDGER_DIR = "migrations";
export const DEFAULT_MIGRATION_EVIDENCE_DIR = "docs/production-scale/evidence";
export const MIGRATION_EVIDENCE_MARKDOWN = "latest-migration-governance.md";
export const MIGRATION_EVIDENCE_JSON = "latest-migration-governance.json";

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

function safeGit(args, rootDir, fallback = "unknown") {
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

function finding({
  category,
  sourcePath,
  title,
  releaseImpact,
  status,
  recommendation,
  detail = "",
}) {
  return {
    category,
    sourcePath,
    title,
    releaseImpact,
    status,
    recommendation,
    detail,
  };
}

function buildFindings({
  expected,
  runtimeEnsureFunctions,
  bootstrapScripts,
  migrationMetadataEndpoints,
  unknownSchemaMutationSources,
  unledgeredSchemaMutationSources,
  missingExpectedSources,
  missingExpectedInventoryEntries,
  migrationLedgerEntries,
}) {
  const findings = [];

  for (const source of runtimeEnsureFunctions) {
    findings.push(finding({
      category: "known-runtime-ensure-source",
      sourcePath: source.path,
      title: "Known runtime ensure source remains active",
      releaseImpact: source.exists ? "warning-only" : "release-blocking",
      status: source.exists ? "present" : "missing",
      recommendation: source.exists
        ? "Keep release-visible until this ensure path has an additive reviewed migration and rollback evidence."
        : "Restore the expected source or update the inventory through a reviewed migration-governance task.",
      detail: source.description,
    }));
  }

  for (const source of bootstrapScripts) {
    findings.push(finding({
      category: "bootstrap-script",
      sourcePath: source.path,
      title: "Bootstrap schema script",
      releaseImpact: source.exists ? "warning-only" : "release-blocking",
      status: source.exists ? "present" : "missing",
      recommendation: source.exists
        ? "Keep classified as bootstrap/local or controlled fixture setup; do not treat as production migration governance."
        : "Restore the expected bootstrap script or update the inventory through review.",
      detail: source.description,
    }));
  }

  for (const source of migrationMetadataEndpoints) {
    findings.push(finding({
      category: "migration-metadata-endpoint",
      sourcePath: source.path,
      title: "Migration metadata endpoint",
      releaseImpact: source.exists ? "warning-only" : "release-blocking",
      status: source.exists ? "present" : "missing",
      recommendation: source.exists
        ? "Keep clear that this endpoint records metadata only and does not execute DDL."
        : "Restore the expected migration metadata endpoint or update the inventory through review.",
      detail: source.description,
    }));
  }

  for (const sourcePath of unknownSchemaMutationSources) {
    findings.push(finding({
      category: "unknown-schema-mutation-source",
      sourcePath,
      title: "Unknown schema mutation source detected",
      releaseImpact: "release-blocking",
      status: "unknown",
      recommendation: "Add the source to a reviewed migration inventory entry or remove the schema mutation from runtime code.",
      detail: "Detected by static schema-mutation pattern scan.",
    }));
  }

  for (const sourcePath of unledgeredSchemaMutationSources) {
    findings.push(finding({
      category: "unledgered-schema-mutation-source",
      sourcePath,
      title: "Schema mutation source is not represented in the ledger",
      releaseImpact: "release-blocking",
      status: "unledgered",
      recommendation: "Add a ledger entry naming this source before relying on release evidence.",
      detail: "Detected source was absent from migration ledger text.",
    }));
  }

  for (const sourcePath of missingExpectedSources) {
    const expectedSource = expected.find((source) => source.path === sourcePath);
    findings.push(finding({
      category: "missing-expected-source",
      sourcePath,
      title: "Expected schema source missing",
      releaseImpact: "release-blocking",
      status: "missing",
      recommendation: "Restore the expected source or update the migration inventory through a reviewed task.",
      detail: expectedSource?.description ?? "",
    }));
  }

  for (const sourcePath of missingExpectedInventoryEntries) {
    const expectedSource = expected.find((source) => source.path === sourcePath);
    findings.push(finding({
      category: "missing-expected-inventory-entry",
      sourcePath,
      title: "Expected source missing from migration inventory ledger",
      releaseImpact: "release-blocking",
      status: "unledgered",
      recommendation: "Update migrations/0000-runtime-schema-inventory.md or a later reviewed ledger entry to name this source.",
      detail: expectedSource?.description ?? "",
    }));
  }

  if (migrationLedgerEntries.length === 0) {
    findings.push(finding({
      category: "missing-ledger",
      sourcePath: DEFAULT_LEDGER_DIR,
      title: "Migration ledger is missing or empty",
      releaseImpact: "release-blocking",
      status: "missing",
      recommendation: "Create a reviewed inventory ledger before relying on migration governance evidence.",
      detail: "No migration ledger files were found.",
    }));
  }

  return findings;
}

function countFindings(findings, releaseImpact) {
  return findings.filter((item) => item.releaseImpact === releaseImpact).length;
}

export function scanMigrationState({
  rootDir = process.cwd(),
  scanRoots = DEFAULT_SCAN_ROOTS,
  ledgerDir = DEFAULT_LEDGER_DIR,
  expectedSources = EXPECTED_SCHEMA_SOURCES,
  generatedAt = new Date().toISOString(),
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
  const missingExpectedInventoryEntries = expected
    .filter((source) => source.exists && !sourceMentionedByLedger(migrationLedgerEntries, source.path))
    .map((source) => source.path);

  const hasOpenInventoryRisk =
    unknownSchemaMutationSources.length > 0 ||
    unledgeredSchemaMutationSources.length > 0 ||
    missingExpectedSources.length > 0 ||
    missingExpectedInventoryEntries.length > 0 ||
    migrationLedgerEntries.length === 0;
  const runtimeEnsureFunctions = expected.filter((source) => source.kind === "runtime-ensure");
  const bootstrapScripts = expected.filter((source) => source.kind === "bootstrap");
  const migrationMetadataEndpoints = expected.filter((source) => source.kind === "migration-metadata-endpoint");
  const findings = buildFindings({
    expected,
    runtimeEnsureFunctions,
    bootstrapScripts,
    migrationMetadataEndpoints,
    unknownSchemaMutationSources,
    unledgeredSchemaMutationSources,
    missingExpectedSources,
    missingExpectedInventoryEntries,
    migrationLedgerEntries,
  });
  const releaseBlockingFindings = countFindings(findings, "release-blocking");
  const warningOnlyFindings = countFindings(findings, "warning-only");

  return {
    reportName: "migration-governance-drift-evidence",
    CERTIFYING: false,
    generatedAt,
    evidenceTimestamp: generatedAt,
    branch: safeGit(["branch", "--show-current"], rootDir),
    commit: safeGit(["rev-parse", "HEAD"], rootDir),
    safety: {
      nonMutating: true,
      requiresDatabase: false,
      mutatesDatabase: false,
      executesDdl: false,
      readsCredentials: false,
      productionMutationAttempted: false,
      liveExternalProvidersConnected: false,
    },
    scanRoots,
    ledgerDir,
    expectedSchemaSources: expected,
    knownRuntimeEnsureSources: runtimeEnsureFunctions,
    runtimeEnsureFunctions,
    bootstrapScripts,
    migrationMetadataEndpoints,
    detectedSchemaMutationSources,
    detectedSchemaMutationSourcePaths: detectedPaths,
    migrationLedgerEntries: migrationLedgerEntries.map(({ content, ...entry }) => entry),
    unknownSchemaMutationSources,
    unledgeredSchemaMutationSources,
    missingExpectedSources,
    missingExpectedInventoryEntries,
    findings,
    releaseSummary: {
      checkerMode: "production-promotion-gate-inventory",
      governanceStatus: hasOpenInventoryRisk ? "blocked" : "promotion-gate-inventory-current",
      releaseBlockingFindings,
      warningOnlyFindings,
      hardDeployGateEnabled: true,
      hardProductionPromotionGateEnabled: true,
      productionPromotionGateCommand: "pnpm run migrations:gate",
      runtimeEnsureResidualCount: runtimeEnsureFunctions.filter((source) => source.exists).length,
      unknownSchemaMutationSourceCount: unknownSchemaMutationSources.length,
      unledgeredSchemaMutationSourceCount: unledgeredSchemaMutationSources.length,
      missingExpectedSourceCount: missingExpectedSources.length,
      missingExpectedInventoryEntryCount: missingExpectedInventoryEntries.length,
    },
    certification: {
      CERTIFYING: false,
      reason:
        "check:migrations is an inventory evidence command. Production certification requires migrations:gate with CERTIFYING:true and no active temporary runtime ensure allowlist entries.",
    },
    recommendation: hasOpenInventoryRisk
      ? "Resolve release-blocking migration inventory findings before treating schema governance as complete; keep this checker non-mutating and release-visible."
      : "Keep runtime ensure residuals release-visible and convert them to reviewed additive ledger migrations one workstream at a time.",
    deployGateRecommendation: hasOpenInventoryRisk
      ? "Production promotion gate must fail until missing, unknown, or unledgered schema mutation sources are resolved."
      : "Run migrations:gate as the hard non-mutating production promotion gate; temporary allowlist entries remain visible, non-certifying, and release-blocking until converted.",
  };
}

export function renderMigrationReport(report) {
  const lines = [
    "# Migration Governance Drift Evidence",
    "",
    "Safety: non-mutating static source scan only; no database connection, credentials, DDL, or schema mutation.",
    `Generated at: ${report.generatedAt}`,
    `CERTIFYING:${report.CERTIFYING ? "true" : "false"}`,
    `Current branch: ${report.branch}`,
    `Current commit hash: ${report.commit}`,
    `Scan roots: ${report.scanRoots.join(", ")}`,
    `Ledger directory: ${report.ledgerDir}`,
    `Checker mode: ${report.releaseSummary.checkerMode}`,
    `Governance status: ${report.releaseSummary.governanceStatus}`,
    `Release-blocking findings: ${report.releaseSummary.releaseBlockingFindings}`,
    `Warning-only findings: ${report.releaseSummary.warningOnlyFindings}`,
    `Hard deploy gate enabled: ${report.releaseSummary.hardDeployGateEnabled ? "yes" : "no"}`,
    `Production promotion gate command: ${report.releaseSummary.productionPromotionGateCommand}`,
    "",
    "## Runtime Ensure Functions",
    ...report.knownRuntimeEnsureSources.map((source) =>
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
    ...(report.missingExpectedInventoryEntries.length > 0
      ? report.missingExpectedInventoryEntries.map((source) => `- Missing expected inventory entry: ${source}`)
      : ["- Missing expected inventory entry: none."]),
    "",
    "## Release Findings",
    ...(report.findings.length > 0
      ? report.findings.map((item) =>
          `- [${item.releaseImpact}] ${item.category}: ${item.sourcePath} (${item.status}) - ${item.recommendation}`,
        )
      : ["- None."]),
    "",
    "## Recommendation",
    report.recommendation,
    "",
    "## Deploy Gate Recommendation",
    report.deployGateRecommendation,
  ];

  return `${lines.join("\n")}\n`;
}

export function validateMigrationGovernanceReport(report) {
  const errors = [];
  if (report.reportName !== "migration-governance-drift-evidence") errors.push("reportName is missing or invalid.");
  if (report.CERTIFYING !== false) errors.push("inventory report must remain CERTIFYING:false.");
  if (!report.generatedAt || !report.evidenceTimestamp) errors.push("generatedAt/evidenceTimestamp is required.");
  if (!report.branch || !report.commit) errors.push("branch and commit are required.");
  if (report.safety?.nonMutating !== true) errors.push("checker must be non-mutating.");
  if (report.safety?.requiresDatabase !== false) errors.push("checker must not require database access.");
  if (report.safety?.mutatesDatabase !== false) errors.push("checker must not mutate the database.");
  if (report.safety?.executesDdl !== false) errors.push("checker must not execute DDL.");
  if (!Array.isArray(report.knownRuntimeEnsureSources)) errors.push("known runtime ensure sources are required.");
  if (!Array.isArray(report.bootstrapScripts)) errors.push("bootstrap scripts are required.");
  if (!Array.isArray(report.unknownSchemaMutationSources)) errors.push("unknown mutation sources are required.");
  if (!Array.isArray(report.missingExpectedSources)) errors.push("missing expected sources are required.");
  if (!Array.isArray(report.findings)) errors.push("findings are required.");
  if (!report.findings.every((item) => ["release-blocking", "warning-only"].includes(item.releaseImpact))) {
    errors.push("each finding must be release-blocking or warning-only.");
  }
  if (!report.recommendation) errors.push("recommendation is required.");
  return { ok: errors.length === 0, errors };
}

export function writeMigrationGovernanceEvidence(report, {
  rootDir = process.cwd(),
  evidenceDir = DEFAULT_MIGRATION_EVIDENCE_DIR,
} = {}) {
  const validation = validateMigrationGovernanceReport(report);
  if (!validation.ok) {
    throw new Error(`Migration governance report validation failed: ${validation.errors.join("; ")}`);
  }
  const absoluteEvidenceDir = repoPath(rootDir, evidenceDir);
  mkdirSync(absoluteEvidenceDir, { recursive: true });
  const markdownPath = normalizeRelativePath(path.join(evidenceDir, MIGRATION_EVIDENCE_MARKDOWN));
  const jsonPath = normalizeRelativePath(path.join(evidenceDir, MIGRATION_EVIDENCE_JSON));
  writeFileSync(repoPath(rootDir, markdownPath), renderMigrationReport(report), "utf8");
  writeFileSync(repoPath(rootDir, jsonPath), `${JSON.stringify({ ...report, validation }, null, 2)}\n`, "utf8");
  return { markdownPath, jsonPath };
}

function nextValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function parseArgs(args) {
  const options = {
    rootDir: process.cwd(),
    evidenceDir: DEFAULT_MIGRATION_EVIDENCE_DIR,
    json: false,
    writeEvidence: true,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (["--apply", "--execute", "--run-ddl", "--ddl", "--mutate", "--write-db"].includes(arg)) {
      throw new Error(`${arg} is refused. Migration governance evidence is static and non-mutating.`);
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--no-write-evidence") {
      options.writeEvidence = false;
      continue;
    }
    if (arg === "--write-evidence") {
      options.writeEvidence = true;
      continue;
    }
    if (arg === "--root") {
      options.rootDir = path.resolve(nextValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--evidence-dir") {
      options.evidenceDir = normalizeRelativePath(nextValue(args, index, arg));
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log([
    "Usage: pnpm run check:migrations -- [options]",
    "",
    "Static, non-mutating migration governance and runtime schema ensure inventory checker.",
    "By default it writes docs/production-scale/evidence/latest-migration-governance.{md,json}.",
    "",
    "Options:",
    "  --json                    Print JSON report instead of Markdown.",
    "  --write-evidence          Write evidence outputs. Default.",
    "  --no-write-evidence       Do not write evidence outputs.",
    "  --root <path>             Project root. Defaults to current working directory.",
    "  --evidence-dir <path>     Output directory. Defaults to docs/production-scale/evidence.",
    "",
    "Refused:",
    "  --apply, --execute, --run-ddl, --ddl, --mutate, --write-db",
  ].join("\n"));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = scanMigrationState({ rootDir: options.rootDir });
  const validation = validateMigrationGovernanceReport(report);
  if (!validation.ok) {
    throw new Error(`Migration governance report validation failed: ${validation.errors.join("; ")}`);
  }
  let outputs = null;
  if (options.writeEvidence) {
    outputs = writeMigrationGovernanceEvidence(report, {
      rootDir: options.rootDir,
      evidenceDir: options.evidenceDir,
    });
  }
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderMigrationReport(report));
  }
  if (outputs) {
    console.log(`Evidence Markdown: ${outputs.markdownPath}`);
    console.log(`Evidence JSON: ${outputs.jsonPath}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
