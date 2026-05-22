import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALERTING_MACHINE_PROOF_ATTESTATION_INPUT,
  buildAlertingMachineProofReport,
} from "./alerting-machine-proof.mjs";
import {
  buildProductionWorkerMachineProofReport,
  PRODUCTION_WORKER_MACHINE_PROOF_RUNTIME_INPUTS,
} from "./production-worker-machine-proof.mjs";
import {
  buildRestoreMachineProofReport,
  RESTORE_MACHINE_ISOLATED_TARGET_INPUT,
  RESTORE_MACHINE_PROOF_RUNTIME_INPUTS,
} from "./restore-machine-proof.mjs";
import {
  buildRetentionArchiveRestoreMachineProofReport,
  RETENTION_ARCHIVE_RESTORE_ISOLATED_TARGET_INPUT,
  RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_RUNTIME_INPUTS,
} from "./retention-archive-restore-machine-proof.mjs";
import {
  RAW_REPORT_DATABASE_ACCESS_INPUT,
  RAW_REPORT_MACHINE_PROOF_CONFIG,
  RAW_REPORT_MACHINE_PROOF_RUNTIME_INPUTS,
  resolveRawReportDatabaseAccess,
} from "./storage-raw-report-machine-proof.mjs";

export const PRODUCTION_PROOF_PREFLIGHT_JSON_PATH =
  "docs/production-scale/evidence/latest-production-proof-preflight.json";
export const PRODUCTION_PROOF_PREFLIGHT_MD_PATH =
  "docs/production-scale/evidence/latest-production-proof-preflight.md";

const DEFAULT_CERTIFICATION_JSON_PATH =
  "docs/production-scale/evidence/latest-production-scale-certification.json";
const DEFAULT_PROMOTION_PACK_JSON_PATH =
  "docs/production-scale/evidence/latest-production-promotion-pack.json";

const SIMULATION_VALUE_PATTERN =
  /(?:^|[^a-z])(?:simulated|simulation|machine-proof-simulation|simulated_machine_proof_fixture|mock-only|fake-only|test-only)(?:[^a-z]|$)/i;
const UNSAFE_PRODUCTION_TARGET_PATTERN =
  /(?:creditregulatorpro-prod|production(?:[_\-.]|$)|prod(?:[_\-.]|$)|\/prod(?:\/|$)|main-production|primary-production)/i;
const DESTRUCTIVE_WORKER_PATTERN =
  /(?:destructive|all-jobs|unbounded|delete|truncate|drop|production-apply|live-drain-all)/i;

