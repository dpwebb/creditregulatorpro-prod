import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_BLOCKER_REGISTRY_PATH = "docs/production-scale/blocker-registry.json";
export const DEFAULT_AUDIT_PATH = "docs/production-at-scale-maximum-audit.md";
export const DEFAULT_EVIDENCE_DIR = "docs/production-scale/evidence";

const OUTPUT_GROUPS = [
  { key: "automatedLocal", title: "Automated Local Evidence", category: "automated-local" },
  { key: "simulated", title: "Simulated Evidence", category: "simulated" },
  { key: "staging", title: "Staging Evidence", category: "staging" },
  { key: "readOnlyProduction", title: "Read-Only Production Evidence", category: "read-only-production" },
  { key: "humanObserved", title: "Human-Observed Evidence", category: "human-observed" },
];

const PRODUCTION_ENV_KEYS = ["NODE_ENV", "CRP_ENV", "FLOOT_ENV", "APP_ENV", "VERCEL_ENV", "DEPLOYMENT_ENV", "ENVIRONMENT"];
const PRODUCTION_SECRET_KEYS = ["FLOOT_DATABASE_URL", "DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "CRP_DATABASE_URL"];

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
}

function readText(rootDir, relativePath) {
  return readFileSync(repoPath(rootDir, relativePath), "utf8");
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

export function detectProductionEnvironment(env = process.env) {
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

export function parseAuditMetadata(auditText, auditPath = DEFAULT_AUDIT_PATH) {
  const auditDateMatch = auditText.match(/^Audit date:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s*$/m);
  return {
    path: auditPath,
    auditDate: auditDateMatch?.[1] ?? null,
    auditDateParseable: Boolean(auditDateMatch),
  };
}

export function parseAuditBlockerRows(auditText) {
  return auditText
    .split(/\r?\n/)
    .filter((line) => /^\|\s*[0-9]+\s*\|/.test(line))
    .map((line) => {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      return {
        number: Number(cells[0]),
        severity: cells[1],
        area: cells[2],
        affectedFilesRoutesFunctions: cells[3],
        evidence: cells[4],
        recommendedNextAction: cells[7],
      };
    })
    .filter((row) => Number.isInteger(row.number));
}

export function loadBlockerRegistry({ rootDir = process.cwd(), registryPath = DEFAULT_BLOCKER_REGISTRY_PATH } = {}) {
  return {
    ...JSON.parse(readText(rootDir, registryPath)),
    registryPath,
  };
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) counts[item[key]] = (counts[item[key]] ?? 0) + 1;
  return counts;
}

function blockerSummary(blocker) {
  return {
    number: blocker.number,
    title: blocker.title,
    severity: blocker.severity,
    area: blocker.area,
    currentStatus: blocker.currentStatus,
    proofTypeRequired: blocker.proofTypeRequired,
    allowedProofCommands: blocker.allowedProofCommands,
    forbiddenProofTypes: blocker.forbiddenProofTypes,
    productionMutationForbidden: blocker.productionMutationForbidden === true,
    simulatedProofAcceptable: blocker.simulatedProofAcceptable === true,
    humanProofRequired: blocker.humanProofRequired === true,
    relatedEvidenceOutputPaths: blocker.relatedEvidenceOutputPaths,
    recommendedNextAction: blocker.recommendedNextAction,
  };
}

export function validateBlockerRegistry(registry, auditRows = []) {
  const errors = [];
  const blockers = Array.isArray(registry.blockers) ? registry.blockers : [];
  const statusValues = new Set(registry.statusValues ?? []);
  const proofCategories = new Set(registry.proofCategories ?? []);
  const recognizedCommands = new Set(registry.recognizedEvidenceCommands ?? []);
  const expectedCount = Number(registry.expectedBlockerCount ?? 25);

  if (blockers.length !== expectedCount) errors.push(`Expected ${expectedCount} blockers, found ${blockers.length}.`);
  const numbers = blockers.map((blocker) => blocker.number);
  const duplicateNumbers = numbers.filter((number, index) => numbers.indexOf(number) !== index);
  if (duplicateNumbers.length > 0) errors.push(`Duplicate blocker number(s): ${Array.from(new Set(duplicateNumbers)).join(", ")}.`);
  const missingNumbers = Array.from({ length: expectedCount }, (_, index) => index + 1).filter((number) => !numbers.includes(number));
  if (missingNumbers.length > 0) errors.push(`Missing blocker number(s): ${missingNumbers.join(", ")}.`);

  for (const row of auditRows) {
    const blocker = blockers.find((item) => item.number === row.number);
    if (!blocker) {
      errors.push(`Audit blocker ${row.number} is absent from the registry.`);
      continue;
    }
    if (blocker.severity !== row.severity) errors.push(`Blocker ${row.number} severity mismatch: registry ${blocker.severity}, audit ${row.severity}.`);
    if (blocker.area !== row.area) errors.push(`Blocker ${row.number} area mismatch: registry ${blocker.area}, audit ${row.area}.`);
  }

  for (const blocker of blockers) {
    if (!Number.isInteger(blocker.number)) errors.push(`Blocker has invalid number: ${JSON.stringify(blocker.number)}.`);
    if (!blocker.title) errors.push(`Blocker ${blocker.number} is missing title.`);
    if (!blocker.severity) errors.push(`Blocker ${blocker.number} is missing severity.`);
    if (!blocker.area) errors.push(`Blocker ${blocker.number} is missing area.`);
    if (!Array.isArray(blocker.affectedFilesRoutesFunctions) || blocker.affectedFilesRoutesFunctions.length === 0) {
      errors.push(`Blocker ${blocker.number} is missing affected files/routes/functions.`);
    }
    if (!statusValues.has(blocker.currentStatus)) errors.push(`Blocker ${blocker.number} has invalid status ${blocker.currentStatus}.`);
    if (!Array.isArray(blocker.proofCategories) || blocker.proofCategories.length === 0) {
      errors.push(`Blocker ${blocker.number} is missing proof categories.`);
    } else {
      for (const category of blocker.proofCategories) {
        if (!proofCategories.has(category)) errors.push(`Blocker ${blocker.number} has invalid proof category ${category}.`);
      }
    }
    if (!blocker.proofTypeRequired) errors.push(`Blocker ${blocker.number} is missing proofTypeRequired.`);
    if (!Array.isArray(blocker.allowedProofCommands)) {
      errors.push(`Blocker ${blocker.number} is missing allowedProofCommands.`);
    } else {
      for (const command of blocker.allowedProofCommands) {
        if (!recognizedCommands.has(command)) errors.push(`Blocker ${blocker.number} has unrecognized evidence command: ${command}.`);
      }
    }
    if (!Array.isArray(blocker.forbiddenProofTypes) || blocker.forbiddenProofTypes.length === 0) {
      errors.push(`Blocker ${blocker.number} is missing forbiddenProofTypes.`);
    }
    if (blocker.productionMutationForbidden !== true) errors.push(`Blocker ${blocker.number} must forbid production mutation.`);
    if (!Array.isArray(blocker.relatedEvidenceOutputPaths) || blocker.relatedEvidenceOutputPaths.length === 0) {
      errors.push(`Blocker ${blocker.number} is missing related evidence output paths.`);
    }
    if (!blocker.recommendedNextAction) errors.push(`Blocker ${blocker.number} is missing recommendedNextAction.`);
    if (blocker.proofCategories?.includes("simulated") && blocker.simulatedProofAcceptable !== true) {
      errors.push(`Blocker ${blocker.number} has simulated proof category but does not allow simulated proof.`);
    }
    if (
      blocker.currentStatus === "fixed" &&
      blocker.humanProofRequired !== true &&
      (!Array.isArray(blocker.allowedProofCommands) || !blocker.allowedProofCommands.some((command) => recognizedCommands.has(command)))
    ) {
      errors.push(`Blocker ${blocker.number} cannot be fixed without recognized evidence commands or human proof.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

function runShellCommand(command, rootDir) {
  if (process.platform === "win32") {
    return spawnSync("cmd.exe", ["/d", "/s", "/c", command], { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  }
  return spawnSync(command, { cwd: rootDir, encoding: "utf8", shell: true, stdio: ["ignore", "pipe", "pipe"] });
}

function parseJsonFromOutput(output) {
  const text = String(output ?? "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function collectDashboardEvidence({ rootDir = process.cwd(), dashboardReport = null, runCommand = runShellCommand } = {}) {
  if (dashboardReport) {
    const skipCount = Number(dashboardReport.summary?.skip ?? 0);
    return {
      available: true,
      command: "pnpm run operator:dashboard -- --json",
      exitCode: 0,
      skipCount,
      checksSkipped: skipCount > 0,
      treatsSkipAsPass: false,
      summary: dashboardReport.summary ?? null,
      releaseEvidenceSemantics: dashboardReport.releaseEvidenceSemantics ?? null,
    };
  }

  const result = runCommand("pnpm run operator:dashboard -- --json", rootDir);
  const parsed = result.status === 0 ? parseJsonFromOutput(result.stdout) : null;
  if (!parsed) {
    return {
      available: false,
      command: "pnpm run operator:dashboard -- --json",
      exitCode: result.status ?? 1,
      skipCount: null,
      checksSkipped: "unknown",
      treatsSkipAsPass: false,
      summary: null,
      error: "operator dashboard JSON was unavailable; no secrets or command stderr are stored in evidence.",
    };
  }

  const skipCount = Number(parsed.summary?.skip ?? 0);
  return {
    available: true,
    command: "pnpm run operator:dashboard -- --json",
    exitCode: result.status ?? 0,
    skipCount,
    checksSkipped: skipCount > 0,
    treatsSkipAsPass: false,
    summary: parsed.summary ?? null,
    releaseEvidenceSemantics: parsed.releaseEvidenceSemantics ?? null,
  };
}

export function collectIngestWorkerBoundaryEvidence({ rootDir = process.cwd() } = {}) {
  const checks = [
    {
      name: "request-bound ingest gate",
      passed: readText(rootDir, "endpoints/ingest/process_POST.ts").includes("shouldAllowRequestBoundIngestProcessing"),
    },
    {
      name: "worker heartbeat persistence",
      passed: readText(rootDir, "helpers/ingestProcessingQueueSchema.ts").includes("ingest_processing_worker_heartbeat"),
    },
    {
      name: "worker heartbeat writer",
      passed: readText(rootDir, "scripts/ingest-processing-worker.ts").includes("recordIngestProcessingWorkerHeartbeat"),
    },
    {
      name: "safe no-worker status",
      passed: readText(rootDir, "helpers/ingestUploadStatusPresenter.ts").includes("stalled_no_worker_heartbeat"),
    },
    {
      name: "staging compose worker service",
      passed: readText(rootDir, "docker-compose.yml").includes("creditregulatorpro-staging-ingest-worker"),
    },
    {
      name: "production compose worker service",
      passed: readText(rootDir, "docker-compose.production.yml").includes("creditregulatorpro-ingest-worker"),
    },
    {
      name: "deploy workflow preflight",
      passed:
        readText(rootDir, ".github/workflows/deploy-staging.yml").includes("ingest:worker-boundary-evidence") &&
        readText(rootDir, ".github/workflows/deploy-production.yml").includes("ingest:worker-boundary-evidence"),
    },
    {
      name: "deploy workflow starts worker services",
      passed:
        readText(rootDir, ".github/workflows/deploy-staging.yml").includes("creditregulatorpro-staging creditregulatorpro-staging-ingest-worker") &&
        readText(rootDir, ".github/workflows/deploy-production.yml").includes("creditregulatorpro creditregulatorpro-ingest-worker"),
    },
  ];
  return {
    available: true,
    status: checks.every((check) => check.passed) ? "passed" : "failed",
    productionProof: false,
    checks,
  };
}

export function buildProductionScaleEvidenceReport({
  rootDir = process.cwd(),
  registry = null,
  auditText = null,
  auditPath = DEFAULT_AUDIT_PATH,
  dashboardReport = null,
  generatedAt = new Date().toISOString(),
  env = process.env,
} = {}) {
  const productionEnvironment = detectProductionEnvironment(env);
  if (productionEnvironment.productionLike) {
    throw new Error(`Refusing to generate evidence in a production-like environment: ${productionEnvironment.reason}`);
  }

  const loadedRegistry = registry ?? loadBlockerRegistry({ rootDir });
  const loadedAuditText = auditText ?? readText(rootDir, auditPath);
  const audit = parseAuditMetadata(loadedAuditText, auditPath);
  const auditRows = parseAuditBlockerRows(loadedAuditText);
  const validation = validateBlockerRegistry(loadedRegistry, auditRows);
  if (!validation.valid) {
    throw new Error(`Production-scale blocker registry validation failed:\n${validation.errors.join("\n")}`);
  }

  const blockers = loadedRegistry.blockers.map(blockerSummary);
  const evidence = {};
  for (const group of OUTPUT_GROUPS) {
    evidence[group.key] = {
      title: group.title,
      category: group.category,
      productionProof: false,
      commandExecutedByThisReport: false,
      blockers: blockers.filter((blocker) => {
        const source = loadedRegistry.blockers.find((item) => item.number === blocker.number);
        return source?.proofCategories?.includes(group.category);
      }),
    };
  }
  evidence.readOnlyProduction.productionProof = "human-required-read-only";
  evidence.simulated.label = "SIMULATED";
  evidence.simulated.notice = "SIMULATED evidence is local/staging-safe only and is not production proof.";

  const waived = blockers.filter((blocker) => blocker.currentStatus === "waived");
  const unresolved = blockers.filter((blocker) => !["fixed", "waived"].includes(blocker.currentStatus));
  const dashboard = collectDashboardEvidence({ rootDir, dashboardReport });
  const ingestWorkerBoundary = collectIngestWorkerBoundaryEvidence({ rootDir });
  const auditNumbers = new Set(auditRows.map((row) => row.number));
  const registryNumbers = new Set(blockers.map((blocker) => blocker.number));
  const allAuditBlockersRepresented = auditRows.length === loadedRegistry.expectedBlockerCount &&
    [...auditNumbers].every((number) => registryNumbers.has(number));

  return {
    reportName: "production-scale-blocker-evidence",
    generatedAt,
    branch: safeGit(["branch", "--show-current"], rootDir),
    commit: safeGit(["rev-parse", "HEAD"], rootDir),
    workingTreeClean: safeGit(["status", "--short"], rootDir, "") === "",
    audit,
    registry: {
      path: loadedRegistry.registryPath ?? DEFAULT_BLOCKER_REGISTRY_PATH,
      schemaVersion: loadedRegistry.schemaVersion,
      expectedBlockerCount: loadedRegistry.expectedBlockerCount,
      actualBlockerCount: blockers.length,
      allAuditBlockersRepresented,
      statusCounts: countBy(blockers, "currentStatus"),
      validation,
    },
    dashboard,
    ingestWorkerBoundary,
    safety: {
      productionMutationForbidden: true,
      productionEnvironmentDetected: false,
      productionDataMutated: false,
      liveExternalProvidersConnected: false,
      realConsumerPiiUsed: false,
      simulatedEvidenceIsProductionProof: false,
      dashboardPassAloneIsReleaseEvidence: false,
    },
    statements: [
      "SIMULATED evidence is not production proof.",
      "Dashboard PASS alone is not sufficient release evidence.",
      "Skipped dashboard checks must remain visible and cannot be treated as PASS.",
      "This report does not claim production-at-scale readiness.",
    ],
    evidence,
    waivedBlockers: waived,
    unresolvedBlockers: unresolved,
  };
}

function formatList(values) {
  if (!values || values.length === 0) return "none";
  return values.map((value) => `\`${value}\``).join(", ");
}

function renderBlockerList(blockers, { simulated = false } = {}) {
  if (blockers.length === 0) return ["- None."];
  return blockers.map((blocker) => {
    const prefix = simulated ? "SIMULATED - " : "";
    return [
      `- ${prefix}#${blocker.number} ${blocker.title} (${blocker.severity}; ${blocker.currentStatus})`,
      `  Proof required: ${blocker.proofTypeRequired}`,
      `  Allowed commands: ${formatList(blocker.allowedProofCommands)}`,
      `  Next action: ${blocker.recommendedNextAction}`,
    ].join("\n");
  });
}

export function renderProductionScaleEvidenceMarkdown(report) {
  const skippedText = report.dashboard.checksSkipped === "unknown"
    ? "unknown"
    : report.dashboard.checksSkipped
      ? `yes (${report.dashboard.skipCount} dashboard SKIP row(s))`
      : "no";
  const lines = [
    "# Latest Production-Scale Evidence",
    "",
    `Generated at: ${report.generatedAt}`,
    `Current branch: \`${report.branch}\``,
    `Current commit hash: \`${report.commit}\``,
    `Working tree clean when generated: ${report.workingTreeClean ? "yes" : "no"}`,
    `Audit file used: \`${report.audit.path}\``,
    `Audit date from file: ${report.audit.auditDate ?? "not parseable"}`,
    `All 25 blockers represented: ${report.registry.actualBlockerCount === 25 && report.registry.allAuditBlockersRepresented ? "yes" : "no"}`,
    `Any checks skipped: ${skippedText}`,
    `Dashboard exact commands recorded: ${report.dashboard.releaseEvidenceSemantics?.exactCommandsRequired ? "yes" : "not available"}`,
    `Ingest worker boundary static proof: ${report.ingestWorkerBoundary.status}`,
    "",
    "## Required Warnings",
    "",
    "- SIMULATED evidence is not production proof.",
    "- Dashboard PASS alone is not sufficient release evidence.",
    "- Dashboard SKIP rows are not treated as PASS.",
    "- Release evidence must record exact commands, not dashboard headline status alone.",
    "- This report does not claim production-at-scale readiness.",
    "- Production mutation, real consumer PII, production database dumps, live provider delivery, and credentials are forbidden for this framework.",
    "",
    "## Registry Summary",
    "",
    `- Registry path: \`${report.registry.path}\``,
    `- Expected blockers: ${report.registry.expectedBlockerCount}`,
    `- Actual blockers: ${report.registry.actualBlockerCount}`,
    `- Registry validation: ${report.registry.validation.valid ? "passed" : "failed"}`,
    `- Status counts: ${Object.entries(report.registry.statusCounts).map(([status, count]) => `${status}=${count}`).join(", ")}`,
    "",
  ];

  for (const group of OUTPUT_GROUPS) {
    lines.push(`## ${group.title}`, "");
    if (group.key === "simulated") {
      lines.push("SIMULATED: Local or staging-safe simulated evidence is separated here and is never rendered as production proof.", "");
    }
    if (group.key === "readOnlyProduction") {
      lines.push("No read-only production command is executed by this report. Any production evidence must be human-observed, sanitized, and non-mutating.", "");
    }
    lines.push(...renderBlockerList(report.evidence[group.key].blockers, { simulated: group.key === "simulated" }), "");
  }

  lines.push("## Waived Blockers", "");
  lines.push(...renderBlockerList(report.waivedBlockers), "");
  lines.push("## Unresolved Blockers", "");
  lines.push(...renderBlockerList(report.unresolvedBlockers), "");
  return `${lines.join("\n")}\n`;
}

function parseArgs(args) {
  const options = {
    rootDir: process.cwd(),
    registryPath: DEFAULT_BLOCKER_REGISTRY_PATH,
    auditPath: DEFAULT_AUDIT_PATH,
    evidenceDir: DEFAULT_EVIDENCE_DIR,
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
      printHelp();
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
    if (arg === "--registry") {
      options.registryPath = normalizeRelativePath(nextValue());
      continue;
    }
    if (arg === "--audit") {
      options.auditPath = normalizeRelativePath(nextValue());
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

function printHelp() {
  console.log([
    "Usage: pnpm run production-scale:evidence -- [options]",
    "",
    "Generates the production-at-scale blocker evidence report from the machine-readable registry.",
    "The command is read-only except for writing docs/production-scale/evidence/latest-production-scale-evidence.{md,json}.",
    "",
    "Options:",
    "  --json                    Also print the JSON report to stdout.",
    "  --root <path>             Project root. Defaults to current working directory.",
    "  --registry <path>         Registry path. Defaults to docs/production-scale/blocker-registry.json.",
    "  --audit <path>            Audit path. Defaults to docs/production-at-scale-maximum-audit.md.",
    "  --evidence-dir <path>     Output directory. Defaults to docs/production-scale/evidence.",
  ].join("\n"));
}

function writeEvidenceOutputs(report, rootDir, evidenceDir) {
  const absoluteEvidenceDir = repoPath(rootDir, evidenceDir);
  mkdirSync(absoluteEvidenceDir, { recursive: true });
  const markdownPath = normalizeRelativePath(path.join(evidenceDir, "latest-production-scale-evidence.md"));
  const jsonPath = normalizeRelativePath(path.join(evidenceDir, "latest-production-scale-evidence.json"));
  writeFileSync(repoPath(rootDir, markdownPath), renderProductionScaleEvidenceMarkdown(report), "utf8");
  writeFileSync(repoPath(rootDir, jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { markdownPath, jsonPath };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const registry = loadBlockerRegistry({ rootDir: options.rootDir, registryPath: options.registryPath });
  const auditText = readText(options.rootDir, options.auditPath);
  const report = buildProductionScaleEvidenceReport({
    rootDir: options.rootDir,
    registry,
    auditText,
    auditPath: options.auditPath,
  });
  const outputs = writeEvidenceOutputs(report, options.rootDir, options.evidenceDir);
  console.log("Production-scale evidence generated.");
  console.log(`Markdown: ${outputs.markdownPath}`);
  console.log(`JSON: ${outputs.jsonPath}`);
  console.log(`Blockers represented: ${report.registry.actualBlockerCount}/${report.registry.expectedBlockerCount}`);
  console.log(`Dashboard skipped checks: ${report.dashboard.checksSkipped} (${report.dashboard.skipCount ?? "unknown"})`);
  console.log("SIMULATED evidence is not production proof. Dashboard PASS alone is not sufficient release evidence.");
  if (options.json) console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && existsSync(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
