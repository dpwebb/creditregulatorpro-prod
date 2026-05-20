import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectDashboardEvidence,
  detectProductionEnvironment,
  loadBlockerRegistry,
  parseAuditBlockerRows,
  parseAuditMetadata,
  validateBlockerRegistry,
} from "./production-scale-evidence.mjs";

export const DEFAULT_PROMOTION_PACK_MD = "docs/production-scale/evidence/latest-production-promotion-pack.md";
export const DEFAULT_PROMOTION_PACK_JSON = "docs/production-scale/evidence/latest-production-promotion-pack.json";
export const DEFAULT_AUDIT_PATH = "docs/production-at-scale-maximum-audit.md";
export const DEFAULT_REGISTRY_PATH = "docs/production-scale/blocker-registry.json";

export const REQUIRED_PROMOTION_COMMANDS = [
  "pnpm run typecheck",
  "pnpm run build",
  "pnpm run test:contracts",
  "pnpm run test:api",
  "pnpm run test:golden-path",
  "pnpm run test:regression-dashboard",
  "pnpm run test:deterministic-ingestion-report",
  "pnpm run response:soak-check",
  "pnpm run operator:dashboard",
  "pnpm run check:migrations",
  "pnpm run check:restore-drill-evidence",
  "pnpm run report:runtime-size",
  "git diff --check",
];

export const OPTIONAL_EVIDENCE_COMMANDS = [
  "pnpm run production-scale:evidence",
  "pnpm run restore:drill:simulated",
  "pnpm run ingest:worker:simulated-proof",
  "pnpm run baseline:production-scale-local -- --simulated",
  "pnpm run alerts:dry-run",
  "pnpm run storage:raw-report-inventory",
  "pnpm run retention:archive-restore:simulated",
  "pnpm run packet-pdf:cache-miss-proof",
  "pnpm run production-worker:activation-plan",
  "pnpm run migrations:evidence",
  "pnpm run production-safe-probes:evidence",
  "pnpm run staging-owner-denial-smoke:evidence",
  "pnpm run sensitive-list-endpoints:evidence",
  "pnpm run check:runtime-size",
];

const OUTPUT_BY_COMMAND = {
  "pnpm run production-scale:evidence": [
    "docs/production-scale/evidence/latest-production-scale-evidence.md",
    "docs/production-scale/evidence/latest-production-scale-evidence.json",
  ],
  "pnpm run restore:drill:simulated": [
    "docs/production-scale/evidence/latest-restore-drill-simulated.md",
    "docs/production-scale/evidence/latest-restore-drill-simulated.json",
  ],
  "pnpm run ingest:worker:simulated-proof": [
    "docs/production-scale/evidence/latest-ingest-worker-simulated.md",
    "docs/production-scale/evidence/latest-ingest-worker-simulated.json",
  ],
  "pnpm run baseline:production-scale-local -- --simulated": [
    "docs/production-scale/evidence/latest-load-simulated.md",
    "docs/production-scale/evidence/latest-load-simulated.json",
  ],
  "pnpm run alerts:dry-run": [
    "docs/production-scale/evidence/latest-alerts-dry-run.md",
    "docs/production-scale/evidence/latest-alerts-dry-run.json",
  ],
  "pnpm run storage:raw-report-inventory": [
    "docs/production-scale/evidence/latest-storage-raw-report-inventory.md",
    "docs/production-scale/evidence/latest-storage-raw-report-inventory.json",
  ],
  "pnpm run retention:archive-restore:simulated": [
    "docs/production-scale/evidence/latest-retention-archive-restore-simulated.md",
    "docs/production-scale/evidence/latest-retention-archive-restore-simulated.json",
  ],
  "pnpm run packet-pdf:cache-miss-proof": [
    "docs/production-scale/evidence/latest-packet-pdf-cache-miss-proof.md",
    "docs/production-scale/evidence/latest-packet-pdf-cache-miss-proof.json",
  ],
  "pnpm run production-worker:activation-plan": [
    "docs/production-scale/evidence/latest-production-worker-activation-plan.md",
    "docs/production-scale/evidence/latest-production-worker-activation-plan.json",
  ],
  "pnpm run migrations:evidence": [
    "docs/production-scale/evidence/latest-migration-governance.md",
    "docs/production-scale/evidence/latest-migration-governance.json",
  ],
  "pnpm run production-safe-probes:evidence": [
    "docs/production-scale/evidence/latest-production-safe-probes.md",
    "docs/production-scale/evidence/latest-production-safe-probes.json",
  ],
  "pnpm run staging-owner-denial-smoke:evidence": [
    "docs/production-scale/evidence/latest-staging-owner-denial-smoke.md",
    "docs/production-scale/evidence/latest-staging-owner-denial-smoke.json",
  ],
  "pnpm run sensitive-list-endpoints:evidence": [
    "docs/production-scale/evidence/latest-sensitive-list-endpoints.md",
    "docs/production-scale/evidence/latest-sensitive-list-endpoints.json",
  ],
  "pnpm run report:runtime-size": [
    "docs/production-scale/evidence/latest-runtime-size.md",
    "docs/production-scale/evidence/latest-runtime-size.json",
  ],
  "pnpm run check:runtime-size": [
    "docs/production-scale/evidence/latest-runtime-size.md",
    "docs/production-scale/evidence/latest-runtime-size.json",
  ],
};