function repoRootFromScript() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function envValue(env, name) {
  const value = env?.[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

function safeRelativePath(rootDir, inputPath) {
  if (!inputPath) return null;
  const absolute = path.isAbsolute(inputPath) ? inputPath : path.resolve(rootDir, inputPath);
  const relative = path.relative(rootDir, absolute).replace(/\\/g, "/");
  return relative.startsWith("..") ? "[outside-repository-path]" : relative;
}

function parseMaybeJson(value) {
  if (!value || !/^\s*[{[]/.test(value)) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function looksSimulationOnly(value) {
  if (!value) return false;
  return SIMULATION_VALUE_PATTERN.test(String(value));
}

function objectFlag(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  for (const key of keys) {
    if (value[key] !== undefined) return value[key];
  }
  return undefined;
}

function objectBool(value, keys) {
  const found = objectFlag(value, keys);
  return found === true ? true : found === false ? false : undefined;
}

function evidenceMetadata(report, key) {
  return report?.metadata && typeof report.metadata === "object" ? report.metadata[key] : undefined;
}

function readJsonIfPresent(rootDir, relativePath) {
  const absolutePath = path.resolve(rootDir, relativePath);
  if (!existsSync(absolutePath)) return { exists: false, parsed: null };
  try {
    return { exists: true, parsed: JSON.parse(readFileSync(absolutePath, "utf8")) };
  } catch {
    return { exists: true, parsed: null };
  }
}

function inputStatus(env, name, { syntheticPresent = false } = {}) {
  const value = envValue(env, name);
  const present = syntheticPresent || Boolean(value);
  return {
    name,
    present,
    missing: !present,
    simulationOnly: Boolean(value && looksSimulationOnly(value)),
  };
}

function loadAttestation(rootDir, env, inputName) {
  const rawPath = envValue(env, inputName);
  if (!rawPath) {
    return {
      inputName,
      present: false,
      fileExists: false,
      parseable: false,
      simulationOnly: false,
      sanitizedPath: null,
      parsed: null,
      errors: ["The machine attestation input is missing."],
    };
  }

  const absolutePath = path.isAbsolute(rawPath) ? rawPath : path.resolve(rootDir, rawPath);
  const sanitizedPath = safeRelativePath(rootDir, rawPath);
  if (!existsSync(absolutePath)) {
    return {
      inputName,
      present: true,
      fileExists: false,
      parseable: false,
      simulationOnly: looksSimulationOnly(rawPath),
      sanitizedPath,
      parsed: null,
      errors: ["The machine attestation input is present, but the referenced file was not found."],
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(absolutePath, "utf8"));
    const simulationOnly =
      parsed?.simulatedOnly === true ||
      parsed?.environment === "machine-proof-simulation" ||
      parsed?.metadata?.runtimeInputResolution?.source === "simulated_machine_proof_fixture" ||
      looksSimulationOnly(rawPath);
    return {
      inputName,
      present: true,
      fileExists: true,
      parseable: true,
      simulationOnly,
      sanitizedPath,
      parsed,
      errors: [],
    };
  } catch {
    return {
      inputName,
      present: true,
      fileExists: true,
      parseable: false,
      simulationOnly: looksSimulationOnly(rawPath),
      sanitizedPath,
      parsed: null,
      errors: ["The machine attestation file exists, but it is not readable JSON."],
    };
  }
}

function targetLooksProduction(value, targetObject) {
  if (targetObject && typeof targetObject === "object") {
    if (targetObject.productionTarget === true) return true;
    if (targetObject.productionDatabaseReachable === true) return true;
    if (targetObject.targetEnvironment === "production") return true;
    if (targetObject.environment === "production") return true;
  }
  return Boolean(value && UNSAFE_PRODUCTION_TARGET_PATTERN.test(String(value)));
}

function targetClearlyNotProduction({ env, inputName, targetObject }) {
  const value = envValue(env, inputName);
  const envObject = parseMaybeJson(value);
  const target = envObject && typeof envObject === "object" ? envObject : targetObject;
  if (!value && !targetObject) {
    return {
      ok: false,
      status: "missing",
      message: "No isolated target was configured.",
    };
  }
  if (targetLooksProduction(value, target)) {
    return {
      ok: false,
      status: "unsafe",
      message: "The target looks like production or can reach production.",
    };
  }
  const isolated = objectBool(target, ["isolated", "temporary", "sandboxed"]);
  const productionTarget = objectBool(target, ["productionTarget"]);
  const productionReachable = objectBool(target, ["productionDatabaseReachable", "productionStorageReachable"]);
  if (isolated === true || productionTarget === false || productionReachable === false) {
    return {
      ok: true,
      status: "safe",
      message: "The target is clearly marked as isolated and not production.",
    };
  }
  return {
    ok: false,
    status: "unclear",
    message: "The target is not clearly marked as isolated and not production.",
  };
}

function workerCanaryIsNonDestructive({ env, report }) {
  const value = envValue(env, "CRP_PRODUCTION_WORKER_CANARY_JOB_ACCESS");
  const objectValue = parseMaybeJson(value);
  if (value && DESTRUCTIVE_WORKER_PATTERN.test(value)) {
    return {
      ok: false,
      status: "unsafe",
      message: "The worker canary configuration contains a destructive or unbounded marker.",
    };
  }
  if (objectValue && objectValue.destructive === true) {
    return {
      ok: false,
      status: "unsafe",
      message: "The worker canary configuration is marked destructive.",
    };
  }

  const boundedRun = evidenceMetadata(report, "boundedRun") ?? {};
  const canaryJob = evidenceMetadata(report, "canaryJob") ?? {};
  const stopRollback = evidenceMetadata(report, "stopRollback") ?? {};
  const mutation = report?.productionMutation;
  const maxJobs = Number(boundedRun.maxJobs);
  const bounded = Number.isInteger(maxJobs) && maxJobs >= 1 && maxJobs <= 5;
  const onlyCanary = boundedRun.onlyCanaryJobProcessed === true || canaryJob.onlyCanaryJobProcessed === true;
  const cleanup = canaryJob.cleanupVerified === true || canaryJob.cleanedUp === true;
  const rollback = stopRollback.verified === true || stopRollback.status === "pass";
  const mutationAllowed = mutation === "synthetic-canary-cleaned-up" || mutation === "approved-bounded";

  if (bounded && onlyCanary && cleanup && rollback && mutationAllowed) {
    return {
      ok: true,
      status: "safe",
      message: "The worker canary is bounded, cleanup is verified, and rollback control is present.",
    };
  }
  return {
    ok: false,
    status: "unclear",
    message: "The worker canary is not clearly bounded and non-destructive.",
  };
}

function alertingRouteIsApproved({ report, attestation }) {
  const metadata = report?.metadata ?? {};
  const noExternalDelivery =
    report?.noExternalDelivery === true ||
    metadata.noExternalDelivery === true ||
    attestation?.noExternalDelivery === true;
  const sinkAvailable =
    report?.alertSinkAvailable === true ||
    metadata.alertSinkAvailable === true ||
    attestation?.alertSinkAvailable === true;
  const externalDeliveryUsed =
    report?.externalDeliveryUsed === true ||
    metadata.externalDeliveryUsed === true ||
    attestation?.externalDeliveryUsed === true;
  const approvedTestRoute =
    report?.approvedTestRoute === true ||
    report?.approvedTestRouteConfigured === true ||
    report?.externalDeliveryApproved === true ||
    metadata.approvedTestRoute === true ||
    metadata.approvedTestRouteConfigured === true ||
    metadata.externalDeliveryApproved === true ||
    attestation?.approvedTestRoute === true ||
    attestation?.approvedTestRouteConfigured === true ||
    attestation?.externalDeliveryApproved === true;

  if (sinkAvailable || noExternalDelivery) {
    return {
      ok: true,
      status: "sink",
      message: "Alerting is configured for a sink or no-external-delivery route.",
    };
  }
  if (externalDeliveryUsed && approvedTestRoute) {
    return {
      ok: true,
      status: "approved-test-route",
      message: "Alerting uses an approved real test route.",
    };
  }
  if (externalDeliveryUsed) {
    return {
      ok: false,
      status: "unsafe-external",
      message: "External alert delivery is configured but not explicitly approved for this proof.",
    };
  }
  return {
    ok: false,
    status: "unclear",
    message: "Alerting is not clearly configured for an approved test route or sink.",
  };
}

function retentionTargetIsSafe({ env, report }) {
  return targetClearlyNotProduction({
    env,
    inputName: RETENTION_ARCHIVE_RESTORE_ISOLATED_TARGET_INPUT,
    targetObject: evidenceMetadata(report, "isolatedRestoreTarget"),
  });
}

function familyReadiness({
  key,
  label,
  requiredInputs,
  inputStatuses,
  attestationStatus,
  report,
  safetyChecks,
  reportPath,
}) {
  const presentInputs = inputStatuses.filter((input) => input.present).map((input) => input.name);
  const missingInputs = inputStatuses.filter((input) => input.missing).map((input) => input.name);
  const simulationOnlyInputs = unique([
    ...inputStatuses.filter((input) => input.simulationOnly).map((input) => input.name),
    ...(attestationStatus?.simulationOnly ? [attestationStatus.inputName] : []),
    ...(report?.simulatedOnly === true ? requiredInputs : []),
  ]);
  const safetyFailed = safetyChecks.filter((check) => check.ok !== true);
  const attestationErrors = attestationStatus?.errors ?? [];
  const proofFailures = Array.isArray(report?.failures) ? report.failures.map((failure) => failure.message ?? failure.code) : [];
  const readyForRealEvidence =
    missingInputs.length === 0 &&
    simulationOnlyInputs.length === 0 &&
    attestationErrors.length === 0 &&
    report?.certifying === true &&
    report?.simulatedOnly !== true &&
    safetyFailed.length === 0;

  return {
    key,
    label,
    readyForRealEvidence,
    reportPath,
    realInputs: inputStatuses,
    presentInputs,
    missingInputs,
    simulationOnlyInputs,
    attestation: attestationStatus
      ? {
          inputName: attestationStatus.inputName,
          present: attestationStatus.present,
          fileExists: attestationStatus.fileExists,
          parseable: attestationStatus.parseable,
          simulationOnly: attestationStatus.simulationOnly,
          sanitizedPath: attestationStatus.sanitizedPath,
          errors: attestationErrors,
        }
      : null,
    proofStatus: {
      certifying: report?.certifying === true,
      status: report?.status ?? "not-run",
      simulatedOnly: report?.simulatedOnly === true,
      missingRuntimeInputs: Array.isArray(report?.missingRuntimeInputs) ? report.missingRuntimeInputs : [],
      failures: proofFailures,
    },
    safetyChecks,
    plainEnglishStatus: readyForRealEvidence
      ? "Ready to run with real evidence."
      : "Not ready to run with real evidence.",
  };
}

function rawReportReadiness({ rootDir, env }) {
  const dbAccess = resolveRawReportDatabaseAccess(env);
  const attestation = loadAttestation(rootDir, env, RAW_REPORT_MACHINE_PROOF_CONFIG.attestationEnv);
  const dbInput = {
    ...inputStatus(env, RAW_REPORT_DATABASE_ACCESS_INPUT, { syntheticPresent: Boolean(dbAccess) }),
    resolvedSourceName: dbAccess?.sourceName ?? null,
  };
  const attestationInput = inputStatus(env, RAW_REPORT_MACHINE_PROOF_CONFIG.attestationEnv);
  const inputStatuses = [dbInput, attestationInput];
  const missingInputs = dbAccess || attestation.present
    ? []
    : RAW_REPORT_MACHINE_PROOF_RUNTIME_INPUTS;
  const simulationOnlyInputs = inputStatuses.filter((input) => input.simulationOnly).map((input) => input.name);
  const readyForRealEvidence = missingInputs.length === 0 && simulationOnlyInputs.length === 0;

  return {
    key: "rawReport",
    label: "Raw report byte proof",
    readyForRealEvidence,
    reportPath: RAW_REPORT_MACHINE_PROOF_CONFIG.jsonPath,
    realInputs: inputStatuses,
    presentInputs: inputStatuses.filter((input) => input.present).map((input) => input.name),
    missingInputs,
    simulationOnlyInputs,
    attestation: attestation.present
      ? {
          inputName: attestation.inputName,
          present: attestation.present,
          fileExists: attestation.fileExists,
          parseable: attestation.parseable,
          simulationOnly: attestation.simulationOnly,
          sanitizedPath: attestation.sanitizedPath,
          errors: attestation.errors,
        }
      : null,
    proofStatus: {
      certifying: null,
      status: readyForRealEvidence ? "ready-to-attempt" : "not-ready",
      simulatedOnly: false,
      missingRuntimeInputs: missingInputs,
      failures: [],
    },
    safetyChecks: [{
      key: "read-only-database-source",
      ok: Boolean(dbAccess || attestation.present),
      status: dbAccess ? "source-present" : attestation.present ? "attestation-present" : "missing",
      message: dbAccess
        ? "A supported database access source is present by name only."
        : attestation.present
          ? "A raw-report attestation file is present."
          : "No raw-report database source or attestation input is present.",
    }],
    plainEnglishStatus: readyForRealEvidence
      ? "Ready to run with real evidence."
      : "Not ready to run with real evidence.",
  };
}

function buildAttestedFamilies({ rootDir, env, generatedAt }) {
  const restoreReport = buildRestoreMachineProofReport({ rootDir, env, argv: [], generatedAt, allowSimulation: false });
  const workerReport = buildProductionWorkerMachineProofReport({ rootDir, env, argv: [], generatedAt, allowSimulation: false });
  const alertingReport = buildAlertingMachineProofReport({ rootDir, env, argv: [], generatedAt, allowSimulation: false });
  const retentionReport = buildRetentionArchiveRestoreMachineProofReport({
    rootDir,
    env,
    argv: [],
    generatedAt,
    allowSimulation: false,
  });

  const restoreInputs = RESTORE_MACHINE_PROOF_RUNTIME_INPUTS.map((name) => inputStatus(env, name));
  const workerInputs = PRODUCTION_WORKER_MACHINE_PROOF_RUNTIME_INPUTS.map((name) => inputStatus(env, name));
  const alertingInputs = [ALERTING_MACHINE_PROOF_ATTESTATION_INPUT].map((name) => inputStatus(env, name));
  const retentionInputs = RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_RUNTIME_INPUTS.map((name) => inputStatus(env, name));
  const alertingAttestationStatus = loadAttestation(rootDir, env, ALERTING_MACHINE_PROOF_ATTESTATION_INPUT);

  return [
    familyReadiness({
      key: "restore",
      label: "Disaster recovery restore proof",
      requiredInputs: RESTORE_MACHINE_PROOF_RUNTIME_INPUTS,
      inputStatuses: restoreInputs,
      attestationStatus: loadAttestation(rootDir, env, "CRP_RESTORE_MACHINE_ATTESTATION_JSON"),
      report: restoreReport,
      reportPath: "docs/production-scale/evidence/latest-restore-machine-proof.json",
      safetyChecks: [{
        key: "isolated-restore-target-not-production",
        ...targetClearlyNotProduction({
          env,
          inputName: RESTORE_MACHINE_ISOLATED_TARGET_INPUT,
          targetObject: evidenceMetadata(restoreReport, "isolatedRestoreTarget"),
        }),
      }],
    }),
    familyReadiness({
      key: "productionWorker",
      label: "Production worker canary proof",
      requiredInputs: PRODUCTION_WORKER_MACHINE_PROOF_RUNTIME_INPUTS,
      inputStatuses: workerInputs,
      attestationStatus: loadAttestation(rootDir, env, "CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON"),
      report: workerReport,
      reportPath: "docs/production-scale/evidence/latest-production-worker-machine-proof.json",
      safetyChecks: [{
        key: "worker-canary-non-destructive",
        ...workerCanaryIsNonDestructive({ env, report: workerReport }),
      }],
    }),
    familyReadiness({
      key: "alerting",
      label: "Alerting proof",
      requiredInputs: [ALERTING_MACHINE_PROOF_ATTESTATION_INPUT],
      inputStatuses: alertingInputs,
      attestationStatus: alertingAttestationStatus,
      report: alertingReport,
      reportPath: "docs/production-scale/evidence/latest-alerting-machine-proof.json",
      safetyChecks: [{
        key: "approved-alert-route-or-sink",
        ...alertingRouteIsApproved({ report: alertingReport, attestation: alertingAttestationStatus.parsed }),
      }],
    }),
    familyReadiness({
      key: "retentionArchiveRestore",
      label: "Retention archive restore proof",
      requiredInputs: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_RUNTIME_INPUTS,
      inputStatuses: retentionInputs,
      attestationStatus: loadAttestation(rootDir, env, "CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON"),
      report: retentionReport,
      reportPath: "docs/production-scale/evidence/latest-retention-archive-restore-machine-proof.json",
      safetyChecks: [{
        key: "retention-isolated-target-not-production",
        ...retentionTargetIsSafe({ env, report: retentionReport }),
      }],
    }),
  ];
}

function migrationReadiness() {
  return {
    key: "migration",
    label: "Migration governance proof",
    readyForRealEvidence: true,
    reportPath: "docs/production-scale/evidence/latest-migration-machine-proof.json",
    realInputs: [],
    presentInputs: [],
    missingInputs: [],
    simulationOnlyInputs: [],
    attestation: null,
    proofStatus: {
      certifying: null,
      status: "ready-to-attempt",
      simulatedOnly: false,
      missingRuntimeInputs: [],
      failures: [],
    },
    safetyChecks: [{
      key: "non-mutating-governance-check",
      ok: true,
      status: "safe",
      message: "Migration governance proof has no extra production secret input for this preflight.",
    }],
    plainEnglishStatus: "Ready to run with real evidence.",
  };
}

function productionPromotionStatus(rootDir) {
  const certification = readJsonIfPresent(rootDir, DEFAULT_CERTIFICATION_JSON_PATH);
  const pack = readJsonIfPresent(rootDir, DEFAULT_PROMOTION_PACK_JSON_PATH);
  const certificationTrue = certification.parsed?.CERTIFYING === true || certification.parsed?.certifying === true;
  const packTrue = pack.parsed?.CERTIFYING === true || pack.parsed?.certifying === true;
  const canPromote = pack.parsed?.canPromoteProductionAtScale === true ||
    pack.parsed?.readinessClassification?.canPromoteProductionAtScale === true;
  const safe = certificationTrue && packTrue && canPromote;
  return {
    safe,
    blocked: !safe,
    certificationReportPresent: certification.exists,
    certificationCertifying: certificationTrue,
    promotionPackPresent: pack.exists,
    promotionPackCertifying: packTrue,
    canPromoteProductionAtScale: canPromote,
    message: safe
      ? "Production promotion is marked safe by current certification and promotion pack evidence."
      : "Production promotion remains blocked until certification and the promotion pack both certify true.",
  };
}

export function buildProductionProofPreflightReport({
  rootDir = process.cwd(),
  env = process.env,
  generatedAt = new Date().toISOString(),
} = {}) {
  const families = [
    rawReportReadiness({ rootDir, env }),
    ...buildAttestedFamilies({ rootDir, env, generatedAt }),
    migrationReadiness(),
  ];
  const missingRealInputs = unique(families.flatMap((family) => family.missingInputs));
  const presentRealInputs = unique(families.flatMap((family) => family.presentInputs));
  const simulationOnlyInputs = unique(families.flatMap((family) => family.simulationOnlyInputs));
  const simulationOnlyFamilies = families
    .filter((family) => family.proofStatus.simulatedOnly === true || family.simulationOnlyInputs.length > 0)
    .map((family) => family.key);
  const unsafeFamilies = families
    .filter((family) => family.safetyChecks.some((check) => check.ok !== true))
    .map((family) => family.key);
  const readyFamilies = families.filter((family) => family.readyForRealEvidence).map((family) => family.key);
  const notReadyFamilies = families.filter((family) => !family.readyForRealEvidence).map((family) => family.key);
  const productionPromotion = productionPromotionStatus(rootDir);
  const readyToRunRealEvidence = notReadyFamilies.length === 0;

  return {
    reportName: "production-proof-preflight",
    generatedAt,
    command: "pnpm run production-proof:preflight",
    reportPaths: {
      markdown: PRODUCTION_PROOF_PREFLIGHT_MD_PATH,
      json: PRODUCTION_PROOF_PREFLIGHT_JSON_PATH,
    },
    inspectionOnly: true,
    productionMutationOccurred: false,
    productionMutationStatus: "none",
    rawValuesPrinted: false,
    secretsPrinted: false,
    realEvidenceReady: readyToRunRealEvidence,
    readyToRunRealEvidence,
    realEvidenceStatus: readyToRunRealEvidence ? "complete enough to attempt" : "incomplete",
    presentRealInputs,
    missingRealInputs,
    simulationOnlyInputs,
    simulationOnlyFamilies,
    unsafeFamilies,
    readyFamilies,
    notReadyFamilies,
    proofFamilies: families,
    productionPromotion,
    productionPromotionSafe: productionPromotion.safe,
    productionPromotionBlocked: productionPromotion.blocked,
    nextSafeHumanAction: readyToRunRealEvidence
      ? "Run pnpm run production-proof:real-evidence. Do not run production promotion from this preflight."
      : "Add the missing real proof inputs or replace simulation-only inputs with sanitized real attestation files, then rerun pnpm run production-proof:preflight.",
  };
}

function yesNo(value) {
  return value ? "yes" : "no";
}

function listOrNone(values) {
  return values.length ? values.map((value) => `- ${value}`).join("\n") : "- None";
}

export function renderProductionProofPreflightMarkdown(report) {
  const lines = [
    "# Production Proof Preflight",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Plain English Result",
    "",
    report.readyToRunRealEvidence
      ? "The real evidence proof environment looks ready to attempt. This command did not change production."
      : "The real evidence proof environment is incomplete. This command did not change production.",
    "",
    `- Real evidence ready to run: ${yesNo(report.readyToRunRealEvidence)}`,
    `- Production mutation occurred: ${yesNo(report.productionMutationOccurred)}`,
    `- Secret values printed: ${yesNo(report.secretsPrinted)}`,
    `- Production promotion safe: ${yesNo(report.productionPromotionSafe)}`,
    `- Production promotion blocked: ${yesNo(report.productionPromotionBlocked)}`,
    "",
    "## Report Files",
    "",
    `- Markdown: \`${report.reportPaths.markdown}\``,
    `- JSON: \`${report.reportPaths.json}\``,
    "",
    "## Real Production Proof Inputs",
    "",
    "Present input names:",
    "",
    listOrNone(report.presentRealInputs),
    "",
    "Missing input names:",
    "",
    listOrNone(report.missingRealInputs),
    "",
    "Still simulation-only:",
    "",
    listOrNone(report.simulationOnlyInputs),
    "",
    "## Proof Families",
    "",
  ];

  for (const family of report.proofFamilies) {
    lines.push(
      `### ${family.label}`,
      "",
      `- Ready to run in real-evidence mode: ${yesNo(family.readyForRealEvidence)}`,
      `- Status: ${family.plainEnglishStatus}`,
      `- Report path: \`${family.reportPath}\``,
      `- Missing inputs: ${family.missingInputs.length ? family.missingInputs.join(", ") : "none"}`,
      `- Simulation-only inputs: ${family.simulationOnlyInputs.length ? family.simulationOnlyInputs.join(", ") : "none"}`,
      `- Current proof is simulation-only: ${yesNo(family.proofStatus.simulatedOnly)}`,
      "- Safety checks:",
      ...family.safetyChecks.map((check) => `  - ${check.key}: ${check.ok ? "pass" : "block"} - ${check.message}`),
      "",
    );
  }

  lines.push(
    "## Production Promotion",
    "",
    `- Safe: ${yesNo(report.productionPromotion.safe)}`,
    `- Blocked: ${yesNo(report.productionPromotion.blocked)}`,
    `- Certification report certifying: ${yesNo(report.productionPromotion.certificationCertifying)}`,
    `- Promotion pack certifying: ${yesNo(report.productionPromotion.promotionPackCertifying)}`,
    `- Can promote production at scale: ${yesNo(report.productionPromotion.canPromoteProductionAtScale)}`,
    `- Summary: ${report.productionPromotion.message}`,
    "",
    "## Next Safe Human Action",
    "",
    report.nextSafeHumanAction,
    "",
  );

  return `${lines.join("\n")}\n`;
}

export function writeProductionProofPreflightReport(report, rootDir = process.cwd()) {
  const jsonPath = path.resolve(rootDir, PRODUCTION_PROOF_PREFLIGHT_JSON_PATH);
  const markdownPath = path.resolve(rootDir, PRODUCTION_PROOF_PREFLIGHT_MD_PATH);
  mkdirSync(path.dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderProductionProofPreflightMarkdown(report), "utf8");
  return {
    jsonPath: PRODUCTION_PROOF_PREFLIGHT_JSON_PATH,
    markdownPath: PRODUCTION_PROOF_PREFLIGHT_MD_PATH,
  };
}

function parseArgs(args) {
  const options = {
    rootDir: repoRootFromScript(),
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--root") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--root requires a value.");
      options.rootDir = path.resolve(value);
      index += 1;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildProductionProofPreflightReport({
    rootDir: options.rootDir,
    env: process.env,
  });
  const outputs = writeProductionProofPreflightReport(report, options.rootDir);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderProductionProofPreflightMarkdown(report));
    console.log(`Preflight report written: ${outputs.markdownPath}`);
    console.log(`Preflight JSON written: ${outputs.jsonPath}`);
  }

  if (!report.readyToRunRealEvidence) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && existsSync(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[production-proof:preflight] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
