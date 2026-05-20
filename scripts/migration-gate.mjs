import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_LEDGER_DIR,
  DEFAULT_MIGRATION_EVIDENCE_DIR,
  DEFAULT_SCAN_ROOTS,
  EXPECTED_SCHEMA_SOURCES,
  scanMigrationState,
  validateMigrationGovernanceReport,
} from "./check-migrations.mjs";

export const MIGRATION_GATE_POLICY_PATH = "docs/production-scale/migration-governance-policy.json";
export const MIGRATION_GATE_MARKDOWN = "latest-migration-gate.md";
export const MIGRATION_GATE_JSON = "latest-migration-gate.json";
export const MIGRATION_GATE_MD_PATH = `${DEFAULT_MIGRATION_EVIDENCE_DIR}/${MIGRATION_GATE_MARKDOWN}`;
export const MIGRATION_GATE_JSON_PATH = `${DEFAULT_MIGRATION_EVIDENCE_DIR}/${MIGRATION_GATE_JSON}`;

const VALID_POLICY_MODES = new Set(["warning-only", "release-blocking", "waived"]);
const REFUSED_FLAGS = new Set(["--apply", "--execute", "--run-ddl", "--ddl", "--mutate", "--write-db"]);

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
}

function readJson(rootDir, relativePath) {
  return JSON.parse(readFileSync(repoPath(rootDir, relativePath), "utf8"));
}

function writeText(rootDir, relativePath, text) {
  const target = repoPath(rootDir, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text, "utf8");
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

function policyPaths(items) {
  return new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => normalizeRelativePath(typeof item === "string" ? item : item?.path))
      .filter(Boolean),
  );
}

function expectedSourcesByKind(kind, expectedSources = EXPECTED_SCHEMA_SOURCES) {
  return expectedSources.filter((source) => source.kind === kind).map((source) => normalizeRelativePath(source.path));
}

function sourceKind(sourcePath, expectedSources = EXPECTED_SCHEMA_SOURCES) {
  const normalized = normalizeRelativePath(sourcePath);
  return expectedSources.find((source) => normalizeRelativePath(source.path) === normalized)?.kind ?? "unknown";
}

function finding({
  category,
  sourcePath = null,
  title,
  impact,
  status,
  recommendation,
  detail = "",
}) {
  return {
    category,
    sourcePath,
    title,
    impact,
    status,
    recommendation,
    detail,
  };
}

export function loadMigrationGatePolicy({
  rootDir = process.cwd(),
  policyPath = MIGRATION_GATE_POLICY_PATH,
} = {}) {
  return readJson(rootDir, policyPath);
}

function validatePolicyShape(policy) {
  const errors = [];
  if (!policy || typeof policy !== "object") errors.push("policy must be an object.");
  if (!VALID_POLICY_MODES.has(policy?.currentMode)) {
    errors.push("policy currentMode must be warning-only, release-blocking, or waived.");
  }
  if (!Array.isArray(policy?.approvedRuntimeEnsureInventory)) {
    errors.push("policy approvedRuntimeEnsureInventory is required.");
  }
  if (!Array.isArray(policy?.allowedBootstrapScripts)) {
    errors.push("policy allowedBootstrapScripts is required.");
  }
  if (!Array.isArray(policy?.forbiddenMutationPatterns)) {
    errors.push("policy forbiddenMutationPatterns is required.");
  }
  if (!Array.isArray(policy?.releaseGateRequirements)) {
    errors.push("policy releaseGateRequirements is required.");
  }
  if (!Array.isArray(policy?.waiverRequirements)) {
    errors.push("policy waiverRequirements is required.");
  }
  if (!Array.isArray(policy?.futureCutoverProcedure)) {
    errors.push("policy futureCutoverProcedure is required.");
  }
  return errors;
}