const CLASSIFICATIONS = new Set([
  "fixed with automated evidence",
  "fixed with staging evidence",
  "simulated proof only",
  "human proof required",
  "waived with explicit reason",
  "partial",
  "open",
]);

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
    return output || fallback;
  } catch {
    return fallback;
  }
}

function readJsonIfPresent(rootDir, relativePath) {
  const absolutePath = repoPath(rootDir, relativePath);
  if (!existsSync(absolutePath)) return null;
  try {
    return JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch {
    return null;
  }
}

function loadPackageJson(rootDir) {
  return JSON.parse(readText(rootDir, "package.json"));
}

function scriptNameForCommand(command) {
  const match = command.match(/^pnpm run ([^ ]+)/);
  return match?.[1] ?? null;
}

function commandAvailability(command, scripts) {
  if (command.startsWith("git ")) return true;
  const scriptName = scriptNameForCommand(command);
  return scriptName ? Boolean(scripts[scriptName]) : false;
}

function parseAuditCommit(auditText) {
  const tableMatch = auditText.match(/\|\s*Current commit hash\s*\|\s*`?([a-f0-9]{7,40})`?\s*\|/i);
  const sentenceMatch = auditText.match(/not production-at-scale ready`?\s+at commit\s+`?([a-f0-9]{7,40})`?/i);
  return tableMatch?.[1] ?? sentenceMatch?.[1] ?? null;
}

function parseDocCommitReferences(text) {
  return Array.from(new Set([...text.matchAll(/`([a-f0-9]{7,40})`/gi)].map((match) => match[1])));
}

function isSimulatedEvidenceType(value) {
  return /simulated|dry run/i.test(String(value ?? ""));
}

function summarizeEvidenceFile(rootDir, relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);
  const exists = existsSync(repoPath(rootDir, normalizedPath));
  const parsed = normalizedPath.endsWith(".json") ? readJsonIfPresent(rootDir, normalizedPath) : null;
  const evidenceType = parsed?.evidenceType ?? parsed?.reportType ?? null;
  return {
    path: normalizedPath,
    exists,
    reportName: parsed?.reportName ?? null,
    evidenceType,
    generatedAt: parsed?.generatedAt ?? null,
    status: parsed?.status ?? parsed?.summary?.status ?? null,
    productionProof: isSimulatedEvidenceType(evidenceType) ? false : parsed?.productionProof === true,
  };
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function classifyBlocker(blocker) {
  if (blocker.currentStatus === "waived") return "waived with explicit reason";
  if (blocker.currentStatus === "open") return "open";
  if (blocker.currentStatus === "requires-human-proof" || blocker.humanProofRequired === true) {
    return "human proof required";
  }
  if (blocker.currentStatus === "simulated-proof-only") return "simulated proof only";
  if (blocker.currentStatus === "staging-proof-only") return "fixed with staging evidence";
  if (blocker.currentStatus === "fixed") {
    if (blocker.proofCategories?.includes("staging") && !blocker.proofCategories?.includes("automated-local")) {
      return "fixed with staging evidence";
    }
    return "fixed with automated evidence";
  }
  if (blocker.currentStatus === "partial") return "partial";
  return "open";
}

function isUnresolvedClassification(classification) {
  return !classification.startsWith("fixed with") && classification !== "waived with explicit reason";
}

function isProductionConcern(blocker) {
  const text = `${blocker.title} ${blocker.area} ${blocker.proofTypeRequired} ${blocker.recommendedNextAction}`.toLowerCase();
  return /production|restore|disaster|response|alert|storage|migration|deploy|privacy|retention|ingest|observability|worker|raw report|rollback/.test(text);
}

function isScaleConcern(blocker) {
  const text = `${blocker.title} ${blocker.area} ${blocker.proofTypeRequired} ${blocker.recommendedNextAction}`.toLowerCase();
  return /scale|load|concurrency|capacity|runtime-size|db pool|rate limiter|packet pdf|high-growth|bundle|cache-miss|throughput|latency/.test(text);
}

function waiverReason(blocker) {
  return blocker.waiverReason ?? blocker.waiver?.reason ?? null;
}

function commandResultSummary(command, rootDir, scripts) {
  const outputPaths = OUTPUT_BY_COMMAND[command] ?? [];
  const evidenceFiles = outputPaths.map((filePath) => summarizeEvidenceFile(rootDir, filePath));
  const anyEvidencePresent = evidenceFiles.some((file) => file.exists);
  const parsedJson = evidenceFiles.find((file) => file.path.endsWith(".json") && file.exists);
  return {
    command,
    availableInRepository: commandAvailability(command, scripts),
    executedByPromotionPack: false,
    result: anyEvidencePresent ? "evidence-file-present" : "reference-required",
    resultSource: anyEvidencePresent ? "generated evidence file" : "exact command reference; run output must be attached for promotion approval",
    evidenceFiles,
    latestGeneratedAt: parsedJson?.generatedAt ?? null,
    status: parsedJson?.status ?? null,
  };
}

function buildCommandList(rootDir, registry, packageJson) {
  const scripts = packageJson.scripts ?? {};
  const registryCommands = Array.isArray(registry.recognizedEvidenceCommands) ? registry.recognizedEvidenceCommands : [];
  const commandSet = new Set([
    ...REQUIRED_PROMOTION_COMMANDS,
    ...OPTIONAL_EVIDENCE_COMMANDS.filter((command) => commandAvailability(command, scripts)),
    ...registryCommands.filter((command) => command.startsWith("pnpm run ") || command === "git diff --check"),
  ]);
  return Array.from(commandSet).map((command) => commandResultSummary(command, rootDir, scripts));
}

function readinessClassification(classifiedBlockers) {
  const unresolved = classifiedBlockers.filter((blocker) => isUnresolvedClassification(blocker.classification));
  if (unresolved.length === 0) {
    return {
      value: "production-at-scale",
      canPromoteProductionAtScale: true,
      reason: "Every blocker is fixed or explicitly waived with accepted evidence.",
    };
  }

  const criticalOrHighUnresolved = unresolved.filter((blocker) => ["Critical", "High"].includes(blocker.severity));
  const humanOrSimulated = unresolved.filter((blocker) =>
    blocker.classification === "human proof required" || blocker.classification === "simulated proof only",
  );
  if (criticalOrHighUnresolved.length === 0 && humanOrSimulated.length === 0) {
    return {
      value: "broader production",
      canPromoteProductionAtScale: false,
      reason: "No critical/high unresolved blocker remains, but production-at-scale evidence is still incomplete.",
    };
  }

  return {
    value: "limited beta",
    canPromoteProductionAtScale: false,
    reason: "Critical/high, simulated-only, human-required, partial, or open blockers remain.",
  };
}

export function buildProductionPromotionPackReport({
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
    throw new Error(`Refusing to generate promotion pack in a production-like environment: ${productionEnvironment.reason}`);
  }

  const loadedRegistry = registry ?? loadBlockerRegistry({ rootDir, registryPath: DEFAULT_REGISTRY_PATH });
  const loadedAuditText = auditText ?? readText(rootDir, auditPath);
  const auditRows = parseAuditBlockerRows(loadedAuditText);
  const registryValidation = validateBlockerRegistry(loadedRegistry, auditRows);
  if (!registryValidation.valid) {
    throw new Error(`Production promotion pack registry validation failed:\n${registryValidation.errors.join("\n")}`);
  }

  const packageJson = loadPackageJson(rootDir);
  const branch = safeGit(["branch", "--show-current"], rootDir);
  const commit = safeGit(["rev-parse", "HEAD"], rootDir);
  const audit = {
    ...parseAuditMetadata(loadedAuditText, auditPath),
    currentCommitHash: parseAuditCommit(loadedAuditText),
  };
  const trackerText = existsSync(repoPath(rootDir, "docs/production-at-scale-execution-tracker.md"))
    ? readText(rootDir, "docs/production-at-scale-execution-tracker.md")
    : "";
  const finalVerificationText = existsSync(repoPath(rootDir, "docs/final-production-at-scale-verification.md"))
    ? readText(rootDir, "docs/final-production-at-scale-verification.md")
    : "";

  const classifiedBlockers = loadedRegistry.blockers.map((blocker) => {
    const classification = classifyBlocker(blocker);
    return {
      number: blocker.number,
      title: blocker.title,
      severity: blocker.severity,
      area: blocker.area,
      currentStatus: blocker.currentStatus,
      classification,
      proofTypeRequired: blocker.proofTypeRequired,
      proofCategories: blocker.proofCategories ?? [],
      allowedProofCommands: blocker.allowedProofCommands ?? [],
      forbiddenProofTypes: blocker.forbiddenProofTypes ?? [],
      relatedEvidenceOutputPaths: blocker.relatedEvidenceOutputPaths ?? [],
      recommendedNextAction: blocker.recommendedNextAction,
      humanProofRequired: blocker.humanProofRequired === true,
      simulatedProofAcceptable: blocker.simulatedProofAcceptable === true,
      waiverReason: waiverReason(blocker),
    };
  });

  const unresolvedBlockers = classifiedBlockers.filter((blocker) => isUnresolvedClassification(blocker.classification));
  const generatedEvidenceFileReferences = unique([
    ...Object.values(OUTPUT_BY_COMMAND).flat(),
    ...classifiedBlockers.flatMap((blocker) => blocker.relatedEvidenceOutputPaths),
  ]).map((filePath) => summarizeEvidenceFile(rootDir, filePath));
  const commandResults = buildCommandList(rootDir, loadedRegistry, packageJson);
  const dashboard = collectDashboardEvidence({ rootDir, dashboardReport });
  const readiness = readinessClassification(classifiedBlockers);

  const report = {
    reportName: "production-promotion-evidence-pack",
    generatedAt,
    currentBranch: branch,
    currentCommitHash: commit,
    auditFilePath: audit.path,
    auditDate: audit.auditDate,
    auditDateParseable: audit.auditDateParseable,
    auditCurrentCommitHash: audit.currentCommitHash,
    staleReferences: {
      auditCommitReferenceStale: Boolean(audit.currentCommitHash && audit.currentCommitHash !== commit),
      trackerCommitReferences: parseDocCommitReferences(trackerText),
      finalVerificationCommitReferences: parseDocCommitReferences(finalVerificationText),
    },
    registry: {
      path: loadedRegistry.registryPath ?? DEFAULT_REGISTRY_PATH,
      expectedBlockerCount: loadedRegistry.expectedBlockerCount,
      actualBlockerCount: classifiedBlockers.length,
      validation: registryValidation,
    },
    commandList: commandResults.map((item) => item.command),
    commandResultSummary: commandResults,
    generatedEvidenceFileReferences,
    blockerClassifications: classifiedBlockers,
    unresolvedProductionBlockers: unresolvedBlockers.filter(isProductionConcern),
    unresolvedScaleBlockers: unresolvedBlockers.filter(isScaleConcern),
    skippedChecks: {
      dashboardAvailable: dashboard.available,
      dashboardCommand: dashboard.command,
      checksSkipped: dashboard.checksSkipped,
      skipCount: dashboard.skipCount,
      treatsSkipAsPass: false,
      dashboardPassAloneIsReleaseEvidence: false,
      summary: dashboard.summary,
    },
    simulatedProofOnlyChecks: classifiedBlockers.filter((blocker) => blocker.classification === "simulated proof only"),
    stagingProofOnlyChecks: classifiedBlockers.filter((blocker) => blocker.currentStatus === "staging-proof-only"),
    humanRequiredProof: classifiedBlockers.filter((blocker) => blocker.classification === "human proof required"),
    waivers: classifiedBlockers.filter((blocker) => blocker.classification === "waived with explicit reason"),
    readinessClassification: readiness,
    safety: {
      productionDataMutated: false,
      liveExternalProvidersCalled: false,
      realConsumerPiiUsed: false,
      productionAtScaleClaimed: readiness.value === "production-at-scale" && readiness.canPromoteProductionAtScale,
      simulatedProofIsProductionProof: false,
      dashboardPassTreatedAsCompleteReleaseEvidence: false,
    },
    requiredStatements: [
      "SIMULATED proof is not production proof.",
      "Dashboard PASS alone is not complete release evidence when checks are skipped.",
      "Production activation requires operator approval.",
      "Codex must not promote readiness classification beyond the evidence in this pack.",
    ],
  };

  const validation = validatePromotionPackReport(report);
  if (!validation.valid) {
    throw new Error(`Production promotion pack validation failed:\n${validation.errors.join("\n")}`);
  }
  return report;
}

export function validatePromotionPackReport(report) {
  const errors = [];
  const blockers = Array.isArray(report.blockerClassifications) ? report.blockerClassifications : [];
  if (blockers.length !== 25) errors.push(`Expected 25 blockers in promotion pack, found ${blockers.length}.`);
  const numbers = blockers.map((blocker) => blocker.number);
  for (let number = 1; number <= 25; number += 1) {
    if (!numbers.includes(number)) errors.push(`Missing blocker ${number}.`);
  }
  for (const blocker of blockers) {
    if (!CLASSIFICATIONS.has(blocker.classification)) {
      errors.push(`Blocker ${blocker.number} has invalid classification ${blocker.classification}.`);
    }
    if (blocker.classification === "waived with explicit reason" && !blocker.waiverReason) {
      errors.push(`Blocker ${blocker.number} is waived without an explicit waiver reason.`);
    }
  }
  const requiredCommands = new Set(report.commandList ?? []);
  for (const command of REQUIRED_PROMOTION_COMMANDS) {
    if (!requiredCommands.has(command)) errors.push(`Missing required command reference: ${command}.`);
  }
  if (!report.currentBranch) errors.push("Promotion pack is missing current branch.");
  if (!/^[a-f0-9]{40}$/i.test(String(report.currentCommitHash ?? ""))) {
    errors.push("Promotion pack is missing a full current commit hash.");
  }
  for (const evidence of report.generatedEvidenceFileReferences ?? []) {
    if (isSimulatedEvidenceType(evidence.evidenceType) && evidence.productionProof === true) {
      errors.push(`SIMULATED evidence is mislabeled as production proof: ${evidence.path}.`);
    }
  }
  if (report.safety?.simulatedProofIsProductionProof === true) {
    errors.push("Promotion pack misclassifies simulated proof as production proof.");
  }
  if (
    report.skippedChecks?.checksSkipped &&
    (report.skippedChecks?.treatsSkipAsPass === true || report.skippedChecks?.dashboardPassAloneIsReleaseEvidence === true)
  ) {
    errors.push("Dashboard SKIP is treated as PASS or complete release evidence.");
  }
  const unresolved = blockers.filter((blocker) => isUnresolvedClassification(blocker.classification));
  if (unresolved.length > 0 && report.readinessClassification?.value === "production-at-scale") {
    errors.push("Promotion pack claims production-at-scale readiness while unresolved blockers remain.");
  }
  return { valid: errors.length === 0, errors };
}

function renderBlockerRows(blockers) {
  if (!blockers.length) return ["- None."];
  return blockers.map((blocker) => `- #${blocker.number} ${blocker.title} (${blocker.severity}; ${blocker.classification}) - ${blocker.recommendedNextAction}`);
}

function renderCommandRows(commands) {
  return commands.map((command) => {
    const evidence = command.evidenceFiles?.filter((file) => file.exists).map((file) => file.path).join(", ") || "none";
    return `- \`${command.command}\` - ${command.result}; evidence: ${evidence}`;
  });
}

export function renderPromotionPackMarkdown(report) {
  const lines = [
    "# Production Promotion Evidence Pack",
    "",
    `Generated at: ${report.generatedAt}`,
    `Current branch: \`${report.currentBranch}\``,
    `Current commit hash: \`${report.currentCommitHash}\``,
    `Audit file path: \`${report.auditFilePath}\``,
    `Audit date: ${report.auditDate ?? "not parseable"}`,
    `Recommended readiness classification: **${report.readinessClassification.value}**`,
    "",
    "## Required Statements",
    "",
    "- SIMULATED proof is not production proof.",
    "- Dashboard PASS alone is not complete release evidence when checks are skipped.",
    "- Codex must not promote readiness classification beyond evidence.",
    "- Production activation requires operator approval.",
    "",
    "## Command Result Summary",
    "",
    ...renderCommandRows(report.commandResultSummary),
    "",
    "## Skipped Checks",
    "",
    `- Dashboard command: \`${report.skippedChecks.dashboardCommand}\``,
    `- Dashboard available: ${report.skippedChecks.dashboardAvailable ? "yes" : "no"}`,
    `- Checks skipped: ${report.skippedChecks.checksSkipped}`,
    `- Skip count: ${report.skippedChecks.skipCount ?? "unknown"}`,
    `- SKIP treated as PASS: ${report.skippedChecks.treatsSkipAsPass ? "yes" : "no"}`,
    "",
    "## Human-Required Proof",
    "",
    ...renderBlockerRows(report.humanRequiredProof),
    "",
    "## Simulated Proof-Only Checks",
    "",
    ...renderBlockerRows(report.simulatedProofOnlyChecks),
    "",
    "## Staging Proof-Only Checks",
    "",
    ...renderBlockerRows(report.stagingProofOnlyChecks),
    "",
    "## Waivers",
    "",
    ...renderBlockerRows(report.waivers),
    "",
    "## Unresolved Production Blockers",
    "",
    ...renderBlockerRows(report.unresolvedProductionBlockers),
    "",
    "## Unresolved Scale Blockers",
    "",
    ...renderBlockerRows(report.unresolvedScaleBlockers),
    "",
    "## Generated Evidence File References",
    "",
    ...report.generatedEvidenceFileReferences.map((file) =>
      `- \`${file.path}\` - ${file.exists ? "present" : "missing"}${file.evidenceType ? `; evidenceType=${file.evidenceType}` : ""}`,
    ),
    "",
    "## Stale Reference Detection",
    "",
    `- Audit commit reference: \`${report.auditCurrentCommitHash ?? "not found"}\``,
    `- Audit commit reference stale: ${report.staleReferences.auditCommitReferenceStale ? "yes" : "no"}`,
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function writePromotionPackOutputs(report, rootDir) {
  mkdirSync(path.dirname(repoPath(rootDir, DEFAULT_PROMOTION_PACK_MD)), { recursive: true });
  writeFileSync(repoPath(rootDir, DEFAULT_PROMOTION_PACK_JSON), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(repoPath(rootDir, DEFAULT_PROMOTION_PACK_MD), renderPromotionPackMarkdown(report), "utf8");
  return {
    markdownPath: DEFAULT_PROMOTION_PACK_MD,
    jsonPath: DEFAULT_PROMOTION_PACK_JSON,
  };
}

function printHelp() {
  console.log([
    "Usage: pnpm run production-scale:promotion-pack -- [options]",
    "",
    "Creates the final production promotion evidence pack.",
    "The command is reporting-only and writes docs/production-scale/evidence/latest-production-promotion-pack.{md,json}.",
    "",
    "Options:",
    "  --root <path>    Project root. Defaults to current working directory.",
  ].join("\n"));
}

function parseArgs(args) {
  const options = { rootDir: process.cwd() };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--root") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--root requires a value.");
      options.rootDir = path.resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildProductionPromotionPackReport({ rootDir: options.rootDir });
  const outputs = writePromotionPackOutputs(report, options.rootDir);
  console.log("Production promotion evidence pack generated.");
  console.log(`Markdown: ${outputs.markdownPath}`);
  console.log(`JSON: ${outputs.jsonPath}`);
  console.log(`Readiness classification: ${report.readinessClassification.value}`);
  console.log(`Unresolved production blockers: ${report.unresolvedProductionBlockers.length}`);
  console.log(`Unresolved scale blockers: ${report.unresolvedScaleBlockers.length}`);
  console.log("SIMULATED proof is not production proof. Dashboard SKIP is not treated as PASS.");
}

if (process.argv[1] && existsSync(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
