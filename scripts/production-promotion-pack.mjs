import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildProductionWorkerReadinessEvidenceReport,
  PRODUCTION_WORKER_QUEUE_DEPTH_EVIDENCE_JSON_PATH,
  PRODUCTION_WORKER_QUEUE_DEPTH_EVIDENCE_MD_PATH,
  PRODUCTION_WORKER_READINESS_JSON_PATH,
  PRODUCTION_WORKER_READINESS_MD_PATH,
} from "./production-worker-readiness-evidence.mjs";

import {
  ALERTING_EXCLUSION_EVIDENCE_JSON_PATH,
  ALERTING_EXCLUSION_EVIDENCE_MD_PATH,
  ALERTING_EXCLUSION_VALIDATION_JSON_PATH,
  ALERTING_EXCLUSION_VALIDATION_MD_PATH,
  buildResponseOpsReadinessEvidenceReport,
  LIVE_ALERT_PROOF_JSON_PATH,
  LIVE_ALERT_PROOF_MD_PATH,
  RESPONSE_OPS_READINESS_JSON_PATH,
  RESPONSE_OPS_READINESS_MD_PATH,
} from "./response-ops-readiness-evidence.mjs";

import {
  buildRawReportRemediationAcceptanceReport,
  RAW_REPORT_REMEDIATION_ACCEPTANCE_EVIDENCE_JSON_PATH,
  RAW_REPORT_REMEDIATION_ACCEPTANCE_EVIDENCE_MD_PATH,
  RAW_REPORT_REMEDIATION_ACCEPTANCE_JSON_PATH,
  RAW_REPORT_REMEDIATION_ACCEPTANCE_MD_PATH,
  RAW_REPORT_REMEDIATION_PLAN_JSON_PATH,
  RAW_REPORT_REMEDIATION_PLAN_MD_PATH,
} from "./storage-raw-report-remediation-plan.mjs";

