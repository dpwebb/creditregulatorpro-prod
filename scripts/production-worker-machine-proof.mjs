import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  buildMachineEvidence,
  repoPath,
  writeMachineEvidenceOutputs,
} from "./lib/productionEvidenceSchema.mjs";
import {
  isSimulatedMachineProofFixture,
  resolveMachineProofRuntimeInputFixture,
} from "./lib/machineProofRuntimeInputResolver.mjs";
import { findSensitiveEvidenceValues } from "./lib/productionMachineProofSanitizer.mjs";
import { readMachineEvidenceFile } from "./lib/validateMachineEvidence.mjs";
import {
  isMain,
  parseMachineProofArgs,
  validateMachineProofForConfig,
} from "./lib/machineProofScript.mjs";

export const PRODUCTION_WORKER_MACHINE_PROOF_JSON_PATH =
  "docs/production-scale/evidence/latest-production-worker-machine-proof.json";
export const PRODUCTION_WORKER_MACHINE_PROOF_MD_PATH =
  "docs/production-scale/evidence/latest-production-worker-machine-proof.md";
export const PRODUCTION_WORKER_MACHINE_PROOF_EVIDENCE_TYPE =
  "PRODUCTION_WORKER_RUNTIME_MACHINE_PROOF";

export const PRODUCTION_WORKER_QUEUE_ACCESS_INPUT =
  "CRP_PRODUCTION_WORKER_QUEUE_ACCESS";
export const PRODUCTION_WORKER_LIVENESS_ACCESS_INPUT =
  "CRP_PRODUCTION_WORKER_LIVENESS_ACCESS";
export const PRODUCTION_WORKER_CANARY_JOB_ACCESS_INPUT =
  "CRP_PRODUCTION_WORKER_CANARY_JOB_ACCESS";
export const PRODUCTION_WORKER_STOP_ROLLBACK_ACCESS_INPUT =
  "CRP_PRODUCTION_WORKER_STOP_ROLLBACK_ACCESS";

export const PRODUCTION_WORKER_MACHINE_PROOF_RUNTIME_INPUTS = [
  "CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON",
  PRODUCTION_WORKER_QUEUE_ACCESS_INPUT,
  PRODUCTION_WORKER_LIVENESS_ACCESS_INPUT,
  PRODUCTION_WORKER_CANARY_JOB_ACCESS_INPUT,
  PRODUCTION_WORKER_STOP_ROLLBACK_ACCESS_INPUT,
];

export const PRODUCTION_WORKER_MACHINE_PROOF_REQUIRED_CHECKS = [
  "queue-depth-before-captured",
  "worker-liveness-verified",
  "bounded-max-jobs-enforced",
  "synthetic-or-canary-job-processed",
  "queue-depth-after-captured",
  "processed-count-captured",
  "failed-dead-letter-stale-counts-captured",
  "worker-stop-rollback-verified",
  "canary-cleanup-verified",
];

export const PRODUCTION_WORKER_MACHINE_PROOF_CONFIG = {
  title: "Production Worker Runtime Machine Proof",
  evidenceType: PRODUCTION_WORKER_MACHINE_PROOF_EVIDENCE_TYPE,
  jsonPath: PRODUCTION_WORKER_MACHINE_PROOF_JSON_PATH,
  markdownPath: PRODUCTION_WORKER_MACHINE_PROOF_MD_PATH,
  generatorScript: "scripts/production-worker-machine-proof.mjs",
  command: "pnpm run production-worker:machine-proof",
  attestationEnv: "CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON",
  runtimeInputs: PRODUCTION_WORKER_MACHINE_PROOF_RUNTIME_INPUTS,
  productionMutation: "synthetic-canary-cleaned-up",
  productionRuntimeProofRequired: true,
  blockerIdsClosedWhenCertifying: ["L10-P1-003"],
  requiredChecks: PRODUCTION_WORKER_MACHINE_PROOF_REQUIRED_CHECKS,
};

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function nestedValue(evidence, ...keys) {
  for (const key of keys) {
    if (evidence?.[key] !== undefined) return evidence[key];
    if (evidence?.metadata?.[key] !== undefined) return evidence.metadata[key];
  }
  return undefined;
}

function checkByName(evidence, name) {
  return Array.isArray(evidence?.checks)
    ? evidence.checks.find((check) => check?.name === name || check?.id === name)
    : undefined;
}

