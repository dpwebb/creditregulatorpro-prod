import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  buildMachineEvidence,
  repoPath,
  writeMachineEvidenceOutputs,
} from "./lib/productionEvidenceSchema.mjs";
import { sanitizeProductionEvidenceValue } from "./lib/sanitizeProductionEvidence.mjs";
import { findSensitiveEvidenceValues } from "./lib/productionMachineProofSanitizer.mjs";
import { readMachineEvidenceFile } from "./lib/validateMachineEvidence.mjs";
import {
  isMain,
  parseMachineProofArgs,
  validateMachineProofForConfig,
} from "./lib/machineProofScript.mjs";

export const ALERTING_MACHINE_PROOF_JSON_PATH = "docs/production-scale/evidence/latest-alerting-machine-proof.json";
export const ALERTING_MACHINE_PROOF_MD_PATH = "docs/production-scale/evidence/latest-alerting-machine-proof.md";
export const ALERTING_MACHINE_PROOF_EVIDENCE_TYPE = "ALERTING_OBSERVABILITY_MACHINE_PROOF";
export const ALERTING_MACHINE_PROOF_ATTESTATION_INPUT = "CRP_ALERTING_MACHINE_ATTESTATION_JSON";

export const ALERTING_MACHINE_PROOF_LIVE_CHECKS = [
  "synthetic-alert-triggered",
  "alert-delivery-verified",
  "sanitized-channel-id-recorded",
  "correlation-id-recorded",
  "machine-acknowledgment-verified",
  "retry-or-failure-behavior-recorded",
  "response-ops-readiness-verified",
  "scheduler-status-verified",
  "no-webhook-or-token-printed",
];

export const ALERTING_MACHINE_PROOF_EXCLUSION_CHECKS = [
  "formal-exclusion-file-validated",
  "policy-allows-certifying-exclusion",
  "compensating-controls-validated",
  "response-ops-readiness-verified",
  "scheduler-status-verified",
  "repo-policy-approval-machine-verified",
  "exclusion-not-stale",
  "next-review-recorded",
  "exclusion-does-not-overclaim-production-pass",
  "no-webhook-or-token-printed",
];

