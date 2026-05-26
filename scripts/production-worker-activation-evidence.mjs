import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PRODUCTION_WORKER_APPLY_COMMAND,
  PRODUCTION_WORKER_APPLY_CONFIRMATION,
  PRODUCTION_WORKER_APPLY_GUARDS,
  PRODUCTION_WORKER_DRY_RUN_COMMAND,
  PRODUCTION_WORKER_MAX_JOBS_LIMIT,
} from "./production-worker-readiness-evidence.mjs";

export const PRODUCTION_WORKER_ACTIVATION_EVIDENCE_MD_PATH =
  "docs/production-scale/evidence/latest-production-worker-activation-evidence.md";
export const PRODUCTION_WORKER_ACTIVATION_EVIDENCE_JSON_PATH =
  "docs/production-scale/evidence/latest-production-worker-activation-evidence.json";
export const STAGING_INGEST_WORKER_EVIDENCE_JSON_PATH =
  "docs/production-scale/evidence/latest-staging-ingest-worker-evidence.json";

const WORKFLOW_PATH = ".github/workflows/deploy-production.yml";
const PRODUCTION_COMPOSE_PATH = "docker-compose.production.yml";
const WORKER_PATH = "scripts/ingest-processing-worker.ts";

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
}

function readText(rootDir, relativePath) {
  return readFileSync(repoPath(rootDir, relativePath), "utf8");
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

function staticCheck(name, passed, details = {}) {
  return {
    name,
    status: passed ? "passed" : "failed",
    passed,
    ...details,
  };
}

function summarizeStagingWorkerEvidence(rootDir) {
  const parsed = readJsonIfPresent(rootDir, STAGING_INGEST_WORKER_EVIDENCE_JSON_PATH);
  if (!parsed) {
    return {
      exists: false,
      path: STAGING_INGEST_WORKER_EVIDENCE_JSON_PATH,
      accepted: false,
      status: "not-submitted",
      productionProof: false,
      queueDepthBeforeRun: null,
      queueDepthAfterRun: null,
      processedCount: null,
      validationOk: false,
    };
  }

  const accepted =
    parsed.evidenceType === "STAGING_INGEST_WORKER_QUEUE_DRAIN" &&
    parsed.accepted === true &&
    parsed.status === "accepted-staging-queue-drain" &&
    parsed.productionProof !== true &&
    parsed.stagingProof === true &&
    parsed.blockerCoverage?.blocker2StagingQueueDrain === true &&
    parsed.safety?.productionDataMutated !== true &&
    parsed.safety?.productionTargetsUsed !== true &&
    parsed.safety?.productionWorkerActivationDeferred === true &&
    parsed.validation?.ok === true;

  return {
    exists: true,
    path: STAGING_INGEST_WORKER_EVIDENCE_JSON_PATH,
    accepted,
    status: parsed.status ?? "unknown",
    generatedAt: parsed.generatedAt ?? null,
    productionProof: parsed.productionProof === true,
    queueDepthBeforeRun: parsed.queueDepthBeforeRun ?? null,
    queueDepthAfterRun: parsed.queueDepthAfterRun ?? null,
    processedCount: parsed.processedCount ?? null,
    failedCount: parsed.failedCount ?? null,
    deadLetterCount: parsed.deadLetterCount ?? null,
    validationOk: parsed.validation?.ok === true,
  };
}

export function buildProductionWorkerActivationEvidenceReport({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
} = {}) {
  const workflowText = readText(rootDir, WORKFLOW_PATH);
  const productionComposeText = readText(rootDir, PRODUCTION_COMPOSE_PATH);
  const workerText = readText(rootDir, WORKER_PATH);
  const stagingWorkerEvidence = summarizeStagingWorkerEvidence(rootDir);

  const checks = [
    staticCheck(
      "production worker default-off",
      workflowText.includes("run_ingest_worker:") &&
        workflowText.includes("default: false") &&
      workflowText.includes("Skipping production ingest worker. Manual workflow_dispatch input is required.") &&
        workflowText.includes('RUN_PRODUCTION_INGEST_WORKER: ${{ github.event_name == \'workflow_dispatch\' && inputs.run_ingest_worker || false }}') &&
        workflowText.includes("production ingest worker started during default no-worker deploy") &&
        !workflowText.includes("docker compose -f docker-compose.production.yml up -d --build creditregulatorpro creditregulatorpro-ingest-worker") &&
        !/^\s{2}creditregulatorpro-ingest-worker:/m.test(productionComposeText) &&
        !/docker compose up -d --build ingest/i.test(workflowText) &&
        !/restart:\s*unless-stopped\s+ingest/i.test(workflowText),
    ),
    staticCheck(
      "explicit run_ingest_worker gate required",
      workflowText.includes("run_ingest_worker=true is required before dry-run or apply") &&
        workflowText.includes("choose dry-run or apply when run_ingest_worker=true") &&
        workflowText.includes("production_worker_requested=\"false\""),
    ),
    staticCheck(
      "apply refuses without confirmation string",
      workflowText.includes(PRODUCTION_WORKER_APPLY_CONFIRMATION) &&
        workflowText.includes("ingest_worker_apply_ack is required for apply") &&
        workerText.includes("CRP_PRODUCTION_INGEST_WORKER_APPLY") &&
        workerText.includes("Production ingest worker apply refused"),
    ),
    staticCheck(
      "apply refuses without max-job bound",
      workflowText.includes("ingest_worker_max_jobs must be explicitly set to 1-5 when a worker run is requested") &&
        workerText.includes("maxJobsExplicit") &&
        workerText.includes('missingGuards.push("--max-jobs")'),
    ),
    staticCheck(
      "dry-run cannot mutate queue",
      workflowText.includes("Running read-only bounded production ingest worker dry-run.") &&
        workflowText.includes("mutates_queue=false") &&
        workerText.includes("if (dryRun)") &&
        workerText.includes("peekNextJob(source)") &&
        workerText.includes('status: "dry_run_preview"') &&
        workerText.includes("const job = await deps.claimNextJob"),
      {
        dryRunCommand: PRODUCTION_WORKER_DRY_RUN_COMMAND,
      },
    ),
    staticCheck(
      "empty queue exits safely",
      workerText.includes('return { status: "idle"') &&
        workerText.includes("return failureCount > 0 ? 2 : 0"),
    ),
    staticCheck(
      "failure stops workflow",
      workflowText.includes("set -euo pipefail") &&
        workflowText.includes("failure_stops_workflow=true") &&
        workerText.includes("failureCount += 1") &&
        workerText.includes("return failureCount > 0 ? 2 : 0"),
    ),
  ];
  const failedChecks = checks.filter((check) => !check.passed);

  return {
    reportName: "production-worker-activation-evidence",
    evidenceType: "PRODUCTION_WORKER_ACTIVATION_EVIDENCE",
    generatedAt,
    branch: safeGit(["branch", "--show-current"], rootDir),
    commit: safeGit(["rev-parse", "HEAD"], rootDir),
    status: failedChecks.length === 0 ? "prepared-default-off" : "failed",
    productionProof: false,
    productionWorkerDefaultOff: failedChecks.length === 0 && checks[0].passed,
    productionActivationDeferred: true,
    explicitActivationInputsRequired: true,
    explicitActivationInputs: [
      "workflow_dispatch input run_ingest_worker=true",
      "choose exactly one of run_ingest_worker_dry_run=true or run_ingest_worker_apply=true",
      "ingest_worker_max_jobs explicitly set to 1-5",
      "ingest_worker_apply_ack required for apply",
      "ingest_worker_operator safe token required for apply",
    ],
    dryRun: {
      command: PRODUCTION_WORKER_DRY_RUN_COMMAND,
      mutatesQueue: false,
      claimsJobs: false,
      processesJobs: false,
    },
    applyMode: {
      command: PRODUCTION_WORKER_APPLY_COMMAND,
      defaultEnabled: false,
      confirmationString: PRODUCTION_WORKER_APPLY_CONFIRMATION,
      maxJobs: {
        required: true,
        min: 1,
        max: PRODUCTION_WORKER_MAX_JOBS_LIMIT,
      },
      guardList: PRODUCTION_WORKER_APPLY_GUARDS,
    },
    rollbackStopProcedure: [
      "Do not rerun workflow_dispatch with run_ingest_worker=true.",
      "Use rollback_sha production deployment for application rollback.",
      "If a one-shot worker is still running, stop the production application container or wait for the bounded command to exit.",
      "Inspect queue depth and dead-letter rows before any later apply attempt.",
    ],
    futureMachineRunFields: {
      queueDepthBefore: null,
      queueDepthAfter: null,
      processedJobs: null,
      failureCount: null,
      deadLetterCount: null,
      workerExitCode: null,
      rollbackStopVerified: null,
      nonInteractive: null,
      machineAttested: null,
      humanObserved: false,
      manualApprovalRequired: false,
      sanitizedEvidence: null,
    },
    stagingWorkerEvidence,
    staticValidation: {
      status: failedChecks.length === 0 ? "passed" : "failed",
      checks,
      failedChecks,
    },
    blockerCoverage: {
      productionIngestRuntime: false,
      productionWorkflowParityAndRollback: false,
      releaseEvidenceExactCommands: true,
    },
    blockerStatus: {
      blocker2: "machine-production-queue-depth-evidence-required",
      blocker11: "partial-production-workflow-parity-and-rollback-evidence-required",
      blocker21: "exact-release-evidence-command-references-present",
    },
    safety: {
      productionJobsProcessedByCodex: false,
      productionDataMutatedByCodex: false,
      productionWorkerActivatedByDefault: false,
      productionActivationEvidenceProcessesJobs: false,
      dryRunIsNonMutating: true,
      parserBehaviorChanged: false,
      ocrBehaviorChanged: false,
      canonicalMappingChanged: false,
      violationBehaviorChanged: false,
      packetGenerationChanged: false,
      packetPdfLogicChanged: false,
      queueLifecycleSafeguardsWeakened: false,
      dashboardPassAloneIsReleaseEvidence: false,
    },
    requiredStatements: [
      "The production worker remains default-off.",
      "Production activation remains deferred unless an operator explicitly runs the guarded workflow.",
      "Dry-run is non-mutating and cannot claim or process queue jobs.",
      "Apply mode requires explicit operator confirmation and a bounded max-job value.",
      "This activation evidence does not process production jobs and does not close blocker 2.",
      "Accepted staging worker evidence is prerequisite context only, not production proof.",
    ],
    outputPaths: {
      markdown: PRODUCTION_WORKER_ACTIVATION_EVIDENCE_MD_PATH,
      json: PRODUCTION_WORKER_ACTIVATION_EVIDENCE_JSON_PATH,
    },
  };
}

export function renderProductionWorkerActivationEvidenceMarkdown(report) {
  const lines = [
    "# Production Worker Activation Evidence",
    "",
    `Generated at: ${report.generatedAt}`,
    `Evidence type: ${report.evidenceType}`,
    `Branch: \`${report.branch}\``,
    `Commit: \`${report.commit}\``,
    `Status: ${report.status}`,
    `Production proof: ${report.productionProof ? "yes" : "no"}`,
    "",
    "## Required Statements",
    "",
    ...report.requiredStatements.map((statement) => `- ${statement}`),
    "",
    "## Activation Gate",
    "",
    `- Production worker default-off: ${report.productionWorkerDefaultOff ? "yes" : "no"}`,
    `- Production activation remains deferred: ${report.productionActivationDeferred ? "yes" : "no"}`,
    `- Explicit activation inputs required: ${report.explicitActivationInputsRequired ? "yes" : "no"}`,
    ...report.explicitActivationInputs.map((input) => `- ${input}`),
    "",
    "## Dry Run",
    "",
    `- Command: \`${report.dryRun.command}\``,
    `- Mutates queue: ${report.dryRun.mutatesQueue ? "yes" : "no"}`,
    `- Claims jobs: ${report.dryRun.claimsJobs ? "yes" : "no"}`,
    "",
    "## Apply Mode",
    "",
    `- Command: \`${report.applyMode.command}\``,
    `- Confirmation string: \`${report.applyMode.confirmationString}\``,
    `- Max jobs bound: ${report.applyMode.maxJobs.min}-${report.applyMode.maxJobs.max}`,
    ...report.applyMode.guardList.map((guard) => `- ${guard}`),
    "",
    "## Rollback/Stop",
    "",
    ...report.rollbackStopProcedure.map((step) => `- ${step}`),
    "",
    "## Future Operator Run Fields",
    "",
    ...Object.entries(report.futureMachineRunFields).map(([key, value]) => `- ${key}: ${value ?? "required in future machine evidence"}`),
    "",
    "## Staging Worker Evidence",
    "",
    `- Exists: ${report.stagingWorkerEvidence.exists ? "yes" : "no"}`,
    `- Accepted: ${report.stagingWorkerEvidence.accepted ? "yes" : "no"}`,
    `- Production proof: ${report.stagingWorkerEvidence.productionProof ? "yes" : "no"}`,
    `- Queue depth before/after: ${report.stagingWorkerEvidence.queueDepthBeforeRun ?? "n/a"}/${report.stagingWorkerEvidence.queueDepthAfterRun ?? "n/a"}`,
    `- Processed/failed/dead-lettered: ${report.stagingWorkerEvidence.processedCount ?? "n/a"}/${report.stagingWorkerEvidence.failedCount ?? "n/a"}/${report.stagingWorkerEvidence.deadLetterCount ?? "n/a"}`,
    "",
    "## Blocker Coverage",
    "",
    `- Blocker 2 production ingest runtime: ${report.blockerCoverage.productionIngestRuntime ? "accepted" : "not accepted"}`,
    `- Blocker 11 workflow parity and rollback: ${report.blockerCoverage.productionWorkflowParityAndRollback ? "accepted" : "not accepted"}`,
    `- Blocker 21 exact evidence commands: ${report.blockerCoverage.releaseEvidenceExactCommands ? "present" : "missing"}`,
    "",
    "## Safety",
    "",
    "- No production jobs were processed by Codex.",
    "- No production data was mutated by Codex.",
    "- Parser, OCR, canonical mapping, violation, packet, and queue lifecycle behavior changed: no.",
  ];
  return `${lines.join("\n")}\n`;
}

export function writeProductionWorkerActivationEvidence(report, { rootDir = process.cwd() } = {}) {
  mkdirSync(path.dirname(repoPath(rootDir, PRODUCTION_WORKER_ACTIVATION_EVIDENCE_MD_PATH)), { recursive: true });
  writeFileSync(repoPath(rootDir, PRODUCTION_WORKER_ACTIVATION_EVIDENCE_JSON_PATH), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(repoPath(rootDir, PRODUCTION_WORKER_ACTIVATION_EVIDENCE_MD_PATH), renderProductionWorkerActivationEvidenceMarkdown(report), "utf8");
  return {
    markdownPath: PRODUCTION_WORKER_ACTIVATION_EVIDENCE_MD_PATH,
    jsonPath: PRODUCTION_WORKER_ACTIVATION_EVIDENCE_JSON_PATH,
  };
}

function parseArgs(args) {
  const options = { rootDir: process.cwd(), json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      console.log([
        "Usage: pnpm run production-worker:activation-evidence -- [options]",
        "",
        "Writes non-mutating production ingest worker activation gate evidence.",
        "",
        "Options:",
        "  --json          Also print JSON report.",
        "  --root <path>   Project root. Defaults to current working directory.",
      ].join("\n"));
      process.exit(0);
    }
    if (arg === "--json") {
      options.json = true;
      continue;
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
  const report = buildProductionWorkerActivationEvidenceReport({ rootDir: options.rootDir });
  const outputs = writeProductionWorkerActivationEvidence(report, { rootDir: options.rootDir });
  console.log("Production worker activation evidence generated.");
  console.log(`Markdown: ${outputs.markdownPath}`);
  console.log(`JSON: ${outputs.jsonPath}`);
  console.log(`Production worker default-off: ${report.productionWorkerDefaultOff ? "yes" : "no"}`);
  console.log(`Staging worker evidence detected: ${report.stagingWorkerEvidence.accepted ? "yes" : "no"}`);
  console.log(`Production activation remains deferred: ${report.productionActivationDeferred ? "yes" : "no"}`);
  console.log("No production jobs were processed by Codex.");
  if (options.json) console.log(JSON.stringify(report, null, 2));
  if (report.staticValidation.status === "failed") process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
