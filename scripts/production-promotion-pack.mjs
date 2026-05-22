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
  buildProductionWorkerRuntimeProofReport,
  DEFAULT_PRODUCTION_WORKER_RUNTIME_PROOF_SUBMISSION_JSON_PATH,
  PRODUCTION_WORKER_RUNTIME_PROOF_JSON_PATH,
  PRODUCTION_WORKER_RUNTIME_PROOF_MD_PATH,
  PRODUCTION_WORKER_RUNTIME_PROOF_TEMPLATE_JSON_PATH,
  PRODUCTION_WORKER_RUNTIME_PROOF_TEMPLATE_MD_PATH,
} from "./production-worker-runtime-proof.mjs";

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
  ALERTING_ACCEPTANCE_JSON_PATH,
  ALERTING_ACCEPTANCE_MD_PATH,
  ALERTING_EXCLUSION_TEMPLATE_JSON_PATH,
  ALERTING_EXCLUSION_TEMPLATE_MD_PATH,
  ALERTING_EXCLUSION_VALIDATION_JSON_PATH,
  ALERTING_EXCLUSION_VALIDATION_MD_PATH,
  ALERTING_LIVE_PROOF_TEMPLATE_JSON_PATH,
  ALERTING_LIVE_PROOF_TEMPLATE_MD_PATH,
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
  RAW_REPORT_REMEDIATION_ACCEPTANCE_TEMPLATE_JSON_PATH,
  RAW_REPORT_REMEDIATION_ACCEPTANCE_TEMPLATE_MD_PATH,
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
  buildRestoreEvidenceAcceptanceReport,
  DEFAULT_RESTORE_EVIDENCE_SUBMISSION_JSON_PATH,
  RESTORE_EVIDENCE_ACCEPTANCE_JSON_PATH,
  RESTORE_EVIDENCE_ACCEPTANCE_MD_PATH,
  RESTORE_EVIDENCE_TEMPLATE_JSON_PATH,
  RESTORE_EVIDENCE_TEMPLATE_MD_PATH,
} from "./restore-evidence-acceptance.mjs";

import {
  RESTORE_MACHINE_PROOF_CONFIG,
  RESTORE_MACHINE_PROOF_JSON_PATH,
  RESTORE_MACHINE_PROOF_MD_PATH,
  restoreMachineProofExtraValidation,
} from "./restore-machine-proof.mjs";

import {
  PRODUCTION_WORKER_MACHINE_PROOF_CONFIG,
  PRODUCTION_WORKER_MACHINE_PROOF_JSON_PATH,
  PRODUCTION_WORKER_MACHINE_PROOF_MD_PATH,
  productionWorkerMachineProofExtraValidation,
} from "./production-worker-machine-proof.mjs";

import {
  RAW_REPORT_MACHINE_PROOF_CONFIG,
  RAW_REPORT_MACHINE_PROOF_JSON_PATH,
  RAW_REPORT_MACHINE_PROOF_MD_PATH,
} from "./storage-raw-report-machine-remediation-proof.mjs";

import {
  RAW_REPORT_MACHINE_INVENTORY_JSON_PATH,
  RAW_REPORT_MACHINE_INVENTORY_MD_PATH,
} from "./storage-raw-report-machine-inventory.mjs";

import {
  ALERTING_MACHINE_PROOF_CONFIG,
  ALERTING_MACHINE_PROOF_JSON_PATH,
  ALERTING_MACHINE_PROOF_MD_PATH,
} from "./alerting-machine-proof.mjs";

import {
  MIGRATION_MACHINE_PROOF_CONFIG,
  MIGRATION_MACHINE_PROOF_JSON_PATH,
  MIGRATION_MACHINE_PROOF_MD_PATH,
  buildMigrationMachineProofReport,
} from "./migration-machine-proof.mjs";

import {
  RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG,
  RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_JSON_PATH,
  RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_MD_PATH,
} from "./retention-archive-restore-machine-proof.mjs";

import { validateMachineProofForConfig } from "./lib/machineProofScript.mjs";
import { MACHINE_PROOF_BLOCKER_REQUIREMENTS as POLICY_MACHINE_PROOF_BLOCKER_REQUIREMENTS } from "./lib/productionMachineProofPolicy.mjs";

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
export const PR_GUARDRAILS_EVIDENCE_MD_PATH =
  "docs/production-scale/evidence/latest-pr-guardrails.md";
export const PR_GUARDRAILS_EVIDENCE_JSON_PATH =
  "docs/production-scale/evidence/latest-pr-guardrails.json";
export const STORAGE_DURABILITY_EVIDENCE_JSON_PATH =
  "docs/production-scale/evidence/latest-storage-durability.json";
export const STORAGE_DURABILITY_EVIDENCE_MD_PATH =
  "docs/production-scale/evidence/latest-storage-durability.md";
export const EVIDENCE_LEDGER_EVIDENCE_JSON_PATH =
  "docs/production-scale/evidence/latest-evidence-ledger.json";
export const EVIDENCE_LEDGER_EVIDENCE_MD_PATH =
  "docs/production-scale/evidence/latest-evidence-ledger.md";
export const DEPLOY_ROLLBACK_SIMULATION_JSON_PATH =
  "docs/production-scale/evidence/latest-deploy-rollback-simulation.json";
export const DEPLOY_ROLLBACK_SIMULATION_MD_PATH =
  "docs/production-scale/evidence/latest-deploy-rollback-simulation.md";

export const REQUIRED_CERTIFICATION_CHECKS = [
  {
    key: "queueLiveness",
    label: "Queue liveness",
    command: "pnpm run production-worker:readiness-evidence",
    jsonPath: PRODUCTION_WORKER_READINESS_JSON_PATH,
  },
  {
    key: "storageDurability",
    label: "Storage durability",
    command: "pnpm run storage:durability-contract",
    jsonPath: STORAGE_DURABILITY_EVIDENCE_JSON_PATH,
  },
  {
    key: "evidenceLedger",
    label: "Evidence ledger",
    command: "pnpm run production-scale:evidence",
    jsonPath: EVIDENCE_LEDGER_EVIDENCE_JSON_PATH,
  },
  {
    key: "migrationGovernance",
    label: "Migration governance",
    command: "pnpm run migrations:gate",
    jsonPath: MIGRATION_GATE_JSON_PATH,
  },
  {
    key: "rollbackSimulation",
    label: "Rollback simulation",
    command: "pnpm run deploy:rollback-simulation",
    jsonPath: DEPLOY_ROLLBACK_SIMULATION_JSON_PATH,
  },
  {
    key: "restoreMachineProof",
    label: "Disaster recovery restore machine proof",
    command: "pnpm run restore:machine-proof",
    jsonPath: RESTORE_MACHINE_PROOF_JSON_PATH,
  },
  {
    key: "productionWorkerMachineProof",
    label: "Production worker runtime machine proof",
    command: "pnpm run production-worker:machine-proof",
    jsonPath: PRODUCTION_WORKER_MACHINE_PROOF_JSON_PATH,
  },
  {
    key: "rawReportMachineProof",
    label: "Raw report byte remediation machine proof",
    command: "pnpm run storage:raw-report-machine-remediation-proof",
    jsonPath: RAW_REPORT_MACHINE_PROOF_JSON_PATH,
  },
  {
    key: "alertingMachineProof",
    label: "Alerting observability machine proof",
    command: "pnpm run alerting:machine-proof",
    jsonPath: ALERTING_MACHINE_PROOF_JSON_PATH,
  },
  {
    key: "migrationMachineProof",
    label: "Migration governance machine proof",
    command: "pnpm run migrations:machine-proof",
    jsonPath: MIGRATION_MACHINE_PROOF_JSON_PATH,
  },
  {
    key: "retentionArchiveRestoreMachineProof",
    label: "Retention archive restore machine proof",
    command: "pnpm run retention:archive-restore-machine-proof",
    jsonPath: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_JSON_PATH,
  },
];

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
  "pnpm run production-worker:runtime-proof",
  "pnpm run production-worker:machine-proof",
  "pnpm run production-worker:readiness-evidence",
  "pnpm run ingest:worker:staging-evidence",
  "pnpm run pr-guardrails:evidence",
  "pnpm run storage:raw-report-remediation-plan",
  "pnpm run storage:raw-report-remediation-acceptance",
  "pnpm run storage:raw-report-machine-inventory",
  "pnpm run storage:raw-report-machine-remediation-proof",
  "pnpm run storage:durability-contract",
  "pnpm run check:migrations",
  "pnpm run migrations:gate",
  "pnpm run migrations:machine-proof",
  "pnpm run deploy:rollback-simulation",
  "pnpm run restore:machine-proof",
  "pnpm run alerting:machine-proof",
  "pnpm run retention:archive-restore-machine-proof",
  "pnpm run report:runtime-size",
  "pnpm run runtime-size:policy-acceptance",
  "git diff --check",
];

export const OPTIONAL_EVIDENCE_COMMANDS = [
  "pnpm run production-scale:evidence",
  "pnpm run restore:drill:simulated",
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
  "pnpm run production-worker:runtime-proof",
  "pnpm run production-worker:machine-proof",
  "pnpm run production-worker:readiness-evidence",
  "pnpm run migrations:evidence",
  "pnpm run production-safe-probes:evidence",
  "pnpm run staging-owner-denial-smoke:evidence",
  "pnpm run sensitive-list-endpoints:evidence",
  "pnpm run storage:raw-report-machine-inventory",
  "pnpm run storage:raw-report-machine-remediation-proof",
  "pnpm run restore:machine-proof",
  "pnpm run alerting:machine-proof",
  "pnpm run migrations:machine-proof",
  "pnpm run retention:archive-restore-machine-proof",
  "pnpm run check:runtime-size",
  "pnpm run runtime-size:policy-acceptance",
];

