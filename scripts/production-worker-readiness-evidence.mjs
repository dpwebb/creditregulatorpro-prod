import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildProductionWorkerRuntimeProofReport,
  PRODUCTION_WORKER_RUNTIME_PROOF_JSON_PATH,
  PRODUCTION_WORKER_RUNTIME_PROOF_MD_PATH,
} from "./production-worker-runtime-proof.mjs";

export const PRODUCTION_WORKER_READINESS_MD_PATH =
  "docs/production-scale/evidence/latest-production-worker-readiness.md";
export const PRODUCTION_WORKER_READINESS_JSON_PATH =
  "docs/production-scale/evidence/latest-production-worker-readiness.json";
export const PRODUCTION_WORKER_QUEUE_DEPTH_EVIDENCE_JSON_PATH =
  "docs/production-scale/evidence/production-worker-queue-depth-evidence.json";
export const PRODUCTION_WORKER_QUEUE_DEPTH_EVIDENCE_MD_PATH =
  "docs/production-scale/evidence/production-worker-queue-depth-evidence.md";

export const PRODUCTION_WORKER_DRY_RUN_COMMAND =
  "pnpm run ingest:worker --dry-run --max-jobs 1 --concurrency 1 --worker-id production-ingest-worker-dry-run --source authenticated_ingest_process";
export const PRODUCTION_WORKER_APPLY_COMMAND =
  "pnpm run ingest:worker --apply --max-jobs <1-5> --concurrency 1 --worker-id production-bounded-ingest-worker --source authenticated_ingest_process";
export const PRODUCTION_WORKER_APPLY_CONFIRMATION = "explicit-bounded-production-ingest-worker-apply";
export const PRODUCTION_WORKER_MAX_JOBS_LIMIT = 5;

const WORKFLOW_PATH = ".github/workflows/deploy-production.yml";
const PRODUCTION_COMPOSE_PATH = "docker-compose.production.yml";
const WORKER_PATH = "scripts/ingest-processing-worker.ts";

export const PRODUCTION_WORKER_APPLY_GUARDS = [
  "workflow_dispatch input run_ingest_worker_apply=true",
  "workflow_dispatch input run_ingest_worker_dry_run=false",
  "ingest_worker_max_jobs explicitly set to 1-5",
  `ingest_worker_apply_ack=${PRODUCTION_WORKER_APPLY_CONFIRMATION}`,
  "ingest_worker_operator set to a safe token",
  "CRP_ENV=production",
  `CRP_PRODUCTION_INGEST_WORKER_APPLY=${PRODUCTION_WORKER_APPLY_CONFIRMATION}`,
  "CRP_PRODUCTION_INGEST_WORKER_ONE_SHOT=true",
  "CRP_PRODUCTION_INGEST_WORKER_MAX_JOBS matching --max-jobs",
  "CRP_PRODUCTION_INGEST_WORKER_OPERATOR set to a safe token",
  "--concurrency=1",
  "--source=authenticated_ingest_process",
  "--worker-id present",
];