function hasPassingCheck(evidence, name) {
  const check = checkByName(evidence, name);
  return check?.status === "pass" || check?.passed === true || check?.ok === true;
}

function proofKind(evidence) {
  return String(
    nestedValue(evidence, "workerProofKind", "proofKind", "runtimeProofKind", "mode") ?? "",
  ).toLowerCase();
}

function numberValue(value) {
  if (Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function nonNegativeInteger(value) {
  const parsed = numberValue(value);
  return Number.isInteger(parsed) && parsed >= 0;
}

function queueDepthEvidence(evidence, key) {
  return asObject(nestedValue(evidence, key));
}

function queueDepthIsCaptured(value) {
  const depth = asObject(value);
  if (!depth) return false;
  const staleValue = depth.stale ?? depth.staleRunning ?? depth.staleCount;
  return [
    depth.queued,
    depth.running,
    depth.failed,
    depth.deadLettered ?? depth.deadLetterCount,
    staleValue,
  ].every(nonNegativeInteger);
}

function workerLivenessEvidence(evidence) {
  return asObject(nestedValue(evidence, "workerLiveness", "liveness"));
}

function workerLivenessIsVerified(liveness) {
  if (!liveness) return false;
  const status = String(liveness.status ?? liveness.serviceStatus ?? "").toLowerCase();
  return (
    liveness.verified === true ||
    liveness.hasRecentHeartbeat === true ||
    ["live", "healthy", "running", "ready", "pass", "passed"].includes(status)
  );
}

function boundedRunEvidence(evidence) {
  return asObject(nestedValue(evidence, "boundedRun", "runtimeCounts", "jobCounts"));
}

function maxJobsIsBounded(value) {
  const parsed = numberValue(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5;
}

function processedCount(run) {
  return run?.processedCount ?? run?.processedJobs ?? run?.processed ?? run?.canaryProcessedCount;
}

function failedCount(run) {
  return run?.failedCount ?? run?.failedJobs ?? run?.failed;
}

function deadLetterCount(run) {
  return run?.deadLetterCount ?? run?.deadLetteredCount ?? run?.deadLetteredJobs ?? run?.deadLettered;
}

function staleCount(run) {
  return run?.staleCount ?? run?.staleRunningCount ?? run?.staleJobs ?? run?.stale;
}

function boundedRunCountsCaptured(run) {
  if (!run) return false;
  return [processedCount(run), failedCount(run), deadLetterCount(run), staleCount(run)]
    .every(nonNegativeInteger);
}

function canaryEvidence(evidence) {
  return asObject(nestedValue(evidence, "canaryJob", "syntheticCanary", "syntheticJob"));
}

function canaryProcessed(canary, run) {
  if (!canary) return false;
  return (
    canary.created === true &&
    (canary.processed === true || canary.status === "processed" || nonNegativeInteger(processedCount(run))) &&
    (canary.onlyCanaryJobProcessed === true || run?.onlyCanaryJobProcessed === true)
  );
}

function canaryCleanupVerified(canary, evidence) {
  return (
    canary?.cleanupVerified === true ||
    canary?.cleanedUp === true ||
    evidence?.metadata?.syntheticCanaryCleanupSucceeded === true
  );
}

function stopRollbackEvidence(evidence) {
  return asObject(nestedValue(evidence, "stopRollback", "rollbackStop", "workerStopRollback"));
}

function stopRollbackVerified(value) {
  if (!value) return false;
  const status = String(value.status ?? value.result ?? "").toLowerCase();
  return value.verified === true || value.passed === true || ["pass", "passed", "verified"].includes(status);
}

function productionMutationIsAllowed(evidence) {
  const mutation = evidence?.productionMutation ?? nestedValue(evidence, "productionMutation");
  return mutation === "synthetic-canary-cleaned-up" || mutation === "approved-bounded";
}

export function productionWorkerMachineProofDomainValidation(evidence) {
  const errors = [];
  const missingRuntimeInputs = [];
  const kind = proofKind(evidence);
  const queueDepthBefore = queueDepthEvidence(evidence, "queueDepthBefore");
  const queueDepthAfter = queueDepthEvidence(evidence, "queueDepthAfter");
  const liveness = workerLivenessEvidence(evidence);
  const run = boundedRunEvidence(evidence);
  const canary = canaryEvidence(evidence);
  const stopRollback = stopRollbackEvidence(evidence);
  const simulatedFixture = isSimulatedMachineProofFixture(evidence);

  if (evidence?.dryRunOnly === true || kind.includes("dry-run")) {
    errors.push("production worker runtime proof is dry-run-only and cannot certify production runtime behavior.");
  }
  if (
    evidence?.humanObserved === true ||
    evidence?.metadata?.humanObserved === true ||
    evidence?.manualApprovalRequired === true ||
    evidence?.metadata?.manualApprovalRequired === true ||
    evidence?.operatorAcknowledgmentRequired === true ||
    evidence?.operatorAcknowledgementRequired === true
  ) {
    errors.push("production worker runtime proof depends on human observation, manual approval, or operator acknowledgment.");
  }
  if (
    evidence?.defaultOff === true ||
    evidence?.productionActivationDeferred === true ||
    evidence?.metadata?.defaultOff === true ||
    evidence?.metadata?.productionActivationDeferred === true ||
    kind.includes("default-off") ||
    kind.includes("deferred")
  ) {
    errors.push("default-off or deferred activation evidence is not production runtime proof.");
  }
  if (!simulatedFixture && (evidence?.simulatedOnly === true || kind.includes("simulated"))) {
    errors.push("simulated worker evidence cannot certify production runtime proof.");
  }
  if (evidence?.certifying === true && !simulatedFixture && !productionMutationIsAllowed(evidence)) {
    errors.push("certifying production worker proof requires synthetic-canary-cleaned-up or approved-bounded mutation mode.");
  }

  if (!queueDepthIsCaptured(queueDepthBefore) || !hasPassingCheck(evidence, "queue-depth-before-captured")) {
    errors.push("queue depth before proof is required.");
    missingRuntimeInputs.push(PRODUCTION_WORKER_QUEUE_ACCESS_INPUT);
  }
  if (!queueDepthIsCaptured(queueDepthAfter) || !hasPassingCheck(evidence, "queue-depth-after-captured")) {
    errors.push("queue depth after proof is required.");
    missingRuntimeInputs.push(PRODUCTION_WORKER_QUEUE_ACCESS_INPUT);
  }
  if (!workerLivenessIsVerified(liveness) || !hasPassingCheck(evidence, "worker-liveness-verified")) {
    errors.push("worker service/liveness proof is required.");
    missingRuntimeInputs.push(PRODUCTION_WORKER_LIVENESS_ACCESS_INPUT);
  }
  if (!maxJobsIsBounded(run?.maxJobs) || !hasPassingCheck(evidence, "bounded-max-jobs-enforced")) {
    errors.push("bounded max jobs proof is required.");
    missingRuntimeInputs.push(PRODUCTION_WORKER_CANARY_JOB_ACCESS_INPUT);
  }
  if (!canaryProcessed(canary, run) || !hasPassingCheck(evidence, "synthetic-or-canary-job-processed")) {
    errors.push("synthetic/canary ingest job processing proof is required.");
    missingRuntimeInputs.push(PRODUCTION_WORKER_CANARY_JOB_ACCESS_INPUT);
  }
  if (!boundedRunCountsCaptured(run)) {
    errors.push("processed, failed, dead-letter, and stale counts are required.");
    missingRuntimeInputs.push(PRODUCTION_WORKER_QUEUE_ACCESS_INPUT);
  }
  if (!nonNegativeInteger(processedCount(run)) || !hasPassingCheck(evidence, "processed-count-captured")) {
    errors.push("processed count proof is required.");
    missingRuntimeInputs.push(PRODUCTION_WORKER_QUEUE_ACCESS_INPUT);
  }
  if (
    ![failedCount(run), deadLetterCount(run), staleCount(run)].every(nonNegativeInteger) ||
    !hasPassingCheck(evidence, "failed-dead-letter-stale-counts-captured")
  ) {
    errors.push("failed, dead-letter, and stale count proof is required.");
    missingRuntimeInputs.push(PRODUCTION_WORKER_QUEUE_ACCESS_INPUT);
  }
  if (!canaryCleanupVerified(canary, evidence) || !hasPassingCheck(evidence, "canary-cleanup-verified")) {
    errors.push("synthetic/canary cleanup proof is required.");
    missingRuntimeInputs.push(PRODUCTION_WORKER_CANARY_JOB_ACCESS_INPUT);
  }
  if (!stopRollbackVerified(stopRollback) || !hasPassingCheck(evidence, "worker-stop-rollback-verified")) {
    errors.push("worker stop/rollback proof is required.");
    missingRuntimeInputs.push(PRODUCTION_WORKER_STOP_ROLLBACK_ACCESS_INPUT);
  }

  return {
    ok: errors.length === 0,
    errors,
    missingRuntimeInputs: [...new Set(missingRuntimeInputs)],
  };
}

export function productionWorkerMachineProofExtraValidation(evidence) {
  return productionWorkerMachineProofDomainValidation(evidence).errors;
}

function resolveInputPath(rootDir, inputPath) {
  return path.isAbsolute(inputPath) ? inputPath : repoPath(rootDir, inputPath);
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function checkStatusFromAttestation(attestation, name) {
  return hasPassingCheck(attestation, name) ? "pass" : "fail";
}

function buildWorkerChecks(attestation) {
  return PRODUCTION_WORKER_MACHINE_PROOF_REQUIRED_CHECKS.map((name) => ({
    name,
    status: checkStatusFromAttestation(attestation, name),
  }));
}

function attestationBaseValidationErrors(attestation) {
  const errors = [];
  const simulatedFixture = isSimulatedMachineProofFixture(attestation);
  if (attestation?.nonInteractive !== true) errors.push("production worker proof is not non-interactive.");
  if (attestation?.machineAttested !== true) errors.push("production worker proof is not machine-attested.");
  if (attestation?.generatedManually === true) errors.push("production worker proof is marked manually generated.");
  if (!simulatedFixture && attestation?.environment !== "production") errors.push("production worker proof must target production.");
  if (simulatedFixture && attestation?.environment !== "machine-proof-simulation") {
    errors.push("simulated production worker proof must remain in machine-proof-simulation environment.");
  }
  if (attestation?.status !== "pass") errors.push("production worker proof status is not pass.");
  if (attestation?.certifying !== true) errors.push("production worker attestation is not certifying.");
  return errors;
}

function buildWorkerMissingEvidence({ rootDir, generatedAt, commitHash = null, failures, missingRuntimeInputs }) {
  return buildMachineEvidence({
    evidenceType: PRODUCTION_WORKER_MACHINE_PROOF_EVIDENCE_TYPE,
    blockerId: "L10-P1-003",
    generatedAt,
    commitHash,
    generatorScript: PRODUCTION_WORKER_MACHINE_PROOF_CONFIG.generatorScript,
    command: PRODUCTION_WORKER_MACHINE_PROOF_CONFIG.command,
    productionMutation: "none",
    status: "fail",
    certifying: false,
    checks: PRODUCTION_WORKER_MACHINE_PROOF_REQUIRED_CHECKS.map((name) => ({ name, status: "fail" })),
    failures,
    missingRuntimeInputs,
    sanitizedArtifacts: [
      PRODUCTION_WORKER_MACHINE_PROOF_JSON_PATH,
      PRODUCTION_WORKER_MACHINE_PROOF_MD_PATH,
    ],
    metadata: {
      proofMode: "machine-attested-production-worker-runtime-required",
      humanInteractionRequired: false,
      missingRuntimeInputs,
    },
    rootDir,
  });
}

export function buildProductionWorkerMachineProofReport({
  rootDir = process.cwd(),
  env = process.env,
  argv = process.argv.slice(2),
  generatedAt = new Date().toISOString(),
  allowSimulation = false,
} = {}) {
  const args = parseMachineProofArgs(argv);
  const attestationInput = args.attestationPath ?? env[PRODUCTION_WORKER_MACHINE_PROOF_CONFIG.attestationEnv];
  const commitHash = env.CRP_MACHINE_EVIDENCE_COMMIT_HASH ?? null;
  let attestation = null;
  let attestationPathForArtifact = null;

  if (!attestationInput) {
    const resolved = resolveMachineProofRuntimeInputFixture({
      family: "productionWorker",
      requiredChecks: PRODUCTION_WORKER_MACHINE_PROOF_REQUIRED_CHECKS,
      requiredInputs: PRODUCTION_WORKER_MACHINE_PROOF_RUNTIME_INPUTS,
      env,
      generatedAt,
      allowSimulation,
    });
    if (!resolved.resolved) {
      return buildWorkerMissingEvidence({
        rootDir,
        generatedAt,
        commitHash,
        missingRuntimeInputs: PRODUCTION_WORKER_MACHINE_PROOF_RUNTIME_INPUTS,
        failures: [
          {
            code: "production-worker-machine-proof-runtime-inputs-missing",
            message:
              "Non-interactive production worker proof requires a sanitized machine attestation with queue, liveness, canary, cleanup, and stop/rollback runtime data.",
          },
        ],
      });
    }
    attestation = resolved.attestation;
  } else {
    const attestationPath = resolveInputPath(rootDir, attestationInput);
    if (!existsSync(attestationPath)) {
      return buildWorkerMissingEvidence({
        rootDir,
        generatedAt,
        commitHash,
        missingRuntimeInputs: [PRODUCTION_WORKER_MACHINE_PROOF_CONFIG.attestationEnv],
        failures: [
          {
            code: "production-worker-machine-proof-attestation-missing",
            message: "Production worker machine proof attestation file was not found.",
            path: path.relative(rootDir, attestationPath),
          },
        ],
      });
    }

    try {
      attestation = readJsonFile(attestationPath);
      attestationPathForArtifact = path.relative(rootDir, attestationPath).replace(/\\/g, "/");
    } catch (error) {
      return buildWorkerMissingEvidence({
        rootDir,
        generatedAt,
        commitHash,
        missingRuntimeInputs: [PRODUCTION_WORKER_MACHINE_PROOF_CONFIG.attestationEnv],
        failures: [
          {
            code: "production-worker-machine-proof-attestation-unreadable",
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      });
    }
  }

  const simulatedFixture = isSimulatedMachineProofFixture(attestation);
  const sensitiveFindings = findSensitiveEvidenceValues(attestation);
  const domainValidation = productionWorkerMachineProofDomainValidation(attestation);
  const checks = buildWorkerChecks(attestation);
  const failedChecks = checks
    .filter((check) => check.status !== "pass")
    .map((check) => ({
      code: `${check.name}-failed`,
      message: `${check.name} did not pass in production worker machine proof attestation.`,
    }));
  const failures = [
    ...attestationBaseValidationErrors(attestation).map((message) => ({
      code: "production-worker-machine-proof-attestation-invalid",
      message,
    })),
    ...domainValidation.errors.map((message) => ({
      code: "production-worker-machine-proof-domain-invalid",
      message,
    })),
    ...sensitiveFindings.map((finding) => ({
      code: "production-worker-machine-proof-sensitive-value",
      message: `Sensitive value pattern rejected at ${finding.path}.`,
    })),
    ...failedChecks,
  ];
  const certifying = failures.length === 0;
  const mutation = simulatedFixture ? "none" : nestedValue(attestation, "productionMutation") ?? "synthetic-canary-cleaned-up";

  return buildMachineEvidence({
    evidenceType: PRODUCTION_WORKER_MACHINE_PROOF_EVIDENCE_TYPE,
    blockerId: "L10-P1-003",
    environment: simulatedFixture ? "machine-proof-simulation" : "production",
    generatedAt,
    commitHash,
    generatorScript: PRODUCTION_WORKER_MACHINE_PROOF_CONFIG.generatorScript,
    command: PRODUCTION_WORKER_MACHINE_PROOF_CONFIG.command,
    productionMutation: mutation,
    simulatedOnly: simulatedFixture,
    status: certifying ? "pass" : "fail",
    certifying,
    checks,
    failures,
    missingRuntimeInputs: domainValidation.missingRuntimeInputs,
    sanitizedArtifacts: [
      ...(attestationPathForArtifact ? [{ path: attestationPathForArtifact, type: "machine-attestation-input" }] : []),
      ...(simulatedFixture ? [{ path: "machine-proof-simulation:production-worker", type: "simulated-runtime-input-resolution" }] : []),
      PRODUCTION_WORKER_MACHINE_PROOF_JSON_PATH,
      PRODUCTION_WORKER_MACHINE_PROOF_MD_PATH,
    ],
    metadata: {
      proofMode: simulatedFixture
        ? "simulated-machine-proof-runtime-input-resolution"
        : "non-interactive-production-worker-runtime",
      workerProofKind: nestedValue(attestation, "workerProofKind", "proofKind", "runtimeProofKind", "mode"),
      queueDepthBefore: queueDepthEvidence(attestation, "queueDepthBefore"),
      queueDepthAfter: queueDepthEvidence(attestation, "queueDepthAfter"),
      workerLiveness: workerLivenessEvidence(attestation),
      boundedRun: boundedRunEvidence(attestation),
      canaryJob: canaryEvidence(attestation),
      stopRollback: stopRollbackEvidence(attestation),
      syntheticCanaryCleanupSucceeded: canaryCleanupVerified(canaryEvidence(attestation), attestation),
      humanInteractionRequired: false,
      attestationSource: simulatedFixture ? "simulated_machine_proof_fixture" : "machine-generated-json",
      ...(attestation?.metadata?.runtimeInputResolution
        ? { runtimeInputResolution: attestation.metadata.runtimeInputResolution }
        : {}),
    },
    rootDir,
  });
}

export async function runProductionWorkerMachineProofCli({
  rootDir = process.cwd(),
  env = process.env,
  argv = process.argv.slice(2),
} = {}) {
  const args = parseMachineProofArgs(argv);
  const evidence = buildProductionWorkerMachineProofReport({ rootDir, env, argv, allowSimulation: true });
  const jsonPath = args.jsonPath ?? PRODUCTION_WORKER_MACHINE_PROOF_JSON_PATH;
  const markdownPath =
    jsonPath === PRODUCTION_WORKER_MACHINE_PROOF_JSON_PATH
      ? PRODUCTION_WORKER_MACHINE_PROOF_MD_PATH
      : jsonPath.replace(/\.json$/u, ".md");

  if (args.writeEvidence !== false) {
    writeMachineEvidenceOutputs(evidence, {
      jsonPath,
      markdownPath,
      rootDir,
      title: PRODUCTION_WORKER_MACHINE_PROOF_CONFIG.title,
    });
  }

  const ok = evidence.certifying === true;
  process.stdout.write(
    JSON.stringify(
      {
        evidenceType: PRODUCTION_WORKER_MACHINE_PROOF_EVIDENCE_TYPE,
        certifying: ok,
        status: evidence.status,
        productionMutation: evidence.productionMutation,
        missingRuntimeInputs: evidence.missingRuntimeInputs ?? [],
        failures: evidence.failures ?? [],
        jsonPath,
        markdownPath,
      },
      null,
      2,
    ) + "\n",
  );
  if (!ok) process.exitCode = 1;
  return evidence;
}

export function validateProductionWorkerMachineProofEvidence(evidence, options = {}) {
  const base = validateMachineProofForConfig(PRODUCTION_WORKER_MACHINE_PROOF_CONFIG, evidence, options);
  const domain = productionWorkerMachineProofDomainValidation(evidence);
  const errors = [...base.errors, ...domain.errors];
  return {
    ...base,
    ok: errors.length === 0,
    certifying: errors.length === 0 && evidence?.certifying === true,
    errors,
    missingRuntimeInputs: [
      ...new Set([
        ...(Array.isArray(evidence?.missingRuntimeInputs) ? evidence.missingRuntimeInputs : []),
        ...(base.missingRuntimeInputs ?? []),
        ...domain.missingRuntimeInputs,
      ]),
    ],
  };
}

export async function runProductionWorkerMachineProofValidationCli({
  rootDir = process.cwd(),
  argv = process.argv.slice(2),
} = {}) {
  const args = parseMachineProofArgs(argv);
  const jsonPath = args.jsonPath ?? PRODUCTION_WORKER_MACHINE_PROOF_JSON_PATH;
  const evidence = readMachineEvidenceFile(rootDir, jsonPath);
  const validation = validateProductionWorkerMachineProofEvidence(evidence, { now: new Date().toISOString() });

  process.stdout.write(
    JSON.stringify(
      {
        evidenceType: PRODUCTION_WORKER_MACHINE_PROOF_EVIDENCE_TYPE,
        valid: validation.ok,
        certifying: validation.certifying,
        missingRuntimeInputs: validation.missingRuntimeInputs ?? [],
        errors: validation.errors ?? [],
        jsonPath,
      },
      null,
      2,
    ) + "\n",
  );
  if (!validation.ok) process.exitCode = 1;
  return validation;
}

if (isMain(import.meta.url)) {
  runProductionWorkerMachineProofCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
