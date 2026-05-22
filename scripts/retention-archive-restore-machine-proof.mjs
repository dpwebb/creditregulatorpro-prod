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

export const RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_JSON_PATH =
  "docs/production-scale/evidence/latest-retention-archive-restore-machine-proof.json";
export const RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_MD_PATH =
  "docs/production-scale/evidence/latest-retention-archive-restore-machine-proof.md";
export const RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_EVIDENCE_TYPE =
  "RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF";

export const RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_INPUT =
  "CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON";
export const RETENTION_ARCHIVE_RESTORE_ARCHIVE_ACCESS_INPUT =
  "CRP_RETENTION_ARCHIVE_RESTORE_ARCHIVE_ACCESS";
export const RETENTION_ARCHIVE_RESTORE_ISOLATED_TARGET_INPUT =
  "CRP_RETENTION_ARCHIVE_RESTORE_ISOLATED_TARGET";
export const RETENTION_ARCHIVE_RESTORE_SAFE_CANDIDATE_INPUT =
  "CRP_RETENTION_ARCHIVE_RESTORE_SAFE_CANDIDATE";

export const RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_RUNTIME_INPUTS = [
  RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_INPUT,
  RETENTION_ARCHIVE_RESTORE_ARCHIVE_ACCESS_INPUT,
  RETENTION_ARCHIVE_RESTORE_ISOLATED_TARGET_INPUT,
  RETENTION_ARCHIVE_RESTORE_SAFE_CANDIDATE_INPUT,
];

export const RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_REQUIRED_CHECKS = [
  "safe-archive-candidate-selected",
  "archive-created-or-selected",
  "archive-metadata-verified",
  "isolated-restore-target-created",
  "archive-restore-integrity-verified",
  "no-pii-exposed",
  "lifecycle-cleanup-verified",
  "rollback-recovery-notes-recorded",
  "isolated-restore-target-destroyed",
];

