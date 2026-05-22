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
import { readMachineEvidenceFile } from "./lib/validateMachineEvidence.mjs";
import { findSensitiveEvidenceValues } from "./lib/productionMachineProofSanitizer.mjs";
import {
  isMain,
  parseMachineProofArgs,
  validateMachineProofForConfig,
} from "./lib/machineProofScript.mjs";

export const RESTORE_MACHINE_PROOF_JSON_PATH =
  "docs/production-scale/evidence/latest-restore-machine-proof.json";
export const RESTORE_MACHINE_PROOF_MD_PATH =
  "docs/production-scale/evidence/latest-restore-machine-proof.md";
export const RESTORE_MACHINE_PROOF_EVIDENCE_TYPE =
  "DISASTER_RECOVERY_RESTORE_MACHINE_PROOF";

export const RESTORE_MACHINE_BACKUP_SOURCE_INPUT =
  "CRP_RESTORE_MACHINE_BACKUP_SOURCE";
export const RESTORE_MACHINE_ISOLATED_TARGET_INPUT =
  "CRP_RESTORE_MACHINE_ISOLATED_TARGET";
export const RESTORE_MACHINE_SAFE_FIXTURE_INPUT =
  "CRP_RESTORE_MACHINE_SAFE_FIXTURE";

export const RESTORE_MACHINE_PROOF_RUNTIME_INPUTS = [
  "CRP_RESTORE_MACHINE_ATTESTATION_JSON",
  RESTORE_MACHINE_BACKUP_SOURCE_INPUT,
  RESTORE_MACHINE_ISOLATED_TARGET_INPUT,
  RESTORE_MACHINE_SAFE_FIXTURE_INPUT,
];

export const RESTORE_MACHINE_PROOF_REQUIRED_CHECKS = [
  "latest-backup-selected",
  "isolated-restore-target-created",
  "rpo-measured",
  "rto-measured",
  "post-restore-auth-session-check",
  "post-restore-packet-pdf-retrieval-check",
  "post-restore-response-queue-check",
  "cleanup-lifecycle-check",
  "rollback-stop-verification",
  "isolated-restore-target-destroyed",
];