const LEGACY_HUMAN_PROOF_COMMANDS = new Set([
  "pnpm run check:restore-drill-evidence",
  "pnpm run restore:accept-human-evidence",
  "pnpm run restore:evidence:acceptance",
  "pnpm run restore:evidence:current-check",
]);

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
  "pnpm run restore:evidence:acceptance": [
    RESTORE_EVIDENCE_ACCEPTANCE_MD_PATH,
    RESTORE_EVIDENCE_ACCEPTANCE_JSON_PATH,
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
    ALERTING_ACCEPTANCE_MD_PATH,
    ALERTING_ACCEPTANCE_JSON_PATH,
  ],
  "pnpm run response:ops-readiness-evidence": [
    RESPONSE_OPS_READINESS_MD_PATH,
    RESPONSE_OPS_READINESS_JSON_PATH,
    ALERTING_ACCEPTANCE_MD_PATH,
    ALERTING_ACCEPTANCE_JSON_PATH,
  ],
  "pnpm run response-ops:readiness-evidence": [
    RESPONSE_OPS_READINESS_MD_PATH,
    RESPONSE_OPS_READINESS_JSON_PATH,
    ALERTING_ACCEPTANCE_MD_PATH,
    ALERTING_ACCEPTANCE_JSON_PATH,
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
  "pnpm run storage:durability-contract": [
    STORAGE_DURABILITY_EVIDENCE_MD_PATH,
    STORAGE_DURABILITY_EVIDENCE_JSON_PATH,
  ],
  "pnpm run deploy:rollback-simulation": [
    DEPLOY_ROLLBACK_SIMULATION_MD_PATH,
    DEPLOY_ROLLBACK_SIMULATION_JSON_PATH,
  ],
  "pnpm run production-worker:activation-plan": [
    "docs/production-scale/evidence/latest-production-worker-activation-plan.md",
    "docs/production-scale/evidence/latest-production-worker-activation-plan.json",
  ],
  "pnpm run production-worker:activation-evidence": [
    PRODUCTION_WORKER_ACTIVATION_EVIDENCE_MD_PATH,
    PRODUCTION_WORKER_ACTIVATION_EVIDENCE_JSON_PATH,
  ],
  "pnpm run production-worker:runtime-proof": [
    PRODUCTION_WORKER_RUNTIME_PROOF_MD_PATH,
    PRODUCTION_WORKER_RUNTIME_PROOF_JSON_PATH,
  ],
  "pnpm run production-worker:machine-proof": [
    PRODUCTION_WORKER_MACHINE_PROOF_MD_PATH,
    PRODUCTION_WORKER_MACHINE_PROOF_JSON_PATH,
  ],
  "pnpm run production-worker:readiness-evidence": [
    PRODUCTION_WORKER_READINESS_MD_PATH,
    PRODUCTION_WORKER_READINESS_JSON_PATH,
  ],
  "pnpm run pr-guardrails:evidence": [
    PR_GUARDRAILS_EVIDENCE_MD_PATH,
    PR_GUARDRAILS_EVIDENCE_JSON_PATH,
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
  "pnpm run migrations:machine-proof": [
    MIGRATION_MACHINE_PROOF_MD_PATH,
    MIGRATION_MACHINE_PROOF_JSON_PATH,
  ],
  "pnpm run restore:machine-proof": [
    RESTORE_MACHINE_PROOF_MD_PATH,
    RESTORE_MACHINE_PROOF_JSON_PATH,
  ],
  "pnpm run alerting:machine-proof": [
    ALERTING_MACHINE_PROOF_MD_PATH,
    ALERTING_MACHINE_PROOF_JSON_PATH,
  ],
  "pnpm run storage:raw-report-machine-inventory": [
    RAW_REPORT_MACHINE_INVENTORY_MD_PATH,
    RAW_REPORT_MACHINE_INVENTORY_JSON_PATH,
  ],
  "pnpm run storage:raw-report-machine-remediation-proof": [
    RAW_REPORT_MACHINE_PROOF_MD_PATH,
    RAW_REPORT_MACHINE_PROOF_JSON_PATH,
  ],
  "pnpm run retention:archive-restore-machine-proof": [
    RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_MD_PATH,
    RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_JSON_PATH,
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
  "simulated proof only",
  "machine proof required",
  "waived with explicit reason",
  "partial",
  "open",
]);

const MACHINE_PROOF_BLOCKER_REQUIREMENTS = POLICY_MACHINE_PROOF_BLOCKER_REQUIREMENTS;

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

function machineProofSummary(key, label, config, evidence, extraValidation = () => [], now = new Date().toISOString()) {
  if (!evidence) {
    return {
      key,
      label,
      evidenceType: config.evidenceType,
      evidencePath: config.jsonPath,
      generatedAt: null,
      commitHash: null,
      status: "missing",
      certifying: false,
      accepted: false,
      humanInteractionRequired: false,
      missingRuntimeInputs: Array.isArray(config.runtimeInputs)
        ? config.runtimeInputs
        : config.attestationEnv
          ? [config.attestationEnv]
          : [],
      validation: {
        ok: false,
        errors: [`Machine evidence file is missing: ${config.jsonPath}`],
        sensitiveFindingCount: 0,
      },
      metadata: {},
    };
  }

  const validation = validateMachineProofForConfig(config, evidence, { now });
  const extraErrors = extraValidation(evidence);
  const errors = [...validation.errors, ...extraErrors];
  const ok = validation.ok && extraErrors.length === 0;

  return {
    key,
    label,
    evidenceType: evidence.evidenceType ?? config.evidenceType,
    evidencePath: config.jsonPath,
    generatedAt: evidence.generatedAt ?? null,
    commitHash: evidence.commitHash ?? evidence.currentCommitHash ?? evidence.currentHead ?? evidence.commit ?? null,
    status: evidence.status ?? "unknown",
    certifying: evidence.certifying === true && evidence.CERTIFYING === true,
    accepted: ok,
    humanInteractionRequired: evidence.humanInteractionRequired === true,
    missingRuntimeInputs: Array.isArray(evidence.missingRuntimeInputs) ? evidence.missingRuntimeInputs : [],
    validation: {
      ok,
      errors,
      sensitiveFindingCount: validation.sensitiveFindings?.length ?? 0,
      stale: validation.stale === true,
    },
    metadata: {
      blockerIdsClosedWhenCertifying: evidence.metadata?.blockerIdsClosedWhenCertifying ?? [],
      acceptedCheckSet: evidence.metadata?.acceptedCheckSet ?? null,
      alertingProofPath: evidence.metadata?.alertingProofPath ?? evidence.metadata?.alertingPath ?? null,
      databaseReliable: evidence.metadata?.databaseReliable === true,
      sanitizedInventoryAccepted: evidence.metadata?.sanitizedInventoryAccepted === true,
      temporaryAllowlistActive: evidence.metadata?.temporaryAllowlistActive === true,
      releaseBlockingFindingCount: evidence.metadata?.releaseBlockingFindingCount ?? null,
    },
  };
}

function hasPassingCheck(evidence, checkName) {
  return Array.isArray(evidence?.checks) &&
    evidence.checks.some((check) => check?.name === checkName && check?.status === "pass");
}

function rawReportMachineProofExtraValidation(evidence) {
  const errors = [];
  if (evidence?.metadata?.databaseReliable !== true && !hasPassingCheck(evidence, "db-connectivity-reliable")) {
    errors.push("raw report machine proof requires reliable database connectivity.");
  }
  if (evidence?.metadata?.sanitizedInventoryAccepted !== true && !hasPassingCheck(evidence, "sanitized-inventory-accepted")) {
    errors.push("raw report machine proof requires accepted sanitized inventory.");
  }
  return errors;
}

function alertingMachineProofExtraValidation(evidence) {
  const errors = [];
  const acceptedSet = evidence?.metadata?.acceptedCheckSet;
  const alertingPath = evidence?.metadata?.alertingProofPath ?? evidence?.metadata?.alertingPath;
  if (
    acceptedSet === "certifying-formal-exclusion" ||
    alertingPath === "certifying-formal-exclusion" ||
    alertingPath === "formal-exclusion"
  ) {
    if (evidence?.metadata?.policyAllowsCertificationUnderExclusion !== true) {
      errors.push("formal alerting exclusion requires explicit repo policy allowing certification under exclusion.");
    }
    if (!hasPassingCheck(evidence, "exclusion-does-not-overclaim-production-pass")) {
      errors.push("formal alerting exclusion must state it does not overclaim production-at-scale PASS.");
    }
    return errors;
  }

  if (acceptedSet !== "live-alert-delivery" && alertingPath !== "live-alert") {
    errors.push("alerting machine proof must be live-alert delivery or a certifying formal exclusion.");
  }
  return errors;
}

function machineRuntimeInputsForBlocker(number, machineProofs = {}) {
  const proofByBlocker = {
    1: machineProofs.restore,
    2: machineProofs.productionWorker,
    6: machineProofs.rawReport,
    9: machineProofs.alerting,
    10: machineProofs.migration,
    22: machineProofs.retentionArchiveRestore,
  };
  return proofByBlocker[number]?.missingRuntimeInputs ?? [];
}

function classifyBlocker(
  blocker,
  humanRestoreEvidenceAcceptance = null,
  restoreReadinessCheck = null,
  restoreEvidenceAcceptance = null,
  productionDeploymentParityEvidence = null,
  productionWorkerReadinessEvidence = null,
  stagingIngestWorkerEvidence = null,
  rawReportRemediationAcceptance = null,
  responseOpsReadinessEvidence = null,
  migrationGateEvidence = null,
  measuredLoadEvidenceAcceptance = null,
  runtimeSizePolicyAcceptance = null,
  machineProofs = {},
) {
  if (blocker.number === 1 && machineProofs.restore?.accepted === true) {
    return "fixed with automated evidence";
  }
  if (blocker.number === 2 && machineProofs.productionWorker?.accepted === true) {
    return "fixed with automated evidence";
  }
  if (blocker.number === 6 && machineProofs.rawReport?.accepted === true) {
    return "fixed with automated evidence";
  }
  if (blocker.number === 9 && machineProofs.alerting?.accepted === true) {
    return "fixed with automated evidence";
  }
  if (blocker.number === 10 && machineProofs.migration?.accepted === true) {
    return "fixed with automated evidence";
  }
  if (blocker.number === 22 && machineProofs.retentionArchiveRestore?.accepted === true) {
    return "fixed with automated evidence";
  }
  if (MACHINE_PROOF_BLOCKER_REQUIREMENTS[blocker.number]) {
    return "machine proof required";
  }
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
    return "machine proof required";
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
    restoreEvidenceAcceptance?.accepted === true &&
    restoreEvidenceAcceptance?.productionProof === true &&
    restoreEvidenceAcceptance?.currentOperationalProof === true &&
    restoreEvidenceAcceptance?.blockerCoverage?.disasterRecoveryRestoreDrill === true
  ) {
    return "machine proof required";
  }
  if (
    blocker.number === 6 &&
    rawReportRemediationAcceptance?.accepted === true &&
    rawReportRemediationAcceptance?.productionProof === true &&
    rawReportRemediationAcceptance?.blockerCoverage?.historicalRawReportBytes === true
  ) {
    return "machine proof required";
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
    return "machine proof required";
  }
  if (
    blocker.number === 10 &&
    migrationGateEvidence?.blockerCoverage?.migrationGovernance === true &&
    migrationGateEvidence?.policyMode === "release-blocking" &&
    migrationGateEvidence?.releaseGateAccepted === true &&
    migrationGateEvidence?.CERTIFYING === true
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
    restoreEvidenceAcceptance?.accepted === true &&
    restoreEvidenceAcceptance?.productionProof === true &&
    restoreEvidenceAcceptance?.currentOperationalProof === true &&
    restoreEvidenceAcceptance?.blockerCoverage?.retentionArchiveRestore === true
  ) {
    return "machine proof required";
  }
  if (blocker.currentStatus === "waived") return "waived with explicit reason";
  if (blocker.currentStatus === "open") return "open";
  if (blocker.currentStatus === "requires-human-proof" || blocker.humanProofRequired === true) {
    return MACHINE_PROOF_BLOCKER_REQUIREMENTS[blocker.number] ? "machine proof required" : "partial";
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
    ...registryCommands.filter((command) =>
      !LEGACY_HUMAN_PROOF_COMMANDS.has(command) &&
      (command.startsWith("pnpm run ") || command === "git diff --check")
    ),
  ]);
  return Array.from(commandSet).map((command) => commandResultSummary(command, rootDir, scripts));
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function evidenceHead(evidence) {
  return firstString(
    evidence?.targetSha,
    evidence?.targetSHA,
    evidence?.targetCommitHash,
    evidence?.targetHead,
    evidence?.currentHead,
    evidence?.currentHEAD,
    evidence?.currentCommitHash,
    evidence?.headSha,
    evidence?.commit,
    evidence?.sha,
  );
}