function validateFormalWaiver(policy, generatedAt) {
  const waiver = policy?.formalWaiver ?? {};
  const errors = [];
  if (policy?.currentMode !== "waived") {
    return { accepted: false, errors: ["Policy mode is not waived."], waiver };
  }
  if (String(waiver.status ?? "").toLowerCase() !== "approved") errors.push("formalWaiver.status must be approved.");
  if (!String(waiver.reason ?? "").trim()) errors.push("formalWaiver.reason is required.");
  if (!String(waiver.approvedByRole ?? "").trim()) errors.push("formalWaiver.approvedByRole is required.");
  if (!String(waiver.acceptedAt ?? "").trim()) errors.push("formalWaiver.acceptedAt is required.");
  if (!String(waiver.expiresOn ?? "").trim()) errors.push("formalWaiver.expiresOn is required.");
  const expiry = Date.parse(`${String(waiver.expiresOn ?? "").trim()}T23:59:59.999Z`);
  if (Number.isFinite(expiry) && expiry < Date.parse(generatedAt)) {
    errors.push("formalWaiver.expiresOn is before the evidence timestamp.");
  }
  if (!/runtime ensure|migration|ledger|cutover/i.test(String(waiver.reason ?? ""))) {
    errors.push("formalWaiver.reason must identify the migration/runtime ensure residual being waived.");
  }
  return { accepted: errors.length === 0, errors, waiver };
}

