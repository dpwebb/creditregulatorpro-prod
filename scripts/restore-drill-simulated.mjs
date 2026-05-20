import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

export const DEFAULT_SIMULATED_RESTORE_EVIDENCE_DIR = "docs/production-scale/evidence";
export const SIMULATED_RESTORE_MARKERS = {
  authSession: "SIMULATED_AUTH_SESSION_CHECK_PASSED",
  packetPdf: "SIMULATED_PACKET_PDF_CHECK_PASSED",
  responseQueue: "SIMULATED_RESPONSE_QUEUE_CHECK_PASSED",
  cleanupLifecycle: "SIMULATED_CLEANUP_LIFECYCLE_CHECK_PASSED",
};

const PRODUCTION_ENV_KEYS = ["NODE_ENV", "CRP_ENV", "FLOOT_ENV", "APP_ENV", "VERCEL_ENV", "DEPLOYMENT_ENV", "ENVIRONMENT"];
const PRODUCTION_SECRET_KEYS = ["FLOOT_DATABASE_URL", "DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "CRP_DATABASE_URL"];

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
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

export function detectSimulatedRestoreProductionEnvironment(env = process.env) {
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

function simulatedCheck(name, marker, notes) {
  return {
    name,
    evidenceType: "SIMULATED",
    status: "passed",
    marker,
    notes,
  };
}

export function validateSimulatedRestoreDrillReport(report) {
  const errors = [];
  if (report.evidenceType !== "SIMULATED") errors.push("report evidenceType must be SIMULATED");
  if (report.humanObservedRestoreProofStillRequired !== true) {
    errors.push("humanObservedRestoreProofStillRequired must be true");
  }
  if (!report.syntheticBackupMetadata?.backupId) errors.push("synthetic backup metadata is missing backupId");
  if (!report.syntheticRestoreTargetMetadata?.targetId) errors.push("synthetic restore target metadata is missing targetId");
  if (!report.syntheticRpoRto?.rpoTarget || !report.syntheticRpoRto?.rpoActual) errors.push("synthetic RPO values are missing");
  if (!report.syntheticRpoRto?.rtoTarget || !report.syntheticRpoRto?.rtoActual) errors.push("synthetic RTO values are missing");

  const postRestoreMarkers = new Set((report.postRestoreChecks ?? []).map((check) => check.marker));
  for (const marker of Object.values(SIMULATED_RESTORE_MARKERS)) {
    if (!postRestoreMarkers.has(marker)) errors.push(`missing post-restore marker ${marker}`);
  }

  if (report.safety?.productionBackupsAccessed !== false) errors.push("production backups must not be accessed");
  if (report.safety?.productionDataMutated !== false) errors.push("production data must not be mutated");
  if (report.safety?.runsDump !== false || report.safety?.runsRestore !== false) errors.push("simulated drill must not dump or restore");
  if (report.safety?.liveExternalProvidersConnected !== false) errors.push("external providers must not be connected");

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function buildSimulatedRestoreDrillReport({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  env = process.env,
  simulationId = `sim-restore-${randomUUID()}`,
} = {}) {
  const productionEnvironment = detectSimulatedRestoreProductionEnvironment(env);
  if (productionEnvironment.productionLike) {
    throw new Error(`Refusing SIMULATED restore drill in a production-like environment: ${productionEnvironment.reason}`);
  }

  const branch = safeGit(["branch", "--show-current"], rootDir);
  const commit = safeGit(["rev-parse", "HEAD"], rootDir);
  const tempStateRoot = normalizeRelativePath(path.join("SIMULATED-local-temp-state", simulationId));

  const report = {
    reportName: "restore-drill-simulated",
    evidenceType: "SIMULATED",
    generatedAt,
    branch,
    commit,
    simulationId,
    status: "passed",
    humanObservedRestoreProofStillRequired: true,
    readinessClaim: "No production, broad-production, or production-at-scale readiness claim is made.",
    syntheticBackupMetadata: {
      evidenceType: "SIMULATED",
      backupId: `SIMULATED-BACKUP-${simulationId}`,
      sourceEnvironment: "SIMULATED-local-fixture-source",
      sourceCommit: commit,
      createdAt: generatedAt,
      containsProductionData: false,
      containsRealConsumerPii: false,
      productionBackupAccessed: false,
    },
    syntheticRestoreTargetMetadata: {
      evidenceType: "SIMULATED",
      targetId: `SIMULATED-RESTORE-TARGET-${simulationId}`,
      targetEnvironment: "SIMULATED-local-temp-state",
      tempStateRoot,
      productionTarget: false,
      restoreExecuted: false,
    },
    syntheticRpoRto: {
      evidenceType: "SIMULATED",
      rpoTarget: "SIMULATED-RPO-target-15-minutes",
      rpoActual: "SIMULATED-RPO-observed-5-minutes",
      rtoTarget: "SIMULATED-RTO-target-30-minutes",
      rtoActual: "SIMULATED-RTO-observed-2-minutes",
    },
    preRestoreChecks: [
      simulatedCheck("SIMULATED source metadata present", "SIMULATED_SOURCE_METADATA_PRESENT", "Synthetic backup ID, source environment, and source commit were created."),
      simulatedCheck("SIMULATED restore target metadata present", "SIMULATED_RESTORE_TARGET_METADATA_PRESENT", "Synthetic local temp restore target metadata was created."),
      simulatedCheck("SIMULATED production environment guard", "SIMULATED_PRODUCTION_ENV_GUARD_PASSED", "Production-looking environment variables and database targets were not detected."),
      simulatedCheck("SIMULATED provider isolation", "SIMULATED_EXTERNAL_PROVIDER_ISOLATION_PASSED", "No email, webhook, Stripe, PostGrid, cloud storage, or other live provider calls are made."),
    ],
    postRestoreChecks: [
      simulatedCheck("SIMULATED auth/session marker", SIMULATED_RESTORE_MARKERS.authSession, "Synthetic auth/session post-restore check marker verified."),
      simulatedCheck("SIMULATED packet PDF marker", SIMULATED_RESTORE_MARKERS.packetPdf, "Synthetic packet PDF post-restore check marker verified."),
      simulatedCheck("SIMULATED response queue marker", SIMULATED_RESTORE_MARKERS.responseQueue, "Synthetic response queue post-restore check marker verified."),
      simulatedCheck("SIMULATED cleanup/lifecycle marker", SIMULATED_RESTORE_MARKERS.cleanupLifecycle, "Synthetic cleanup/lifecycle post-restore check marker verified."),
    ],
    safety: {
      evidenceType: "SIMULATED",
      syntheticFixturesOnly: true,
      localTempStateOnly: true,
      productionBackupsAccessed: false,
      productionDatabaseDumpsAccessed: false,
      productionDataMutated: false,
      realConsumerPiiUsed: false,
      liveExternalProvidersConnected: false,
      runsDump: false,
      runsRestore: false,
      sendsMail: false,
      changesParserBehavior: false,
      changesPacketWording: false,
      changesQueueSemantics: false,
      changesSchemaBehavior: false,
    },
  };

  const validation = validateSimulatedRestoreDrillReport(report);
  if (!validation.ok) {
    throw new Error(`SIMULATED restore drill validation failed: ${validation.errors.join("; ")}`);
  }
  return {
    ...report,
    validation,
  };
}

export function renderSimulatedRestoreDrillMarkdown(report) {
  const lines = [
    "# SIMULATED Restore Drill Evidence",
    "",
    "SIMULATED evidence only. This is not actual disaster recovery completion and is not production proof.",
    "",
    `Generated at: ${report.generatedAt}`,
    `Branch: \`${report.branch}\``,
    `Commit: \`${report.commit}\``,
    `Simulation ID: \`${report.simulationId}\``,
    `Status: ${report.status}`,
    `Human-observed restore proof still required: ${report.humanObservedRestoreProofStillRequired ? "yes" : "no"}`,
    "",
    "## SIMULATED Backup Metadata",
    "",
    `- Backup ID: \`${report.syntheticBackupMetadata.backupId}\``,
    `- Source environment: ${report.syntheticBackupMetadata.sourceEnvironment}`,
    `- Source commit: \`${report.syntheticBackupMetadata.sourceCommit}\``,
    "- Production backup accessed: no",
    "- Real consumer PII used: no",
    "",
    "## SIMULATED Restore Target Metadata",
    "",
    `- Restore target: ${report.syntheticRestoreTargetMetadata.targetEnvironment}`,
    `- Target ID: \`${report.syntheticRestoreTargetMetadata.targetId}\``,
    `- Local temp state root: \`${report.syntheticRestoreTargetMetadata.tempStateRoot}\``,
    "- Restore executed: no",
    "",
    "## SIMULATED RPO/RTO",
    "",
    `- RPO target: ${report.syntheticRpoRto.rpoTarget}`,
    `- RPO actual: ${report.syntheticRpoRto.rpoActual}`,
    `- RTO target: ${report.syntheticRpoRto.rtoTarget}`,
    `- RTO actual: ${report.syntheticRpoRto.rtoActual}`,
    "",
    "## SIMULATED Pre-Restore Checks",
    "",
    ...report.preRestoreChecks.map((check) => `- ${check.marker}: ${check.status} - ${check.notes}`),
    "",
    "## SIMULATED Post-Restore Checks",
    "",
    ...report.postRestoreChecks.map((check) => `- ${check.marker}: ${check.status} - ${check.notes}`),
    "",
    "## Safety",
    "",
    "- Production backups accessed: no",
    "- Production database dumps accessed: no",
    "- Production data mutated: no",
    "- Live external providers connected: no",
    "- Dump or restore command executed: no",
    "- Parser, OCR, packet wording, queue semantics, auth rules, deployment activation, and schema behavior changed: no",
    "",
    "## Remaining Blocker",
    "",
    "SIMULATED restore proof does not close the disaster recovery blocker. A human-observed restore drill with signed, sanitized evidence is still required before broader production or production-at-scale claims.",
  ];
  return `${lines.join("\n")}\n`;
}

export function writeSimulatedRestoreDrillEvidence(report, {
  rootDir = process.cwd(),
  evidenceDir = DEFAULT_SIMULATED_RESTORE_EVIDENCE_DIR,
} = {}) {
  const absoluteEvidenceDir = repoPath(rootDir, evidenceDir);
  mkdirSync(absoluteEvidenceDir, { recursive: true });
  const markdownPath = normalizeRelativePath(path.join(evidenceDir, "latest-restore-drill-simulated.md"));
  const jsonPath = normalizeRelativePath(path.join(evidenceDir, "latest-restore-drill-simulated.json"));
  writeFileSync(repoPath(rootDir, markdownPath), renderSimulatedRestoreDrillMarkdown(report), "utf8");
  writeFileSync(repoPath(rootDir, jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { markdownPath, jsonPath };
}

function parseArgs(args) {
  const options = {
    rootDir: process.cwd(),
    evidenceDir: DEFAULT_SIMULATED_RESTORE_EVIDENCE_DIR,
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
        "Usage: pnpm run restore:drill:simulated -- [options]",
        "",
        "Creates SIMULATED restore drill evidence using synthetic metadata and local temp-state labels only.",
        "No production backups, database dumps, external providers, or restore commands are accessed.",
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
  const report = buildSimulatedRestoreDrillReport({ rootDir: options.rootDir });
  const outputs = writeSimulatedRestoreDrillEvidence(report, {
    rootDir: options.rootDir,
    evidenceDir: options.evidenceDir,
  });
  console.log("SIMULATED restore drill evidence generated.");
  console.log("SIMULATED evidence is not production proof and does not complete disaster recovery.");
  console.log(`Markdown: ${outputs.markdownPath}`);
  console.log(`JSON: ${outputs.jsonPath}`);
  console.log("Human-observed restore proof remains required.");
  if (options.json) console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