function evidenceTimestamp(evidence) {
  return firstString(
    evidence?.generatedAt,
    evidence?.completedAt,
    evidence?.timestamp,
    evidence?.createdAt,
  );
}

function evidenceCertifyingFlag(evidence) {
  return evidence?.CERTIFYING === true || evidence?.certifying === true;
}

function evidenceLooksManualOnly(evidence) {
  const markers = [
    evidence?.evidenceType,
    evidence?.proofType,
    evidence?.status,
    evidence?.validation?.evidenceType,
    evidence?.acceptanceKind,
  ].map((value) => String(value ?? "").toLowerCase());
  return markers.some((value) => /human|manual/.test(value)) ||
    evidence?.manualOnly === true ||
    evidence?.manualTestingRequired === true ||
    evidence?.requiresHumanSignoff === true;
}

function evidenceLooksSkipped(evidence) {
  const markers = [
    evidence?.status,
    evidence?.result,
    evidence?.summary?.status,
  ].map((value) => String(value ?? "").toLowerCase());
  return markers.some((value) => /skip|skipped|not-run|not run/.test(value)) ||
    evidence?.skipped === true ||
    evidence?.checksSkipped === true;
}

function evidenceStatusText(evidence) {
  return firstString(
    evidence?.status,
    evidence?.result,
    evidence?.summary?.status,
    evidence?.validation?.status,
  );
}

function isPassedStatusText(value) {
  return ["pass", "passed", "ok", "success"].includes(String(value ?? "").toLowerCase());
}

function checkPassedByKey(key, evidence, targetEnvironment) {
  if (!evidence || evidenceLooksManualOnly(evidence) || evidenceLooksSkipped(evidence)) return false;

  if (
    [
      "restoreMachineProof",
      "productionWorkerMachineProof",
      "rawReportMachineProof",
      "alertingMachineProof",
      "migrationMachineProof",
      "retentionArchiveRestoreMachineProof",
    ].includes(key)
  ) {
    return evidenceCertifyingFlag(evidence) === true && evidenceStatusText(evidence) === "pass";
  }

  if (key === "queueLiveness") {
    return evidenceCertifyingFlag(evidence) === true &&
      (
        evidence.queueLiveness?.status === "passed" ||
        evidence.acceptedProductionRunEvidence?.accepted === true ||
        evidence.blockerCoverage?.productionIngestRuntime === true ||
        evidenceStatusText(evidence) === "passed"
      );
  }

  if (key === "storageDurability") {
    const environmentContract = evidence.contracts?.[targetEnvironment];
    return evidenceCertifyingFlag(evidence) === true &&
      (
        evidenceStatusText(evidence) === "passed" ||
        (
          environmentContract?.status === "passed" &&
          evidence.sentinelSimulation?.status === "passed" &&
          evidence.deployPreflight?.[targetEnvironment]?.status === "passed"
        )
      );
  }

  if (key === "evidenceLedger") {
    return evidenceCertifyingFlag(evidence) === true &&
      (
        evidenceStatusText(evidence) === "passed" ||
        evidence.automatedEvidenceCoverage?.serverComputedHashesVerifyWithHashChainHelper === true ||
        evidence.summary?.appendOnlyHelperAdded === true
      );
  }

  if (key === "migrationGovernance") {
    return evidenceCertifyingFlag(evidence) === true &&
      evidence.productionPromotionGateAccepted === true &&
      evidence.releaseGateAccepted === true &&
      evidence.safety?.nonMutating === true;
  }

  if (key === "rollbackSimulation") {
    return evidenceCertifyingFlag(evidence) === true &&
      isPassedStatusText(evidenceStatusText(evidence));
  }

  return evidenceCertifyingFlag(evidence) === true && isPassedStatusText(evidenceStatusText(evidence));
}

function evidenceForCertificationCheck({ check, rootDir, overrides, defaults }) {
  if (Object.prototype.hasOwnProperty.call(overrides, check.key)) {
    return overrides[check.key];
  }
  if (Object.prototype.hasOwnProperty.call(defaults, check.key)) {
    return defaults[check.key];
  }
  return readJsonIfPresent(rootDir, check.jsonPath);
}