export const RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG = {
  title: "Retention Archive Restore Machine Proof",
  evidenceType: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_EVIDENCE_TYPE,
  jsonPath: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_JSON_PATH,
  markdownPath: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_MD_PATH,
  generatorScript: "scripts/retention-archive-restore-machine-proof.mjs",
  command: "pnpm run retention:archive-restore-machine-proof",
  attestationEnv: RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_INPUT,
  runtimeInputs: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_RUNTIME_INPUTS,
  productionMutation: "synthetic-canary-cleaned-up",
  productionRuntimeProofRequired: true,
  blockerIdsClosedWhenCertifying: ["retention-archive-restore"],
  requiredChecks: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_REQUIRED_CHECKS,
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

function valueLooksPresent(value) {
  return typeof value === "string" ? value.trim().length > 0 : value !== undefined && value !== null;
}

function truthyStatus(value) {
  if (value === true) return true;
  const object = asObject(value);
  if (!object) return false;
  const status = String(object.status ?? object.result ?? "").toLowerCase();
  return object.verified === true || object.passed === true || object.ok === true || status === "pass" || status === "passed";
}

function proofKind(evidence) {
  return String(
    nestedValue(evidence, "retentionProofKind", "proofKind", "retentionMode", "archiveRestoreMode") ?? "",
  ).toLowerCase();
}

function safeCandidateEvidence(evidence) {
  return asObject(nestedValue(evidence, "safeArchiveCandidate", "archiveCandidate", "safeCandidate"));
}

function archiveEvidence(evidence) {
  return asObject(nestedValue(evidence, "archive", "archiveEvidence", "retentionArchive"));
}

function isolatedTargetEvidence(evidence) {
  return asObject(nestedValue(evidence, "isolatedRestoreTarget", "restoreTarget"));
}

function restoreVerificationEvidence(evidence) {
  return asObject(nestedValue(evidence, "restoreVerification", "archiveRestoreVerification", "restoreIntegrity"));
}

function lifecycleCleanupEvidence(evidence) {
  return asObject(nestedValue(evidence, "lifecycleCleanup", "cleanup", "cleanupVerification"));
}

function rollbackRecoveryEvidence(evidence) {
  return asObject(nestedValue(evidence, "rollbackRecovery", "rollbackRecoveryVerification", "rollback"));
}

function hasOpaqueIdentifier(object, keys) {
  if (!object) return false;
  return keys.some((key) => valueLooksPresent(object[key]));
}

function candidateIsConfigured(candidate) {
  if (!candidate) return false;
  const selected = candidate.selected === true || candidate.created === true || candidate.safe === true;
  const identifierPresent = hasOpaqueIdentifier(candidate, [
    "candidateId",
    "opaqueCandidateId",
    "canaryId",
    "syntheticRecordId",
    "hash",
    "id",
  ]);
  return selected && identifierPresent && candidate.realConsumerPiiUsed !== true;
}

function archiveIsConfigured(archive) {
  if (!archive) return false;
  const selected = archive.selected === true || archive.created === true || archive.createdOrSelected === true;
  const identifierPresent = hasOpaqueIdentifier(archive, [
    "archiveId",
    "opaqueArchiveId",
    "manifestHash",
    "hash",
    "id",
  ]);
  return selected && identifierPresent && archive.containsPii !== true;
}

function archiveMetadataIsVerified(archive) {
  if (!archive) return false;
  return archive.metadataVerified === true ||
    archive.archiveMetadataVerified === true ||
    truthyStatus(archive.metadata) ||
    truthyStatus(archive.archiveMetadata);
}

function targetIsConfigured(target) {
  if (!target) return false;
  const identifierPresent = hasOpaqueIdentifier(target, [
    "targetId",
    "opaqueTargetId",
    "schema",
    "namespace",
    "container",
    "id",
  ]);
  return target.created === true && target.productionTarget !== true && identifierPresent;
}

function targetIsDestroyed(target) {
  return target?.destroyed === true || target?.cleanupDestroyed === true || target?.temporaryTargetDestroyed === true;
}

function restoreIntegrityIsVerified(restoreVerification) {
  if (!restoreVerification) return false;
  const explicit =
    restoreVerification.integrityVerified === true ||
    restoreVerification.verified === true ||
    restoreVerification.restoredIntegrityVerified === true ||
    restoreVerification.restoredHashMatchesArchive === true;
  if (!explicit) return false;
  if (
    valueLooksPresent(restoreVerification.sourceHash) &&
    valueLooksPresent(restoreVerification.restoredHash) &&
    restoreVerification.sourceHash !== restoreVerification.restoredHash
  ) {
    return false;
  }
  return true;
}

function cleanupIsVerified(cleanup) {
  return cleanup?.verified === true ||
    cleanup?.cleanupVerified === true ||
    cleanup?.lifecycleCleanupVerified === true ||
    cleanup?.canaryCleanedUp === true ||
    cleanup?.temporaryArchiveCleaned === true;
}

function rollbackRecoveryIsVerified(rollbackRecovery) {
  return rollbackRecovery?.verified === true ||
    rollbackRecovery?.notesRecorded === true ||
    rollbackRecovery?.rollbackRecoveryVerified === true ||
    rollbackRecovery?.recoveryNotesRecorded === true;
}

function noPiiIsVerified(evidence) {
  return nestedValue(evidence, "noPiiExposed") === true ||
    nestedValue(evidence, "sanitizerResult")?.ok === true ||
    nestedValue(evidence, "sanitizerResult")?.sensitiveFindingCount === 0;
}

export function retentionArchiveRestoreMachineProofDomainValidation(evidence) {
  const errors = [];
  const missingRuntimeInputs = [];
  const kind = proofKind(evidence);
  const candidate = safeCandidateEvidence(evidence);
  const archive = archiveEvidence(evidence);
  const target = isolatedTargetEvidence(evidence);
  const restoreVerification = restoreVerificationEvidence(evidence);
  const cleanup = lifecycleCleanupEvidence(evidence);
  const rollbackRecovery = rollbackRecoveryEvidence(evidence);
  const simulatedFixture = isSimulatedMachineProofFixture(evidence);

  if (!simulatedFixture && (kind.includes("simulated") || evidence?.simulatedOnly === true)) {
    errors.push("retention archive/restore proof is simulated-only and cannot certify production retention recovery.");
  }
  if (kind.includes("checklist") || evidence?.checklistOnly === true || evidence?.metadata?.checklistOnly === true) {
    errors.push("retention archive/restore proof is checklist-only and cannot certify production retention recovery.");
  }
  if (kind.includes("dry-run") || evidence?.dryRunOnly === true || evidence?.metadata?.dryRunOnly === true) {
    errors.push("dry-run-only retention archive/restore proof cannot certify production retention recovery.");
  }
  if (
    evidence?.humanObserved === true ||
    evidence?.humanInteractionRequired === true ||
    evidence?.metadata?.humanObserved === true ||
    evidence?.metadata?.humanInteractionRequired === true
  ) {
    errors.push("retention archive/restore proof depends on human-observed evidence or human interaction.");
  }
  if (
    evidence?.manualApprovalRequired === true ||
    evidence?.operatorAcknowledgmentRequired === true ||
    evidence?.metadata?.manualApprovalRequired === true ||
    evidence?.metadata?.operatorAcknowledgmentRequired === true
  ) {
    errors.push("retention archive/restore proof depends on manual approval or operator acknowledgment.");
  }

  if (!candidateIsConfigured(candidate) || !hasPassingCheck(evidence, "safe-archive-candidate-selected")) {
    errors.push("safe retention archive candidate evidence is missing or unsafe.");
    missingRuntimeInputs.push(RETENTION_ARCHIVE_RESTORE_SAFE_CANDIDATE_INPUT);
  }
  if (!archiveIsConfigured(archive) || !hasPassingCheck(evidence, "archive-created-or-selected")) {
    errors.push("archive selection or creation evidence is missing.");
    missingRuntimeInputs.push(RETENTION_ARCHIVE_RESTORE_ARCHIVE_ACCESS_INPUT);
  }
  if (!archiveMetadataIsVerified(archive) || !hasPassingCheck(evidence, "archive-metadata-verified")) {
    errors.push("archive metadata verification proof is required.");
    missingRuntimeInputs.push(RETENTION_ARCHIVE_RESTORE_ARCHIVE_ACCESS_INPUT);
  }
  if (!targetIsConfigured(target) || !hasPassingCheck(evidence, "isolated-restore-target-created")) {
    errors.push("isolated retention restore target evidence is missing or unsafe.");
    missingRuntimeInputs.push(RETENTION_ARCHIVE_RESTORE_ISOLATED_TARGET_INPUT);
  }
  if (!restoreIntegrityIsVerified(restoreVerification) || !hasPassingCheck(evidence, "archive-restore-integrity-verified")) {
    errors.push("archive restore integrity verification proof is required.");
    missingRuntimeInputs.push(RETENTION_ARCHIVE_RESTORE_ARCHIVE_ACCESS_INPUT);
  }
  if (!noPiiIsVerified(evidence) || !hasPassingCheck(evidence, "no-pii-exposed")) {
    errors.push("retention proof must verify no PII was exposed.");
  }
  if (!cleanupIsVerified(cleanup) || !hasPassingCheck(evidence, "lifecycle-cleanup-verified")) {
    errors.push("lifecycle cleanup proof is required.");
    missingRuntimeInputs.push(RETENTION_ARCHIVE_RESTORE_SAFE_CANDIDATE_INPUT);
  }
  if (!rollbackRecoveryIsVerified(rollbackRecovery) || !hasPassingCheck(evidence, "rollback-recovery-notes-recorded")) {
    errors.push("rollback/recovery verification proof is required.");
  }
  if (!targetIsDestroyed(target) || !hasPassingCheck(evidence, "isolated-restore-target-destroyed")) {
    errors.push("isolated retention restore target destruction proof is required.");
    missingRuntimeInputs.push(RETENTION_ARCHIVE_RESTORE_ISOLATED_TARGET_INPUT);
  }

  return {
    ok: errors.length === 0,
    errors,
    missingRuntimeInputs: [...new Set(missingRuntimeInputs)],
  };
}

export function retentionArchiveRestoreMachineProofExtraValidation(evidence) {
  return retentionArchiveRestoreMachineProofDomainValidation(evidence).errors;
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

function buildRetentionChecks(attestation) {
  return RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_REQUIRED_CHECKS.map((name) => ({
    name,
    status: checkStatusFromAttestation(attestation, name),
  }));
}

function attestationBaseValidationErrors(attestation) {
  const errors = [];
  const simulatedFixture = isSimulatedMachineProofFixture(attestation);
  if (attestation?.nonInteractive !== true) errors.push("retention proof is not non-interactive.");
  if (attestation?.machineAttested !== true) errors.push("retention proof is not machine-attested.");
  if (attestation?.humanObserved === true || attestation?.humanInteractionRequired === true) {
    errors.push("retention proof depends on human-observed evidence or human interaction.");
  }
  if (attestation?.manualApprovalRequired === true) {
    errors.push("retention proof depends on manual approval.");
  }
  if (attestation?.generatedManually === true) errors.push("retention proof is marked manually generated.");
  if (!simulatedFixture && attestation?.environment !== "production") {
    errors.push("retention proof must target the production environment.");
  }
  if (simulatedFixture && attestation?.environment !== "machine-proof-simulation") {
    errors.push("simulated retention proof must remain in machine-proof-simulation environment.");
  }
  if (attestation?.status !== "pass") errors.push("retention proof status is not pass.");
  if (attestation?.certifying !== true && attestation?.CERTIFYING !== true) {
    errors.push("retention proof attestation is not certifying.");
  }
  return errors;
}

function buildRetentionMissingEvidence({ rootDir, missingRuntimeInputs, failures, generatedAt, commitHash = null }) {
  return buildMachineEvidence({
    evidenceType: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_EVIDENCE_TYPE,
    blockerId: "retention-archive-restore",
    generatedAt,
    commitHash,
    generatorScript: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG.generatorScript,
    command: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG.command,
    productionMutation: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG.productionMutation,
    status: "fail",
    certifying: false,
    checks: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_REQUIRED_CHECKS.map((name) => ({ name, status: "fail" })),
    failures,
    missingRuntimeInputs,
    sanitizedArtifacts: [
      RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_JSON_PATH,
      RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_MD_PATH,
    ],
    metadata: {
      proofMode: "machine-attested-retention-archive-restore-required",
      humanInteractionRequired: false,
      missingRuntimeInputs,
    },
    rootDir,
  });
}

export function buildRetentionArchiveRestoreMachineProofReport({
  rootDir = process.cwd(),
  env = process.env,
  argv = process.argv.slice(2),
  generatedAt = new Date().toISOString(),
  allowSimulation = false,
} = {}) {
  const args = parseMachineProofArgs(argv);
  const attestationInput = args.attestationPath ?? env[RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG.attestationEnv];
  const commitHash = env.CRP_MACHINE_EVIDENCE_COMMIT_HASH ?? null;
  let attestation = null;
  let attestationPathForArtifact = null;

  if (!attestationInput) {
    const resolved = resolveMachineProofRuntimeInputFixture({
      family: "retentionArchiveRestore",
      requiredChecks: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_REQUIRED_CHECKS,
      requiredInputs: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_RUNTIME_INPUTS,
      env,
      generatedAt,
      allowSimulation,
    });
    if (!resolved.resolved) {
      return buildRetentionMissingEvidence({
        rootDir,
        generatedAt,
        commitHash,
        missingRuntimeInputs: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_RUNTIME_INPUTS,
        failures: [
          {
            code: "retention-archive-restore-runtime-inputs-missing",
            message:
              "Non-interactive retention archive/restore proof requires a machine attestation plus archive access, isolated restore target, and safe archive candidate evidence.",
          },
        ],
      });
    }
    attestation = resolved.attestation;
  } else {
    const attestationPath = resolveInputPath(rootDir, attestationInput);
    if (!existsSync(attestationPath)) {
      return buildRetentionMissingEvidence({
        rootDir,
        generatedAt,
        commitHash,
        missingRuntimeInputs: [RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG.attestationEnv],
        failures: [
          {
            code: "retention-archive-restore-attestation-missing",
            message: "Retention archive/restore machine proof attestation file was not found.",
            path: path.relative(rootDir, attestationPath),
          },
        ],
      });
    }

    try {
      attestation = readJsonFile(attestationPath);
      attestationPathForArtifact = path.relative(rootDir, attestationPath).replace(/\\/g, "/");
    } catch (error) {
      return buildRetentionMissingEvidence({
        rootDir,
        generatedAt,
        commitHash,
        missingRuntimeInputs: [RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG.attestationEnv],
        failures: [
          {
            code: "retention-archive-restore-attestation-unreadable",
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      });
    }
  }

  const simulatedFixture = isSimulatedMachineProofFixture(attestation);
  const sensitiveFindings = findSensitiveEvidenceValues(attestation);
  const domainValidation = retentionArchiveRestoreMachineProofDomainValidation(attestation);
  const checks = buildRetentionChecks(attestation);
  const failedChecks = checks
    .filter((check) => check.status !== "pass")
    .map((check) => ({
      code: `${check.name}-failed`,
      message: `${check.name} did not pass in retention archive/restore machine proof attestation.`,
    }));
  const failures = [
    ...attestationBaseValidationErrors(attestation).map((message) => ({
      code: "retention-archive-restore-attestation-invalid",
      message,
    })),
    ...domainValidation.errors.map((message) => ({
      code: "retention-archive-restore-domain-invalid",
      message,
    })),
    ...sensitiveFindings.map((finding) => ({
      code: "retention-archive-restore-sensitive-value",
      message: `Sensitive value pattern rejected at ${finding.path}.`,
    })),
    ...failedChecks,
  ];
  const certifying = failures.length === 0;

  return buildMachineEvidence({
    evidenceType: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_EVIDENCE_TYPE,
    blockerId: "retention-archive-restore",
    environment: simulatedFixture ? "machine-proof-simulation" : "production",
    generatedAt,
    commitHash,
    generatorScript: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG.generatorScript,
    command: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG.command,
    productionMutation: simulatedFixture ? "none" : RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG.productionMutation,
    simulatedOnly: simulatedFixture,
    status: certifying ? "pass" : "fail",
    certifying,
    checks,
    failures,
    missingRuntimeInputs: domainValidation.missingRuntimeInputs,
    sanitizedArtifacts: [
      ...(attestationPathForArtifact ? [{ path: attestationPathForArtifact, type: "machine-attestation-input" }] : []),
      ...(simulatedFixture ? [{ path: "machine-proof-simulation:retention-archive-restore", type: "simulated-runtime-input-resolution" }] : []),
      RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_JSON_PATH,
      RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_MD_PATH,
    ],
    metadata: {
      proofMode: simulatedFixture
        ? "simulated-machine-proof-runtime-input-resolution"
        : "non-interactive-machine-attested-retention-archive-restore",
      retentionProofKind: nestedValue(attestation, "retentionProofKind", "proofKind", "retentionMode", "archiveRestoreMode"),
      safeArchiveCandidate: safeCandidateEvidence(attestation),
      archive: archiveEvidence(attestation),
      isolatedRestoreTarget: isolatedTargetEvidence(attestation),
      restoreVerification: restoreVerificationEvidence(attestation),
      lifecycleCleanup: lifecycleCleanupEvidence(attestation),
      rollbackRecovery: rollbackRecoveryEvidence(attestation),
      noPiiExposed: noPiiIsVerified(attestation),
      syntheticCanaryCleanupSucceeded:
        cleanupIsVerified(lifecycleCleanupEvidence(attestation)) && targetIsDestroyed(isolatedTargetEvidence(attestation)),
      humanInteractionRequired: false,
      attestationSource: simulatedFixture ? "simulated_machine_proof_fixture" : "machine-generated-json",
      ...(attestation?.metadata?.runtimeInputResolution
        ? { runtimeInputResolution: attestation.metadata.runtimeInputResolution }
        : {}),
    },
    rootDir,
  });
}

export async function runRetentionArchiveRestoreMachineProofCli({
  rootDir = process.cwd(),
  env = process.env,
  argv = process.argv.slice(2),
} = {}) {
  const args = parseMachineProofArgs(argv);
  const evidence = buildRetentionArchiveRestoreMachineProofReport({
    rootDir,
    env,
    argv,
    allowSimulation: true,
  });
  const jsonPath = args.jsonPath ?? RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_JSON_PATH;
  const markdownPath =
    jsonPath === RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_JSON_PATH
      ? RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_MD_PATH
      : jsonPath.replace(/\.json$/u, ".md");

  if (args.writeEvidence !== false) {
    writeMachineEvidenceOutputs(evidence, {
      jsonPath,
      markdownPath,
      rootDir,
      title: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG.title,
    });
  }

  const ok = evidence.certifying === true;
  process.stdout.write(
    JSON.stringify(
      {
        evidenceType: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_EVIDENCE_TYPE,
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

export function validateRetentionArchiveRestoreMachineProofEvidence(evidence, options = {}) {
  const base = validateMachineProofForConfig(RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG, evidence, options);
  const domain = retentionArchiveRestoreMachineProofDomainValidation(evidence);
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

export async function runRetentionArchiveRestoreMachineProofValidationCli({
  rootDir = process.cwd(),
  argv = process.argv.slice(2),
} = {}) {
  const args = parseMachineProofArgs(argv);
  const jsonPath = args.jsonPath ?? RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_JSON_PATH;
  const evidence = readMachineEvidenceFile(rootDir, jsonPath);
  const validation = validateRetentionArchiveRestoreMachineProofEvidence(evidence, {
    now: new Date().toISOString(),
  });

  process.stdout.write(
    JSON.stringify(
      {
        evidenceType: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_EVIDENCE_TYPE,
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
  runRetentionArchiveRestoreMachineProofCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
