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
  buildProductionWorkerActivationEvidenceReport,
  PRODUCTION_WORKER_ACTIVATION_EVIDENCE_JSON_PATH,
  PRODUCTION_WORKER_ACTIVATION_EVIDENCE_MD_PATH,
} from "./production-worker-activation-evidence.mjs";

import {
  PRODUCTION_DEPLOYMENT_PARITY_JSON_PATH,
  PRODUCTION_DEPLOYMENT_PARITY_MD_PATH,
  readProductionDeploymentParityEvidenceReport,
} from "./production-deployment-parity-evidence.mjs";

import {
  buildMigrationGateReport,
  MIGRATION_GATE_JSON_PATH,
  MIGRATION_GATE_MD_PATH,
  MIGRATION_GATE_POLICY_PATH,
} from "./migration-gate.mjs";

import {
  buildRuntimeSizePolicyAcceptanceReport,
  RUNTIME_SIZE_POLICY_ACCEPTANCE_JSON_PATH,
  RUNTIME_SIZE_POLICY_ACCEPTANCE_MD_PATH,
} from "./runtime-size-policy-acceptance.mjs";

import {
  buildMeasuredLoadEvidenceAcceptance,
  LOAD_MEASURED_JSON_PATH,
  LOAD_MEASURED_MD_PATH,
  LOAD_THRESHOLD_POLICY_PATH,
} from "./production-scale-measured.mjs";

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
  buildRestoreEvidenceCurrentCheckReport,
  HUMAN_RESTORE_DRILL_ACCEPTANCE_JSON_PATH,
  HUMAN_RESTORE_DRILL_ACCEPTANCE_MD_PATH,
  HUMAN_RESTORE_DRILL_EVIDENCE_JSON_PATH,
  HUMAN_RESTORE_DRILL_EVIDENCE_MD_PATH,
  RESTORE_READINESS_CHECK_JSON_PATH,
  RESTORE_READINESS_CHECK_MD_PATH,
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
export const STAGING_INGEST_WORKER_EVIDENCE_MD_PATH =
  "docs/production-scale/evidence/latest-staging-ingest-worker-evidence.md";
export const STAGING_INGEST_WORKER_EVIDENCE_JSON_PATH =
  "docs/production-scale/evidence/latest-staging-ingest-worker-evidence.json";

export const REQUIRED_PROMOTION_COMMANDS = [
  "pnpm run typecheck",
  "pnpm run build",
  "pnpm run test:contracts",
  "pnpm run test:api",
  "pnpm run test:golden-path",
  "pnpm run test:regression-dashboard",
  "pnpm run test:deterministic-ingestion-report",
  "pnpm run baseline:production-scale-measured -- --local",
  "pnpm run response:soak-check",
  "pnpm run operator:dashboard",
  "pnpm run alerts:dry-run",
  "pnpm run alerts:exclusion:validate",
  "pnpm run response-ops:readiness-evidence",
  "pnpm run response:ops-readiness-evidence",
  "pnpm run production-deployment-parity:evidence",
  "pnpm run production-worker:activation-evidence",
  "pnpm run production-worker:readiness-evidence",
  "pnpm run ingest:worker:staging-evidence",
  "pnpm run storage:raw-report-remediation-plan",
  "pnpm run storage:raw-report-remediation-acceptance",
  "pnpm run check:migrations",
  "pnpm run check:restore-drill-evidence",
  "pnpm run migrations:gate",
  "pnpm run restore:accept-human-evidence",
  "pnpm run restore:evidence:current-check",
  "pnpm run report:runtime-size",
  "pnpm run runtime-size:policy-acceptance",
  "git diff --check",
];