export const RESTORE_MACHINE_PROOF_CONFIG = {
  title: "Disaster Recovery Restore Machine Proof",
  evidenceType: RESTORE_MACHINE_PROOF_EVIDENCE_TYPE,
  jsonPath: RESTORE_MACHINE_PROOF_JSON_PATH,
  markdownPath: RESTORE_MACHINE_PROOF_MD_PATH,
  generatorScript: "scripts/restore-machine-proof.mjs",
  command: "pnpm run restore:machine-proof",
  attestationEnv: "CRP_RESTORE_MACHINE_ATTESTATION_JSON",
  runtimeInputs: RESTORE_MACHINE_PROOF_RUNTIME_INPUTS,
  productionMutation: "none",
  blockerIdsClosedWhenCertifying: ["L10-P1-002"],
  requiredChecks: RESTORE_MACHINE_PROOF_REQUIRED_CHECKS,
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

function numberFromMetric(metric, keys) {
  for (const key of keys) {
    const value = metric?.[key];
    if (Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function metricIsMeasured(metric) {
  const value = asObject(metric);
  if (!value) return false;

  const status = String(value.status ?? value.result ?? "").toLowerCase();
  const explicitPass = status === "pass" || status === "passed" || value.passed === true;
  const measuredMinutes =
    numberFromMetric(value, ["actualMinutes", "measuredMinutes", "minutes", "valueMinutes"]) ??
    (numberFromMetric(value, ["actualSeconds", "measuredSeconds", "seconds"]) / 60);
  const targetMinutes =
    numberFromMetric(value, ["targetMinutes", "maxMinutes", "thresholdMinutes"]) ??
    (numberFromMetric(value, ["targetSeconds", "maxSeconds", "thresholdSeconds"]) / 60);

  if (!Number.isFinite(measuredMinutes)) return false;
  if (explicitPass) return true;
  return Number.isFinite(targetMinutes) && measuredMinutes <= targetMinutes;
}

function proofKind(evidence) {
  return String(
    nestedValue(evidence, "restoreProofKind", "proofKind", "restoreMode") ?? "",
  ).toLowerCase();
}

function latestBackupEvidence(evidence) {
  return asObject(nestedValue(evidence, "latestBackup", "backupSource"));
}

function isolatedTargetEvidence(evidence) {
  return asObject(nestedValue(evidence, "isolatedRestoreTarget", "restoreTarget"));
}

function safeFixtureEvidence(evidence) {
  return asObject(nestedValue(evidence, "safeFixture", "fixture"));
}

function postRestoreEvidence(evidence) {
  return asObject(nestedValue(evidence, "postRestoreChecks", "postRestore"));
}

function valueLooksPresent(value) {
  return typeof value === "string" ? value.trim().length > 0 : value !== undefined && value !== null;
}

function backupIsConfigured(backup) {
  if (!backup) return false;
  const selected = backup.selectedLatest === true || backup.selected === true || backup.latest === true;
  const identifierPresent = [
    backup.backupId,
    backup.backupIdentifier,
    backup.opaqueBackupId,
    backup.id,
    backup.hash,
  ].some(valueLooksPresent);
  return selected && identifierPresent;
}

function targetIsConfigured(target) {
  if (!target) return false;
  const identifierPresent = [
    target.targetId,
    target.targetIdentifier,
    target.opaqueTargetId,
    target.schema,
    target.namespace,
    target.container,
    target.id,
  ].some(valueLooksPresent);
  return target.created === true && target.productionTarget !== true && identifierPresent;
}

function fixtureIsConfigured(fixture) {
  if (!fixture) return false;
  const identifierPresent = [
    fixture.fixtureId,
    fixture.canaryId,
    fixture.opaqueFixtureId,
    fixture.id,
  ].some(valueLooksPresent);
  const safeCredentials =
    fixture.syntheticCredentials === true ||
    fixture.safeSyntheticCredentials === true ||
    fixture.credentialsKind === "synthetic";
  const packetFixture =
    fixture.packetPdfFixture === true ||
    fixture.canaryPacket === true ||
    fixture.safePacketFixture === true;
  return identifierPresent && safeCredentials && packetFixture;
}

function postRestoreCheckPasses(postRestore, keys) {
  if (!postRestore) return false;
  return keys.some((key) => {
    const value = postRestore[key];
    if (value === true) return true;
    if (asObject(value)) {
      const status = String(value.status ?? value.result ?? "").toLowerCase();
      return value.passed === true || status === "pass" || status === "passed";
    }
    return false;
  });
}

export function restoreMachineProofDomainValidation(evidence) {
  const errors = [];
  const missingRuntimeInputs = [];
  const kind = proofKind(evidence);
  const backup = latestBackupEvidence(evidence);
  const target = isolatedTargetEvidence(evidence);
  const fixture = safeFixtureEvidence(evidence);
  const postRestore = postRestoreEvidence(evidence);
  const rpo = asObject(nestedValue(evidence, "rpo", "measuredRpo"));
  const rto = asObject(nestedValue(evidence, "rto", "measuredRto"));
  const simulatedFixture = isSimulatedMachineProofFixture(evidence);

  if (!simulatedFixture && (kind.includes("simulated") || evidence?.simulatedOnly === true)) {
    errors.push("restore proof is simulated-only and cannot certify production disaster recovery.");
  }
  if (kind.includes("checklist") || evidence?.checklistOnly === true || evidence?.metadata?.checklistOnly === true) {
    errors.push("restore proof is checklist-only and cannot certify production disaster recovery.");
  }
  if (evidence?.humanObserved === true || evidence?.metadata?.humanObserved === true) {
    errors.push("restore proof depends on human-observed evidence.");
  }
  if (
    evidence?.manualApprovalRequired === true ||
    evidence?.operatorAcknowledgmentRequired === true ||
    evidence?.metadata?.manualApprovalRequired === true ||
    evidence?.metadata?.operatorAcknowledgmentRequired === true
  ) {
    errors.push("restore proof depends on manual approval or operator acknowledgment.");
  }

  if (!backupIsConfigured(backup)) {
    errors.push("latest configured backup evidence is missing or not machine-selected.");
    missingRuntimeInputs.push(RESTORE_MACHINE_BACKUP_SOURCE_INPUT);
  }
  if (!targetIsConfigured(target)) {
    errors.push("isolated restore target evidence is missing or unsafe.");
    missingRuntimeInputs.push(RESTORE_MACHINE_ISOLATED_TARGET_INPUT);
  }
  if (!fixtureIsConfigured(fixture)) {
    errors.push("safe synthetic restore fixture evidence is missing.");
    missingRuntimeInputs.push(RESTORE_MACHINE_SAFE_FIXTURE_INPUT);
  }

  if (!metricIsMeasured(rpo) || !hasPassingCheck(evidence, "rpo-measured")) {
    errors.push("measured RPO is required and must pass.");
  }
  if (!metricIsMeasured(rto) || !hasPassingCheck(evidence, "rto-measured")) {
    errors.push("measured RTO is required and must pass.");
  }

  if (
    !hasPassingCheck(evidence, "post-restore-auth-session-check") ||
    !postRestoreCheckPasses(postRestore, ["authSession", "authSessionCheck", "session"])
  ) {
    errors.push("post-restore auth/session proof is required.");
  }
  if (
    !hasPassingCheck(evidence, "post-restore-packet-pdf-retrieval-check") ||
    !postRestoreCheckPasses(postRestore, [
      "packetPdfRetrieval",
      "packetPdf",
      "packetPdfRetrievalCheck",
    ])
  ) {
    errors.push("post-restore packet PDF retrieval proof is required.");
  }
  if (
    !hasPassingCheck(evidence, "post-restore-response-queue-check") ||
    !postRestoreCheckPasses(postRestore, ["responseQueueState", "responseQueue", "queueState"])
  ) {
    errors.push("post-restore response queue state proof is required.");
  }
  if (
    !hasPassingCheck(evidence, "cleanup-lifecycle-check") ||
    !postRestoreCheckPasses(postRestore, ["cleanupLifecycle", "lifecycleCleanup", "cleanup"])
  ) {
    errors.push("post-restore cleanup/lifecycle proof is required.");
  }
  if (
    !hasPassingCheck(evidence, "rollback-stop-verification") ||
    !postRestoreCheckPasses(postRestore, ["rollbackStop", "rollbackStopVerification", "stopVerification"])
  ) {
    errors.push("rollback/stop verification proof is required.");
  }
  if (!hasPassingCheck(evidence, "isolated-restore-target-destroyed") || target?.destroyed !== true) {
    errors.push("isolated restore target cleanup proof is required.");
  }

  return {
    ok: errors.length === 0,
    errors,
    missingRuntimeInputs: [...new Set(missingRuntimeInputs)],
  };
}

export function restoreMachineProofExtraValidation(evidence) {
  return restoreMachineProofDomainValidation(evidence).errors;
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function resolveInputPath(rootDir, inputPath) {
  return path.isAbsolute(inputPath) ? inputPath : repoPath(rootDir, inputPath);
}

function checkStatusFromAttestation(attestation, name) {
  return hasPassingCheck(attestation, name) ? "pass" : "fail";
}

function buildRestoreChecks(attestation) {
  return RESTORE_MACHINE_PROOF_REQUIRED_CHECKS.map((name) => ({
    name,
    status: checkStatusFromAttestation(attestation, name),
  }));
}

function attestationBaseValidationErrors(attestation) {
  const errors = [];
  const simulatedFixture = isSimulatedMachineProofFixture(attestation);
  if (attestation?.nonInteractive !== true) errors.push("restore proof is not non-interactive.");
  if (attestation?.machineAttested !== true) errors.push("restore proof is not machine-attested.");
  if (attestation?.humanObserved === true) errors.push("restore proof depends on human-observed evidence.");
  if (attestation?.manualApprovalRequired === true) {
    errors.push("restore proof depends on manual approval.");
  }
  if (attestation?.generatedManually === true) errors.push("restore proof is marked manually generated.");
  if (!simulatedFixture && attestation?.environment !== "production") {
    errors.push("restore proof must target the production environment.");
  }
  if (simulatedFixture && attestation?.environment !== "machine-proof-simulation") {
    errors.push("simulated restore proof must remain in machine-proof-simulation environment.");
  }
  if (attestation?.status !== "pass") errors.push("restore proof status is not pass.");
  if (attestation?.certifying !== true) errors.push("restore proof attestation is not certifying.");
  return errors;
}

function buildRestoreMissingEvidence({ rootDir, missingRuntimeInputs, failures, generatedAt, commitHash = null }) {
  return buildMachineEvidence({
    evidenceType: RESTORE_MACHINE_PROOF_EVIDENCE_TYPE,
    blockerId: "L10-P1-002",
    generatedAt,
    commitHash,
    generatorScript: RESTORE_MACHINE_PROOF_CONFIG.generatorScript,
    command: RESTORE_MACHINE_PROOF_CONFIG.command,
    productionMutation: RESTORE_MACHINE_PROOF_CONFIG.productionMutation,
    status: "fail",
    certifying: false,
    checks: RESTORE_MACHINE_PROOF_REQUIRED_CHECKS.map((name) => ({ name, status: "fail" })),
    failures,
    missingRuntimeInputs,
    sanitizedArtifacts: [RESTORE_MACHINE_PROOF_JSON_PATH, RESTORE_MACHINE_PROOF_MD_PATH],
    metadata: {
      proofMode: "machine-attested-restore-required",
      humanInteractionRequired: false,
      missingRuntimeInputs,
    },
    rootDir,
  });
}

export function buildRestoreMachineProofReport({
  rootDir = process.cwd(),
  env = process.env,
  argv = process.argv.slice(2),
  generatedAt = new Date().toISOString(),
  allowSimulation = false,
} = {}) {
  const args = parseMachineProofArgs(argv);
  const attestationInput = args.attestationPath ?? env[RESTORE_MACHINE_PROOF_CONFIG.attestationEnv];
  const commitHash = env.CRP_MACHINE_EVIDENCE_COMMIT_HASH ?? null;
  let attestation = null;
  let attestationPathForArtifact = null;

  if (!attestationInput) {
    const resolved = resolveMachineProofRuntimeInputFixture({
      family: "restore",
      requiredChecks: RESTORE_MACHINE_PROOF_REQUIRED_CHECKS,
      requiredInputs: RESTORE_MACHINE_PROOF_RUNTIME_INPUTS,
      env,
      generatedAt,
      allowSimulation,
    });
    if (!resolved.resolved) {
      return buildRestoreMissingEvidence({
        rootDir,
        generatedAt,
        commitHash,
        missingRuntimeInputs: RESTORE_MACHINE_PROOF_RUNTIME_INPUTS,
        failures: [
          {
            code: "restore-machine-proof-runtime-inputs-missing",
            message:
              "Non-interactive restore proof requires a machine attestation plus configured backup source, isolated restore target, and safe synthetic fixture.",
          },
        ],
      });
    }
    attestation = resolved.attestation;
  } else {
    const attestationPath = resolveInputPath(rootDir, attestationInput);
    if (!existsSync(attestationPath)) {
      return buildRestoreMissingEvidence({
        rootDir,
        generatedAt,
        commitHash,
        missingRuntimeInputs: [RESTORE_MACHINE_PROOF_CONFIG.attestationEnv],
        failures: [
          {
            code: "restore-machine-proof-attestation-missing",
            message: "Restore machine proof attestation file was not found.",
            path: path.relative(rootDir, attestationPath),
          },
        ],
      });
    }

    try {
      attestation = readJsonFile(attestationPath);
      attestationPathForArtifact = path.relative(rootDir, attestationPath).replace(/\\/g, "/");
    } catch (error) {
      return buildRestoreMissingEvidence({
        rootDir,
        generatedAt,
        commitHash,
        missingRuntimeInputs: [RESTORE_MACHINE_PROOF_CONFIG.attestationEnv],
        failures: [
          {
            code: "restore-machine-proof-attestation-unreadable",
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      });
    }
  }

  const simulatedFixture = isSimulatedMachineProofFixture(attestation);
  const sensitiveFindings = findSensitiveEvidenceValues(attestation);
  const domainValidation = restoreMachineProofDomainValidation(attestation);
  const checks = buildRestoreChecks(attestation);
  const failedChecks = checks
    .filter((check) => check.status !== "pass")
    .map((check) => ({
      code: `${check.name}-failed`,
      message: `${check.name} did not pass in restore machine proof attestation.`,
    }));
  const failures = [
    ...attestationBaseValidationErrors(attestation).map((message) => ({
      code: "restore-machine-proof-attestation-invalid",
      message,
    })),
    ...domainValidation.errors.map((message) => ({
      code: "restore-machine-proof-domain-invalid",
      message,
    })),
    ...sensitiveFindings.map((finding) => ({
      code: "restore-machine-proof-sensitive-value",
      message: `Sensitive value pattern rejected at ${finding.path}.`,
    })),
    ...failedChecks,
  ];
  const certifying = failures.length === 0;

  return buildMachineEvidence({
    evidenceType: RESTORE_MACHINE_PROOF_EVIDENCE_TYPE,
    blockerId: "L10-P1-002",
    environment: simulatedFixture ? "machine-proof-simulation" : "production",
    generatedAt,
    commitHash,
    generatorScript: RESTORE_MACHINE_PROOF_CONFIG.generatorScript,
    command: RESTORE_MACHINE_PROOF_CONFIG.command,
    productionMutation: RESTORE_MACHINE_PROOF_CONFIG.productionMutation,
    simulatedOnly: simulatedFixture,
    status: certifying ? "pass" : "fail",
    certifying,
    checks,
    failures,
    missingRuntimeInputs: domainValidation.missingRuntimeInputs,
    sanitizedArtifacts: [
      ...(attestationPathForArtifact ? [{ path: attestationPathForArtifact, type: "machine-attestation-input" }] : []),
      ...(simulatedFixture ? [{ path: "machine-proof-simulation:restore", type: "simulated-runtime-input-resolution" }] : []),
      RESTORE_MACHINE_PROOF_JSON_PATH,
      RESTORE_MACHINE_PROOF_MD_PATH,
    ],
    metadata: {
      proofMode: simulatedFixture
        ? "simulated-machine-proof-runtime-input-resolution"
        : "non-interactive-machine-attested-restore",
      restoreProofKind: nestedValue(attestation, "restoreProofKind", "proofKind", "restoreMode"),
      latestBackup: latestBackupEvidence(attestation),
      isolatedRestoreTarget: isolatedTargetEvidence(attestation),
      safeFixture: safeFixtureEvidence(attestation),
      rpo: asObject(nestedValue(attestation, "rpo", "measuredRpo")),
      rto: asObject(nestedValue(attestation, "rto", "measuredRto")),
      postRestoreChecks: postRestoreEvidence(attestation),
      humanInteractionRequired: false,
      attestationSource: simulatedFixture ? "simulated_machine_proof_fixture" : "machine-generated-json",
      ...(attestation?.metadata?.runtimeInputResolution
        ? { runtimeInputResolution: attestation.metadata.runtimeInputResolution }
        : {}),
    },
    rootDir,
  });
}

export async function runRestoreMachineProofCli({
  rootDir = process.cwd(),
  env = process.env,
  argv = process.argv.slice(2),
} = {}) {
  const args = parseMachineProofArgs(argv);
  const evidence = buildRestoreMachineProofReport({
    rootDir,
    env,
    argv,
    allowSimulation: true,
  });
  const jsonPath = args.jsonPath ?? RESTORE_MACHINE_PROOF_JSON_PATH;
  const markdownPath =
    jsonPath === RESTORE_MACHINE_PROOF_JSON_PATH
      ? RESTORE_MACHINE_PROOF_MD_PATH
      : jsonPath.replace(/\.json$/u, ".md");

  if (args.writeEvidence !== false) {
    writeMachineEvidenceOutputs(evidence, {
      jsonPath,
      markdownPath,
      rootDir,
      title: RESTORE_MACHINE_PROOF_CONFIG.title,
    });
  }

  const ok = evidence.certifying === true;
  process.stdout.write(
    JSON.stringify(
      {
        evidenceType: RESTORE_MACHINE_PROOF_EVIDENCE_TYPE,
        certifying: ok,
        status: evidence.status,
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

export function validateRestoreMachineProofEvidence(evidence, options = {}) {
  const base = validateMachineProofForConfig(RESTORE_MACHINE_PROOF_CONFIG, evidence, options);
  const domain = restoreMachineProofDomainValidation(evidence);
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

export async function runRestoreMachineProofValidationCli({
  rootDir = process.cwd(),
  argv = process.argv.slice(2),
} = {}) {
  const args = parseMachineProofArgs(argv);
  const jsonPath = args.jsonPath ?? RESTORE_MACHINE_PROOF_JSON_PATH;
  const evidence = readMachineEvidenceFile(rootDir, jsonPath);
  const validation = validateRestoreMachineProofEvidence(evidence, { now: new Date().toISOString() });

  process.stdout.write(
    JSON.stringify(
      {
        evidenceType: RESTORE_MACHINE_PROOF_EVIDENCE_TYPE,
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
  runRestoreMachineProofCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