import {
  buildHumanRestoreDrillEvidenceAcceptanceReport,
  HUMAN_RESTORE_DRILL_ACCEPTANCE_JSON_PATH,
  HUMAN_RESTORE_DRILL_ACCEPTANCE_MD_PATH,
  HUMAN_RESTORE_DRILL_EVIDENCE_JSON_PATH,
  HUMAN_RESTORE_DRILL_EVIDENCE_MD_PATH,
} from "./staging-backup-restore-checklist.mjs";

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
  "pnpm run alerts:dry-run",
  "pnpm run alerts:exclusion:validate",
  "pnpm run response:ops-readiness-evidence",
  "pnpm run production-worker:readiness-evidence",
  "pnpm run storage:raw-report-remediation-plan",
  "pnpm run storage:raw-report-remediation-acceptance",
  "pnpm run check:migrations",
  "pnpm run check:restore-drill-evidence",
  "pnpm run restore:accept-human-evidence",
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
  "pnpm run storage:raw-report-remediation-plan",
  "pnpm run storage:raw-report-remediation-acceptance",
  "pnpm run retention:archive-restore:simulated",
  "pnpm run packet-pdf:cache-miss-proof",
  "pnpm run production-worker:activation-plan",
  "pnpm run production-worker:readiness-evidence",
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
  "pnpm run restore:accept-human-evidence": [
    HUMAN_RESTORE_DRILL_ACCEPTANCE_MD_PATH,
    HUMAN_RESTORE_DRILL_ACCEPTANCE_JSON_PATH,
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
  "pnpm run alerts:exclusion:validate": [
    ALERTING_EXCLUSION_VALIDATION_MD_PATH,
    ALERTING_EXCLUSION_VALIDATION_JSON_PATH,
  ],
  "pnpm run response:ops-readiness-evidence": [
    RESPONSE_OPS_READINESS_MD_PATH,
    RESPONSE_OPS_READINESS_JSON_PATH,
  ],
  "pnpm run storage:raw-report-inventory": [
    "docs/production-scale/evidence/latest-storage-raw-report-inventory.md",
    "docs/production-scale/evidence/latest-storage-raw-report-inventory.json",
  ],
  "pnpm run storage:raw-report-remediation-plan": [
    RAW_REPORT_REMEDIATION_PLAN_MD_PATH,
    RAW_REPORT_REMEDIATION_PLAN_JSON_PATH,
  ],
  "pnpm run storage:raw-report-remediation-acceptance": [
    RAW_REPORT_REMEDIATION_ACCEPTANCE_MD_PATH,
    RAW_REPORT_REMEDIATION_ACCEPTANCE_JSON_PATH,
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
  "pnpm run production-worker:readiness-evidence": [
    PRODUCTION_WORKER_READINESS_MD_PATH,
    PRODUCTION_WORKER_READINESS_JSON_PATH,
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
  "fixed with human-observed evidence",
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

function classifyBlocker(
  blocker,
  humanRestoreEvidenceAcceptance = null,
  productionWorkerReadinessEvidence = null,
  rawReportRemediationAcceptance = null,
  responseOpsReadinessEvidence = null,
) {
  if (
    blocker.number === 2 &&
    productionWorkerReadinessEvidence?.blockerCoverage?.productionIngestRuntime === true &&
    productionWorkerReadinessEvidence?.acceptedProductionRunEvidence?.accepted === true
  ) {
    return "fixed with human-observed evidence";
  }
  if (blocker.number === 11) {
    if (
      productionWorkerReadinessEvidence?.blockerCoverage?.productionWorkflowParityAndRollback === true &&
      productionWorkerReadinessEvidence?.acceptedProductionRunEvidence?.accepted === true
    ) {
      return "fixed with human-observed evidence";
    }
    return "partial";
  }
  if (
    blocker.number === 1 &&
    humanRestoreEvidenceAcceptance?.accepted === true &&
    humanRestoreEvidenceAcceptance?.blockerCoverage?.disasterRecoveryRestoreDrill === true
  ) {
    return "fixed with human-observed evidence";
  }
  if (
    blocker.number === 6 &&
    rawReportRemediationAcceptance?.accepted === true &&
    rawReportRemediationAcceptance?.blockerCoverage?.historicalRawReportBytes === true
  ) {
    return "fixed with human-observed evidence";
  }
  if (
    blocker.number === 8 &&
    responseOpsReadinessEvidence?.blockerCoverage?.responseOperationsMaturity === true &&
    responseOpsReadinessEvidence?.safety?.responseQueueSemanticsChanged !== true
  ) {
    return "fixed with automated evidence";
  }
  if (
    blocker.number === 9 &&
    responseOpsReadinessEvidence?.blockerCoverage?.observabilityAlerting === true &&
    (
      responseOpsReadinessEvidence?.alerting?.status === "live-evidenced" ||
      responseOpsReadinessEvidence?.alerting?.status === "formally-excluded"
    )
  ) {
    return "fixed with human-observed evidence";
  }
  if (
    blocker.number === 22 &&
    humanRestoreEvidenceAcceptance?.accepted === true &&
    humanRestoreEvidenceAcceptance?.blockerCoverage?.retentionArchiveRestore === true
  ) {
    return "fixed with human-observed evidence";
  }
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
  humanRestoreEvidenceAcceptance = null,
  productionWorkerReadinessEvidence = null,
  rawReportRemediationAcceptance = null,
  responseOpsReadinessEvidence = null,
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
  const acceptedHumanRestoreEvidence =
    humanRestoreEvidenceAcceptance ?? buildHumanRestoreDrillEvidenceAcceptanceReport({ rootDir, generatedAt });
  const workerReadinessEvidence =
    productionWorkerReadinessEvidence ?? buildProductionWorkerReadinessEvidenceReport({ rootDir, generatedAt });
  const rawReportRemediationEvidence =
    rawReportRemediationAcceptance ?? buildRawReportRemediationAcceptanceReport({ rootDir, generatedAt });
  const responseOpsEvidence =
    responseOpsReadinessEvidence ?? buildResponseOpsReadinessEvidenceReport({ rootDir, generatedAt, env });

  const classifiedBlockers = loadedRegistry.blockers.map((blocker) => {
    const classification = classifyBlocker(
      blocker,
      acceptedHumanRestoreEvidence,
      workerReadinessEvidence,
      rawReportRemediationEvidence,
      responseOpsEvidence,
    );
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
      acceptedHumanEvidence:
        classification === "fixed with human-observed evidence"
          ? {
              evidencePath:
                blocker.number === 2 || blocker.number === 11
                  ? workerReadinessEvidence.acceptedProductionRunEvidence?.evidencePath
                  : blocker.number === 6
                    ? rawReportRemediationEvidence.evidencePath
                  : blocker.number === 9
                    ? responseOpsEvidence.alerting?.exclusionValidation?.evidencePath ?? responseOpsEvidence.alerting?.liveAlertProof?.evidencePath
                  : acceptedHumanRestoreEvidence.evidencePath,
              acceptedAt:
                blocker.number === 2 || blocker.number === 11
                  ? workerReadinessEvidence.generatedAt
                  : blocker.number === 6
                    ? rawReportRemediationEvidence.generatedAt
                  : blocker.number === 9
                    ? responseOpsEvidence.generatedAt
                  : acceptedHumanRestoreEvidence.generatedAt,
            }
          : null,
      waiverReason: waiverReason(blocker),
    };
  });

  const unresolvedBlockers = classifiedBlockers.filter((blocker) => isUnresolvedClassification(blocker.classification));
  const generatedEvidenceFileReferences = unique([
    ...Object.values(OUTPUT_BY_COMMAND).flat(),
    HUMAN_RESTORE_DRILL_EVIDENCE_MD_PATH,
    HUMAN_RESTORE_DRILL_EVIDENCE_JSON_PATH,
    PRODUCTION_WORKER_QUEUE_DEPTH_EVIDENCE_JSON_PATH,
    PRODUCTION_WORKER_QUEUE_DEPTH_EVIDENCE_MD_PATH,
    RAW_REPORT_REMEDIATION_ACCEPTANCE_EVIDENCE_JSON_PATH,
    RAW_REPORT_REMEDIATION_ACCEPTANCE_EVIDENCE_MD_PATH,
    ALERTING_EXCLUSION_EVIDENCE_JSON_PATH,
    ALERTING_EXCLUSION_EVIDENCE_MD_PATH,
    LIVE_ALERT_PROOF_JSON_PATH,
    LIVE_ALERT_PROOF_MD_PATH,
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
    humanRestoreDrillEvidenceAcceptance: {
      reportName: acceptedHumanRestoreEvidence.reportName,
      generatedAt: acceptedHumanRestoreEvidence.generatedAt,
      status: acceptedHumanRestoreEvidence.status,
      accepted: acceptedHumanRestoreEvidence.accepted,
      evidencePath: acceptedHumanRestoreEvidence.evidencePath,
      blockerCoverage: acceptedHumanRestoreEvidence.blockerCoverage,
      validation: {
        ok: acceptedHumanRestoreEvidence.validation?.ok === true,
        evidenceType: acceptedHumanRestoreEvidence.validation?.evidenceType ?? "unknown",
        simulatedOnlySubmission: acceptedHumanRestoreEvidence.validation?.simulatedOnlySubmission === true,
        sensitiveFindings: acceptedHumanRestoreEvidence.validation?.sensitiveFindings ?? [],
        errors: acceptedHumanRestoreEvidence.validation?.errors ?? [],
      },
    },
    productionWorkerReadinessEvidence: {
      reportName: workerReadinessEvidence.reportName,
      generatedAt: workerReadinessEvidence.generatedAt,
      status: workerReadinessEvidence.status,
      productionProof: workerReadinessEvidence.productionProof === true,
      acceptedProductionRunEvidence: {
        status: workerReadinessEvidence.acceptedProductionRunEvidence?.status ?? "unknown",
        accepted: workerReadinessEvidence.acceptedProductionRunEvidence?.accepted === true,
        evidencePath: workerReadinessEvidence.acceptedProductionRunEvidence?.evidencePath ?? null,
      },
      blockerCoverage: workerReadinessEvidence.blockerCoverage,
      safety: {
        productionJobsProcessedByCodex: workerReadinessEvidence.safety?.productionJobsProcessedByCodex === true,
        productionWorkerActivatedByDefault: workerReadinessEvidence.safety?.productionWorkerActivatedByDefault === true,
        dashboardPassAloneIsReleaseEvidence: workerReadinessEvidence.safety?.dashboardPassAloneIsReleaseEvidence === true,
      },
    },
    rawReportRemediationAcceptance: {
      reportName: rawReportRemediationEvidence.reportName,
      generatedAt: rawReportRemediationEvidence.generatedAt,
      status: rawReportRemediationEvidence.status,
      accepted: rawReportRemediationEvidence.accepted === true,
      evidencePath: rawReportRemediationEvidence.evidencePath,
      blockerCoverage: rawReportRemediationEvidence.blockerCoverage,
      validation: {
        accepted: rawReportRemediationEvidence.validation?.accepted === true,
        sensitiveFindings: rawReportRemediationEvidence.validation?.sensitiveFindings ?? [],
        remainingPossibleInlineBase64Rows:
          rawReportRemediationEvidence.validation?.remainingPossibleInlineBase64Rows ?? null,
        errors: rawReportRemediationEvidence.validation?.errors ?? [],
      },
      safety: {
        productionDataMutatedByCodex: rawReportRemediationEvidence.safety?.productionDataMutatedByCodex === true,
        codexPerformedRemediation: rawReportRemediationEvidence.safety?.codexPerformedRemediation === true,
        rawSensitiveValuesAccepted: rawReportRemediationEvidence.safety?.rawSensitiveValuesAccepted === true,
      },
    },
    responseOpsReadinessEvidence: {
      reportName: responseOpsEvidence.reportName,
      generatedAt: responseOpsEvidence.generatedAt,
      status: responseOpsEvidence.status,
      productionProof: responseOpsEvidence.productionProof === true,
      liveSchedulerStatus: responseOpsEvidence.liveScheduler?.status ?? "unknown",
      backfillReadinessStatus: responseOpsEvidence.backfillReadiness?.status ?? "unknown",
      purgeArchiveReadinessStatus: responseOpsEvidence.purgeArchiveReadiness?.status ?? "unknown",
      alertingStatus: responseOpsEvidence.alerting?.status ?? "unknown",
      alertingExclusionAccepted: responseOpsEvidence.alerting?.exclusionValidation?.accepted === true,
      liveAlertProofAccepted: responseOpsEvidence.alerting?.liveAlertProof?.accepted === true,
      blockerCoverage: responseOpsEvidence.blockerCoverage,
      unresolvedRisks: responseOpsEvidence.unresolvedRisks ?? [],
      safety: {
        liveSchedulerEnabledByCodex: responseOpsEvidence.safety?.liveSchedulerEnabledByCodex === true,
        liveAlertsSentByCodex: responseOpsEvidence.safety?.liveAlertsSentByCodex === true,
        productionDataMutated: responseOpsEvidence.safety?.productionDataMutated === true,
        productionRecordsPurgedOrArchived: responseOpsEvidence.safety?.productionRecordsPurgedOrArchived === true,
        responseQueueSemanticsChanged: responseOpsEvidence.safety?.responseQueueSemanticsChanged === true,
        dryRunAlertsAreLiveProof: responseOpsEvidence.safety?.dryRunAlertsAreLiveProof === true,
      },
    },
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
      "Historical raw report remediation requires accepted sanitized operator evidence.",
      "Response operations readiness requires exact scheduler, backfill, purge/archive, alerting, dashboard, and soak evidence commands.",
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
  const humanAcceptance = report.humanRestoreDrillEvidenceAcceptance;
  const workerReadiness = report.productionWorkerReadinessEvidence;
  const responseOpsReadiness = report.responseOpsReadinessEvidence;
  const blocker1 = blockers.find((blocker) => blocker.number === 1);
  const blocker2 = blockers.find((blocker) => blocker.number === 2);
  const blocker6 = blockers.find((blocker) => blocker.number === 6);
  const blocker8 = blockers.find((blocker) => blocker.number === 8);
  const blocker9 = blockers.find((blocker) => blocker.number === 9);
  const blocker11 = blockers.find((blocker) => blocker.number === 11);
  const blocker21 = blockers.find((blocker) => blocker.number === 21);
  const blocker22 = blockers.find((blocker) => blocker.number === 22);
  if (blocker2?.classification === "fixed with human-observed evidence") {
    if (
      workerReadiness?.acceptedProductionRunEvidence?.accepted !== true ||
      workerReadiness?.blockerCoverage?.productionIngestRuntime !== true ||
      workerReadiness?.safety?.productionJobsProcessedByCodex === true
    ) {
      errors.push("Blocker 2 cannot be production-ready without accepted production queue-depth evidence.");
    }
  }
  if (blocker11?.classification === "fixed with human-observed evidence") {
    if (
      workerReadiness?.acceptedProductionRunEvidence?.accepted !== true ||
      workerReadiness?.blockerCoverage?.productionWorkflowParityAndRollback !== true
    ) {
      errors.push("Blocker 11 cannot be fixed without production workflow parity and rollback evidence.");
    }
  }
  if (blocker11?.classification === "human proof required") {
    errors.push("Blocker 11 must remain partial until production workflow parity and rollback evidence are present.");
  }
  if (blocker6?.classification === "fixed with human-observed evidence") {
    const rawReportAcceptance = report.rawReportRemediationAcceptance;
    if (
      rawReportAcceptance?.accepted !== true ||
      rawReportAcceptance?.blockerCoverage?.historicalRawReportBytes !== true ||
      rawReportAcceptance?.validation?.sensitiveFindings?.length > 0 ||
      rawReportAcceptance?.safety?.productionDataMutatedByCodex === true ||
      rawReportAcceptance?.safety?.codexPerformedRemediation === true
    ) {
      errors.push("Blocker 6 cannot be classified fixed without accepted sanitized operator raw-report remediation evidence.");
    }
  }
  if (blocker8?.classification === "fixed with automated evidence") {
    if (
      responseOpsReadiness?.blockerCoverage?.responseOperationsMaturity !== true ||
      responseOpsReadiness?.safety?.liveSchedulerEnabledByCodex === true ||
      responseOpsReadiness?.safety?.productionDataMutated === true ||
      responseOpsReadiness?.safety?.productionRecordsPurgedOrArchived === true ||
      responseOpsReadiness?.safety?.responseQueueSemanticsChanged === true
    ) {
      errors.push("Blocker 8 cannot be fixed without accepted response ops readiness and non-mutating operator controls.");
    }
  }
  if (blocker9?.classification === "fixed with human-observed evidence") {
    if (
      responseOpsReadiness?.blockerCoverage?.observabilityAlerting !== true ||
      !["live-evidenced", "formally-excluded"].includes(responseOpsReadiness?.alertingStatus) ||
      responseOpsReadiness?.safety?.dryRunAlertsAreLiveProof === true ||
      responseOpsReadiness?.safety?.liveAlertsSentByCodex === true
    ) {
      errors.push("Blocker 9 cannot be fixed without live alert proof or accepted formal alert exclusion.");
    }
  }
  if (blocker21?.classification === "fixed with automated evidence") {
    const commandList = new Set(report.commandList ?? []);
    for (const command of [
      "pnpm run production-scale:evidence",
      "pnpm run production-worker:readiness-evidence",
      "pnpm run response:ops-readiness-evidence",
      "pnpm run alerts:exclusion:validate",
      "pnpm run alerts:dry-run",
      "pnpm run production-scale:promotion-pack",
      "pnpm run operator:dashboard",
    ]) {
      if (!commandList.has(command)) {
        errors.push(`Blocker 21 fixed status is missing exact release evidence command: ${command}.`);
      }
    }
    if (report.skippedChecks?.dashboardPassAloneIsReleaseEvidence === true) {
      errors.push("Blocker 21 cannot rely on dashboard PASS alone.");
    }
  }
  if (blocker1?.classification === "fixed with human-observed evidence") {
    if (
      humanAcceptance?.accepted !== true ||
      humanAcceptance?.blockerCoverage?.disasterRecoveryRestoreDrill !== true ||
      humanAcceptance?.validation?.simulatedOnlySubmission === true
    ) {
      errors.push("Blocker 1 cannot be classified fixed without accepted non-simulated human restore evidence.");
    }
  }
  if (blocker22?.classification === "fixed with human-observed evidence") {
    if (
      humanAcceptance?.accepted !== true ||
      humanAcceptance?.blockerCoverage?.retentionArchiveRestore !== true ||
      humanAcceptance?.validation?.simulatedOnlySubmission === true
    ) {
      errors.push("Blocker 22 cannot be classified fixed without accepted non-simulated human retention recoverability evidence.");
    }
  }
  if (humanAcceptance?.validation?.simulatedOnlySubmission === true && humanAcceptance?.accepted === true) {
    errors.push("SIMULATED-only human evidence submission was accepted.");
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
    "- Historical raw report remediation requires accepted sanitized operator evidence.",
    "- Response operations readiness requires exact scheduler, backfill, purge/archive, alerting, dashboard, and soak evidence commands.",
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
    "## Human Restore Drill Evidence Acceptance",
    "",
    `- Status: ${report.humanRestoreDrillEvidenceAcceptance.status}`,
    `- Accepted: ${report.humanRestoreDrillEvidenceAcceptance.accepted ? "yes" : "no"}`,
    `- Evidence path: \`${report.humanRestoreDrillEvidenceAcceptance.evidencePath ?? "not submitted"}\``,
    `- Blocker 1 coverage: ${
      report.humanRestoreDrillEvidenceAcceptance.blockerCoverage?.disasterRecoveryRestoreDrill ? "accepted" : "not accepted"
    }`,
    `- Blocker 22 coverage: ${
      report.humanRestoreDrillEvidenceAcceptance.blockerCoverage?.retentionArchiveRestore ? "accepted" : "not accepted"
    }`,
    `- SIMULATED-only submitted as human proof: ${
      report.humanRestoreDrillEvidenceAcceptance.validation?.simulatedOnlySubmission ? "yes" : "no"
    }`,
    "",
    "## Production Worker Readiness Evidence",
    "",
    `- Status: ${report.productionWorkerReadinessEvidence.status}`,
    `- Production proof accepted: ${report.productionWorkerReadinessEvidence.productionProof ? "yes" : "no"}`,
    `- Queue-depth evidence accepted: ${
      report.productionWorkerReadinessEvidence.acceptedProductionRunEvidence?.accepted ? "yes" : "no"
    }`,
    `- Queue-depth evidence path: \`${report.productionWorkerReadinessEvidence.acceptedProductionRunEvidence?.evidencePath ?? "not submitted"}\``,
    `- Blocker 2 coverage: ${
      report.productionWorkerReadinessEvidence.blockerCoverage?.productionIngestRuntime ? "accepted" : "not accepted"
    }`,
    `- Blocker 11 coverage: ${
      report.productionWorkerReadinessEvidence.blockerCoverage?.productionWorkflowParityAndRollback ? "accepted" : "not accepted"
    }`,
    `- Codex processed production jobs: ${
      report.productionWorkerReadinessEvidence.safety?.productionJobsProcessedByCodex ? "yes" : "no"
    }`,
    "",
    "## Raw Report Remediation Acceptance",
    "",
    `- Status: ${report.rawReportRemediationAcceptance.status}`,
    `- Accepted: ${report.rawReportRemediationAcceptance.accepted ? "yes" : "no"}`,
    `- Evidence path: \`${report.rawReportRemediationAcceptance.evidencePath ?? "not submitted"}\``,
    `- Blocker 6 coverage: ${
      report.rawReportRemediationAcceptance.blockerCoverage?.historicalRawReportBytes ? "accepted" : "not accepted"
    }`,
    `- Sensitive findings: ${report.rawReportRemediationAcceptance.validation?.sensitiveFindings?.length ?? 0}`,
    "",
    "## Response Ops Readiness Evidence",
    "",
    `- Status: ${report.responseOpsReadinessEvidence.status}`,
    `- Live scheduler status: ${report.responseOpsReadinessEvidence.liveSchedulerStatus}`,
    `- Backfill readiness status: ${report.responseOpsReadinessEvidence.backfillReadinessStatus}`,
    `- Purge/archive readiness status: ${report.responseOpsReadinessEvidence.purgeArchiveReadinessStatus}`,
    `- Alerting status: ${report.responseOpsReadinessEvidence.alertingStatus}`,
    `- Alerting exclusion accepted: ${report.responseOpsReadinessEvidence.alertingExclusionAccepted ? "yes" : "no"}`,
    `- Live alert proof accepted: ${report.responseOpsReadinessEvidence.liveAlertProofAccepted ? "yes" : "no"}`,
    `- Blocker 8 coverage: ${
      report.responseOpsReadinessEvidence.blockerCoverage?.responseOperationsMaturity ? "accepted" : "not accepted"
    }`,
    `- Blocker 9 coverage: ${
      report.responseOpsReadinessEvidence.blockerCoverage?.observabilityAlerting ? "accepted" : "not accepted"
    }`,
    `- Response queue semantics changed: ${
      report.responseOpsReadinessEvidence.safety?.responseQueueSemanticsChanged ? "yes" : "no"
    }`,
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