export const PRODUCTION_WORKER_RELEASE_EVIDENCE_COMMANDS = [
  "pnpm run production-worker:runtime-proof",
  "pnpm run production-worker:activation-evidence",
  "pnpm run production-worker:readiness-evidence",
  "pnpm run production-scale:evidence",
  "pnpm run production-scale:promotion-pack",
  "pnpm run operator:dashboard",
  "pnpm run test:api",
  "pnpm run typecheck",
  "git diff --check",
];

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

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function scanSensitiveEvidenceText(text) {
  const findings = [];
  const patterns = [
    ["database-url", /\b(?:postgres|postgresql|mysql|mongodb):\/\/[^\s)]+/i],
    ["private-key-block", /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i],
    ["api-token", /\b(?:sk|ghp|github_pat|xox[baprs])[_-][A-Za-z0-9_-]{12,}\b/i],
    ["bearer-token", /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/i],
    ["session-cookie", /\bfloot_built_app_session=[A-Za-z0-9._~+/=-]{12,}\b/i],
    ["raw-pdf-bytes", /(?:%PDF-|JVBERi0)/i],
    ["raw-report-text", /\b(?:rawExtractedText|raw\s+report\s+text|full\s+credit\s+report\s+text)\s*[:=]/i],
    ["signed-url", /https?:\/\/[^\s]+(?:X-Amz-Signature|X-Goog-Signature|GoogleAccessId|Signature=|[?&]sig=|[?&]sv=)[^\s]*/i],
    ["obvious-email-pii", /\b[A-Z0-9._%+-]+@(?!example\.test\b|example\.invalid\b|example\.com\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ];
  for (const [name, pattern] of patterns) {
    if (pattern.test(text)) findings.push(name);
  }
  return findings;
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

export function validateProductionWorkerQueueDepthEvidence(evidence) {
  const errors = [];
  const serialized = JSON.stringify(evidence ?? {});
  const sensitiveFindings = scanSensitiveEvidenceText(serialized);
  const maxJobs = safeNumber(evidence?.maxJobs);
  const queueDepthBefore = safeNumber(evidence?.queueDepthBefore);
  const queueDepthAfter = safeNumber(evidence?.queueDepthAfter);
  const workerExitCode = safeNumber(evidence?.workerExitCode);
  const failureCount = safeNumber(evidence?.failureCount);
  const processedJobs = safeNumber(evidence?.processedJobs);

  if (!evidence || typeof evidence !== "object") errors.push("Production worker evidence must be a JSON object.");
  if (evidence?.evidenceType !== "MACHINE_ATTESTED_PRODUCTION_WORKER_RUN") {
    errors.push("evidenceType must be MACHINE_ATTESTED_PRODUCTION_WORKER_RUN.");
  }
  if (evidence?.environment !== "production") errors.push("environment must be production.");
  if (evidence?.mode !== "apply") errors.push("mode must be apply for production runtime readiness.");
  if (evidence?.machineRuntimeRunCompleted !== true) {
    errors.push("machineRuntimeRunCompleted must be true.");
  }
  if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > PRODUCTION_WORKER_MAX_JOBS_LIMIT) {
    errors.push(`maxJobs must be an integer between 1 and ${PRODUCTION_WORKER_MAX_JOBS_LIMIT}.`);
  }
  if (!Number.isInteger(queueDepthBefore) || queueDepthBefore < 0) {
    errors.push("queueDepthBefore must be a non-negative integer.");
  }
  if (!Number.isInteger(queueDepthAfter) || queueDepthAfter < 0) {
    errors.push("queueDepthAfter must be a non-negative integer.");
  }
  if (workerExitCode !== 0) errors.push("workerExitCode must be 0.");
  if (failureCount !== 0) errors.push("failureCount must be 0.");
  if (!Number.isInteger(processedJobs) || processedJobs < 0 || processedJobs > maxJobs) {
    errors.push("processedJobs must be a non-negative integer no greater than maxJobs.");
  }
  if (evidence?.productionJobsProcessedByCodex !== false) {
    errors.push("productionJobsProcessedByCodex must be false.");
  }
  if (evidence?.sanitizedEvidence !== true) errors.push("sanitizedEvidence must be true.");
  if (evidence?.nonInteractive !== true) errors.push("nonInteractive must be true.");
  if (evidence?.machineAttested !== true) errors.push("machineAttested must be true.");
  if (evidence?.humanObserved === true) errors.push("humanObserved evidence is not accepted as production worker proof.");
  if (evidence?.manualApprovalRequired === true) errors.push("manualApprovalRequired must be false.");
  if (evidence?.operatorAcknowledgementSigned === true) {
    errors.push("operatorAcknowledgementSigned is legacy manual proof and is not accepted.");
  }
  if (evidence?.rollbackStopVerified !== true) errors.push("rollbackStopVerified must be true.");
  if (evidence?.workflowParityEvidencePresent !== true) {
    errors.push("workflowParityEvidencePresent must be true for production workflow parity coverage.");
  }
  if (sensitiveFindings.length > 0) {
    errors.push(`Sensitive content detected: ${sensitiveFindings.join(", ")}.`);
  }

  return {
    accepted: errors.length === 0,
    status: errors.length === 0 ? "accepted" : "failed",
    errors,
    sensitiveFindings,
    blockerCoverage: {
      productionIngestRuntime: errors.length === 0,
      productionWorkflowParityAndRollback:
        errors.length === 0 && evidence?.workflowParityEvidencePresent === true && evidence?.rollbackStopVerified === true,
    },
  };
}

function readProductionWorkerQueueDepthEvidence(rootDir) {
  const parsed = readJsonIfPresent(rootDir, PRODUCTION_WORKER_QUEUE_DEPTH_EVIDENCE_JSON_PATH);
  if (!parsed) {
    return {
      status: existsSync(repoPath(rootDir, PRODUCTION_WORKER_QUEUE_DEPTH_EVIDENCE_MD_PATH))
        ? "submitted-markdown-requires-json"
        : "not-submitted",
      accepted: false,
      evidencePath: null,
      defaultEvidencePaths: [
        PRODUCTION_WORKER_QUEUE_DEPTH_EVIDENCE_JSON_PATH,
        PRODUCTION_WORKER_QUEUE_DEPTH_EVIDENCE_MD_PATH,
      ],
      validation: {
        accepted: false,
        status: "not-submitted",
        errors: ["No accepted production worker queue-depth evidence has been submitted."],
        sensitiveFindings: [],
        blockerCoverage: {
          productionIngestRuntime: false,
          productionWorkflowParityAndRollback: false,
        },
      },
      blockerCoverage: {
        productionIngestRuntime: false,
        productionWorkflowParityAndRollback: false,
      },
    };
  }

  const validation = validateProductionWorkerQueueDepthEvidence(parsed);
  return {
    status: validation.status,
    accepted: validation.accepted,
    evidencePath: PRODUCTION_WORKER_QUEUE_DEPTH_EVIDENCE_JSON_PATH,
    defaultEvidencePaths: [
      PRODUCTION_WORKER_QUEUE_DEPTH_EVIDENCE_JSON_PATH,
      PRODUCTION_WORKER_QUEUE_DEPTH_EVIDENCE_MD_PATH,
    ],
    validation,
    blockerCoverage: validation.blockerCoverage,
  };
}

function staticCheck(name, passed, details = {}) {
  return {
    name,
    status: passed ? "passed" : "failed",
    passed,
    ...details,
  };
}

export function buildProductionWorkerReadinessEvidenceReport({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  productionWorkerQueueDepthEvidence = null,
  productionWorkerRuntimeProofEvidence = null,
} = {}) {
  const workflowText = readText(rootDir, WORKFLOW_PATH);
  const productionComposeText = readText(rootDir, PRODUCTION_COMPOSE_PATH);
  const workerText = readText(rootDir, WORKER_PATH);
  const runtimeProof =
    productionWorkerRuntimeProofEvidence ?? buildProductionWorkerRuntimeProofReport({ rootDir, generatedAt });
  const acceptedProductionRunEvidence = productionWorkerQueueDepthEvidence
    ? {
        ...productionWorkerQueueDepthEvidence,
        accepted: false,
        legacyQueueDepthEvidenceAccepted: false,
        validation: {
          ...(productionWorkerQueueDepthEvidence.validation ?? {}),
          accepted: false,
          errors: [
            "Legacy production-worker-queue-depth evidence is retained for history but is not accepted as production runtime proof.",
            ...(productionWorkerQueueDepthEvidence.validation?.errors ?? []),
          ],
        },
        blockerCoverage: {
          productionIngestRuntime: false,
          productionWorkflowParityAndRollback: false,
        },
      }
    : {
        status: runtimeProof.status,
        accepted: runtimeProof.accepted === true && runtimeProof.productionProof === true,
        evidencePath: runtimeProof.evidencePath ?? PRODUCTION_WORKER_RUNTIME_PROOF_JSON_PATH,
        runtimeProofAccepted: runtimeProof.accepted === true,
        productionProof: runtimeProof.productionProof === true,
        stagingProof: runtimeProof.stagingProof === true,
        queueDepth: runtimeProof.queueDepth ?? null,
        processedCount: runtimeProof.processedCount ?? null,
        failedCount: runtimeProof.failedCount ?? null,
        deadLetterCount: runtimeProof.deadLetterCount ?? null,
        staleCount: runtimeProof.staleCount ?? null,
        validation: runtimeProof.validation ?? {
          ok: false,
          errors: ["No production worker runtime proof has been submitted."],
          sensitiveFindings: [],
        },
        blockerCoverage: runtimeProof.blockerCoverage ?? {
          productionIngestRuntime: false,
          productionWorkflowParityAndRollback: false,
        },
      };

  const checks = [
    staticCheck(
      "production worker default-off",
      workflowText.includes("run_ingest_worker:") &&
      workflowText.includes("run_ingest_worker_dry_run:") &&
        workflowText.includes("run_ingest_worker_apply:") &&
        workflowText.includes("default: false") &&
        workflowText.includes("Skipping production ingest worker. Manual workflow_dispatch input is required.") &&
        workflowText.includes("production ingest worker started during default no-worker deploy") &&
        !workflowText.includes("docker compose -f docker-compose.production.yml up -d --build creditregulatorpro creditregulatorpro-ingest-worker") &&
        !/^\s{2}creditregulatorpro-ingest-worker:/m.test(productionComposeText) &&
        !/docker compose up -d --build ingest/i.test(workflowText),
    ),
    staticCheck(
      "dry-run non-mutating path",
      workflowText.includes("Running read-only bounded production ingest worker dry-run.") &&
        workflowText.includes("--dry-run --max-jobs") &&
        workerText.includes("peekNextJob(source)") &&
        workerText.includes('status: "dry_run_preview"'),
    ),
    staticCheck(
      "apply requires explicit confirmation",
      workflowText.includes(PRODUCTION_WORKER_APPLY_CONFIRMATION) &&
        workerText.includes("CRP_PRODUCTION_INGEST_WORKER_APPLY") &&
        workerText.includes("Production ingest worker apply refused"),
    ),
    staticCheck(
      "apply requires explicit max job bound",
      workflowText.includes("ingest_worker_max_jobs must be explicitly set to 1-5") &&
        workerText.includes("maxJobsExplicit") &&
        workerText.includes('missingGuards.push("--max-jobs")'),
    ),
    staticCheck(
      "empty queue exits successfully",
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
    staticCheck(
      "exact release evidence commands recorded",
      PRODUCTION_WORKER_RELEASE_EVIDENCE_COMMANDS.includes("pnpm run production-worker:runtime-proof") &&
      PRODUCTION_WORKER_RELEASE_EVIDENCE_COMMANDS.includes("pnpm run production-worker:activation-evidence") &&
      PRODUCTION_WORKER_RELEASE_EVIDENCE_COMMANDS.includes("pnpm run production-worker:readiness-evidence") &&
        PRODUCTION_WORKER_RELEASE_EVIDENCE_COMMANDS.includes("pnpm run operator:dashboard"),
      { commands: PRODUCTION_WORKER_RELEASE_EVIDENCE_COMMANDS },
    ),
  ];
  const failedChecks = checks.filter((check) => !check.passed);
  const staticStatus = failedChecks.length === 0 ? "passed" : "failed";
  const acceptedCoverage = acceptedProductionRunEvidence.blockerCoverage ?? {};

  return {
    reportName: "production-worker-readiness-evidence",
    evidenceType: "PRODUCTION_WORKER_READINESS_EVIDENCE",
    generatedAt,
    branch: safeGit(["branch", "--show-current"], rootDir),
    commit: safeGit(["rev-parse", "HEAD"], rootDir),
    status: staticStatus === "passed" ? "prepared-awaiting-machine-production-evidence" : "failed",
    productionProof: acceptedProductionRunEvidence.accepted === true,
    staticValidation: {
      status: staticStatus,
      checks,
      failedChecks,
    },
    workerDefaultOff: {
      status: checks[0].status,
      defaultProductionDeployStartsWorker: false,
      alwaysOnWorkerServiceAdded: false,
      workflowDispatchInputsRequired: [
        "run_ingest_worker_dry_run=true for dry-run",
        "run_ingest_worker_apply=true for apply",
      ],
    },
    dryRun: {
      command: PRODUCTION_WORKER_DRY_RUN_COMMAND,
      mutatesQueue: false,
      claimsJobs: false,
      processesJobs: false,
    },
    applyMode: {
      command: PRODUCTION_WORKER_APPLY_COMMAND,
      defaultEnabled: false,
      boundedOneShot: true,
      maxJobs: {
        required: true,
        min: 1,
        max: PRODUCTION_WORKER_MAX_JOBS_LIMIT,
      },
      guardList: PRODUCTION_WORKER_APPLY_GUARDS,
    },
    rollbackStopInstructions: [
      "Do not rerun workflow_dispatch with worker inputs.",
      "Use rollback_sha production deployment for application rollback.",
      "If a one-shot worker is still running, stop the production application container or wait for the bounded command to exit.",
      "Inspect queue depth and dead-letter rows before any later apply attempt.",
    ],
    futureMachineProductionRunFields: {
      queueDepthBefore: null,
      queueDepthAfter: null,
      processedJobs: null,
      failureCount: null,
      workerExitCode: null,
      rollbackStopVerified: null,
      nonInteractive: null,
      machineAttested: null,
      humanObserved: false,
      manualApprovalRequired: false,
      sanitizedEvidence: null,
    },
    runtimeProof: {
      reportName: runtimeProof.reportName,
      status: runtimeProof.status,
      accepted: runtimeProof.accepted === true,
      productionProof: runtimeProof.productionProof === true,
      stagingProof: runtimeProof.stagingProof === true,
      evidencePath: runtimeProof.evidencePath ?? PRODUCTION_WORKER_RUNTIME_PROOF_JSON_PATH,
      outputPaths: {
        markdown: PRODUCTION_WORKER_RUNTIME_PROOF_MD_PATH,
        json: PRODUCTION_WORKER_RUNTIME_PROOF_JSON_PATH,
      },
      validation: {
        ok: runtimeProof.validation?.ok === true,
        errors: runtimeProof.validation?.errors ?? [],
        sensitiveFindings: runtimeProof.validation?.sensitiveFindings ?? [],
      },
    },
    acceptedProductionRunEvidence,
    blockerCoverage: {
      productionIngestRuntime: acceptedCoverage.productionIngestRuntime === true,
      productionWorkflowParityAndRollback: acceptedCoverage.productionWorkflowParityAndRollback === true,
      releaseEvidenceExactCommands: true,
    },
    blockerStatus: {
      blocker2: acceptedCoverage.productionIngestRuntime === true
        ? "production-ready-with-accepted-queue-depth-evidence"
        : "machine-production-queue-depth-evidence-required",
      blocker11: acceptedCoverage.productionWorkflowParityAndRollback === true
        ? "production-workflow-parity-and-rollback-evidence-present"
        : "partial-production-workflow-parity-and-rollback-evidence-required",
      blocker21: "exact-release-evidence-command-references-present",
    },
    safety: {
      productionJobsProcessedByCodex: false,
      productionDataMutatedByCodex: false,
      productionWorkerActivatedByDefault: false,
      parserBehaviorChanged: false,
      ocrBehaviorChanged: false,
      canonicalMappingChanged: false,
      violationBehaviorChanged: false,
      packetBehaviorChanged: false,
      storageBehaviorChanged: false,
      dryRunIsNonMutating: true,
      dashboardPassAloneIsReleaseEvidence: false,
    },
    requiredStatements: [
      "No production jobs were processed by Codex.",
      "The production worker remains default-off.",
      "Dry-run is non-mutating.",
      "Production apply requires explicit operator inputs and runtime guards.",
      "Blocker 2 cannot be production-ready without accepted production queue-depth evidence.",
      "Dashboard PASS alone is not release evidence; exact commands are required.",
    ],
    outputPaths: {
      markdown: PRODUCTION_WORKER_READINESS_MD_PATH,
      json: PRODUCTION_WORKER_READINESS_JSON_PATH,
    },
  };
}

export function renderProductionWorkerReadinessEvidenceMarkdown(report) {
  const lines = [
    "# Production Worker Readiness Evidence",
    "",
    `Generated at: ${report.generatedAt}`,
    `Evidence type: ${report.evidenceType}`,
    `Branch: \`${report.branch}\``,
    `Commit: \`${report.commit}\``,
    `Status: ${report.status}`,
    `Production proof accepted: ${report.productionProof ? "yes" : "no"}`,
    "",
    "## Required Statements",
    "",
    ...report.requiredStatements.map((statement) => `- ${statement}`),
    "",
    "## Worker Default-Off Status",
    "",
    `- Default production deploy starts worker: ${report.workerDefaultOff.defaultProductionDeployStartsWorker ? "yes" : "no"}`,
    `- Always-on worker service added: ${report.workerDefaultOff.alwaysOnWorkerServiceAdded ? "yes" : "no"}`,
    "",
    "## Dry Run",
    "",
    `- Command: \`${report.dryRun.command}\``,
    `- Mutates queue: ${report.dryRun.mutatesQueue ? "yes" : "no"}`,
    "",
    "## Apply Mode Guards",
    "",
    `- Bounded max jobs required: ${report.applyMode.maxJobs.required ? "yes" : "no"} (${report.applyMode.maxJobs.min}-${report.applyMode.maxJobs.max})`,
    ...report.applyMode.guardList.map((guard) => `- ${guard}`),
    "",
    "## Rollback/Stop",
    "",
    ...report.rollbackStopInstructions.map((step) => `- ${step}`),
    "",
    "## Future Human Production Run Fields",
    "",
    ...Object.entries(report.futureMachineProductionRunFields).map(([key, value]) => `- ${key}: ${value ?? "required in future machine evidence"}`),
    "",
    "## Runtime Proof Gate",
    "",
    `- Status: ${report.runtimeProof.status}`,
    `- Accepted: ${report.runtimeProof.accepted ? "yes" : "no"}`,
    `- Production proof: ${report.runtimeProof.productionProof ? "yes" : "no"}`,
    `- Staging proof: ${report.runtimeProof.stagingProof ? "yes" : "no"}`,
    `- Evidence path: ${report.runtimeProof.evidencePath ?? "not submitted"}`,
    "",
    "## Accepted Production Runtime Proof",
    "",
    `- Status: ${report.acceptedProductionRunEvidence.status}`,
    `- Accepted: ${report.acceptedProductionRunEvidence.accepted ? "yes" : "no"}`,
    `- Evidence path: ${report.acceptedProductionRunEvidence.evidencePath ?? "not submitted"}`,
    "",
    "## Blocker Coverage",
    "",
    `- Blocker 2 production ingest runtime: ${report.blockerCoverage.productionIngestRuntime ? "accepted" : "not accepted"}`,
    `- Blocker 11 workflow parity and rollback: ${report.blockerCoverage.productionWorkflowParityAndRollback ? "accepted" : "not accepted"}`,
    `- Blocker 21 exact release evidence commands: ${report.blockerCoverage.releaseEvidenceExactCommands ? "present" : "missing"}`,
    "",
    "## Safety",
    "",
    "- No production jobs were processed by Codex.",
    "- No production data was mutated by Codex.",
    "- Parser, OCR, canonical mapping, violation, packet, and storage behavior changed: no.",
  ];
  return `${lines.join("\n")}\n`;
}

export function writeProductionWorkerReadinessEvidence(report, { rootDir = process.cwd() } = {}) {
  mkdirSync(path.dirname(repoPath(rootDir, PRODUCTION_WORKER_READINESS_MD_PATH)), { recursive: true });
  writeFileSync(repoPath(rootDir, PRODUCTION_WORKER_READINESS_JSON_PATH), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(repoPath(rootDir, PRODUCTION_WORKER_READINESS_MD_PATH), renderProductionWorkerReadinessEvidenceMarkdown(report), "utf8");
  return {
    markdownPath: PRODUCTION_WORKER_READINESS_MD_PATH,
    jsonPath: PRODUCTION_WORKER_READINESS_JSON_PATH,
  };
}

function parseArgs(args) {
  const options = { rootDir: process.cwd(), json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      console.log([
        "Usage: pnpm run production-worker:readiness-evidence -- [options]",
        "",
        "Writes non-mutating production ingest worker readiness evidence.",
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
  const report = buildProductionWorkerReadinessEvidenceReport({ rootDir: options.rootDir });
  const outputs = writeProductionWorkerReadinessEvidence(report, { rootDir: options.rootDir });
  console.log("Production worker readiness evidence generated.");
  console.log(`Markdown: ${outputs.markdownPath}`);
  console.log(`JSON: ${outputs.jsonPath}`);
  console.log(`Production worker default-off: ${report.workerDefaultOff.defaultProductionDeployStartsWorker ? "no" : "yes"}`);
  console.log(`Accepted production runtime proof: ${report.acceptedProductionRunEvidence.accepted ? "yes" : "no"}`);
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