export function buildPromotionCertificationGate({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  targetEnvironment = "production",
  targetSha,
  currentHead,
  certificationEvidence = {},
  defaultEvidence = {},
} = {}) {
  const resolvedTargetSha = targetSha ?? currentHead ?? safeGit(["rev-parse", "HEAD"], rootDir);
  const checks = {};
  const reasons = [];
  const missingRequiredChecks = [];
  const staleChecks = [];
  const nonAutomatedChecks = [];
  const skippedChecks = [];
  const failedChecks = [];

  for (const check of REQUIRED_CERTIFICATION_CHECKS) {
    const evidence = evidenceForCertificationCheck({
      check,
      rootDir,
      overrides: certificationEvidence,
      defaults: defaultEvidence,
    });
    const present = Boolean(evidence);
    const head = present ? evidenceHead(evidence) : null;
    const timestamp = present ? evidenceTimestamp(evidence) : null;
    const headMatchesTarget = present && head === resolvedTargetSha;
    const timestampCurrentForRun = present && timestamp === generatedAt;
    const certifyingFlag = present && evidenceCertifyingFlag(evidence);
    const manualOnly = present && evidenceLooksManualOnly(evidence);
    const skipped = present && evidenceLooksSkipped(evidence);
    const passed = present && checkPassedByKey(check.key, evidence, targetEnvironment);
    const status = present ? evidenceStatusText(evidence) : "missing";
    const checkResult = {
      key: check.key,
      label: check.label,
      command: check.command,
      evidencePath: check.jsonPath,
      present,
      status,
      generatedAt: timestamp,
      evidenceHead: head,
      targetSha: resolvedTargetSha,
      headMatchesTarget,
      timestampCurrentForRun,
      certifyingFlag,
      manualOnly,
      skipped,
      passed,
      CERTIFYING: present && passed && headMatchesTarget && timestampCurrentForRun && certifyingFlag && !manualOnly && !skipped,
    };

    if (!present) {
      missingRequiredChecks.push(check.key);
      reasons.push(`${check.label} evidence is missing.`);
    } else {
      if (!headMatchesTarget) {
        staleChecks.push(check.key);
        reasons.push(`${check.label} evidence HEAD does not match target SHA.`);
      }
      if (!timestampCurrentForRun) {
        staleChecks.push(check.key);
        reasons.push(`${check.label} evidence timestamp is not current for this promotion-pack run.`);
      }
      if (manualOnly) {
        nonAutomatedChecks.push(check.key);
        reasons.push(`${check.label} evidence is not accepted as non-interactive machine-attested proof.`);
      }
      if (skipped) {
        skippedChecks.push(check.key);
        reasons.push(`${check.label} evidence is skipped or not run.`);
      }
      if (!passed || !certifyingFlag) {
        failedChecks.push(check.key);
        reasons.push(`${check.label} evidence is not passing and certifying.`);
      }
    }

    checks[check.key] = checkResult;
  }

  const uniqueReasons = unique(reasons);
  const certifying =
    missingRequiredChecks.length === 0 &&
    staleChecks.length === 0 &&
    nonAutomatedChecks.length === 0 &&
    skippedChecks.length === 0 &&
    failedChecks.length === 0 &&
    Object.values(checks).every((check) => check.CERTIFYING === true);

  return {
    targetEnvironment,
    targetSha: resolvedTargetSha,
    generatedAt,
    requiredChecks: REQUIRED_CERTIFICATION_CHECKS.map((check) => ({
      key: check.key,
      label: check.label,
      command: check.command,
      evidencePath: check.jsonPath,
    })),
    checks,
    missingRequiredChecks: unique(missingRequiredChecks),
    staleChecks: unique(staleChecks),
    nonAutomatedChecks: unique(nonAutomatedChecks),
    skippedChecks: unique(skippedChecks),
    failedChecks: unique(failedChecks),
    reasons: certifying ? [] : uniqueReasons,
    certifying,
    CERTIFYING: certifying,
  };
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
    blocker.classification === "simulated proof only" ||
    blocker.classification === "machine proof required",
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
    reason: "Critical/high, machine-required, simulated-only, partial, or open blockers remain.",
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
  restoreEvidenceAcceptance = null,
  productionDeploymentParityEvidence = null,
  productionWorkerActivationEvidence = null,
  productionWorkerRuntimeProof = null,
  productionWorkerReadinessEvidence = null,
  stagingIngestWorkerEvidence = null,
  rawReportRemediationAcceptance = null,
  responseOpsReadinessEvidence = null,
  migrationGateEvidence = null,
  restoreMachineProofEvidence = null,
  productionWorkerMachineProofEvidence = null,
  rawReportMachineProofEvidence = null,
  alertingMachineProofEvidence = null,
  migrationMachineProofEvidence = null,
  retentionArchiveRestoreMachineProofEvidence = null,
  measuredLoadEvidenceAcceptance = null,
  runtimeSizePolicyAcceptance = null,
  certificationEvidence = {},
  generatedAt = new Date().toISOString(),
  env = process.env,
  targetEnvironment = env.CRP_PROMOTION_TARGET_ENV ?? env.TARGET_ENVIRONMENT ?? "production",
  targetSha = env.CRP_PROMOTION_TARGET_SHA ?? env.TARGET_SHA ?? null,
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
  const resolvedTargetEnvironment = String(targetEnvironment || "production").trim();
  const resolvedTargetSha = targetSha ? String(targetSha).trim() : commit;
  if (!/^[a-f0-9]{40}$/i.test(resolvedTargetSha)) {
    throw new Error("Production promotion pack target SHA must be a strict 40-hex commit hash.");
  }
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
  const acceptedRestoreEvidence =
    restoreEvidenceAcceptance ?? buildRestoreEvidenceAcceptanceReport({ rootDir, generatedAt });
  const deploymentParityEvidence =
    productionDeploymentParityEvidence ?? readProductionDeploymentParityEvidenceReport({ rootDir, generatedAt });
  const workerRuntimeProof =
    productionWorkerRuntimeProof ?? buildProductionWorkerRuntimeProofReport({ rootDir, generatedAt });
  const workerReadinessEvidence =
    productionWorkerReadinessEvidence ??
    buildProductionWorkerReadinessEvidenceReport({
      rootDir,
      generatedAt,
      productionWorkerRuntimeProofEvidence: workerRuntimeProof,
    });
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
  const loadedRestoreMachineProof =
    restoreMachineProofEvidence ?? readJsonIfPresent(rootDir, RESTORE_MACHINE_PROOF_JSON_PATH);
  const loadedProductionWorkerMachineProof =
    productionWorkerMachineProofEvidence ?? readJsonIfPresent(rootDir, PRODUCTION_WORKER_MACHINE_PROOF_JSON_PATH);
  const loadedRawReportMachineProof =
    rawReportMachineProofEvidence ?? readJsonIfPresent(rootDir, RAW_REPORT_MACHINE_PROOF_JSON_PATH);
  const loadedAlertingMachineProof =
    alertingMachineProofEvidence ?? readJsonIfPresent(rootDir, ALERTING_MACHINE_PROOF_JSON_PATH);
  const loadedMigrationMachineProof =
    migrationMachineProofEvidence ?? buildMigrationMachineProofReport({ rootDir, generatedAt, migrationGateEvidence: migrationGate });
  const loadedRetentionArchiveRestoreMachineProof =
    retentionArchiveRestoreMachineProofEvidence ?? readJsonIfPresent(rootDir, RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_JSON_PATH);
  const machineProofs = {
    restore: machineProofSummary(
      "restore",
      "Disaster recovery restore machine proof",
      RESTORE_MACHINE_PROOF_CONFIG,
      loadedRestoreMachineProof,
      restoreMachineProofExtraValidation,
      generatedAt,
    ),
    productionWorker: machineProofSummary(
      "productionWorker",
      "Production worker runtime machine proof",
      PRODUCTION_WORKER_MACHINE_PROOF_CONFIG,
      loadedProductionWorkerMachineProof,
      productionWorkerMachineProofExtraValidation,
      generatedAt,
    ),
    rawReport: machineProofSummary(
      "rawReport",
      "Raw report byte remediation machine proof",
      RAW_REPORT_MACHINE_PROOF_CONFIG,
      loadedRawReportMachineProof,
      rawReportMachineProofExtraValidation,
      generatedAt,
    ),
    alerting: machineProofSummary(
      "alerting",
      "Alerting observability machine proof",
      ALERTING_MACHINE_PROOF_CONFIG,
      loadedAlertingMachineProof,
      alertingMachineProofExtraValidation,
      generatedAt,
    ),
    migration: machineProofSummary(
      "migration",
      "Migration governance machine proof",
      MIGRATION_MACHINE_PROOF_CONFIG,
      loadedMigrationMachineProof,
      undefined,
      generatedAt,
    ),
    retentionArchiveRestore: machineProofSummary(
      "retentionArchiveRestore",
      "Retention archive restore machine proof",
      RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG,
      loadedRetentionArchiveRestoreMachineProof,
      undefined,
      generatedAt,
    ),
  };
  const missingMachineRuntimeInputs = unique(
    Object.values(machineProofs).flatMap((proof) => proof?.missingRuntimeInputs ?? []),
  );
  const measuredLoadAcceptance =
    measuredLoadEvidenceAcceptance ?? buildMeasuredLoadEvidenceAcceptance({ rootDir, generatedAt });
  const runtimeSizeAcceptance =
    runtimeSizePolicyAcceptance ?? buildRuntimeSizePolicyAcceptanceReport({ rootDir, generatedAt });

  const classifiedBlockers = loadedRegistry.blockers.map((blocker) => {
    const machineRequirement = MACHINE_PROOF_BLOCKER_REQUIREMENTS[blocker.number] ?? null;
    const classification = classifyBlocker(
      blocker,
      acceptedHumanRestoreEvidence,
      currentRestoreReadiness,
      acceptedRestoreEvidence,
      deploymentParityEvidence,
      workerReadinessEvidence,
      stagingIngestEvidence,
      rawReportRemediationEvidence,
      responseOpsEvidence,
      migrationGate,
      measuredLoadAcceptance,
      runtimeSizeAcceptance,
      machineProofs,
    );
    return {
      number: blocker.number,
      title: blocker.title,
      severity: blocker.severity,
      area: blocker.area,
      currentStatus: blocker.currentStatus,
      classification,
      proofTypeRequired: machineRequirement?.proofTypeRequired ?? blocker.proofTypeRequired,
      proofCategories: machineRequirement?.proofCategories ?? blocker.proofCategories ?? [],
      allowedProofCommands: unique([
        ...(blocker.allowedProofCommands ?? []),
        ...(machineRequirement?.allowedProofCommands ?? []),
      ]),
      forbiddenProofTypes: blocker.forbiddenProofTypes ?? [],
      relatedEvidenceOutputPaths: blocker.relatedEvidenceOutputPaths ?? [],
      recommendedNextAction: machineRequirement?.recommendedNextAction ?? blocker.recommendedNextAction,
      humanProofRequired: false,
      machineProofRequired: Boolean(machineRequirement) && classification !== "fixed with automated evidence",
      missingRuntimeInputs: machineRuntimeInputsForBlocker(blocker.number, machineProofs),
      simulatedProofAcceptable: machineRequirement ? false : blocker.simulatedProofAcceptable === true,
      legacyManualEvidenceIgnored: blocker.humanProofRequired === true || blocker.currentStatus === "requires-human-proof",
      waiverReason: waiverReason(blocker),
    };
  });

  const unresolvedBlockers = classifiedBlockers.filter((blocker) => isUnresolvedClassification(blocker.classification));
  const generatedEvidenceFileReferences = unique([
    ...Object.values(OUTPUT_BY_COMMAND).flat(),
    RESTORE_EVIDENCE_TEMPLATE_MD_PATH,
    RESTORE_EVIDENCE_TEMPLATE_JSON_PATH,
    DEFAULT_RESTORE_EVIDENCE_SUBMISSION_JSON_PATH,
    RESTORE_EVIDENCE_ACCEPTANCE_MD_PATH,
    RESTORE_EVIDENCE_ACCEPTANCE_JSON_PATH,
    HUMAN_RESTORE_DRILL_EVIDENCE_MD_PATH,
    HUMAN_RESTORE_DRILL_EVIDENCE_JSON_PATH,
    PRODUCTION_DEPLOYMENT_PARITY_MD_PATH,
    PRODUCTION_DEPLOYMENT_PARITY_JSON_PATH,
    PRODUCTION_WORKER_RUNTIME_PROOF_TEMPLATE_MD_PATH,
    PRODUCTION_WORKER_RUNTIME_PROOF_TEMPLATE_JSON_PATH,
    DEFAULT_PRODUCTION_WORKER_RUNTIME_PROOF_SUBMISSION_JSON_PATH,
    PRODUCTION_WORKER_RUNTIME_PROOF_MD_PATH,
    PRODUCTION_WORKER_RUNTIME_PROOF_JSON_PATH,
    PRODUCTION_WORKER_QUEUE_DEPTH_EVIDENCE_JSON_PATH,
    PRODUCTION_WORKER_QUEUE_DEPTH_EVIDENCE_MD_PATH,
    STORAGE_DURABILITY_EVIDENCE_MD_PATH,
    STORAGE_DURABILITY_EVIDENCE_JSON_PATH,
    EVIDENCE_LEDGER_EVIDENCE_MD_PATH,
    EVIDENCE_LEDGER_EVIDENCE_JSON_PATH,
    DEPLOY_ROLLBACK_SIMULATION_MD_PATH,
    DEPLOY_ROLLBACK_SIMULATION_JSON_PATH,
    RAW_REPORT_REMEDIATION_ACCEPTANCE_EVIDENCE_JSON_PATH,
    RAW_REPORT_REMEDIATION_ACCEPTANCE_EVIDENCE_MD_PATH,
    RAW_REPORT_REMEDIATION_ACCEPTANCE_TEMPLATE_JSON_PATH,
    RAW_REPORT_REMEDIATION_ACCEPTANCE_TEMPLATE_MD_PATH,
    ALERTING_LIVE_PROOF_TEMPLATE_JSON_PATH,
    ALERTING_LIVE_PROOF_TEMPLATE_MD_PATH,
    ALERTING_EXCLUSION_TEMPLATE_JSON_PATH,
    ALERTING_EXCLUSION_TEMPLATE_MD_PATH,
    ALERTING_ACCEPTANCE_JSON_PATH,
    ALERTING_ACCEPTANCE_MD_PATH,
    ALERTING_EXCLUSION_EVIDENCE_JSON_PATH,
    ALERTING_EXCLUSION_EVIDENCE_MD_PATH,
    LIVE_ALERT_PROOF_JSON_PATH,
    LIVE_ALERT_PROOF_MD_PATH,
    RESTORE_MACHINE_PROOF_MD_PATH,
    RESTORE_MACHINE_PROOF_JSON_PATH,
    PRODUCTION_WORKER_MACHINE_PROOF_MD_PATH,
    PRODUCTION_WORKER_MACHINE_PROOF_JSON_PATH,
    RAW_REPORT_MACHINE_INVENTORY_MD_PATH,
    RAW_REPORT_MACHINE_INVENTORY_JSON_PATH,
    RAW_REPORT_MACHINE_PROOF_MD_PATH,
    RAW_REPORT_MACHINE_PROOF_JSON_PATH,
    ALERTING_MACHINE_PROOF_MD_PATH,
    ALERTING_MACHINE_PROOF_JSON_PATH,
    MIGRATION_MACHINE_PROOF_MD_PATH,
    MIGRATION_MACHINE_PROOF_JSON_PATH,
    RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_MD_PATH,
    RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_JSON_PATH,
    MIGRATION_GATE_POLICY_PATH,
    LOAD_THRESHOLD_POLICY_PATH,
    RUNTIME_SIZE_POLICY_ACCEPTANCE_MD_PATH,
    RUNTIME_SIZE_POLICY_ACCEPTANCE_JSON_PATH,
    ...classifiedBlockers.flatMap((blocker) => blocker.relatedEvidenceOutputPaths),
  ]).map((filePath) => summarizeEvidenceFile(rootDir, filePath));
  const commandResults = buildCommandList(rootDir, loadedRegistry, packageJson);
  const dashboard = collectDashboardEvidence({ rootDir, dashboardReport });
  const readiness = readinessClassification(classifiedBlockers);
  const promotionCertification = buildPromotionCertificationGate({
    rootDir,
    generatedAt,
    targetEnvironment: resolvedTargetEnvironment,
    targetSha: resolvedTargetSha,
    currentHead: commit,
    certificationEvidence,
    defaultEvidence: {
      queueLiveness: workerReadinessEvidence,
      migrationGovernance: migrationGate,
      restoreMachineProof: loadedRestoreMachineProof,
      productionWorkerMachineProof: loadedProductionWorkerMachineProof,
      rawReportMachineProof: loadedRawReportMachineProof,
      alertingMachineProof: loadedAlertingMachineProof,
      migrationMachineProof: loadedMigrationMachineProof,
      retentionArchiveRestoreMachineProof: loadedRetentionArchiveRestoreMachineProof,
    },
  });
  const packCertifying = promotionCertification.CERTIFYING === true && readiness.canPromoteProductionAtScale === true;

  const report = {
    reportName: "production-promotion-evidence-pack",
    generatedAt,
    currentBranch: branch,
    currentCommitHash: commit,
    currentHead: commit,
    targetEnvironment: resolvedTargetEnvironment,
    targetSha: resolvedTargetSha,
    exactCommandsRun: [
      {
        command: "pnpm run production-scale:promotion-pack",
        startedAt: generatedAt,
        completedAt: generatedAt,
        status: "passed",
        automated: true,
      },
    ],
    certifying: packCertifying,
    CERTIFYING: packCertifying,
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
    queueLivenessStatus: promotionCertification.checks.queueLiveness,
    storageDurabilityResult: promotionCertification.checks.storageDurability,
    evidenceLedgerResult: promotionCertification.checks.evidenceLedger,
    migrationGovernanceResult: promotionCertification.checks.migrationGovernance,
    rollbackSimulationResult: promotionCertification.checks.rollbackSimulation,
    restoreMachineProofResult: promotionCertification.checks.restoreMachineProof,
    productionWorkerMachineProofResult: promotionCertification.checks.productionWorkerMachineProof,
    rawReportMachineProofResult: promotionCertification.checks.rawReportMachineProof,
    alertingMachineProofResult: promotionCertification.checks.alertingMachineProof,
    migrationMachineProofResult: promotionCertification.checks.migrationMachineProof,
    retentionArchiveRestoreMachineProofResult: promotionCertification.checks.retentionArchiveRestoreMachineProof,
    promotionCertification,
    machineProofs,
    missingMachineRuntimeInputs,
    humanInteractionRequired: false,
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
    restoreEvidenceAcceptance: {
      reportName: acceptedRestoreEvidence.reportName,
      generatedAt: acceptedRestoreEvidence.generatedAt,
      status: acceptedRestoreEvidence.status,
      accepted: acceptedRestoreEvidence.accepted === true,
      productionProof: acceptedRestoreEvidence.productionProof === true,
      stagingProof: acceptedRestoreEvidence.stagingProof === true,
      currentOperationalProof: acceptedRestoreEvidence.currentOperationalProof === true,
      evidencePath: acceptedRestoreEvidence.evidencePath,
      evidenceId: acceptedRestoreEvidence.evidenceId ?? null,
      environment: acceptedRestoreEvidence.environment ?? null,
      restoreType: acceptedRestoreEvidence.restoreType ?? null,
      observedAt: acceptedRestoreEvidence.observedAt ?? null,
      ageDays: acceptedRestoreEvidence.ageDays ?? null,
      maxAgeDays: acceptedRestoreEvidence.maxAgeDays ?? null,
      measuredRpo: acceptedRestoreEvidence.measuredRpo ?? null,
      measuredRto: acceptedRestoreEvidence.measuredRto ?? null,
      evidenceAttachments: acceptedRestoreEvidence.evidenceAttachments ?? [],
      blockerCoverage: acceptedRestoreEvidence.blockerCoverage,
      validation: {
        ok: acceptedRestoreEvidence.validation?.ok === true,
        errors: acceptedRestoreEvidence.validation?.errors ?? [],
        sensitiveFindings: acceptedRestoreEvidence.validation?.sensitiveFindings ?? [],
        evidenceKind: acceptedRestoreEvidence.validation?.evidenceKind ?? "unknown",
        stale: acceptedRestoreEvidence.validation?.stale === true,
        futureDated: acceptedRestoreEvidence.validation?.futureDated === true,
      },
      safety: {
        runsDump: acceptedRestoreEvidence.safety?.runsDump === true,
        runsRestore: acceptedRestoreEvidence.safety?.runsRestore === true,
        modifiesProduction: acceptedRestoreEvidence.safety?.modifiesProduction === true,
        acceptsSimulatedEvidenceAsProductionProof:
          acceptedRestoreEvidence.safety?.acceptsSimulatedEvidenceAsProductionProof === true,
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
    productionWorkerRuntimeProof: {
      reportName: workerRuntimeProof.reportName,
      generatedAt: workerRuntimeProof.generatedAt,
      status: workerRuntimeProof.status,
      accepted: workerRuntimeProof.accepted === true,
      productionProof: workerRuntimeProof.productionProof === true,
      stagingProof: workerRuntimeProof.stagingProof === true,
      currentOperationalProof: workerRuntimeProof.currentOperationalProof === true,
      evidencePath: workerRuntimeProof.evidencePath,
      environment: workerRuntimeProof.environment ?? null,
      mode: workerRuntimeProof.mode ?? null,
      dryRunOnly: workerRuntimeProof.dryRunOnly === true,
      queueDepth: workerRuntimeProof.queueDepth ?? null,
      processedCount: workerRuntimeProof.processedCount ?? null,
      failedCount: workerRuntimeProof.failedCount ?? null,
      deadLetterCount: workerRuntimeProof.deadLetterCount ?? null,
      staleCount: workerRuntimeProof.staleCount ?? null,
      blockerCoverage: workerRuntimeProof.blockerCoverage,
      validation: {
        ok: workerRuntimeProof.validation?.ok === true,
        errors: workerRuntimeProof.validation?.errors ?? [],
        sensitiveFindings: workerRuntimeProof.validation?.sensitiveFindings ?? [],
        stale: workerRuntimeProof.validation?.stale === true,
      },
      safety: {
        productionJobsProcessedByCodex: workerRuntimeProof.safety?.productionJobsProcessedByCodex === true,
        productionDataMutatedByCodex: workerRuntimeProof.safety?.productionDataMutatedByCodex === true,
        runsProductionApplyByDefault: workerRuntimeProof.safety?.runsProductionApplyByDefault === true,
        acceptsDryRunAsProductionProof: workerRuntimeProof.safety?.acceptsDryRunAsProductionProof === true,
        acceptsDefaultOffActivationAsProductionProof:
          workerRuntimeProof.safety?.acceptsDefaultOffActivationAsProductionProof === true,
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
        runtimeProofAccepted: workerReadinessEvidence.acceptedProductionRunEvidence?.runtimeProofAccepted === true,
        productionProof: workerReadinessEvidence.acceptedProductionRunEvidence?.productionProof === true,
        stagingProof: workerReadinessEvidence.acceptedProductionRunEvidence?.stagingProof === true,
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
      futureMachineRunFields: workerActivationEvidence.futureMachineRunFields,
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
      productionProof: rawReportRemediationEvidence.productionProof === true,
      stagingProof: rawReportRemediationEvidence.stagingProof === true,
      evidencePath: rawReportRemediationEvidence.evidencePath,
      linkedEvidence: rawReportRemediationEvidence.linkedEvidence ?? {
        inventoryEvidencePath: null,
        remediationPlanEvidencePath: null,
        reliableInventoryAccepted: false,
        remediationPlanAccepted: false,
      },
      blockerCoverage: rawReportRemediationEvidence.blockerCoverage,
      validation: {
        accepted: rawReportRemediationEvidence.validation?.accepted === true,
        sensitiveFindings: rawReportRemediationEvidence.validation?.sensitiveFindings ?? [],
        inventoryAccepted: rawReportRemediationEvidence.validation?.inventoryValidation?.accepted === true,
        remediationPlanAccepted: rawReportRemediationEvidence.validation?.remediationPlanValidation?.accepted === true,
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
      CERTIFYING: migrationGate.CERTIFYING === true,
      releaseGateAccepted: migrationGate.releaseGateAccepted === true,
      productionPromotionGateAccepted: migrationGate.productionPromotionGateAccepted === true,
      temporaryAllowlistActive: migrationGate.temporaryAllowlistActive === true,
      runtimeEnsureResidualImpact: migrationGate.runtimeEnsureResidualImpact,
      releaseBlockingFindings: migrationGate.releaseBlockingFindings?.length ?? 0,
      warningOnlyFindings: migrationGate.warningOnlyFindings?.length ?? 0,
      waivedFindings: migrationGate.waivedFindings?.length ?? 0,
      temporaryAllowlistFindings: migrationGate.temporaryAllowlistFindings?.length ?? 0,
      reviewedAdditiveFindings: migrationGate.reviewedAdditiveFindings?.length ?? 0,
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
      alertingAcceptanceStatus: responseOpsEvidence.alerting?.acceptance?.status ?? "unknown",
      alertingAcceptancePath: responseOpsEvidence.alerting?.acceptance?.acceptancePath ?? "none",
      alertingAcceptanceAccepted: responseOpsEvidence.alerting?.acceptance?.accepted === true,
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
    humanRequiredProof: [],
    machineRequiredProof: classifiedBlockers.filter((blocker) => blocker.classification === "machine proof required"),
    waivers: classifiedBlockers.filter((blocker) => blocker.classification === "waived with explicit reason"),
    readinessClassification: readiness,
    canPromoteProductionAtScale: readiness.canPromoteProductionAtScale,
    safety: {
      productionDataMutated: false,
      liveExternalProvidersCalled: false,
      realConsumerPiiUsed: false,
      productionAtScaleClaimed: readiness.value === "production-at-scale" && readiness.canPromoteProductionAtScale,
      productionReadyClaim: packCertifying === true && readiness.value === "production-at-scale",
      simulatedProofIsProductionProof: false,
      dashboardPassTreatedAsCompleteReleaseEvidence: false,
    },
    requiredStatements: [
      "SIMULATED proof is not production proof.",
      "Dashboard PASS alone is not complete release evidence when checks are skipped.",
      "Machine proof gates are non-interactive and require only machine attestations.",
      "Missing runtime inputs are machine inputs and keep CERTIFYING:false.",
      "Disaster recovery, ingest runtime, raw report remediation, alerting, migration, and retention closure require accepted machine-attested evidence.",
      "Machine-attested production evidence can close production blockers only when non-interactive, sanitized, current, and CERTIFYING:true.",
      "Measured load evidence must be local or staging-safe, threshold-passing, synthetic, and zero-provider-call only.",
      "Staging ingest worker queue-drain evidence is staging proof only and does not activate production.",
      "Migration governance requires a non-mutating production promotion gate; CERTIFYING remains false while temporary runtime ensure allowlist entries are active.",
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
    if (/human/i.test(String(blocker.classification ?? ""))) {
      errors.push(`Blocker ${blocker.number} uses a human-proof classification, which is not allowed for production certification.`);
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
  if (!report.targetEnvironment) errors.push("Promotion pack is missing target environment.");
  if (!/^[a-f0-9]{40}$/i.test(String(report.targetSha ?? ""))) {
    errors.push("Promotion pack is missing a strict 40-hex target SHA.");
  }
  if (!Array.isArray(report.exactCommandsRun) || report.exactCommandsRun.length === 0) {
    errors.push("Promotion pack is missing exact commands run.");
  }
  if (!report.promotionCertification || typeof report.promotionCertification !== "object") {
    errors.push("Promotion pack is missing promotion certification details.");
  }
  if (!report.restoreEvidenceAcceptance || typeof report.restoreEvidenceAcceptance !== "object") {
    errors.push("Promotion pack is missing restore evidence acceptance details.");
  }
  for (const requiredKey of [
    "queueLivenessStatus",
    "storageDurabilityResult",
    "evidenceLedgerResult",
    "migrationGovernanceResult",
    "rollbackSimulationResult",
    "restoreMachineProofResult",
    "productionWorkerMachineProofResult",
    "rawReportMachineProofResult",
    "alertingMachineProofResult",
    "migrationMachineProofResult",
    "retentionArchiveRestoreMachineProofResult",
  ]) {
    if (!report[requiredKey]) errors.push(`Promotion pack is missing ${requiredKey}.`);
  }
  const expectedTopLevelCertifying =
    report.promotionCertification?.CERTIFYING === true &&
    report.readinessClassification?.canPromoteProductionAtScale === true;
  if (report.CERTIFYING !== expectedTopLevelCertifying) {
    errors.push("Promotion pack top-level CERTIFYING must require both certifying evidence and production-at-scale readiness.");
  }
  if (report.certifying !== report.CERTIFYING) {
    errors.push("Promotion pack certifying and CERTIFYING flags must match.");
  }
  if (report.CERTIFYING === true) {
    if (report.currentCommitHash !== report.targetSha) {
      errors.push("Promotion pack cannot certify when current HEAD differs from target SHA.");
    }
    for (const check of Object.values(report.promotionCertification?.checks ?? {})) {
      if (check.CERTIFYING !== true) {
        errors.push(`Promotion pack cannot certify while required check is not certifying: ${check.key}.`);
      }
    }
  }
  if (report.safety?.productionReadyClaim === true && report.CERTIFYING !== true) {
    errors.push("Promotion pack cannot claim production-ready while CERTIFYING is false.");
  }
  for (const evidence of report.generatedEvidenceFileReferences ?? []) {
    if (isSimulatedEvidenceType(evidence.evidenceType) && evidence.productionProof === true) {
      errors.push(`SIMULATED evidence is mislabeled as production proof: ${evidence.path}.`);
    }
  }
  const humanAcceptance = report.humanRestoreDrillEvidenceAcceptance;
  const restoreReadiness = report.restoreReadinessCheck;
  const restoreAcceptance = report.restoreEvidenceAcceptance;
  const deploymentParity = report.productionDeploymentParityEvidence;
  const workerRuntimeProof = report.productionWorkerRuntimeProof;
  const workerReadiness = report.productionWorkerReadinessEvidence;
  const workerActivation = report.productionWorkerActivationEvidence;
  const stagingIngest = report.stagingIngestWorkerEvidence;
  const responseOpsReadiness = report.responseOpsReadinessEvidence;
  const migrationGate = report.migrationGateEvidence;
  const measuredLoad = report.measuredLoadEvidenceAcceptance;
  const runtimeSize = report.runtimeSizePolicyAcceptance;
  const machineProofs = report.machineProofs ?? {};
  const topLevelMissingInputs = new Set(report.missingMachineRuntimeInputs ?? []);
  for (const proof of Object.values(machineProofs)) {
    for (const input of proof?.missingRuntimeInputs ?? []) {
      if (!topLevelMissingInputs.has(input)) {
        errors.push(`Missing machine runtime input is not surfaced at top level: ${input}.`);
      }
    }
    if (proof?.humanInteractionRequired === true) {
      errors.push(`Machine proof ${proof.key ?? proof.label} must not require human interaction.`);
    }
  }
  for (const blocker of blockers.filter((entry) => entry.classification === "machine proof required")) {
    if (blocker.humanProofRequired === true) {
      errors.push(`Blocker ${blocker.number} cannot require disallowed manual proof while machine proof is required.`);
    }
  }
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
  if (blocker1?.classification === "fixed with automated evidence" && machineProofs.restore?.accepted !== true) {
    errors.push("Blocker 1 cannot be fixed with automated evidence without certifying restore machine proof.");
  }
  if (blocker2?.classification === "fixed with automated evidence" && machineProofs.productionWorker?.accepted !== true) {
    errors.push("Blocker 2 cannot be fixed with automated evidence without certifying production worker machine proof.");
  }
  if (blocker6?.classification === "fixed with automated evidence" && machineProofs.rawReport?.accepted !== true) {
    errors.push("Blocker 6 cannot be fixed with automated evidence without certifying raw report remediation machine proof.");
  }
  if (blocker9?.classification === "fixed with automated evidence" && machineProofs.alerting?.accepted !== true) {
    errors.push("Blocker 9 cannot be fixed with automated evidence without certifying alerting machine proof.");
  }
  if (blocker10?.classification === "fixed with automated evidence" && machineProofs.migration?.accepted !== true) {
    errors.push("Blocker 10 cannot be fixed with automated evidence without certifying migration machine proof.");
  }
  if (blocker22?.classification === "fixed with automated evidence" && machineProofs.retentionArchiveRestore?.accepted !== true) {
    errors.push("Blocker 22 cannot be fixed with automated evidence without certifying retention archive restore machine proof.");
  }
  if (workerRuntimeProof?.accepted === true) {
    if (
      workerRuntimeProof?.safety?.runsProductionApplyByDefault === true ||
      workerRuntimeProof?.safety?.acceptsDryRunAsProductionProof === true ||
      workerRuntimeProof?.safety?.acceptsDefaultOffActivationAsProductionProof === true ||
      workerRuntimeProof?.safety?.productionJobsProcessedByCodex === true ||
      workerRuntimeProof?.safety?.productionDataMutatedByCodex === true ||
      workerRuntimeProof?.validation?.sensitiveFindings?.length > 0
    ) {
      errors.push("Production worker runtime proof is unsafe or contains sensitive findings.");
    }
    if (workerRuntimeProof?.stagingProof === true && workerRuntimeProof?.productionProof === true) {
      errors.push("Staging worker runtime evidence cannot also be production proof.");
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
  if (blocker8?.classification === "fixed with automated evidence") {
    if (
      responseOpsReadiness?.blockerCoverage?.responseOperationsMaturity !== true ||
      responseOpsReadiness?.liveSchedulerStatus !== "disabled" ||
      !["machine-controlled-deferred", "ready", "staging-evidenced"].includes(responseOpsReadiness?.backfillReadinessStatus) ||
      !["machine-controlled-deferred", "ready", "staging-evidenced"].includes(responseOpsReadiness?.purgeArchiveReadinessStatus) ||
      responseOpsReadiness?.safety?.liveSchedulerEnabledByCodex === true ||
      responseOpsReadiness?.safety?.productionDataMutated === true ||
      responseOpsReadiness?.safety?.productionRecordsPurgedOrArchived === true ||
      responseOpsReadiness?.safety?.responseQueueSemanticsChanged === true
    ) {
      errors.push("Blocker 8 cannot be fixed without accepted response ops readiness and non-mutating machine controls.");
    }
  }
  if (blocker10?.classification === "fixed with automated evidence") {
    if (
      migrationGate?.policyMode !== "release-blocking" ||
      migrationGate?.CERTIFYING !== true ||
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
  if (restoreAcceptance?.accepted === true) {
    if (
      restoreAcceptance?.safety?.runsDump === true ||
      restoreAcceptance?.safety?.runsRestore === true ||
      restoreAcceptance?.safety?.modifiesProduction === true ||
      restoreAcceptance?.safety?.acceptsSimulatedEvidenceAsProductionProof === true ||
      restoreAcceptance?.validation?.sensitiveFindings?.length > 0
    ) {
      errors.push("Restore evidence acceptance is unsafe or contains sensitive findings.");
    }
    if (restoreAcceptance?.stagingProof === true && restoreAcceptance?.productionProof === true) {
      errors.push("Staging restore evidence cannot also be production proof.");
    }
  }
  if (restoreReadiness?.currentOperationalProof === true) {
    errors.push("Legacy restore readiness current proof is not accepted as production certification proof; use restore machine proof.");
  }
  if (humanAcceptance?.validation?.simulatedOnlySubmission === true && humanAcceptance?.accepted === true) {
    errors.push("SIMULATED-only legacy restore evidence submission was accepted.");
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
  if (report.canPromoteProductionAtScale !== report.readinessClassification?.canPromoteProductionAtScale) {
    errors.push("Promotion pack canPromoteProductionAtScale must match readinessClassification.canPromoteProductionAtScale.");
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

function renderCertificationRows(checks) {
  return REQUIRED_CERTIFICATION_CHECKS.map((required) => {
    const check = checks?.[required.key] ?? {};
    return `- ${required.label}: ${check.CERTIFYING ? "CERTIFYING" : "non-certifying"}; status=${check.status ?? "missing"}; head=${check.evidenceHead ?? "missing"}; timestamp=${check.generatedAt ?? "missing"}; command=\`${required.command}\``;
  });
}

function renderMachineProofRows(machineProofs = {}) {
  const proofs = Object.values(machineProofs);
  if (!proofs.length) return ["- None."];
  return proofs.map((proof) =>
    `- ${proof.label}: ${proof.accepted ? "accepted" : "not accepted"}; status=${proof.status}; certifying=${proof.certifying ? "true" : "false"}; missingRuntimeInputs=${proof.missingRuntimeInputs?.join(", ") || "none"}; humanInteractionRequired=${proof.humanInteractionRequired ? "true" : "false"}; evidence=\`${proof.evidencePath}\``,
  );
}

export function renderPromotionPackMarkdown(report) {
  const lines = [
    "# Production Promotion Evidence Pack",
    "",
    `Generated at: ${report.generatedAt}`,
    `Current branch: \`${report.currentBranch}\``,
    `Current commit hash: \`${report.currentCommitHash}\``,
    `Current HEAD: \`${report.currentHead ?? report.currentCommitHash}\``,
    `Target environment: \`${report.targetEnvironment}\``,
    `Target SHA: \`${report.targetSha}\``,
    `CERTIFYING:${report.CERTIFYING ? "true" : "false"}`,
    `Audit file path: \`${report.auditFilePath}\``,
    `Audit date: ${report.auditDate ?? "not parseable"}`,
    `Recommended readiness classification: **${report.readinessClassification.value}**`,
    `Production-ready claim: **${report.safety?.productionReadyClaim ? "true" : "false"}**`,
    "",
    "## Required Statements",
    "",
    "- SIMULATED proof is not production proof.",
    "- Dashboard PASS alone is not complete release evidence when checks are skipped.",
    "- Codex must not promote readiness classification beyond evidence.",
    "- Machine proof gates are non-interactive and require only machine attestations.",
    "- Missing runtime inputs are machine inputs and keep CERTIFYING:false.",
    "- Disaster recovery, ingest runtime, raw report remediation, alerting, migration, and retention closure require accepted machine-attested evidence.",
    "- Machine-attested production evidence can close production blockers only when non-interactive, sanitized, current, and CERTIFYING:true.",
    "- Measured load evidence must be local or staging-safe, threshold-passing, synthetic, and zero-provider-call only.",
    "- Staging ingest worker queue-drain evidence is staging proof only and does not activate production.",
    "- Migration governance requires a non-mutating accepted gate policy or a formal waiver with reason.",
    "- Runtime-size closure requires accepted hard-gate policy evidence or an accepted warning-only formal waiver.",
    "- Response operations readiness requires exact scheduler, backfill, purge/archive, alerting, dashboard, and soak evidence commands.",
    "- Existing stale, skipped, manual-only, failed, or non-automated evidence is historical and non-certifying.",
    "",
    "## Certification Gate",
    "",
    `- CERTIFYING: ${report.CERTIFYING ? "true" : "false"}`,
    `- Target environment: \`${report.targetEnvironment}\``,
    `- Target SHA: \`${report.targetSha}\``,
    `- Missing required checks: ${report.promotionCertification?.missingRequiredChecks?.join(", ") || "none"}`,
    `- Stale checks: ${report.promotionCertification?.staleChecks?.join(", ") || "none"}`,
    `- Non-automated checks: ${report.promotionCertification?.nonAutomatedChecks?.join(", ") || "none"}`,
    `- Skipped checks: ${report.promotionCertification?.skippedChecks?.join(", ") || "none"}`,
    `- Failed checks: ${report.promotionCertification?.failedChecks?.join(", ") || "none"}`,
    `- Missing machine runtime inputs: ${report.missingMachineRuntimeInputs?.join(", ") || "none"}`,
    "",
    "### Required Certification Checks",
    "",
    ...renderCertificationRows(report.promotionCertification?.checks),
    "",
    "### Machine-Attested Proof Gates",
    "",
    ...renderMachineProofRows(report.machineProofs),
    "",
    "### Missing Machine Runtime Inputs",
    "",
    ...(report.missingMachineRuntimeInputs?.length
      ? report.missingMachineRuntimeInputs.map((input) => `- ${input}`)
      : ["- None."]),
    "",
    "### Exact Commands Run By This Evidence Pack",
    "",
    ...report.exactCommandsRun.map((command) =>
      `- \`${command.command}\` - ${command.status}; started=${command.startedAt}; completed=${command.completedAt}`,
    ),
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
    "## Restore Evidence Acceptance",
    "",
    `- Status: ${report.restoreEvidenceAcceptance.status}`,
    `- Accepted: ${report.restoreEvidenceAcceptance.accepted ? "yes" : "no"}`,
    `- Production proof: ${report.restoreEvidenceAcceptance.productionProof ? "yes" : "no"}`,
    `- Staging proof: ${report.restoreEvidenceAcceptance.stagingProof ? "yes" : "no"}`,
    `- Evidence path: \`${report.restoreEvidenceAcceptance.evidencePath ?? "not submitted"}\``,
    `- Environment: ${report.restoreEvidenceAcceptance.environment ?? "not submitted"}`,
    `- Blocker 1 production coverage: ${
      report.restoreEvidenceAcceptance.blockerCoverage?.disasterRecoveryRestoreDrill ? "accepted" : "not accepted"
    }`,
    `- Blocker 22 production coverage: ${
      report.restoreEvidenceAcceptance.blockerCoverage?.retentionArchiveRestore ? "accepted" : "not accepted"
    }`,
    "- Staging restore evidence is recorded but not counted as production proof.",
    "",
    "## Legacy Restore Drill Evidence (Non-Certifying)",
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
    `- SIMULATED-only submitted as legacy proof: ${
      report.humanRestoreDrillEvidenceAcceptance.validation?.simulatedOnlySubmission ? "yes" : "no"
    }`,
    "",
    "## Restore Evidence Current Readiness",
    "",
    `- Status: ${report.restoreReadinessCheck.status}`,
    `- Current operational proof: ${report.restoreReadinessCheck.currentOperationalProof ? "yes" : "no"}`,
    `- Evidence type: ${report.restoreReadinessCheck.evidenceType}`,
    `- Legacy observed flag: ${report.restoreReadinessCheck.humanObserved ? "yes" : "no"}`,
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
    "## Production Worker Runtime Proof",
    "",
    `- Status: ${report.productionWorkerRuntimeProof.status}`,
    `- Accepted: ${report.productionWorkerRuntimeProof.accepted ? "yes" : "no"}`,
    `- Production proof: ${report.productionWorkerRuntimeProof.productionProof ? "yes" : "no"}`,
    `- Staging proof: ${report.productionWorkerRuntimeProof.stagingProof ? "yes" : "no"}`,
    `- Dry-run only: ${report.productionWorkerRuntimeProof.dryRunOnly ? "yes" : "no"}`,
    `- Evidence path: \`${report.productionWorkerRuntimeProof.evidencePath ?? "not submitted"}\``,
    `- Processed/failed/dead-letter/stale: ${
      report.productionWorkerRuntimeProof.processedCount ?? "n/a"
    }/${report.productionWorkerRuntimeProof.failedCount ?? "n/a"}/${report.productionWorkerRuntimeProof.deadLetterCount ?? "n/a"}/${report.productionWorkerRuntimeProof.staleCount ?? "n/a"}`,
    `- Blocker 2 runtime coverage: ${
      report.productionWorkerRuntimeProof.blockerCoverage?.productionIngestRuntime ? "accepted" : "not accepted"
    }`,
    "- Dry-run, default-off, and deferred activation evidence are not production runtime proof.",
    "",
    "## Production Worker Readiness Evidence",
    "",
    `- Status: ${report.productionWorkerReadinessEvidence.status}`,
    `- Production proof accepted: ${report.productionWorkerReadinessEvidence.productionProof ? "yes" : "no"}`,
    `- Runtime proof evidence accepted: ${
      report.productionWorkerReadinessEvidence.acceptedProductionRunEvidence?.accepted ? "yes" : "no"
    }`,
    `- Runtime proof evidence path: \`${report.productionWorkerReadinessEvidence.acceptedProductionRunEvidence?.evidencePath ?? "not submitted"}\``,
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
      report.productionWorkerActivationEvidence.futureMachineRunFields?.queueDepthBefore ?? "required"
    }/${report.productionWorkerActivationEvidence.futureMachineRunFields?.queueDepthAfter ?? "required"}`,
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
    `- Production proof: ${report.rawReportRemediationAcceptance.productionProof ? "yes" : "no"}`,
    `- Evidence path: \`${report.rawReportRemediationAcceptance.evidencePath ?? "not submitted"}\``,
    `- Reliable inventory accepted: ${
      report.rawReportRemediationAcceptance.linkedEvidence?.reliableInventoryAccepted ? "yes" : "no"
    }`,
    `- Remediation plan accepted: ${
      report.rawReportRemediationAcceptance.linkedEvidence?.remediationPlanAccepted ? "yes" : "no"
    }`,
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
    `- CERTIFYING:${report.migrationGateEvidence.CERTIFYING ? "true" : "false"}`,
    `- Release gate accepted: ${report.migrationGateEvidence.releaseGateAccepted ? "yes" : "no"}`,
    `- Production promotion gate accepted: ${report.migrationGateEvidence.productionPromotionGateAccepted ? "yes" : "no"}`,
    `- Temporary allowlist active: ${report.migrationGateEvidence.temporaryAllowlistActive ? "yes" : "no"}`,
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
    `- Alerting acceptance status/path: ${report.responseOpsReadinessEvidence.alertingAcceptanceStatus}/${report.responseOpsReadinessEvidence.alertingAcceptancePath}`,
    `- Alerting acceptance accepted: ${report.responseOpsReadinessEvidence.alertingAcceptanceAccepted ? "yes" : "no"}`,
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
    "## Disallowed Manual Proof Dependencies",
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
    "  --target-environment <name>  Promotion target environment. Defaults to production.",
    "  --target-sha <sha>           Strict 40-hex deploy target SHA. Defaults to current HEAD.",
  ].join("\n"));
}

function parseArgs(args) {
  const options = { rootDir: process.cwd(), targetEnvironment: undefined, targetSha: undefined };
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
    if (arg === "--target-environment") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--target-environment requires a value.");
      options.targetEnvironment = value;
      index += 1;
      continue;
    }
    if (arg === "--target-sha") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--target-sha requires a value.");
      options.targetSha = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildProductionPromotionPackReport({
    rootDir: options.rootDir,
    targetEnvironment: options.targetEnvironment,
    targetSha: options.targetSha,
  });
  const outputs = writePromotionPackOutputs(report, options.rootDir);
  console.log("Production promotion evidence pack generated.");
  console.log(`Markdown: ${outputs.markdownPath}`);
  console.log(`JSON: ${outputs.jsonPath}`);
  console.log(`Readiness classification: ${report.readinessClassification.value}`);
  console.log(`CERTIFYING:${report.CERTIFYING ? "true" : "false"}`);
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