function forbiddenPatternFindings(migrationState, policy) {
  const forbidden = new Set(
    (policy.forbiddenMutationPatterns ?? [])
      .map((entry) => String(typeof entry === "string" ? entry : entry?.pattern ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
  return migrationState.detectedSchemaMutationSources.flatMap((source) =>
    source.matches
      .filter((match) => forbidden.has(String(match.pattern ?? "").toLowerCase()))
      .map((match) =>
        finding({
          category: "forbidden-mutation-pattern",
          sourcePath: source.path,
          title: "Forbidden schema mutation pattern detected",
          impact: "release-blocking",
          status: "forbidden",
          recommendation: "Remove the forbidden mutation or replace it with a reviewed additive migration plan.",
          detail: `${match.pattern} at line ${match.line}`,
        }),
      ),
  );
}

function buildGateFindings({ policy, migrationState, expectedSources }) {
  const findings = [];
  const policyRuntimePaths = policyPaths(policy.approvedRuntimeEnsureInventory);
  const policyBootstrapPaths = policyPaths(policy.allowedBootstrapScripts);
  const expectedRuntimePaths = expectedSourcesByKind("runtime-ensure", expectedSources);
  const detectedPaths = new Set(migrationState.detectedSchemaMutationSourcePaths ?? []);

  for (const error of validatePolicyShape(policy)) {
    findings.push(finding({
      category: "invalid-policy",
      title: "Migration gate policy is invalid",
      impact: "release-blocking",
      status: "invalid",
      recommendation: "Fix the policy before treating migration governance as release-gated.",
      detail: error,
    }));
  }

  for (const sourcePath of migrationState.unknownSchemaMutationSources ?? []) {
    findings.push(finding({
      category: "unknown-schema-mutation-source",
      sourcePath,
      title: "Unknown schema mutation source detected",
      impact: "release-blocking",
      status: "unknown",
      recommendation: "Add the source to the reviewed inventory or remove the schema mutation from runtime code.",
      detail: "Detected by the static migration checker.",
    }));
  }

  for (const sourcePath of migrationState.unledgeredSchemaMutationSources ?? []) {
    findings.push(finding({
      category: "unledgered-schema-mutation-source",
      sourcePath,
      title: "Schema mutation source is not represented in the ledger",
      impact: "release-blocking",
      status: "unledgered",
      recommendation: "Add a ledger entry naming this source before accepting the migration gate.",
      detail: "Detected source was absent from migration ledger text.",
    }));
  }

  for (const sourcePath of migrationState.missingExpectedSources ?? []) {
    findings.push(finding({
      category: "missing-expected-source",
      sourcePath,
      title: "Expected schema source missing",
      impact: "release-blocking",
      status: "missing",
      recommendation: "Restore the expected source or update the reviewed migration policy and ledger.",
    }));
  }

  for (const sourcePath of migrationState.missingExpectedInventoryEntries ?? []) {
    findings.push(finding({
      category: "missing-expected-inventory-entry",
      sourcePath,
      title: "Expected source missing from migration inventory ledger",
      impact: "release-blocking",
      status: "unledgered",
      recommendation: "Update migrations/0000-runtime-schema-inventory.md or a later reviewed ledger entry.",
    }));
  }

  for (const sourcePath of expectedRuntimePaths.filter((sourcePath) => !policyRuntimePaths.has(sourcePath))) {
    findings.push(finding({
      category: "missing-policy-runtime-inventory-entry",
      sourcePath,
      title: "Expected runtime ensure source missing from gate policy",
      impact: "release-blocking",
      status: "missing",
      recommendation: "Add this runtime ensure source to approvedRuntimeEnsureInventory or remove it through reviewed migration cutover.",
    }));
  }

  for (const sourcePath of [...detectedPaths].filter((sourcePath) => sourceKind(sourcePath, expectedSources) === "bootstrap" && !policyBootstrapPaths.has(sourcePath))) {
    findings.push(finding({
      category: "unapproved-bootstrap-mutation-source",
      sourcePath,
      title: "Bootstrap mutation source is not approved by policy",
      impact: "release-blocking",
      status: "unapproved",
      recommendation: "Add the bootstrap source to allowedBootstrapScripts or remove its schema mutation.",
    }));
  }

  findings.push(...forbiddenPatternFindings(migrationState, policy));

  const approvedRuntimeResiduals = migrationState.runtimeEnsureFunctions.filter((source) => source.exists && policyRuntimePaths.has(source.path));
  const runtimeResidualImpact =
    policy.currentMode === "release-blocking"
      ? "release-blocking"
      : policy.currentMode === "warning-only"
        ? "warning-only"
        : "formally-waived";

  for (const source of approvedRuntimeResiduals) {
    findings.push(finding({
      category: "approved-runtime-ensure-residual",
      sourcePath: source.path,
      title: "Approved runtime ensure residual remains active",
      impact: runtimeResidualImpact,
      status: "present",
      recommendation:
        policy.currentMode === "release-blocking"
          ? "Complete reviewed additive migration cutover before accepting a release-blocking migration gate."
          : "Keep this residual visible until the reviewed additive migration ledger cutover is complete.",
      detail: source.description,
    }));
  }

  return { findings, approvedRuntimeResiduals, runtimeResidualImpact };
}

export function buildMigrationGateReport({
  rootDir = process.cwd(),
  policy = null,
  policyPath = MIGRATION_GATE_POLICY_PATH,
  migrationState = null,
  scanRoots = DEFAULT_SCAN_ROOTS,
  ledgerDir = DEFAULT_LEDGER_DIR,
  expectedSources = EXPECTED_SCHEMA_SOURCES,
  generatedAt = new Date().toISOString(),
} = {}) {
  const loadedPolicy = policy ?? loadMigrationGatePolicy({ rootDir, policyPath });
  const state =
    migrationState ??
    scanMigrationState({
      rootDir,
      scanRoots,
      ledgerDir,
      expectedSources,
      generatedAt,
    });
  const checkerValidation = validateMigrationGovernanceReport(state);
  const formalWaiver = validateFormalWaiver(loadedPolicy, generatedAt);
  const { findings, approvedRuntimeResiduals, runtimeResidualImpact } = buildGateFindings({
    policy: loadedPolicy,
    migrationState: state,
    expectedSources,
  });
  if (loadedPolicy.currentMode === "waived" && !formalWaiver.accepted) {
    for (const error of formalWaiver.errors) {
      findings.push(finding({
        category: "invalid-formal-waiver",
        title: "Formal migration gate waiver is invalid",
        impact: "release-blocking",
        status: "invalid",
        recommendation: "Add an approved waiver reason, approving role, acceptance timestamp, and expiry.",
        detail: error,
      }));
    }
  }

  const releaseBlockingFindings = findings.filter((item) => item.impact === "release-blocking");
  const warningOnlyFindings = findings.filter((item) => item.impact === "warning-only");
  const waivedFindings = findings.filter((item) => item.impact === "formally-waived");
  const hasBlockingFindings = releaseBlockingFindings.length > 0;
  const acceptedReleaseBlocking = loadedPolicy.currentMode === "release-blocking" && !hasBlockingFindings;
  const acceptedFormalWaiver = loadedPolicy.currentMode === "waived" && formalWaiver.accepted && !hasBlockingFindings;
  const releaseGateAccepted = acceptedReleaseBlocking || acceptedFormalWaiver;
  const status = hasBlockingFindings
    ? "failed"
    : acceptedReleaseBlocking
      ? "accepted-release-blocking"
      : acceptedFormalWaiver
        ? "accepted-formal-waiver"
        : "warning-only";

  return {
    reportName: "migration-governance-release-gate",
    evidenceType: "MIGRATION_GATE_EVIDENCE",
    generatedAt,
    branch: safeGit(["branch", "--show-current"], rootDir),
    commit: safeGit(["rev-parse", "HEAD"], rootDir),
    policyPath,
    policyName: loadedPolicy.policyName ?? "unknown",
    policyMode: loadedPolicy.currentMode,
    status,
    releaseGateAccepted,
    checkerValidation,
    migrationStateSummary: {
      releaseBlockingFindings: state.releaseSummary?.releaseBlockingFindings ?? null,
      warningOnlyFindings: state.releaseSummary?.warningOnlyFindings ?? null,
      unknownSchemaMutationSourceCount: state.unknownSchemaMutationSources?.length ?? 0,
      unledgeredSchemaMutationSourceCount: state.unledgeredSchemaMutationSources?.length ?? 0,
      missingExpectedSourceCount: state.missingExpectedSources?.length ?? 0,
      missingExpectedInventoryEntryCount: state.missingExpectedInventoryEntries?.length ?? 0,
      runtimeEnsureResidualCount: approvedRuntimeResiduals.length,
    },
    approvedRuntimeEnsureInventory: loadedPolicy.approvedRuntimeEnsureInventory ?? [],
    allowedBootstrapScripts: loadedPolicy.allowedBootstrapScripts ?? [],
    forbiddenMutationPatterns: loadedPolicy.forbiddenMutationPatterns ?? [],
    releaseGateRequirements: loadedPolicy.releaseGateRequirements ?? [],
    waiverRequirements: loadedPolicy.waiverRequirements ?? [],
    futureCutoverProcedure: loadedPolicy.futureCutoverProcedure ?? [],
    formalWaiver: {
      accepted: formalWaiver.accepted,
      reason: formalWaiver.waiver?.reason ?? null,
      approvedByRole: formalWaiver.waiver?.approvedByRole ?? null,
      acceptedAt: formalWaiver.waiver?.acceptedAt ?? null,
      expiresOn: formalWaiver.waiver?.expiresOn ?? null,
      errors: formalWaiver.errors,
    },
    approvedRuntimeResiduals: approvedRuntimeResiduals.map((source) => ({
      path: source.path,
      description: source.description,
      impact: runtimeResidualImpact,
    })),
    runtimeEnsureResidualImpact: runtimeResidualImpact,
    findings,
    releaseBlockingFindings,
    warningOnlyFindings,
    waivedFindings,
    blockerCoverage: {
      migrationGovernance: releaseGateAccepted,
      acceptedReleaseBlocking,
      acceptedFormalWaiver,
    },
    safety: {
      nonMutating: true,
      requiresDatabase: false,
      mutatesDatabase: false,
      executesDdl: false,
      performsRuntimeDdl: false,
      productionMutationAttempted: false,
      schemaChangedByCodex: false,
      runtimeEnsurePathsRemoved: false,
      adHocDdlAdded: false,
    },
    outputPaths: {
      markdown: MIGRATION_GATE_MD_PATH,
      json: MIGRATION_GATE_JSON_PATH,
    },
  };
}

export function validateMigrationGateReport(report) {
  const errors = [];
  if (report.reportName !== "migration-governance-release-gate") errors.push("reportName is invalid.");
  if (report.evidenceType !== "MIGRATION_GATE_EVIDENCE") errors.push("evidenceType is invalid.");
  if (!VALID_POLICY_MODES.has(report.policyMode)) errors.push("policyMode is invalid.");
  if (!report.generatedAt || !report.branch || !report.commit) errors.push("generatedAt, branch, and commit are required.");
  if (report.safety?.nonMutating !== true) errors.push("gate must be non-mutating.");
  if (report.safety?.requiresDatabase !== false) errors.push("gate must not require database access.");
  if (report.safety?.mutatesDatabase !== false) errors.push("gate must not mutate database.");
  if (report.safety?.executesDdl !== false || report.safety?.performsRuntimeDdl !== false) errors.push("gate must not execute DDL.");
  if (report.safety?.productionMutationAttempted === true) errors.push("gate must not mutate production.");
  if (!Array.isArray(report.findings)) errors.push("findings are required.");
  if (report.status === "accepted-release-blocking" && report.policyMode !== "release-blocking") {
    errors.push("accepted-release-blocking status requires release-blocking policy mode.");
  }
  if (report.status === "accepted-formal-waiver" && (report.policyMode !== "waived" || report.formalWaiver?.accepted !== true)) {
    errors.push("accepted-formal-waiver status requires an accepted formal waiver.");
  }
  if (report.releaseBlockingFindings?.length > 0 && report.releaseGateAccepted === true) {
    errors.push("releaseGateAccepted cannot be true with release-blocking findings.");
  }
  if (report.blockerCoverage?.migrationGovernance === true && report.releaseGateAccepted !== true) {
    errors.push("migration governance blocker coverage requires an accepted release gate.");
  }
  return { ok: errors.length === 0, errors };
}

export function renderMigrationGateReport(report) {
  const lines = [
    "# Migration Governance Release Gate",
    "",
    "Safety: non-mutating static source and policy validation only; no database connection, credentials, runtime DDL, or schema mutation.",
    `Generated at: ${report.generatedAt}`,
    `Branch: ${report.branch}`,
    `Commit: ${report.commit}`,
    `Policy: ${report.policyPath}`,
    `Policy mode: ${report.policyMode}`,
    `Status: ${report.status}`,
    `Release gate accepted: ${report.releaseGateAccepted ? "yes" : "no"}`,
    "",
    "## Gate Summary",
    "",
    `- Unknown mutation sources: ${report.migrationStateSummary.unknownSchemaMutationSourceCount}`,
    `- Unledgered mutation sources: ${report.migrationStateSummary.unledgeredSchemaMutationSourceCount}`,
    `- Missing expected sources: ${report.migrationStateSummary.missingExpectedSourceCount}`,
    `- Missing expected inventory entries: ${report.migrationStateSummary.missingExpectedInventoryEntryCount}`,
    `- Runtime ensure residuals: ${report.migrationStateSummary.runtimeEnsureResidualCount}`,
    `- Runtime ensure residual impact: ${report.runtimeEnsureResidualImpact}`,
    "",
    "## Formal Waiver",
    "",
    `- Accepted: ${report.formalWaiver.accepted ? "yes" : "no"}`,
    `- Approved by role: ${report.formalWaiver.approvedByRole ?? "n/a"}`,
    `- Accepted at: ${report.formalWaiver.acceptedAt ?? "n/a"}`,
    `- Expires on: ${report.formalWaiver.expiresOn ?? "n/a"}`,
    `- Reason: ${report.formalWaiver.reason ?? "n/a"}`,
    "",
    "## Approved Runtime Ensure Residuals",
    "",
    ...(report.approvedRuntimeResiduals.length
      ? report.approvedRuntimeResiduals.map((source) => `- [${source.impact}] ${source.path}: ${source.description}`)
      : ["- None."]),
    "",
    "## Gate Findings",
    "",
    ...(report.findings.length
      ? report.findings.map((item) => `- [${item.impact}] ${item.category}: ${item.sourcePath ?? "policy"} (${item.status}) - ${item.recommendation}`)
      : ["- None."]),
    "",
    "## Future Cutover Procedure",
    "",
    ...(report.futureCutoverProcedure.length ? report.futureCutoverProcedure.map((item) => `- ${item}`) : ["- Not recorded."]),
  ];
  return `${lines.join("\n")}\n`;
}

export function writeMigrationGateEvidence(report, {
  rootDir = process.cwd(),
  evidenceDir = DEFAULT_MIGRATION_EVIDENCE_DIR,
} = {}) {
  const validation = validateMigrationGateReport(report);
  if (!validation.ok) {
    throw new Error(`Migration gate report validation failed: ${validation.errors.join("; ")}`);
  }
  const markdownPath = normalizeRelativePath(path.join(evidenceDir, MIGRATION_GATE_MARKDOWN));
  const jsonPath = normalizeRelativePath(path.join(evidenceDir, MIGRATION_GATE_JSON));
  writeText(rootDir, markdownPath, renderMigrationGateReport(report));
  writeText(rootDir, jsonPath, `${JSON.stringify({ ...report, validation }, null, 2)}\n`);
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
    policyPath: MIGRATION_GATE_POLICY_PATH,
    evidenceDir: DEFAULT_MIGRATION_EVIDENCE_DIR,
    json: false,
    writeEvidence: true,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (REFUSED_FLAGS.has(arg)) {
      throw new Error(`${arg} is refused. Migration gate is static and non-mutating.`);
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
    if (arg === "--policy") {
      options.policyPath = normalizeRelativePath(nextValue(args, index, arg));
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
    "Usage: pnpm run migrations:gate -- [options]",
    "",
    "Static, non-mutating migration governance release gate.",
    "Writes docs/production-scale/evidence/latest-migration-gate.{md,json}.",
    "",
    "Options:",
    "  --json                    Print JSON report instead of Markdown.",
    "  --write-evidence          Write evidence outputs. Default.",
    "  --no-write-evidence       Do not write evidence outputs.",
    "  --root <path>             Project root. Defaults to current working directory.",
    "  --policy <path>           Policy path. Defaults to docs/production-scale/migration-governance-policy.json.",
    "  --evidence-dir <path>     Output directory. Defaults to docs/production-scale/evidence.",
    "",
    "Refused:",
    "  --apply, --execute, --run-ddl, --ddl, --mutate, --write-db",
  ].join("\n"));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const report = buildMigrationGateReport({
    rootDir: options.rootDir,
    policyPath: options.policyPath,
  });
  const validation = validateMigrationGateReport(report);
  if (!validation.ok) {
    throw new Error(`Migration gate report validation failed: ${validation.errors.join("; ")}`);
  }
  let outputs = null;
  if (options.writeEvidence) {
    outputs = writeMigrationGateEvidence(report, {
      rootDir: options.rootDir,
      evidenceDir: options.evidenceDir,
    });
  }
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderMigrationGateReport(report));
  }
  if (outputs) {
    console.log(`Evidence Markdown: ${outputs.markdownPath}`);
    console.log(`Evidence JSON: ${outputs.jsonPath}`);
  }
  if (report.status === "failed") process.exitCode = 1;
}

if (process.argv[1] && existsSync(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