export const ALERTING_MACHINE_PROOF_CONFIG = {
  title: "Alerting Observability Machine Proof",
  evidenceType: ALERTING_MACHINE_PROOF_EVIDENCE_TYPE,
  jsonPath: ALERTING_MACHINE_PROOF_JSON_PATH,
  markdownPath: ALERTING_MACHINE_PROOF_MD_PATH,
  generatorScript: "scripts/alerting-machine-proof.mjs",
  command: "pnpm run alerts:machine-proof",
  attestationEnv: ALERTING_MACHINE_PROOF_ATTESTATION_INPUT,
  runtimeInputs: [ALERTING_MACHINE_PROOF_ATTESTATION_INPUT],
  productionMutation: "none",
  blockerIdsClosedWhenCertifying: ["L10-P1-005"],
  acceptedCheckSets: [
    {
      name: "live-alert-delivery",
      checks: ALERTING_MACHINE_PROOF_LIVE_CHECKS,
    },
    {
      name: "certifying-formal-exclusion",
      checks: ALERTING_MACHINE_PROOF_EXCLUSION_CHECKS,
    },
  ],
  requiredChecks: ALERTING_MACHINE_PROOF_LIVE_CHECKS,
};

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function nestedValue(evidence, ...keys) {
  for (const key of keys) {
    if (evidence?.[key] !== undefined) return evidence[key];
    if (evidence?.metadata?.[key] !== undefined) return evidence.metadata[key];
    if (evidence?.alerting?.[key] !== undefined) return evidence.alerting[key];
    if (evidence?.exclusion?.[key] !== undefined) return evidence.exclusion[key];
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

function dateLooksPresent(value) {
  return valueLooksPresent(value) && Number.isFinite(Date.parse(String(value)));
}

function isFutureOrCurrent(value, generatedAt) {
  const valueMs = Date.parse(String(value ?? ""));
  const generatedMs = Date.parse(String(generatedAt ?? ""));
  return Number.isFinite(valueMs) && Number.isFinite(generatedMs) && valueMs >= generatedMs;
}

function stringIncludes(value, pattern) {
  return pattern.test(String(value ?? ""));
}

function proofPath(evidence) {
  return String(
    nestedValue(evidence, "alertingProofPath", "alertingPath", "proofPath", "proofKind") ?? "",
  ).toLowerCase();
}

function acceptedCheckSet(evidence) {
  return String(nestedValue(evidence, "acceptedCheckSet") ?? "").toLowerCase();
}

function isFormalExclusionProof(evidence) {
  const pathValue = proofPath(evidence);
  const setValue = acceptedCheckSet(evidence);
  return (
    setValue === "certifying-formal-exclusion" ||
    pathValue === "certifying-formal-exclusion" ||
    pathValue === "formal-exclusion"
  );
}

function isLiveAlertProof(evidence) {
  const pathValue = proofPath(evidence);
  const setValue = acceptedCheckSet(evidence);
  return setValue === "live-alert-delivery" || pathValue === "live-alert" || pathValue === "live-alert-delivery";
}

function boolValue(evidence, ...keys) {
  return keys.some((key) => nestedValue(evidence, key) === true);
}

function schedulerStatus(evidence) {
  return nestedValue(evidence, "schedulerStatus", "scheduler", "schedulerVerification");
}

function schedulerStatusVerified(evidence) {
  const value = schedulerStatus(evidence);
  if (value === true) return true;
  if (asObject(value)) {
    const status = String(value.status ?? value.result ?? "").toLowerCase();
    return value.verified === true || value.passed === true || ["pass", "passed", "verified", "disabled", "healthy"].includes(status);
  }
  return typeof value === "string" && value.trim().length > 0 && !/unknown|missing|placeholder/i.test(value);
}

function responseOpsReady(evidence) {
  const value = nestedValue(evidence, "responseOpsReady", "responseOpsReadiness", "responseOperationsReady");
  if (value === true) return true;
  if (asObject(value)) {
    const status = String(value.status ?? value.result ?? "").toLowerCase();
    return value.ready === true || value.verified === true || value.passed === true || ["pass", "passed", "ready"].includes(status);
  }
  return false;
}

function deliveryTimestamp(evidence) {
  return nestedValue(evidence, "deliveryTimestamp", "deliveredAt", "deliveryVerifiedAt");
}

function alertType(evidence) {
  return nestedValue(evidence, "alertType", "syntheticAlertType", "type");
}

function channelSanitizedId(evidence) {
  return nestedValue(evidence, "channelSanitizedId", "sanitizedChannelId", "channelId");
}

function correlationId(evidence) {
  return nestedValue(evidence, "correlationId", "correlationID", "dedupeKey");
}

function deliveryVerified(evidence) {
  return boolValue(evidence, "deliveryVerified", "alertDeliveryVerified", "delivered");
}

function policyAllowsExclusion(evidence) {
  return boolValue(
    evidence,
    "policyAllowsCertificationUnderExclusion",
    "policyAllowsFormalExclusion",
    "policyAllowsCertifyingExclusion",
  );
}

function exclusionExpiry(evidence) {
  return nestedValue(evidence, "exclusionExpiresAt", "expiresOn", "reviewOrExpiryDate");
}

function exclusionNextReview(evidence) {
  return nestedValue(evidence, "nextReviewDate", "exclusionNextReviewDate");
}

function overclaimStatementPresent(evidence) {
  const value = nestedValue(
    evidence,
    "exclusionDoesNotMeanProductionAtScalePassUnlessPolicyAllows",
    "productionAtScalePassStatement",
  );
  return value === true || stringIncludes(value, /not\s+(?:mean|equal|claim).*production-at-scale\s+pass|production-at-scale\s+pass.*unless\s+policy/i);
}

function selectedRequiredChecks(attestation) {
  return isFormalExclusionProof(attestation)
    ? ALERTING_MACHINE_PROOF_EXCLUSION_CHECKS
    : ALERTING_MACHINE_PROOF_LIVE_CHECKS;
}

function buildAlertingChecks(attestation) {
  return selectedRequiredChecks(attestation).map((name) => ({
    name,
    status: hasPassingCheck(attestation, name) ? "pass" : "fail",
  }));
}

export function alertingMachineProofDomainValidation(evidence) {
  const errors = [];
  const kind = proofPath(evidence);
  const generatedAt = evidence?.generatedAt ?? new Date().toISOString();

  if (evidence?.dryRunOnly === true || kind.includes("dry-run")) {
    errors.push("dry-run-only alert evidence cannot certify production alerting proof.");
  }
  if (evidence?.simulatedOnly === true || kind.includes("simulated")) {
    errors.push("simulated-only alert evidence cannot certify production alerting proof.");
  }
  if (
    evidence?.humanObserved === true ||
    evidence?.metadata?.humanObserved === true ||
    evidence?.manualApprovalRequired === true ||
    evidence?.metadata?.manualApprovalRequired === true ||
    evidence?.operatorAcknowledgmentRequired === true ||
    evidence?.operatorAcknowledgementRequired === true ||
    evidence?.operatorAcknowledgment === true ||
    evidence?.operatorAcknowledgement === true ||
    evidence?.operatorAcknowledgementSigned === true
  ) {
    errors.push("alerting proof depends on human observation, manual approval, or operator acknowledgment.");
  }

  if (!responseOpsReady(evidence) || !hasPassingCheck(evidence, "response-ops-readiness-verified")) {
    errors.push("response operations readiness proof is required.");
  }
  if (!schedulerStatusVerified(evidence) || !hasPassingCheck(evidence, "scheduler-status-verified")) {
    errors.push("scheduler status proof is required.");
  }

  if (isFormalExclusionProof(evidence)) {
    if (!policyAllowsExclusion(evidence) || !hasPassingCheck(evidence, "policy-allows-certifying-exclusion")) {
      errors.push("formal alerting exclusion requires explicit repo policy allowing certification under exclusion.");
    }
    if (!hasPassingCheck(evidence, "formal-exclusion-file-validated")) {
      errors.push("formal alerting exclusion file must be machine-validated.");
    }
    if (!hasPassingCheck(evidence, "compensating-controls-validated")) {
      errors.push("formal alerting exclusion requires machine-validated compensating controls.");
    }
    if (!hasPassingCheck(evidence, "repo-policy-approval-machine-verified")) {
      errors.push("formal alerting exclusion requires machine-verifiable repo policy approval.");
    }
    if (!hasPassingCheck(evidence, "exclusion-not-stale")) {
      errors.push("formal alerting exclusion must be unexpired.");
    }
    if (!hasPassingCheck(evidence, "next-review-recorded")) {
      errors.push("formal alerting exclusion must record a next review date.");
    }
    if (!hasPassingCheck(evidence, "exclusion-does-not-overclaim-production-pass") || !overclaimStatementPresent(evidence)) {
      errors.push("formal alerting exclusion must state it does not overclaim production-at-scale PASS.");
    }
    const expiry = exclusionExpiry(evidence);
    if (!dateLooksPresent(expiry) || !isFutureOrCurrent(expiry, generatedAt)) {
      errors.push("formal alerting exclusion is stale or missing an unexpired expiration date.");
    }
    const nextReview = exclusionNextReview(evidence);
    if (!dateLooksPresent(nextReview) || !isFutureOrCurrent(nextReview, generatedAt)) {
      errors.push("formal alerting exclusion is missing a current next review date.");
    }
    return {
      ok: errors.length === 0,
      errors,
      missingRuntimeInputs: [],
    };
  }

  if (!isLiveAlertProof(evidence)) {
    errors.push("alerting machine proof must be live-alert delivery or a certifying formal exclusion.");
  }
  if (!valueLooksPresent(alertType(evidence))) errors.push("alert type is required.");
  if (!valueLooksPresent(channelSanitizedId(evidence)) || !hasPassingCheck(evidence, "sanitized-channel-id-recorded")) {
    errors.push("sanitized alert channel identifier is required.");
  }
  if (!valueLooksPresent(correlationId(evidence)) || !hasPassingCheck(evidence, "correlation-id-recorded")) {
    errors.push("alert correlation ID is required.");
  }
  if (!dateLooksPresent(deliveryTimestamp(evidence))) {
    errors.push("alert delivery timestamp is required.");
  }
  if (!deliveryVerified(evidence) || !hasPassingCheck(evidence, "alert-delivery-verified")) {
    errors.push("alert delivery verification is required.");
  }
  if (!hasPassingCheck(evidence, "synthetic-alert-triggered")) {
    errors.push("safe synthetic alert trigger proof is required.");
  }
  if (!hasPassingCheck(evidence, "no-webhook-or-token-printed")) {
    errors.push("proof must attest that no webhook URL or token was printed.");
  }

  return {
    ok: errors.length === 0,
    errors,
    missingRuntimeInputs: [],
  };
}

export function alertingMachineProofExtraValidation(evidence) {
  return alertingMachineProofDomainValidation(evidence).errors;
}

function resolveInputPath(rootDir, inputPath) {
  return path.isAbsolute(inputPath) ? inputPath : repoPath(rootDir, inputPath);
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function attestationBaseValidationErrors(attestation) {
  const errors = [];
  if (attestation?.nonInteractive !== true) errors.push("alerting proof is not non-interactive.");
  if (attestation?.machineAttested !== true) errors.push("alerting proof is not machine-attested.");
  if (attestation?.generatedManually === true) errors.push("alerting proof is marked manually generated.");
  if (attestation?.environment !== "production") errors.push("alerting proof must target production.");
  if (attestation?.status !== "pass") errors.push("alerting proof status is not pass.");
  if (attestation?.certifying !== true && attestation?.CERTIFYING !== true) {
    errors.push("alerting attestation is not certifying.");
  }
  return errors;
}

function buildAlertingMissingEvidence({ rootDir, generatedAt, commitHash = null, failures, missingRuntimeInputs }) {
  const base = buildMachineEvidence({
    evidenceType: ALERTING_MACHINE_PROOF_EVIDENCE_TYPE,
    blockerId: "L10-P1-005",
    generatedAt,
    commitHash,
    generatorScript: ALERTING_MACHINE_PROOF_CONFIG.generatorScript,
    command: ALERTING_MACHINE_PROOF_CONFIG.command,
    productionMutation: "none",
    status: "fail",
    certifying: false,
    checks: ALERTING_MACHINE_PROOF_LIVE_CHECKS.map((name) => ({ name, status: "fail" })),
    failures,
    missingRuntimeInputs,
    sanitizedArtifacts: [ALERTING_MACHINE_PROOF_JSON_PATH, ALERTING_MACHINE_PROOF_MD_PATH],
    metadata: {
      proofMode: "machine-attested-alerting-required",
      humanInteractionRequired: false,
      missingRuntimeInputs,
    },
    rootDir,
  });

  return sanitizeProductionEvidenceValue({
    ...base,
    alertType: null,
    channelSanitizedId: null,
    correlationId: null,
    deliveryTimestamp: null,
    deliveryVerified: false,
    responseOpsReady: false,
    schedulerStatus: null,
    sanitizerResult: {
      passed: true,
      sensitiveFindingCount: 0,
      sensitiveFindingCodes: [],
    },
  });
}

function buildAlertingEvidenceFromAttestation({
  rootDir,
  generatedAt,
  commitHash,
  attestation,
  attestationPath,
}) {
  const sensitiveFindings = findSensitiveEvidenceValues(attestation);
  const domainValidation = alertingMachineProofDomainValidation({
    ...attestation,
    generatedAt,
    checks: Array.isArray(attestation?.checks) ? attestation.checks : [],
  });
  const checks = buildAlertingChecks(attestation);
  const failedChecks = checks
    .filter((check) => check.status !== "pass")
    .map((check) => ({
      code: `${check.name}-failed`,
      message: `${check.name} did not pass in alerting machine proof attestation.`,
    }));
  const failures = [
    ...attestationBaseValidationErrors(attestation).map((message) => ({
      code: "alerting-machine-proof-attestation-invalid",
      message,
    })),
    ...domainValidation.errors.map((message) => ({
      code: "alerting-machine-proof-domain-invalid",
      message,
    })),
    ...sensitiveFindings.map((finding) => ({
      code: "alerting-machine-proof-sensitive-value",
      message: `Sensitive value pattern rejected at ${finding.path}.`,
    })),
    ...failedChecks,
  ];
  const certifying = failures.length === 0;
  const proofMode = isFormalExclusionProof(attestation)
    ? "certifying-formal-exclusion"
    : "live-alert-delivery";

  const base = buildMachineEvidence({
    evidenceType: ALERTING_MACHINE_PROOF_EVIDENCE_TYPE,
    blockerId: "L10-P1-005",
    environment: "production",
    generatedAt,
    commitHash,
    generatorScript: ALERTING_MACHINE_PROOF_CONFIG.generatorScript,
    command: ALERTING_MACHINE_PROOF_CONFIG.command,
    productionMutation: "none",
    status: certifying ? "pass" : "fail",
    certifying,
    checks,
    failures,
    missingRuntimeInputs: domainValidation.missingRuntimeInputs,
    sanitizedArtifacts: [
      ALERTING_MACHINE_PROOF_JSON_PATH,
      ALERTING_MACHINE_PROOF_MD_PATH,
      ...(attestationPath ? [{ path: attestationPath, type: "machine-attestation-input" }] : []),
    ],
    metadata: {
      proofMode,
      acceptedCheckSet: proofMode,
      alertingProofPath: isFormalExclusionProof(attestation) ? "certifying-formal-exclusion" : "live-alert",
      policyAllowsCertificationUnderExclusion: policyAllowsExclusion(attestation),
      exclusionExpiresAt: exclusionExpiry(attestation) ?? null,
      nextReviewDate: exclusionNextReview(attestation) ?? null,
      exclusionDoesNotMeanProductionAtScalePassUnlessPolicyAllows:
        nestedValue(
          attestation,
          "exclusionDoesNotMeanProductionAtScalePassUnlessPolicyAllows",
          "productionAtScalePassStatement",
        ) ?? null,
      alertType: alertType(attestation) ?? null,
      channelSanitizedId: channelSanitizedId(attestation) ?? null,
      correlationId: correlationId(attestation) ?? null,
      deliveryTimestamp: deliveryTimestamp(attestation) ?? null,
      deliveryVerified: deliveryVerified(attestation),
      responseOpsReady: responseOpsReady(attestation),
      schedulerStatus: schedulerStatus(attestation) ?? null,
      humanInteractionRequired: false,
      attestationSource: "machine-generated-json",
    },
    rootDir,
  });

  return sanitizeProductionEvidenceValue({
    ...base,
    alertType: alertType(attestation) ?? null,
    channelSanitizedId: channelSanitizedId(attestation) ?? null,
    correlationId: correlationId(attestation) ?? null,
    deliveryTimestamp: deliveryTimestamp(attestation) ?? null,
    deliveryVerified: deliveryVerified(attestation),
    responseOpsReady: responseOpsReady(attestation),
    schedulerStatus: schedulerStatus(attestation) ?? null,
    sanitizerResult: {
      passed: sensitiveFindings.length === 0,
      sensitiveFindingCount: sensitiveFindings.length,
      sensitiveFindingCodes: [...new Set(sensitiveFindings.map((finding) => finding.code))],
    },
  });
}

export function buildAlertingMachineProofReport({
  rootDir = process.cwd(),
  env = process.env,
  argv = process.argv.slice(2),
  generatedAt = new Date().toISOString(),
} = {}) {
  const args = parseMachineProofArgs(argv);
  const attestationInput = args.attestationPath ?? env[ALERTING_MACHINE_PROOF_CONFIG.attestationEnv];
  const commitHash = env.CRP_MACHINE_EVIDENCE_COMMIT_HASH ?? null;

  if (!attestationInput) {
    return buildAlertingMissingEvidence({
      rootDir,
      generatedAt,
      commitHash,
      missingRuntimeInputs: [ALERTING_MACHINE_PROOF_ATTESTATION_INPUT],
      failures: [
        {
          code: "alerting-machine-proof-runtime-inputs-missing",
          message:
            "Non-interactive alerting proof requires a sanitized machine attestation for live synthetic delivery or a repo-policy-approved automated exclusion.",
        },
      ],
    });
  }

  const attestationPath = resolveInputPath(rootDir, attestationInput);
  if (!existsSync(attestationPath)) {
    return buildAlertingMissingEvidence({
      rootDir,
      generatedAt,
      commitHash,
      missingRuntimeInputs: [ALERTING_MACHINE_PROOF_ATTESTATION_INPUT],
      failures: [
        {
          code: "alerting-machine-proof-attestation-missing",
          message: "Alerting machine proof attestation file was not found.",
          path: path.relative(rootDir, attestationPath),
        },
      ],
    });
  }

  let attestation;
  try {
    attestation = readJsonFile(attestationPath);
  } catch (error) {
    return buildAlertingMissingEvidence({
      rootDir,
      generatedAt,
      commitHash,
      missingRuntimeInputs: [ALERTING_MACHINE_PROOF_ATTESTATION_INPUT],
      failures: [
        {
          code: "alerting-machine-proof-attestation-unreadable",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    });
  }

  return buildAlertingEvidenceFromAttestation({
    rootDir,
    generatedAt,
    commitHash,
    attestation,
    attestationPath: path.relative(rootDir, attestationPath).replace(/\\/g, "/"),
  });
}

export async function runAlertingMachineProofCli({
  rootDir = process.cwd(),
  env = process.env,
  argv = process.argv.slice(2),
} = {}) {
  const args = parseMachineProofArgs(argv);
  const resolvedRootDir = args.rootDir ?? rootDir;
  const evidence = buildAlertingMachineProofReport({ rootDir: resolvedRootDir, env, argv });
  const jsonPath = args.jsonPath ?? ALERTING_MACHINE_PROOF_JSON_PATH;
  const markdownPath =
    jsonPath === ALERTING_MACHINE_PROOF_JSON_PATH
      ? ALERTING_MACHINE_PROOF_MD_PATH
      : jsonPath.replace(/\.json$/u, ".md");

  if (args.writeEvidence !== false) {
    writeMachineEvidenceOutputs(evidence, {
      jsonPath,
      markdownPath,
      rootDir: resolvedRootDir,
      title: ALERTING_MACHINE_PROOF_CONFIG.title,
    });
  }

  const ok = evidence.certifying === true;
  process.stdout.write(
    JSON.stringify(
      {
        evidenceType: ALERTING_MACHINE_PROOF_EVIDENCE_TYPE,
        certifying: ok,
        status: evidence.status,
        alertType: evidence.alertType ?? null,
        channelSanitizedId: evidence.channelSanitizedId ?? null,
        correlationId: evidence.correlationId ?? null,
        deliveryVerified: evidence.deliveryVerified === true,
        responseOpsReady: evidence.responseOpsReady === true,
        schedulerStatus: evidence.schedulerStatus ?? null,
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

export function validateAlertingMachineProofEvidence(evidence, options = {}) {
  const base = validateMachineProofForConfig(ALERTING_MACHINE_PROOF_CONFIG, evidence, options);
  const domain = alertingMachineProofDomainValidation(evidence);
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

export async function runAlertingMachineProofValidationCli({
  rootDir = process.cwd(),
  argv = process.argv.slice(2),
} = {}) {
  const args = parseMachineProofArgs(argv);
  const resolvedRootDir = args.rootDir ?? rootDir;
  const jsonPath = args.jsonPath ?? ALERTING_MACHINE_PROOF_JSON_PATH;
  const evidence = readMachineEvidenceFile(resolvedRootDir, jsonPath);
  const validation = validateAlertingMachineProofEvidence(evidence, { now: new Date().toISOString() });

  process.stdout.write(
    JSON.stringify(
      {
        evidenceType: ALERTING_MACHINE_PROOF_EVIDENCE_TYPE,
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
  runAlertingMachineProofCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