export const OPTIONAL_EVIDENCE_COMMANDS = [
  "pnpm run production-scale:evidence",
  "pnpm run restore:drill:simulated",
  "pnpm run restore:evidence:current-check",
  "pnpm run ingest:worker:simulated-proof",
  "pnpm run ingest:worker:staging-evidence",
  "pnpm run baseline:production-scale-local -- --simulated",
  "pnpm run alerts:dry-run",
  "pnpm run response-ops:readiness-evidence",
  "pnpm run storage:raw-report-inventory",
  "pnpm run storage:raw-report-remediation-plan",
  "pnpm run storage:raw-report-remediation-acceptance",
  "pnpm run retention:archive-restore:simulated",
  "pnpm run packet-pdf:cache-miss-proof",
  "pnpm run production-worker:activation-plan",
  "pnpm run production-deployment-parity:evidence",
  "pnpm run production-worker:activation-evidence",
  "pnpm run production-worker:readiness-evidence",
  "pnpm run migrations:evidence",
  "pnpm run production-safe-probes:evidence",
  "pnpm run staging-owner-denial-smoke:evidence",
  "pnpm run sensitive-list-endpoints:evidence",
  "pnpm run check:runtime-size",
  "pnpm run runtime-size:policy-acceptance",
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
  "pnpm run restore:evidence:current-check": [
    RESTORE_READINESS_CHECK_MD_PATH,
    RESTORE_READINESS_CHECK_JSON_PATH,
  ],
  "pnpm run ingest:worker:simulated-proof": [
    "docs/production-scale/evidence/latest-ingest-worker-simulated.md",
    "docs/production-scale/evidence/latest-ingest-worker-simulated.json",
  ],
  "pnpm run ingest:worker:staging-evidence": [
    STAGING_INGEST_WORKER_EVIDENCE_MD_PATH,
    STAGING_INGEST_WORKER_EVIDENCE_JSON_PATH,
  ],
  "pnpm run baseline:production-scale-local -- --simulated": [
    "docs/production-scale/evidence/latest-load-simulated.md",
    "docs/production-scale/evidence/latest-load-simulated.json",
  ],
  "pnpm run baseline:production-scale-measured -- --local": [
    LOAD_MEASURED_MD_PATH,
    LOAD_MEASURED_JSON_PATH,
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
  "pnpm run response-ops:readiness-evidence": [
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
  "pnpm run production-worker:activation-evidence": [
    PRODUCTION_WORKER_ACTIVATION_EVIDENCE_MD_PATH,
    PRODUCTION_WORKER_ACTIVATION_EVIDENCE_JSON_PATH,
  ],
  "pnpm run production-worker:readiness-evidence": [
    PRODUCTION_WORKER_READINESS_MD_PATH,
    PRODUCTION_WORKER_READINESS_JSON_PATH,
  ],
  "pnpm run production-deployment-parity:evidence": [
    PRODUCTION_DEPLOYMENT_PARITY_MD_PATH,
    PRODUCTION_DEPLOYMENT_PARITY_JSON_PATH,
  ],
  "pnpm run migrations:evidence": [
    "docs/production-scale/evidence/latest-migration-governance.md",
    "docs/production-scale/evidence/latest-migration-governance.json",
  ],
  "pnpm run migrations:gate": [
    MIGRATION_GATE_MD_PATH,
    MIGRATION_GATE_JSON_PATH,
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
  "pnpm run runtime-size:policy-acceptance": [
    RUNTIME_SIZE_POLICY_ACCEPTANCE_MD_PATH,
    RUNTIME_SIZE_POLICY_ACCEPTANCE_JSON_PATH,
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

function buildStagingIngestWorkerEvidenceAcceptance(rootDir) {
  const parsed = readJsonIfPresent(rootDir, STAGING_INGEST_WORKER_EVIDENCE_JSON_PATH);
  if (!parsed) {
    return {
      reportName: "staging-ingest-worker-queue-drain-evidence",
      generatedAt: null,
      status: existsSync(repoPath(rootDir, STAGING_INGEST_WORKER_EVIDENCE_MD_PATH))
        ? "submitted-markdown-requires-json"
        : "not-submitted",
      accepted: false,
      evidencePath: null,
      productionProof: false,
      stagingProof: false,
      queueDepthBeforeRun: null,
      queueDepthAfterRun: null,
      processedCount: null,
      failedCount: null,
      deadLetterCount: null,
      blockerCoverage: {
        blocker2StagingQueueDrain: false,
        blocker2ProductionRuntime: false,
        blocker11ProductionParityAndRollback: false,
      },
      validation: {
        ok: false,
        errors: ["No accepted staging ingest worker queue-drain evidence has been generated."],
      },
      safety: {
        productionDataMutated: false,
        productionTargetsUsed: false,
        productionWorkerActivationDeferred: true,
        workerAlwaysOn: false,
      },
    };
  }

  const errors = [];
  if (parsed.evidenceType !== "STAGING_INGEST_WORKER_QUEUE_DRAIN") {
    errors.push("evidenceType must be STAGING_INGEST_WORKER_QUEUE_DRAIN.");
  }
  if (parsed.environment !== "staging-safe") errors.push("environment must be staging-safe.");
  if (parsed.productionProof === true) errors.push("staging ingest worker evidence must not be production proof.");
  if (parsed.stagingProof !== true) errors.push("stagingProof must be true.");
  if (parsed.accepted !== true || parsed.status !== "accepted-staging-queue-drain") {
    errors.push("staging ingest worker evidence has not been accepted.");
  }
  if (!Number.isInteger(parsed.queueDepthBeforeRun) || parsed.queueDepthBeforeRun < 1) {
    errors.push("queueDepthBeforeRun must show at least one scoped queued job before apply.");
  }
  if (parsed.queueDepthAfterRun !== 0 || parsed.eligibleDepthAfterRun !== 0) {
    errors.push("scoped queue depth and eligible depth must be zero after apply.");
  }
  if (!Number.isInteger(parsed.processedCount) || parsed.processedCount < 1) {
    errors.push("processedCount must be at least one.");
  }
  if (parsed.processedCount > parsed.boundedExecution?.maxJobs) {
    errors.push("processedCount must not exceed bounded maxJobs.");
  }
  if (parsed.failedCount !== 0 || parsed.deadLetterCount !== 0) {
    errors.push("failedCount and deadLetterCount must be zero.");
  }
  if (parsed.safety?.productionDataMutated !== false || parsed.safety?.productionTargetsUsed !== false) {
    errors.push("staging evidence must record no production mutation and no production targets.");
  }
  if (parsed.safety?.productionWorkerActivationDeferred !== true || parsed.safety?.workerAlwaysOn !== false) {
    errors.push("staging evidence must keep production worker activation deferred and non-daemon.");
  }
  if (parsed.safety?.parserBehaviorChanged !== false || parsed.safety?.ocrBehaviorChanged !== false) {
    errors.push("staging evidence must not change parser or OCR behavior.");
  }
  const accepted = errors.length === 0;

  return {
    reportName: parsed.reportName ?? "staging-ingest-worker-queue-drain-evidence",
    generatedAt: parsed.generatedAt ?? null,
    status: accepted ? "accepted-staging-queue-drain" : "failed",
    accepted,
    evidencePath: STAGING_INGEST_WORKER_EVIDENCE_JSON_PATH,
    productionProof: false,
    stagingProof: accepted,
    queueDepthBeforeRun: parsed.queueDepthBeforeRun ?? null,
    queueDepthAfterRun: parsed.queueDepthAfterRun ?? null,
    processedCount: parsed.processedCount ?? null,
    failedCount: parsed.failedCount ?? null,
    deadLetterCount: parsed.deadLetterCount ?? null,
    blockerCoverage: {
      blocker2StagingQueueDrain: accepted,
      blocker2ProductionRuntime: false,
      blocker11ProductionParityAndRollback: false,
    },
    validation: {
      ok: accepted,
      errors,
    },
    safety: {
      productionDataMutated: parsed.safety?.productionDataMutated === true,
      productionTargetsUsed: parsed.safety?.productionTargetsUsed === true,
      productionWorkerActivationDeferred: parsed.safety?.productionWorkerActivationDeferred === true,
      workerAlwaysOn: parsed.safety?.workerAlwaysOn === true,
    },
  };
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function classifyBlocker(
  blocker,
  humanRestoreEvidenceAcceptance = null,
  restoreReadinessCheck = null,
  productionDeploymentParityEvidence = null,
  productionWorkerReadinessEvidence = null,
  stagingIngestWorkerEvidence = null,
  rawReportRemediationAcceptance = null,
  responseOpsReadinessEvidence = null,
  migrationGateEvidence = null,
  measuredLoadEvidenceAcceptance = null,
  runtimeSizePolicyAcceptance = null,
) {
  if (
    blocker.number === 3 &&
    measuredLoadEvidenceAcceptance?.accepted === true &&
    measuredLoadEvidenceAcceptance?.blockerCoverage?.loadConcurrency === true
  ) {
    return "fixed with automated evidence";
  }
  if (
    blocker.number === 2 &&
    productionWorkerReadinessEvidence?.blockerCoverage?.productionIngestRuntime === true &&
    productionWorkerReadinessEvidence?.acceptedProductionRunEvidence?.accepted === true
  ) {
    return "fixed with human-observed evidence";
  }
  if (
    blocker.number === 2 &&
    stagingIngestWorkerEvidence?.accepted === true &&
    stagingIngestWorkerEvidence?.blockerCoverage?.blocker2StagingQueueDrain === true &&
    stagingIngestWorkerEvidence?.productionProof !== true
  ) {
    return "partial";
  }
  if (blocker.number === 11) {
    if (
      productionDeploymentParityEvidence?.current === true &&
      productionDeploymentParityEvidence?.blockerCoverage?.productionDeploymentParity === true &&
      productionDeploymentParityEvidence?.productionSafeProbeEvidence?.accepted === true &&
      productionDeploymentParityEvidence?.rollbackEvidence?.status === "passed" &&
      productionDeploymentParityEvidence?.safety?.productionDataMutatedByCodex !== true &&
      productionDeploymentParityEvidence?.safety?.productionFixturesCreatedByCodex !== true
    ) {
      return "fixed with automated evidence";
    }
    return "partial";
  }
  if (
    blocker.number === 1 &&
    restoreReadinessCheck?.currentOperationalProof === true &&
    restoreReadinessCheck?.blockerCoverage?.disasterRecoveryRestoreDrill === true &&
    restoreReadinessCheck?.evidenceType === "HUMAN-OBSERVED" &&
    restoreReadinessCheck?.simulatedOnly !== true &&
    restoreReadinessCheck?.stale !== true
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
    blocker.number === 10 &&
    migrationGateEvidence?.blockerCoverage?.migrationGovernance === true &&
    migrationGateEvidence?.policyMode === "release-blocking" &&
    migrationGateEvidence?.releaseGateAccepted === true
  ) {
    return "fixed with automated evidence";
  }
  if (
    blocker.number === 10 &&
    migrationGateEvidence?.blockerCoverage?.migrationGovernance === true &&
    migrationGateEvidence?.policyMode === "waived" &&
    migrationGateEvidence?.formalWaiver?.accepted === true
  ) {
    return "waived with explicit reason";
  }
  if (
    blocker.number === 16 &&
    measuredLoadEvidenceAcceptance?.accepted === true &&
    measuredLoadEvidenceAcceptance?.blockerCoverage?.dbPoolPressure === true
  ) {
    return "fixed with automated evidence";
  }
  if (
    blocker.number === 17 &&
    measuredLoadEvidenceAcceptance?.accepted === true &&
    measuredLoadEvidenceAcceptance?.blockerCoverage?.rateLimiterWritePressure === true
  ) {
    return "fixed with automated evidence";
  }
  if (
    blocker.number === 18 &&
    runtimeSizePolicyAcceptance?.accepted === true &&
    runtimeSizePolicyAcceptance?.blockerCoverage?.acceptedHardGate === true
  ) {
    return "fixed with automated evidence";
  }
  if (
    blocker.number === 18 &&
    runtimeSizePolicyAcceptance?.accepted === true &&
    runtimeSizePolicyAcceptance?.blockerCoverage?.acceptedWarningOnlyWaiver === true
  ) {
    return "waived with explicit reason";
  }
  if (
    blocker.number === 20 &&
    productionDeploymentParityEvidence?.current === true &&
    productionDeploymentParityEvidence?.blockerCoverage?.productionSafePrivacyProbeDepth === true &&
    productionDeploymentParityEvidence?.productionSafeProbeEvidence?.accepted === true &&
    productionDeploymentParityEvidence?.stagingOwnerDenialEvidenceReference?.accepted === true &&
    productionDeploymentParityEvidence?.safety?.productionFixturesCreatedByCodex !== true
  ) {
    return "fixed with staging evidence";
  }
  if (
    blocker.number === 22 &&
    restoreReadinessCheck?.currentOperationalProof === true &&
    restoreReadinessCheck?.blockerCoverage?.retentionArchiveRestore === true &&
    restoreReadinessCheck?.evidenceType === "HUMAN-OBSERVED" &&
    restoreReadinessCheck?.simulatedOnly !== true &&
    restoreReadinessCheck?.stale !== true
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
  restoreReadinessCheck = null,
  productionDeploymentParityEvidence = null,
  productionWorkerActivationEvidence = null,
  productionWorkerReadinessEvidence = null,
  stagingIngestWorkerEvidence = null,
  rawReportRemediationAcceptance = null,
  responseOpsReadinessEvidence = null,
  migrationGateEvidence = null,
  measuredLoadEvidenceAcceptance = null,
  runtimeSizePolicyAcceptance = null,
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
  const currentRestoreReadiness =
    restoreReadinessCheck ??
    buildRestoreEvidenceCurrentCheckReport({
      rootDir,
      evidencePath: acceptedHumanRestoreEvidence.evidencePath,
      generatedAt,
    });
  const deploymentParityEvidence =
    productionDeploymentParityEvidence ?? readProductionDeploymentParityEvidenceReport({ rootDir, generatedAt });
  const workerReadinessEvidence =
    productionWorkerReadinessEvidence ?? buildProductionWorkerReadinessEvidenceReport({ rootDir, generatedAt });
  const workerActivationEvidence =
    productionWorkerActivationEvidence ?? buildProductionWorkerActivationEvidenceReport({ rootDir, generatedAt });
  const stagingIngestEvidence =
    stagingIngestWorkerEvidence ?? buildStagingIngestWorkerEvidenceAcceptance(rootDir);
  const rawReportRemediationEvidence =
    rawReportRemediationAcceptance ?? buildRawReportRemediationAcceptanceReport({ rootDir, generatedAt });
  const responseOpsEvidence =
    responseOpsReadinessEvidence ?? buildResponseOpsReadinessEvidenceReport({ rootDir, generatedAt, env });
  const migrationGate =
    migrationGateEvidence ?? buildMigrationGateReport({ rootDir, generatedAt });
  const measuredLoadAcceptance =
    measuredLoadEvidenceAcceptance ?? buildMeasuredLoadEvidenceAcceptance({ rootDir, generatedAt });
  const runtimeSizeAcceptance =
    runtimeSizePolicyAcceptance ?? buildRuntimeSizePolicyAcceptanceReport({ rootDir, generatedAt });

  const classifiedBlockers = loadedRegistry.blockers.map((blocker) => {
    const classification = classifyBlocker(
      blocker,
      acceptedHumanRestoreEvidence,
      currentRestoreReadiness,
      deploymentParityEvidence,
      workerReadinessEvidence,
      stagingIngestEvidence,
      rawReportRemediationEvidence,
      responseOpsEvidence,
      migrationGate,
      measuredLoadAcceptance,
      runtimeSizeAcceptance,
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
                  : blocker.number === 10
                    ? migrationGate.policyPath
                  : acceptedHumanRestoreEvidence.evidencePath,
              acceptedAt:
                blocker.number === 2 || blocker.number === 11
                  ? workerReadinessEvidence.generatedAt
                  : blocker.number === 6
                    ? rawReportRemediationEvidence.generatedAt
                  : blocker.number === 9
                    ? responseOpsEvidence.generatedAt
                  : blocker.number === 10
                    ? migrationGate.generatedAt
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
    PRODUCTION_DEPLOYMENT_PARITY_MD_PATH,
    PRODUCTION_DEPLOYMENT_PARITY_JSON_PATH,
    PRODUCTION_WORKER_QUEUE_DEPTH_EVIDENCE_JSON_PATH,
    PRODUCTION_WORKER_QUEUE_DEPTH_EVIDENCE_MD_PATH,
    RAW_REPORT_REMEDIATION_ACCEPTANCE_EVIDENCE_JSON_PATH,
    RAW_REPORT_REMEDIATION_ACCEPTANCE_EVIDENCE_MD_PATH,
    ALERTING_EXCLUSION_EVIDENCE_JSON_PATH,
    ALERTING_EXCLUSION_EVIDENCE_MD_PATH,
    LIVE_ALERT_PROOF_JSON_PATH,
    LIVE_ALERT_PROOF_MD_PATH,
    MIGRATION_GATE_POLICY_PATH,
    LOAD_THRESHOLD_POLICY_PATH,
    RUNTIME_SIZE_POLICY_ACCEPTANCE_MD_PATH,
    RUNTIME_SIZE_POLICY_ACCEPTANCE_JSON_PATH,
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
    restoreReadinessCheck: {
      reportName: currentRestoreReadiness.reportName,
      generatedAt: currentRestoreReadiness.generatedAt,
      status: currentRestoreReadiness.status,
      currentOperationalProof: currentRestoreReadiness.currentOperationalProof === true,
      stale: currentRestoreReadiness.stale === true,
      maxAgeDays: currentRestoreReadiness.maxAgeDays,
      evidencePath: currentRestoreReadiness.evidencePath,
      evidenceType: currentRestoreReadiness.evidenceType,
      humanObserved: currentRestoreReadiness.humanObserved === true,
      simulatedOnly: currentRestoreReadiness.simulatedOnly === true,
      restoreDateTime: currentRestoreReadiness.restoreDateTime,
      ageDays: currentRestoreReadiness.ageDays,
      requiredFields: currentRestoreReadiness.requiredFields,
      blockerCoverage: currentRestoreReadiness.blockerCoverage,
      validation: {
        ok: currentRestoreReadiness.validation?.ok === true,
        humanAcceptanceOk: currentRestoreReadiness.validation?.humanAcceptanceOk === true,
        errors: currentRestoreReadiness.validation?.errors ?? [],
        unresolvedReasons: currentRestoreReadiness.validation?.unresolvedReasons ?? [],
      },
      safety: {
        runsDump: currentRestoreReadiness.safety?.runsDump === true,
        runsRestore: currentRestoreReadiness.safety?.runsRestore === true,
        accessesProductionBackups: currentRestoreReadiness.safety?.accessesProductionBackups === true,
        modifiesProduction: currentRestoreReadiness.safety?.modifiesProduction === true,
        acceptsSimulatedEvidenceAsProductionProof:
          currentRestoreReadiness.safety?.acceptsSimulatedEvidenceAsProductionProof === true,
      },
    },
    productionDeploymentParityEvidence: {
      reportName: deploymentParityEvidence.reportName,
      generatedAt: deploymentParityEvidence.generatedAt,
      status: deploymentParityEvidence.status,
      current: deploymentParityEvidence.current === true,
      productionProof: deploymentParityEvidence.productionProof === true,
      runtimeProductionProbesExecutedByThisCommand:
        deploymentParityEvidence.runtimeProductionProbesExecutedByThisCommand === true,
      productionSafeProbeEvidence: {
        accepted: deploymentParityEvidence.productionSafeProbeEvidence?.accepted === true,
        current: deploymentParityEvidence.productionSafeProbeEvidence?.current === true,
        path: deploymentParityEvidence.productionSafeProbeEvidence?.path ?? null,
        planOnly: deploymentParityEvidence.productionSafeProbeEvidence?.planOnly === true,
        runtimeProductionProof: deploymentParityEvidence.productionSafeProbeEvidence?.runtimeProductionProof === true,
      },
      stagingOwnerDenialEvidenceReference: {
        accepted: deploymentParityEvidence.stagingOwnerDenialEvidenceReference?.accepted === true,
        current: deploymentParityEvidence.stagingOwnerDenialEvidenceReference?.current === true,
        path: deploymentParityEvidence.stagingOwnerDenialEvidenceReference?.path ?? null,
        productionProof: deploymentParityEvidence.stagingOwnerDenialEvidenceReference?.productionProof === true,
      },
      invalidSessionDenialProbeStatus: deploymentParityEvidence.invalidSessionDenialProbeStatus ?? null,
      publicHealthReadinessProbeStatus: deploymentParityEvidence.publicHealthReadinessProbeStatus ?? null,
      rollbackEvidence: {
        status: deploymentParityEvidence.rollbackEvidence?.status ?? "unknown",
        rollbackShaInputRequired: deploymentParityEvidence.rollbackEvidence?.rollbackShaInputRequired === true,
        healthCheckAfterRollbackRequired:
          deploymentParityEvidence.rollbackEvidence?.healthCheckAfterRollbackRequired === true,
        selectedRollbackShaDeployedAndVerified:
          deploymentParityEvidence.rollbackEvidence?.selectedRollbackShaDeployedAndVerified === true,
      },
      staticUnsafePostSurfaceProof: {
        status: deploymentParityEvidence.staticUnsafePostSurfaceProof?.status ?? "unknown",
        unsafePostSurfaceStaticProofCount:
          deploymentParityEvidence.staticUnsafePostSurfaceProof?.unsafePostSurfaceStaticProofCount ?? 0,
      },
      retiredPublicRouteContractProof: {
        status: deploymentParityEvidence.retiredPublicRouteContractProof?.status ?? "unknown",
        staticContractCount: deploymentParityEvidence.retiredPublicRouteContractProof?.staticContractCount ?? 0,
      },
      blockerCoverage: deploymentParityEvidence.blockerCoverage,
      validation: {
        ok: deploymentParityEvidence.validation?.ok === true,
        errors: deploymentParityEvidence.validation?.errors ?? [],
        sensitiveFindings: deploymentParityEvidence.validation?.sensitiveFindings ?? [],
      },
      safety: {
        runtimeProductionProbesReadOnly:
          deploymentParityEvidence.safety?.runtimeProductionProbesReadOnly === true,
        staticProofTreatedAsRuntimeProductionProof:
          deploymentParityEvidence.safety?.staticProofTreatedAsRuntimeProductionProof === true,
        productionDataMutatedByCodex:
          deploymentParityEvidence.safety?.productionDataMutatedByCodex === true,
        productionFixturesCreatedByCodex:
          deploymentParityEvidence.safety?.productionFixturesCreatedByCodex === true,
        productionWorkerActivatedByCodex:
          deploymentParityEvidence.safety?.productionWorkerActivatedByCodex === true,
        productionJobsProcessedByCodex:
          deploymentParityEvidence.safety?.productionJobsProcessedByCodex === true,
        liveExternalProvidersCalledByCodex:
          deploymentParityEvidence.safety?.liveExternalProvidersCalledByCodex === true,
        dashboardPassAloneIsReleaseEvidence:
          deploymentParityEvidence.safety?.dashboardPassAloneIsReleaseEvidence === true,
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
    productionWorkerActivationEvidence: {
      reportName: workerActivationEvidence.reportName,
      generatedAt: workerActivationEvidence.generatedAt,
      status: workerActivationEvidence.status,
      productionProof: workerActivationEvidence.productionProof === true,
      productionWorkerDefaultOff: workerActivationEvidence.productionWorkerDefaultOff === true,
      productionActivationDeferred: workerActivationEvidence.productionActivationDeferred === true,
      explicitActivationInputsRequired: workerActivationEvidence.explicitActivationInputsRequired === true,
      dryRun: {
        command: workerActivationEvidence.dryRun?.command,
        mutatesQueue: workerActivationEvidence.dryRun?.mutatesQueue === true,
        claimsJobs: workerActivationEvidence.dryRun?.claimsJobs === true,
        processesJobs: workerActivationEvidence.dryRun?.processesJobs === true,
      },
      applyMode: {
        confirmationString: workerActivationEvidence.applyMode?.confirmationString,
        maxJobs: workerActivationEvidence.applyMode?.maxJobs,
      },
      futureOperatorRunFields: workerActivationEvidence.futureOperatorRunFields,
      stagingWorkerEvidence: workerActivationEvidence.stagingWorkerEvidence,
      staticValidation: {
        status: workerActivationEvidence.staticValidation?.status ?? "unknown",
        failedChecks: workerActivationEvidence.staticValidation?.failedChecks ?? [],
      },
      blockerCoverage: workerActivationEvidence.blockerCoverage,
      safety: {
        productionJobsProcessedByCodex: workerActivationEvidence.safety?.productionJobsProcessedByCodex === true,
        productionDataMutatedByCodex: workerActivationEvidence.safety?.productionDataMutatedByCodex === true,
        productionWorkerActivatedByDefault: workerActivationEvidence.safety?.productionWorkerActivatedByDefault === true,
        productionActivationEvidenceProcessesJobs:
          workerActivationEvidence.safety?.productionActivationEvidenceProcessesJobs === true,
        dryRunIsNonMutating: workerActivationEvidence.safety?.dryRunIsNonMutating === true,
        dashboardPassAloneIsReleaseEvidence:
          workerActivationEvidence.safety?.dashboardPassAloneIsReleaseEvidence === true,
      },
    },
    stagingIngestWorkerEvidence: {
      reportName: stagingIngestEvidence.reportName,
      generatedAt: stagingIngestEvidence.generatedAt,
      status: stagingIngestEvidence.status,
      accepted: stagingIngestEvidence.accepted === true,
      evidencePath: stagingIngestEvidence.evidencePath,
      productionProof: stagingIngestEvidence.productionProof === true,
      stagingProof: stagingIngestEvidence.stagingProof === true,
      queueDepthBeforeRun: stagingIngestEvidence.queueDepthBeforeRun,
      queueDepthAfterRun: stagingIngestEvidence.queueDepthAfterRun,
      processedCount: stagingIngestEvidence.processedCount,
      failedCount: stagingIngestEvidence.failedCount,
      deadLetterCount: stagingIngestEvidence.deadLetterCount,
      blockerCoverage: stagingIngestEvidence.blockerCoverage,
      validation: {
        ok: stagingIngestEvidence.validation?.ok === true,
        errors: stagingIngestEvidence.validation?.errors ?? [],
      },
      safety: {
        productionDataMutated: stagingIngestEvidence.safety?.productionDataMutated === true,
        productionTargetsUsed: stagingIngestEvidence.safety?.productionTargetsUsed === true,
        productionWorkerActivationDeferred:
          stagingIngestEvidence.safety?.productionWorkerActivationDeferred === true,
        workerAlwaysOn: stagingIngestEvidence.safety?.workerAlwaysOn === true,
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
    measuredLoadEvidenceAcceptance: {
      reportName: measuredLoadAcceptance.reportName,
      generatedAt: measuredLoadAcceptance.generatedAt,
      status: measuredLoadAcceptance.status,
      accepted: measuredLoadAcceptance.accepted === true,
      evidencePath: measuredLoadAcceptance.evidencePath,
      evidenceType: measuredLoadAcceptance.evidenceType ?? null,
      mode: measuredLoadAcceptance.mode ?? null,
      thresholdMode: measuredLoadAcceptance.thresholdMode ?? null,
      thresholdStatus: measuredLoadAcceptance.thresholdStatus ?? null,
      summary: measuredLoadAcceptance.summary ?? null,
      dbPool: measuredLoadAcceptance.dbPool
        ? {
            configuredMax: measuredLoadAcceptance.dbPool.configuredMax ?? null,
            observedSignalAvailable: measuredLoadAcceptance.dbPool.observedSignalAvailable === true,
            observedActiveConnections: measuredLoadAcceptance.dbPool.observedActiveConnections ?? null,
            observedBorrowedConnections: measuredLoadAcceptance.dbPool.observedBorrowedConnections ?? null,
            unavailableReason: measuredLoadAcceptance.dbPool.unavailableReason ?? null,
          }
        : null,
      rateLimiter: measuredLoadAcceptance.rateLimiter
        ? {
            attempts: measuredLoadAcceptance.rateLimiter.attempts ?? null,
            acceptedCount: measuredLoadAcceptance.rateLimiter.acceptedCount ?? null,
            rejectedCount: measuredLoadAcceptance.rateLimiter.rejectedCount ?? null,
            bounded: measuredLoadAcceptance.rateLimiter.bounded === true,
          }
        : null,
      packetPdfCache: measuredLoadAcceptance.packetPdfCache
        ? {
            cacheHitCount: measuredLoadAcceptance.packetPdfCache.cacheHitCount ?? null,
            cacheMissCount: measuredLoadAcceptance.packetPdfCache.cacheMissCount ?? null,
          }
        : null,
      blockerCoverage: measuredLoadAcceptance.blockerCoverage,
      validation: {
        ok: measuredLoadAcceptance.validation?.ok === true,
        errors: measuredLoadAcceptance.validation?.errors ?? [],
      },
      safety: {
        productionDataMutated: measuredLoadAcceptance.safety?.productionDataMutated === true,
        productionDatabaseTargeted: measuredLoadAcceptance.safety?.productionDatabaseTargeted === true,
        externalProviderCallsMade: Number(measuredLoadAcceptance.safety?.externalProviderCallsMade ?? -1),
        liveExternalProvidersConnected: measuredLoadAcceptance.safety?.liveExternalProvidersConnected === true,
        realConsumerPiiUsed: measuredLoadAcceptance.safety?.realConsumerPiiUsed === true,
        rawReportBytesSent: measuredLoadAcceptance.safety?.rawReportBytesSent === true,
      },
    },
    runtimeSizePolicyAcceptance: {
      reportName: runtimeSizeAcceptance.reportName,
      generatedAt: runtimeSizeAcceptance.generatedAt,
      status: runtimeSizeAcceptance.status,
      accepted: runtimeSizeAcceptance.accepted === true,
      acceptanceKind: runtimeSizeAcceptance.acceptanceKind ?? null,
      policyPath: runtimeSizeAcceptance.policyPath,
      evidencePath: runtimeSizeAcceptance.evidencePath,
      policyMode: runtimeSizeAcceptance.policyMode,
      formalWaiver: {
        accepted: runtimeSizeAcceptance.formalWaiver?.accepted === true,
        reason: runtimeSizeAcceptance.formalWaiver?.reason ?? null,
        approvedByRole: runtimeSizeAcceptance.formalWaiver?.approvedByRole ?? null,
        ownerRole: runtimeSizeAcceptance.formalWaiver?.ownerRole ?? null,
        acceptedAt: runtimeSizeAcceptance.formalWaiver?.acceptedAt ?? null,
        expiresOn: runtimeSizeAcceptance.formalWaiver?.expiresOn ?? null,
        reviewDate: runtimeSizeAcceptance.formalWaiver?.reviewDate ?? null,
        acceptedRiskStatement: runtimeSizeAcceptance.formalWaiver?.acceptedRiskStatement ?? null,
      },
      runtimeEvidence: runtimeSizeAcceptance.runtimeEvidence ?? null,
      warningRows: runtimeSizeAcceptance.warningRows ?? [],
      waivedRows: runtimeSizeAcceptance.waivedRows ?? [],
      blockerCoverage: runtimeSizeAcceptance.blockerCoverage,
      validation: {
        ok: runtimeSizeAcceptance.validation?.ok === true,
        errors: runtimeSizeAcceptance.validation?.errors ?? [],
      },
      safety: {
        nonMutating: runtimeSizeAcceptance.safety?.nonMutating === true,
        productionDataMutated: runtimeSizeAcceptance.safety?.productionDataMutated === true,
        dependencyVersionsChanged: runtimeSizeAcceptance.safety?.dependencyVersionsChanged === true,
        buildChunkingChanged: runtimeSizeAcceptance.safety?.buildChunkingChanged === true,
        buildBehaviorChanged: runtimeSizeAcceptance.safety?.buildBehaviorChanged === true,
        pdfOcrBehaviorChanged: runtimeSizeAcceptance.safety?.pdfOcrBehaviorChanged === true,
        hardGateClaimedWhenWarningOnly: runtimeSizeAcceptance.safety?.hardGateClaimedWhenWarningOnly === true,
      },
    },
    migrationGateEvidence: {
      reportName: migrationGate.reportName,
      generatedAt: migrationGate.generatedAt,
      status: migrationGate.status,
      policyPath: migrationGate.policyPath,
      policyMode: migrationGate.policyMode,
      releaseGateAccepted: migrationGate.releaseGateAccepted === true,
      runtimeEnsureResidualImpact: migrationGate.runtimeEnsureResidualImpact,
      releaseBlockingFindings: migrationGate.releaseBlockingFindings?.length ?? 0,
      warningOnlyFindings: migrationGate.warningOnlyFindings?.length ?? 0,
      waivedFindings: migrationGate.waivedFindings?.length ?? 0,
      blockerCoverage: migrationGate.blockerCoverage,
      formalWaiver: {
        accepted: migrationGate.formalWaiver?.accepted === true,
        reason: migrationGate.formalWaiver?.reason ?? null,
        approvedByRole: migrationGate.formalWaiver?.approvedByRole ?? null,
        acceptedAt: migrationGate.formalWaiver?.acceptedAt ?? null,
        expiresOn: migrationGate.formalWaiver?.expiresOn ?? null,
      },
      safety: {
        nonMutating: migrationGate.safety?.nonMutating === true,
        requiresDatabase: migrationGate.safety?.requiresDatabase === true,
        mutatesDatabase: migrationGate.safety?.mutatesDatabase === true,
        executesDdl: migrationGate.safety?.executesDdl === true,
        productionMutationAttempted: migrationGate.safety?.productionMutationAttempted === true,
        schemaChangedByCodex: migrationGate.safety?.schemaChangedByCodex === true,
        runtimeEnsurePathsRemoved: migrationGate.safety?.runtimeEnsurePathsRemoved === true,
        adHocDdlAdded: migrationGate.safety?.adHocDdlAdded === true,
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
      responseSoakStatus: responseOpsEvidence.responseSoak?.status ?? "unknown",
      dashboardStatus: responseOpsEvidence.dashboard?.status ?? "unknown",
      dashboardSkipCount: responseOpsEvidence.dashboard?.skipCount ?? null,
      dashboardSkippedChecksVisible: responseOpsEvidence.dashboard?.skippedChecksVisible === true,
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
      "Measured load evidence must be local or staging-safe, threshold-passing, synthetic, and zero-provider-call only.",
      "Staging ingest worker queue-drain evidence is staging proof only and does not activate production.",
      "Migration governance requires a non-mutating accepted gate policy or a formal waiver with reason.",
      "Runtime-size closure requires accepted hard-gate policy evidence or an accepted warning-only formal waiver.",
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
  const restoreReadiness = report.restoreReadinessCheck;
  const deploymentParity = report.productionDeploymentParityEvidence;
  const workerReadiness = report.productionWorkerReadinessEvidence;
  const workerActivation = report.productionWorkerActivationEvidence;
  const stagingIngest = report.stagingIngestWorkerEvidence;
  const responseOpsReadiness = report.responseOpsReadinessEvidence;
  const migrationGate = report.migrationGateEvidence;
  const measuredLoad = report.measuredLoadEvidenceAcceptance;
  const runtimeSize = report.runtimeSizePolicyAcceptance;
  const blocker1 = blockers.find((blocker) => blocker.number === 1);
  const blocker2 = blockers.find((blocker) => blocker.number === 2);
  const blocker3 = blockers.find((blocker) => blocker.number === 3);
  const blocker6 = blockers.find((blocker) => blocker.number === 6);
  const blocker8 = blockers.find((blocker) => blocker.number === 8);
  const blocker9 = blockers.find((blocker) => blocker.number === 9);
  const blocker10 = blockers.find((blocker) => blocker.number === 10);
  const blocker11 = blockers.find((blocker) => blocker.number === 11);
  const blocker16 = blockers.find((blocker) => blocker.number === 16);
  const blocker17 = blockers.find((blocker) => blocker.number === 17);
  const blocker18 = blockers.find((blocker) => blocker.number === 18);
  const blocker20 = blockers.find((blocker) => blocker.number === 20);
  const blocker21 = blockers.find((blocker) => blocker.number === 21);
  const blocker22 = blockers.find((blocker) => blocker.number === 22);
  if (blocker2?.classification === "fixed with human-observed evidence") {
    if (
      workerReadiness?.acceptedProductionRunEvidence?.accepted !== true ||
      workerReadiness?.blockerCoverage?.productionIngestRuntime !== true ||
      workerReadiness?.safety?.productionJobsProcessedByCodex === true ||
      workerActivation?.productionWorkerDefaultOff !== true ||
      workerActivation?.productionActivationDeferred !== true ||
      workerActivation?.explicitActivationInputsRequired !== true
    ) {
      errors.push("Blocker 2 cannot be production-ready without accepted production queue-depth evidence.");
    }
  }
  if (blocker2?.classification === "fixed with staging evidence") {
    if (
      stagingIngest?.accepted !== true ||
      stagingIngest?.blockerCoverage?.blocker2StagingQueueDrain !== true ||
      stagingIngest?.productionProof === true ||
      stagingIngest?.safety?.productionDataMutated === true ||
      stagingIngest?.safety?.productionTargetsUsed === true ||
      stagingIngest?.safety?.productionWorkerActivationDeferred !== true
    ) {
      errors.push("Blocker 2 staging evidence requires accepted staging-safe queue-drain proof and cannot be production proof.");
    }
  }
  if (
    workerActivation?.productionProof === true ||
    workerActivation?.blockerCoverage?.productionIngestRuntime === true ||
    workerActivation?.safety?.productionJobsProcessedByCodex === true ||
    workerActivation?.safety?.productionDataMutatedByCodex === true ||
    workerActivation?.safety?.productionWorkerActivatedByDefault === true ||
    workerActivation?.safety?.productionActivationEvidenceProcessesJobs === true ||
    workerActivation?.safety?.dryRunIsNonMutating !== true
  ) {
    errors.push("Production worker activation evidence must remain non-mutating, default-off, and non-production-proof.");
  }
  if (blocker3?.classification === "fixed with automated evidence") {
    if (
      measuredLoad?.accepted !== true ||
      measuredLoad?.blockerCoverage?.loadConcurrency !== true ||
      !["MEASURED_LOCAL", "MEASURED_STAGING_SAFE"].includes(measuredLoad?.evidenceType) ||
      measuredLoad?.thresholdMode !== "release-blocking" ||
      measuredLoad?.thresholdStatus !== "passed" ||
      measuredLoad?.safety?.productionDataMutated === true ||
      measuredLoad?.safety?.productionDatabaseTargeted === true ||
      measuredLoad?.safety?.externalProviderCallsMade !== 0 ||
      measuredLoad?.safety?.liveExternalProvidersConnected === true ||
      measuredLoad?.safety?.realConsumerPiiUsed === true ||
      measuredLoad?.safety?.rawReportBytesSent === true
    ) {
      errors.push("Blocker 3 cannot be fixed without accepted measured local/staging-safe load evidence.");
    }
  }
  if (blocker11?.classification?.startsWith("fixed with")) {
    if (
      deploymentParity?.current !== true ||
      deploymentParity?.blockerCoverage?.productionDeploymentParity !== true ||
      deploymentParity?.productionSafeProbeEvidence?.accepted !== true ||
      deploymentParity?.rollbackEvidence?.status !== "passed" ||
      deploymentParity?.rollbackEvidence?.rollbackShaInputRequired !== true ||
      deploymentParity?.rollbackEvidence?.healthCheckAfterRollbackRequired !== true ||
      deploymentParity?.safety?.runtimeProductionProbesReadOnly !== true ||
      deploymentParity?.safety?.staticProofTreatedAsRuntimeProductionProof === true ||
      deploymentParity?.safety?.productionDataMutatedByCodex === true ||
      deploymentParity?.safety?.productionFixturesCreatedByCodex === true ||
      deploymentParity?.safety?.productionWorkerActivatedByCodex === true
    ) {
      errors.push("Blocker 11 cannot be fixed without current production-safe probe and rollback evidence.");
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
      responseOpsReadiness?.liveSchedulerStatus !== "disabled" ||
      !["operator-controlled-deferred", "ready", "staging-evidenced"].includes(responseOpsReadiness?.backfillReadinessStatus) ||
      !["operator-controlled-deferred", "ready", "staging-evidenced"].includes(responseOpsReadiness?.purgeArchiveReadinessStatus) ||
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
  if (blocker10?.classification === "fixed with automated evidence") {
    if (
      migrationGate?.policyMode !== "release-blocking" ||
      migrationGate?.releaseGateAccepted !== true ||
      migrationGate?.blockerCoverage?.migrationGovernance !== true ||
      migrationGate?.releaseBlockingFindings !== 0 ||
      migrationGate?.safety?.nonMutating !== true ||
      migrationGate?.safety?.requiresDatabase === true ||
      migrationGate?.safety?.mutatesDatabase === true ||
      migrationGate?.safety?.executesDdl === true ||
      migrationGate?.safety?.productionMutationAttempted === true ||
      migrationGate?.safety?.schemaChangedByCodex === true ||
      migrationGate?.safety?.adHocDdlAdded === true
    ) {
      errors.push("Blocker 10 cannot be fixed without accepted non-mutating release-blocking migration gate evidence.");
    }
  }
  if (blocker10?.classification === "waived with explicit reason") {
    if (
      migrationGate?.policyMode !== "waived" ||
      migrationGate?.releaseGateAccepted !== true ||
      migrationGate?.blockerCoverage?.migrationGovernance !== true ||
      migrationGate?.formalWaiver?.accepted !== true ||
      !migrationGate?.formalWaiver?.reason ||
      migrationGate?.releaseBlockingFindings !== 0 ||
      migrationGate?.safety?.nonMutating !== true ||
      migrationGate?.safety?.requiresDatabase === true ||
      migrationGate?.safety?.mutatesDatabase === true ||
      migrationGate?.safety?.executesDdl === true ||
      migrationGate?.safety?.productionMutationAttempted === true ||
      migrationGate?.safety?.schemaChangedByCodex === true ||
      migrationGate?.safety?.adHocDdlAdded === true
    ) {
      errors.push("Blocker 10 cannot be policy-closed without an accepted formal migration gate waiver and non-mutating evidence.");
    }
  }
  if (blocker16?.classification === "fixed with automated evidence") {
    if (
      measuredLoad?.accepted !== true ||
      measuredLoad?.blockerCoverage?.dbPoolPressure !== true ||
      measuredLoad?.dbPool?.configuredMax < 1 ||
      (
        measuredLoad?.dbPool?.observedSignalAvailable !== true &&
        !measuredLoad?.dbPool?.unavailableReason
      ) ||
      measuredLoad?.thresholdMode !== "release-blocking" ||
      measuredLoad?.thresholdStatus !== "passed" ||
      measuredLoad?.safety?.productionDatabaseTargeted === true
    ) {
      errors.push("Blocker 16 cannot be fixed without accepted measured DB pool pressure evidence.");
    }
  }
  if (blocker17?.classification === "fixed with automated evidence") {
    if (
      measuredLoad?.accepted !== true ||
      measuredLoad?.blockerCoverage?.rateLimiterWritePressure !== true ||
      measuredLoad?.rateLimiter?.bounded !== true ||
      measuredLoad?.rateLimiter?.acceptedCount < 1 ||
      measuredLoad?.rateLimiter?.rejectedCount < 1 ||
      measuredLoad?.thresholdMode !== "release-blocking" ||
      measuredLoad?.thresholdStatus !== "passed" ||
      measuredLoad?.safety?.productionDataMutated === true
    ) {
      errors.push("Blocker 17 cannot be fixed without accepted bounded measured rate limiter write-pressure evidence.");
    }
  }
  if (blocker18?.classification === "fixed with automated evidence") {
    if (
      runtimeSize?.accepted !== true ||
      runtimeSize?.blockerCoverage?.acceptedHardGate !== true ||
      !["release-blocking", "hard-gate"].includes(runtimeSize?.policyMode) ||
      runtimeSize?.runtimeEvidence?.hasBlockingFailures === true ||
      runtimeSize?.validation?.ok !== true ||
      runtimeSize?.safety?.nonMutating !== true ||
      runtimeSize?.safety?.dependencyVersionsChanged === true ||
      runtimeSize?.safety?.buildChunkingChanged === true ||
      runtimeSize?.safety?.buildBehaviorChanged === true ||
      runtimeSize?.safety?.pdfOcrBehaviorChanged === true
    ) {
      errors.push("Blocker 18 cannot be fixed by gate without accepted non-mutating release-blocking runtime-size policy evidence.");
    }
  }
  if (blocker18?.classification === "waived with explicit reason") {
    if (
      runtimeSize?.accepted !== true ||
      runtimeSize?.blockerCoverage?.acceptedWarningOnlyWaiver !== true ||
      !["warning-only", "waived"].includes(runtimeSize?.policyMode) ||
      runtimeSize?.formalWaiver?.accepted !== true ||
      !runtimeSize?.formalWaiver?.reason ||
      !(runtimeSize?.formalWaiver?.approvedByRole || runtimeSize?.formalWaiver?.ownerRole) ||
      !(runtimeSize?.formalWaiver?.reviewDate || runtimeSize?.formalWaiver?.expiresOn) ||
      !runtimeSize?.formalWaiver?.acceptedRiskStatement ||
      runtimeSize?.safety?.hardGateClaimedWhenWarningOnly === true ||
      runtimeSize?.safety?.dependencyVersionsChanged === true ||
      runtimeSize?.safety?.buildChunkingChanged === true ||
      runtimeSize?.safety?.buildBehaviorChanged === true ||
      runtimeSize?.safety?.pdfOcrBehaviorChanged === true
    ) {
      errors.push("Blocker 18 cannot be waived without accepted warning-only runtime-size waiver evidence.");
    }
  }
  if (blocker20?.classification?.startsWith("fixed with")) {
    if (
      deploymentParity?.current !== true ||
      deploymentParity?.blockerCoverage?.productionSafePrivacyProbeDepth !== true ||
      deploymentParity?.productionSafeProbeEvidence?.accepted !== true ||
      deploymentParity?.stagingOwnerDenialEvidenceReference?.accepted !== true ||
      deploymentParity?.stagingOwnerDenialEvidenceReference?.productionProof === true ||
      deploymentParity?.safety?.runtimeProductionProbesReadOnly !== true ||
      deploymentParity?.safety?.productionFixturesCreatedByCodex === true ||
      deploymentParity?.safety?.productionDataMutatedByCodex === true
    ) {
      errors.push("Blocker 20 cannot be fixed without current staging/local owner-denial evidence and explicit read-only production probe limits.");
    }
  }
  if (blocker21?.classification === "fixed with automated evidence") {
    const commandList = new Set(report.commandList ?? []);
    for (const command of [
      "pnpm run production-scale:evidence",
      "pnpm run production-deployment-parity:evidence",
      "pnpm run production-worker:activation-evidence",
      "pnpm run production-worker:readiness-evidence",
      "pnpm run ingest:worker:staging-evidence",
      "pnpm run response-ops:readiness-evidence",
      "pnpm run response:ops-readiness-evidence",
      "pnpm run alerts:exclusion:validate",
      "pnpm run alerts:dry-run",
      "pnpm run baseline:production-scale-measured -- --local",
      "pnpm run runtime-size:policy-acceptance",
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
    if (report.skippedChecks?.skipCount === null || report.skippedChecks?.treatsSkipAsPass === true) {
      errors.push("Blocker 21 fixed status requires visible dashboard SKIP count and must not treat SKIP as PASS.");
    }
  }
  if (blocker1?.classification === "fixed with human-observed evidence") {
    if (
      humanAcceptance?.accepted !== true ||
      humanAcceptance?.blockerCoverage?.disasterRecoveryRestoreDrill !== true ||
      humanAcceptance?.validation?.simulatedOnlySubmission === true ||
      restoreReadiness?.currentOperationalProof !== true ||
      restoreReadiness?.blockerCoverage?.disasterRecoveryRestoreDrill !== true ||
      restoreReadiness?.evidenceType !== "HUMAN-OBSERVED" ||
      restoreReadiness?.simulatedOnly === true ||
      restoreReadiness?.stale === true
    ) {
      errors.push("Blocker 1 cannot be classified fixed without current accepted non-simulated human restore evidence.");
    }
  }
  if (blocker22?.classification === "fixed with human-observed evidence") {
    if (
      humanAcceptance?.accepted !== true ||
      humanAcceptance?.blockerCoverage?.retentionArchiveRestore !== true ||
      humanAcceptance?.validation?.simulatedOnlySubmission === true ||
      restoreReadiness?.currentOperationalProof !== true ||
      restoreReadiness?.blockerCoverage?.retentionArchiveRestore !== true ||
      restoreReadiness?.evidenceType !== "HUMAN-OBSERVED" ||
      restoreReadiness?.simulatedOnly === true ||
      restoreReadiness?.stale === true
    ) {
      errors.push("Blocker 22 cannot be classified fixed without current accepted non-simulated human retention recoverability evidence.");
    }
  }
  if (restoreReadiness?.currentOperationalProof === true) {
    if (
      restoreReadiness?.stale === true ||
      restoreReadiness?.simulatedOnly === true ||
      restoreReadiness?.evidenceType !== "HUMAN-OBSERVED" ||
      restoreReadiness?.safety?.runsDump === true ||
      restoreReadiness?.safety?.runsRestore === true ||
      restoreReadiness?.safety?.accessesProductionBackups === true ||
      restoreReadiness?.safety?.modifiesProduction === true ||
      restoreReadiness?.safety?.acceptsSimulatedEvidenceAsProductionProof === true
    ) {
      errors.push("Restore readiness current proof is unsafe or not human-observed.");
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
    "- Measured load evidence must be local or staging-safe, threshold-passing, synthetic, and zero-provider-call only.",
    "- Staging ingest worker queue-drain evidence is staging proof only and does not activate production.",
    "- Migration governance requires a non-mutating accepted gate policy or a formal waiver with reason.",
    "- Runtime-size closure requires accepted hard-gate policy evidence or an accepted warning-only formal waiver.",
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
    "## Restore Evidence Current Readiness",
    "",
    `- Status: ${report.restoreReadinessCheck.status}`,
    `- Current operational proof: ${report.restoreReadinessCheck.currentOperationalProof ? "yes" : "no"}`,
    `- Evidence type: ${report.restoreReadinessCheck.evidenceType}`,
    `- Human-observed: ${report.restoreReadinessCheck.humanObserved ? "yes" : "no"}`,
    `- SIMULATED-only: ${report.restoreReadinessCheck.simulatedOnly ? "yes" : "no"}`,
    `- Stale: ${report.restoreReadinessCheck.stale ? "yes" : "no"}`,
    `- Restore date/time: ${report.restoreReadinessCheck.restoreDateTime ?? "not available"}`,
    `- Evidence age days: ${report.restoreReadinessCheck.ageDays ?? "not available"}`,
    `- Blocker 1 current coverage: ${
      report.restoreReadinessCheck.blockerCoverage?.disasterRecoveryRestoreDrill ? "accepted" : "not accepted"
    }`,
    `- Missing fields: ${
      report.restoreReadinessCheck.requiredFields?.missing?.length
        ? report.restoreReadinessCheck.requiredFields.missing.join(", ")
        : "none"
    }`,
    "",
    "## Production Deployment Parity Evidence",
    "",
    `- Status: ${report.productionDeploymentParityEvidence.status}`,
    `- Current: ${report.productionDeploymentParityEvidence.current ? "yes" : "no"}`,
    `- Production proof: ${report.productionDeploymentParityEvidence.productionProof ? "yes" : "no"}`,
    `- Production-safe probe evidence accepted: ${
      report.productionDeploymentParityEvidence.productionSafeProbeEvidence?.accepted ? "yes" : "no"
    }`,
    `- Staging/local owner-denial evidence accepted: ${
      report.productionDeploymentParityEvidence.stagingOwnerDenialEvidenceReference?.accepted ? "yes" : "no"
    }`,
    `- Runtime production probes executed by this command: ${
      report.productionDeploymentParityEvidence.runtimeProductionProbesExecutedByThisCommand ? "yes" : "no"
    }`,
    `- Runtime production probes read-only: ${
      report.productionDeploymentParityEvidence.safety?.runtimeProductionProbesReadOnly ? "yes" : "no"
    }`,
    `- Rollback SHA input required: ${
      report.productionDeploymentParityEvidence.rollbackEvidence?.rollbackShaInputRequired ? "yes" : "no"
    }`,
    `- Health check after rollback required: ${
      report.productionDeploymentParityEvidence.rollbackEvidence?.healthCheckAfterRollbackRequired ? "yes" : "no"
    }`,
    `- Blocker 11 coverage: ${
      report.productionDeploymentParityEvidence.blockerCoverage?.productionDeploymentParity ? "accepted" : "not accepted"
    }`,
    `- Blocker 20 coverage: ${
      report.productionDeploymentParityEvidence.blockerCoverage?.productionSafePrivacyProbeDepth ? "accepted" : "not accepted"
    }`,
    "- Static POST and retired-route proof is not runtime production proof.",
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
    "## Production Worker Activation Evidence",
    "",
    `- Status: ${report.productionWorkerActivationEvidence.status}`,
    `- Production worker default-off: ${report.productionWorkerActivationEvidence.productionWorkerDefaultOff ? "yes" : "no"}`,
    `- Production activation deferred: ${report.productionWorkerActivationEvidence.productionActivationDeferred ? "yes" : "no"}`,
    `- Explicit activation inputs required: ${
      report.productionWorkerActivationEvidence.explicitActivationInputsRequired ? "yes" : "no"
    }`,
    `- Staging worker evidence detected: ${
      report.productionWorkerActivationEvidence.stagingWorkerEvidence?.accepted ? "yes" : "no"
    }`,
    `- Dry-run mutates queue: ${report.productionWorkerActivationEvidence.dryRun?.mutatesQueue ? "yes" : "no"}`,
    `- Future queue depth before/after: ${
      report.productionWorkerActivationEvidence.futureOperatorRunFields?.queueDepthBefore ?? "required"
    }/${report.productionWorkerActivationEvidence.futureOperatorRunFields?.queueDepthAfter ?? "required"}`,
    "- This activation evidence does not close blocker 2 without accepted production queue-depth evidence.",
    "",
    "## Staging Ingest Worker Evidence",
    "",
    `- Status: ${report.stagingIngestWorkerEvidence.status}`,
    `- Accepted staging queue drain: ${report.stagingIngestWorkerEvidence.accepted ? "yes" : "no"}`,
    `- Production proof: ${report.stagingIngestWorkerEvidence.productionProof ? "yes" : "no"}`,
    `- Queue depth before/after: ${report.stagingIngestWorkerEvidence.queueDepthBeforeRun ?? "n/a"}/${report.stagingIngestWorkerEvidence.queueDepthAfterRun ?? "n/a"}`,
    `- Processed/failed/dead-lettered: ${report.stagingIngestWorkerEvidence.processedCount ?? "n/a"}/${report.stagingIngestWorkerEvidence.failedCount ?? "n/a"}/${report.stagingIngestWorkerEvidence.deadLetterCount ?? "n/a"}`,
    `- Blocker 2 staging queue drain: ${
      report.stagingIngestWorkerEvidence.blockerCoverage?.blocker2StagingQueueDrain ? "accepted" : "not accepted"
    }`,
    `- Blocker 2 production runtime: ${
      report.stagingIngestWorkerEvidence.blockerCoverage?.blocker2ProductionRuntime ? "accepted" : "not accepted"
    }`,
    "- Production worker activation remains deferred.",
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
    "## Measured Load Evidence Acceptance",
    "",
    `- Status: ${report.measuredLoadEvidenceAcceptance.status}`,
    `- Accepted: ${report.measuredLoadEvidenceAcceptance.accepted ? "yes" : "no"}`,
    `- Evidence path: \`${report.measuredLoadEvidenceAcceptance.evidencePath ?? "not submitted"}\``,
    `- Evidence type: ${report.measuredLoadEvidenceAcceptance.evidenceType ?? "not submitted"}`,
    `- Threshold mode: ${report.measuredLoadEvidenceAcceptance.thresholdMode ?? "unknown"}`,
    `- Threshold status: ${report.measuredLoadEvidenceAcceptance.thresholdStatus ?? "unknown"}`,
    `- Request count: ${report.measuredLoadEvidenceAcceptance.summary?.requestCount ?? "unknown"}`,
    `- Latency p50/p95/max ms: ${
      report.measuredLoadEvidenceAcceptance.summary?.latency
        ? `${report.measuredLoadEvidenceAcceptance.summary.latency.p50Ms}/${report.measuredLoadEvidenceAcceptance.summary.latency.p95Ms}/${report.measuredLoadEvidenceAcceptance.summary.latency.maxMs}`
        : "unknown"
    }`,
    `- DB pool configured max: ${report.measuredLoadEvidenceAcceptance.dbPool?.configuredMax ?? "unknown"}`,
    `- DB pool observed signal: ${
      report.measuredLoadEvidenceAcceptance.dbPool?.observedSignalAvailable ? "available" : "unavailable"
    }`,
    `- Rate limiter accepted/rejected: ${
      report.measuredLoadEvidenceAcceptance.rateLimiter
        ? `${report.measuredLoadEvidenceAcceptance.rateLimiter.acceptedCount}/${report.measuredLoadEvidenceAcceptance.rateLimiter.rejectedCount}`
        : "unknown"
    }`,
    `- Packet PDF cache hit/miss: ${
      report.measuredLoadEvidenceAcceptance.packetPdfCache
        ? `${report.measuredLoadEvidenceAcceptance.packetPdfCache.cacheHitCount}/${report.measuredLoadEvidenceAcceptance.packetPdfCache.cacheMissCount}`
        : "unknown"
    }`,
    `- External provider calls made: ${report.measuredLoadEvidenceAcceptance.safety?.externalProviderCallsMade ?? "unknown"}`,
    `- Blocker 3 coverage: ${
      report.measuredLoadEvidenceAcceptance.blockerCoverage?.loadConcurrency ? "accepted" : "not accepted"
    }`,
    `- Blocker 16 coverage: ${
      report.measuredLoadEvidenceAcceptance.blockerCoverage?.dbPoolPressure ? "accepted" : "not accepted"
    }`,
    `- Blocker 17 coverage: ${
      report.measuredLoadEvidenceAcceptance.blockerCoverage?.rateLimiterWritePressure ? "accepted" : "not accepted"
    }`,
    "",
    "## Runtime Size Policy Acceptance",
    "",
    `- Status: ${report.runtimeSizePolicyAcceptance.status}`,
    `- Accepted: ${report.runtimeSizePolicyAcceptance.accepted ? "yes" : "no"}`,
    `- Acceptance kind: ${report.runtimeSizePolicyAcceptance.acceptanceKind ?? "unknown"}`,
    `- Policy mode: ${report.runtimeSizePolicyAcceptance.policyMode ?? "unknown"}`,
    `- Policy path: \`${report.runtimeSizePolicyAcceptance.policyPath ?? "not submitted"}\``,
    `- Evidence path: \`${report.runtimeSizePolicyAcceptance.evidencePath ?? "not submitted"}\``,
    `- Runtime overall status: ${report.runtimeSizePolicyAcceptance.runtimeEvidence?.overallStatus ?? "unknown"}`,
    `- Runtime blocking failures: ${
      report.runtimeSizePolicyAcceptance.runtimeEvidence?.hasBlockingFailures ? "yes" : "no"
    }`,
    `- WARN rows governed: ${
      report.runtimeSizePolicyAcceptance.warningRows?.filter((row) => row.accepted).length ?? 0
    }/${report.runtimeSizePolicyAcceptance.warningRows?.length ?? 0}`,
    `- WAIVED rows with reasons: ${
      report.runtimeSizePolicyAcceptance.waivedRows?.filter((row) => row.accepted).length ?? 0
    }/${report.runtimeSizePolicyAcceptance.waivedRows?.length ?? 0}`,
    `- Formal waiver accepted: ${report.runtimeSizePolicyAcceptance.formalWaiver?.accepted ? "yes" : "no"}`,
    `- Blocker 18 hard-gate coverage: ${
      report.runtimeSizePolicyAcceptance.blockerCoverage?.acceptedHardGate ? "accepted" : "not accepted"
    }`,
    `- Blocker 18 warning-only waiver coverage: ${
      report.runtimeSizePolicyAcceptance.blockerCoverage?.acceptedWarningOnlyWaiver ? "accepted" : "not accepted"
    }`,
    `- Dependency versions changed: ${
      report.runtimeSizePolicyAcceptance.safety?.dependencyVersionsChanged ? "yes" : "no"
    }`,
    `- Build chunking changed: ${report.runtimeSizePolicyAcceptance.safety?.buildChunkingChanged ? "yes" : "no"}`,
    `- PDF/OCR behavior changed: ${report.runtimeSizePolicyAcceptance.safety?.pdfOcrBehaviorChanged ? "yes" : "no"}`,
    "",
    "## Migration Gate Evidence",
    "",
    `- Status: ${report.migrationGateEvidence.status}`,
    `- Policy mode: ${report.migrationGateEvidence.policyMode}`,
    `- Release gate accepted: ${report.migrationGateEvidence.releaseGateAccepted ? "yes" : "no"}`,
    `- Runtime ensure residual impact: ${report.migrationGateEvidence.runtimeEnsureResidualImpact}`,
    `- Release-blocking findings: ${report.migrationGateEvidence.releaseBlockingFindings}`,
    `- Formal waiver accepted: ${report.migrationGateEvidence.formalWaiver?.accepted ? "yes" : "no"}`,
    `- Formal waiver reason: ${report.migrationGateEvidence.formalWaiver?.reason ?? "n/a"}`,
    `- Blocker 10 coverage: ${
      report.migrationGateEvidence.blockerCoverage?.migrationGovernance ? "accepted" : "not accepted"
    }`,
    `- Gate mutates DB: ${report.migrationGateEvidence.safety?.mutatesDatabase ? "yes" : "no"}`,
    `- Gate executes DDL: ${report.migrationGateEvidence.safety?.executesDdl ? "yes" : "no"}`,
    "",
    "## Response Ops Readiness Evidence",
    "",
    `- Status: ${report.responseOpsReadinessEvidence.status}`,
    `- Live scheduler status: ${report.responseOpsReadinessEvidence.liveSchedulerStatus}`,
    `- Backfill readiness status: ${report.responseOpsReadinessEvidence.backfillReadinessStatus}`,
    `- Purge/archive readiness status: ${report.responseOpsReadinessEvidence.purgeArchiveReadinessStatus}`,
    `- Response soak status: ${report.responseOpsReadinessEvidence.responseSoakStatus}`,
    `- Dashboard status/SKIP count: ${report.responseOpsReadinessEvidence.dashboardStatus}/${report.responseOpsReadinessEvidence.dashboardSkipCount ?? "unknown"}`,
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
