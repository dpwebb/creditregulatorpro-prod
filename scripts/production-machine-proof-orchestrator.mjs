import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALERTING_MACHINE_PROOF_CONFIG,
} from "./alerting-machine-proof.mjs";
import {
  MIGRATION_MACHINE_PROOF_CONFIG,
  migrationMachineProofExtraValidation,
} from "./migration-machine-proof.mjs";
import {
  PRODUCTION_WORKER_MACHINE_PROOF_CONFIG,
  productionWorkerMachineProofExtraValidation,
} from "./production-worker-machine-proof.mjs";
import {
  DEFAULT_PROMOTION_PACK_JSON,
} from "./production-promotion-pack.mjs";
import {
  validateLatestProductionPromotionPack,
} from "./production-promotion-guard.mjs";
import {
  RESTORE_MACHINE_PROOF_CONFIG,
  restoreMachineProofExtraValidation,
} from "./restore-machine-proof.mjs";
import {
  RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG,
  retentionArchiveRestoreMachineProofExtraValidation,
} from "./retention-archive-restore-machine-proof.mjs";
import {
  RAW_REPORT_MACHINE_PROOF_CONFIG,
} from "./storage-raw-report-machine-proof.mjs";
import {
  normalizeRelativePath,
  repoPath,
  safeGit,
} from "./lib/productionEvidenceSchema.mjs";
import {
  validateMachineProofForConfig,
} from "./lib/machineProofScript.mjs";
import {
  PRODUCTION_MACHINE_PROOF_POLICY_VERSION,
} from "./lib/productionMachineProofPolicy.mjs";
import {
  findSensitiveEvidenceValues,
  sanitizeProductionEvidenceValue,
} from "./lib/sanitizeProductionEvidence.mjs";

export const MACHINE_PROOF_SUMMARY_JSON_PATH = "docs/production-scale/evidence/latest-machine-proof-summary.json";
export const MACHINE_PROOF_SUMMARY_MD_PATH = "docs/production-scale/evidence/latest-machine-proof-summary.md";

const OUTPUT_TAIL_LIMIT = 6000;
const MACHINE_INPUTS_CLOSED_BY_CERTIFYING_AREA = {
  restore: RESTORE_MACHINE_PROOF_CONFIG.runtimeInputs,
  productionWorker: PRODUCTION_WORKER_MACHINE_PROOF_CONFIG.runtimeInputs,
  rawReport: [
    "CRP_RAW_REPORT_DATABASE_ACCESS",
    "CRP_RAW_REPORT_MACHINE_INVENTORY_ATTESTATION_JSON",
    "CRP_RAW_REPORT_MACHINE_REMEDIATION_ATTESTATION_JSON",
  ],
  alerting: ALERTING_MACHINE_PROOF_CONFIG.runtimeInputs,
  retentionArchiveRestore: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG.runtimeInputs,
};

function repoRootFromScript() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && String(value).trim()))];
}

function commandTail(buffer, chunk, maxLength = OUTPUT_TAIL_LIMIT) {
  const next = `${buffer}${chunk.toString()}`;
  return next.length > maxLength ? next.slice(next.length - maxLength) : next;
}

export function defaultMachineProofAreas() {
  return [
    {
      key: "restore",
      label: "Disaster recovery / restore",
      blockerId: "L10-P1-002",
      kind: "machine-proof",
      config: RESTORE_MACHINE_PROOF_CONFIG,
      extraValidation: restoreMachineProofExtraValidation,
      commands: ["pnpm run restore:machine-proof", "pnpm run restore:machine-proof:validate"],
    },
    {
      key: "productionWorker",
      label: "Production ingest worker runtime",
      blockerId: "L10-P1-003",
      kind: "machine-proof",
      config: PRODUCTION_WORKER_MACHINE_PROOF_CONFIG,
      extraValidation: productionWorkerMachineProofExtraValidation,
      commands: [
        "pnpm run production-worker:machine-proof",
        "pnpm run production-worker:machine-proof:validate",
      ],
    },
    {
      key: "rawReport",
      label: "Raw report byte remediation",
      blockerId: "L10-P1-004",
      kind: "machine-proof",
      config: RAW_REPORT_MACHINE_PROOF_CONFIG,
      commands: [
        "pnpm run storage:raw-report-machine-proof",
        "pnpm run storage:raw-report-machine-proof:validate",
      ],
    },
    {
      key: "alerting",
      label: "Alerting and observability",
      blockerId: "L10-P1-005",
      kind: "machine-proof",
      config: ALERTING_MACHINE_PROOF_CONFIG,
      commands: ["pnpm run alerts:machine-proof", "pnpm run alerts:machine-proof:validate"],
    },
    {
      key: "migration",
      label: "Migration governance",
      blockerId: "L10-P1-006",
      kind: "machine-proof",
      config: MIGRATION_MACHINE_PROOF_CONFIG,
      extraValidation: migrationMachineProofExtraValidation,
      commands: ["pnpm run migrations:machine-proof", "pnpm run migrations:machine-proof:validate"],
    },
    {
      key: "retentionArchiveRestore",
      label: "Retention archive/restore",
      blockerId: "retention-archive-restore",
      kind: "machine-proof",
      config: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG,
      extraValidation: retentionArchiveRestoreMachineProofExtraValidation,
      commands: [
        "pnpm run retention:archive-restore-machine-proof",
        "pnpm run retention:archive-restore-machine-proof:validate",
      ],
    },
    {
      key: "productionPromotionPackGuard",
      label: "Production promotion pack guard",
      blockerId: "L10-P1-001",
      kind: "promotion-guard",
      evidencePath: DEFAULT_PROMOTION_PACK_JSON,
      commands: ["pnpm run production-scale:promotion-pack", "pnpm run production-scale:promotion-guard"],
    },
  ];
}

export function runNonInteractiveCommand(command, {
  cwd = process.cwd(),
  env = {},
  stdin = "ignore",
} = {}) {
  const startedAt = new Date();

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command, {
      cwd,
      shell: true,
      env: {
        ...process.env,
        CI: process.env.CI ?? "1",
        ...env,
      },
      stdio: [stdin, "pipe", "pipe"],
    });

    child.stdout?.on("data", (chunk) => {
      stdout = commandTail(stdout, chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = commandTail(stderr, chunk);
    });
    child.on("error", (error) => {
      const completedAt = new Date();
      stderr = commandTail(stderr, Buffer.from(error.message));
      const sensitiveOutputFindings = findSensitiveEvidenceValues({ stdout, stderr });
      resolve({
        command,
        exitCode: 1,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        stdin,
        stdoutCaptured: stdout.length > 0,
        stderrCaptured: stderr.length > 0,
        sensitiveOutputFindingCount: sensitiveOutputFindings.length,
        sensitiveOutputFindingCodes: unique(sensitiveOutputFindings.map((finding) => finding.code)),
      });
    });
    child.on("close", (code) => {
      const completedAt = new Date();
      const sensitiveOutputFindings = findSensitiveEvidenceValues({ stdout, stderr });
      resolve({
        command,
        exitCode: code ?? 1,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        stdin,
        stdoutCaptured: stdout.length > 0,
        stderrCaptured: stderr.length > 0,
        sensitiveOutputFindingCount: sensitiveOutputFindings.length,
        sensitiveOutputFindingCodes: unique(sensitiveOutputFindings.map((finding) => finding.code)),
      });
    });
  });
}

function readJsonIfPresent(rootDir, relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const absolutePath = repoPath(rootDir, normalized);
  if (!existsSync(absolutePath)) return { exists: false, parsed: null, errors: [`JSON evidence is missing: ${normalized}`] };
  try {
    return { exists: true, parsed: JSON.parse(readFileSync(absolutePath, "utf8")), errors: [] };
  } catch {
    return { exists: true, parsed: null, errors: [`JSON evidence is unreadable: ${normalized}`] };
  }
}

function hasPassingCleanupCheck(evidence) {
  return Array.isArray(evidence?.checks) &&
    evidence.checks.some((check) =>
      check?.status === "pass" && /cleanup|destroyed|rollback|stop/i.test(String(check.name ?? "")));
}

function mutationSummaryForEvidence(evidence) {
  const productionMutation = evidence?.productionMutation ?? "none";
  const syntheticCanaryCleanupSucceeded = productionMutation === "synthetic-canary-cleaned-up"
    ? evidence?.metadata?.syntheticCanaryCleanupSucceeded === true || hasPassingCleanupCheck(evidence)
    : null;
  return {
    productionMutation,
    productionMutationOccurred: productionMutation !== "none",
    syntheticCanaryCleanupSucceeded,
  };
}

function safetyFlagsForEvidence(evidence, commandResults, validation) {
  const sensitiveEvidenceFindingCount = Number(validation?.sensitiveFindings?.length ?? 0);
  const sensitiveOutputFindingCount = commandResults.reduce(
    (total, result) => total + Number(result.sensitiveOutputFindingCount ?? 0),
    0,
  );
  const sensitiveFindingCount = sensitiveEvidenceFindingCount + sensitiveOutputFindingCount;
  return {
    humanDependent: evidence?.humanInteractionRequired === true ||
      evidence?.humanObserved === true ||
      evidence?.manualApprovalRequired === true,
    simulatedOnly: evidence?.simulatedOnly === true,
    dryRunOnly: evidence?.dryRunOnly === true,
    secretsPrinted: evidence?.secretsPrinted !== false || sensitiveFindingCount > 0,
    piiPrinted: evidence?.piiPrinted !== false || sensitiveFindingCount > 0,
    rawReportBytesPrinted: evidence?.rawReportBytesPrinted !== false || sensitiveFindingCount > 0,
    signedUrlsPrinted: evidence?.signedUrlsPrinted !== false || sensitiveFindingCount > 0,
    sensitiveFindingCount,
    sensitiveOutputFindingCount,
    sensitiveOutputFindingCodes: unique(commandResults.flatMap((result) => result.sensitiveOutputFindingCodes ?? [])),
  };
}

async function runAreaCommands(area, { rootDir, runCommands, runCommand, env }) {
  const results = [];
  if (!runCommands) return results;

  for (const command of area.commands ?? []) {
    results.push(await runCommand(command, {
      cwd: rootDir,
      env,
      stdin: "ignore",
      area,
    }));
  }
  return results;
}

function buildMachineProofResult(area, evidence, readErrors, commandResults, now) {
  const validation = evidence
    ? validateMachineProofForConfig(area.config, evidence, { now })
    : {
        ok: false,
        errors: readErrors,
        sensitiveFindings: [],
        stale: false,
        certifying: false,
      };
  const extraErrors = evidence && typeof area.extraValidation === "function"
    ? area.extraValidation(evidence)
    : [];
  const commandFailures = commandResults
    .filter((result) => result.exitCode !== 0)
    .map((result) => `${result.command} exited ${result.exitCode}`);
  const validationErrors = [...(validation.errors ?? []), ...extraErrors, ...readErrors, ...commandFailures];
  const certifying = validation.ok === true && extraErrors.length === 0 && commandFailures.length === 0;
  const mutation = mutationSummaryForEvidence(evidence);
  const safety = safetyFlagsForEvidence(evidence, commandResults, validation);
  const missingRuntimeInputs = unique([
    ...(Array.isArray(evidence?.missingRuntimeInputs) ? evidence.missingRuntimeInputs : []),
    ...(!evidence
      ? Array.isArray(area.config?.runtimeInputs)
        ? area.config.runtimeInputs
        : area.config?.attestationEnv
          ? [area.config.attestationEnv]
          : []
      : []),
  ]);

  return {
    key: area.key,
    label: area.label,
    blockerId: area.blockerId,
    kind: area.kind,
    evidenceType: evidence?.evidenceType ?? area.config.evidenceType,
    evidencePath: area.config.jsonPath,
    evidenceExists: Boolean(evidence),
    generatedAt: evidence?.generatedAt ?? null,
    expiresAt: evidence?.expiresAt ?? null,
    status: certifying ? "pass" : "fail",
    certifying,
    CERTIFYING: certifying,
    commandResults,
    validation: {
      ok: validation.ok === true && commandFailures.length === 0,
      errors: validationErrors,
      stale: validation.stale === true,
      sensitiveFindingCount: safety.sensitiveFindingCount,
    },
    missingRuntimeInputs,
    sanitizedArtifacts: Array.isArray(evidence?.sanitizedArtifacts) ? evidence.sanitizedArtifacts : [],
    humanInteractionRequired: evidence?.humanInteractionRequired === true,
    humanObserved: evidence?.humanObserved === true,
    manualApprovalRequired: evidence?.manualApprovalRequired === true,
    simulatedOnly: evidence?.simulatedOnly === true,
    dryRunOnly: evidence?.dryRunOnly === true,
    ...mutation,
    ...safety,
  };
}

function buildPromotionGuardResult(area, pack, readErrors, commandResults, guardResult) {
  const commandFailures = commandResults
    .filter((result) => result.exitCode !== 0)
    .map((result) => `${result.command} exited ${result.exitCode}`);
  const sensitiveFindings = filterPromotionPackSensitiveFindings(findSensitiveEvidenceValues(pack));
  const sensitiveOutputFindingCount = commandResults.reduce(
    (total, result) => total + Number(result.sensitiveOutputFindingCount ?? 0),
    0,
  );
  const validationErrors = [
    ...readErrors,
    ...(guardResult?.reasons ?? []).map((reason) => reason.message ?? reason.code ?? "promotion guard failed"),
    ...commandFailures,
  ];
  const missingRuntimeInputs = unique([
    ...(Array.isArray(pack?.missingMachineRuntimeInputs) ? pack.missingMachineRuntimeInputs : []),
    ...(Array.isArray(pack?.missingRuntimeInputs) ? pack.missingRuntimeInputs : []),
  ]);
  const certifying = guardResult?.allowed === true && commandFailures.length === 0 && sensitiveFindings.length === 0;

  return {
    key: area.key,
    label: area.label,
    blockerId: area.blockerId,
    kind: area.kind,
    evidenceType: "PRODUCTION_PROMOTION_PACK_GUARD",
    evidencePath: area.evidencePath,
    evidenceExists: Boolean(pack),
    generatedAt: pack?.generatedAt ?? null,
    expiresAt: null,
    status: certifying ? "pass" : "fail",
    certifying,
    CERTIFYING: certifying,
    commandResults,
    validation: {
      ok: certifying,
      errors: validationErrors,
      stale: false,
      sensitiveFindingCount: sensitiveFindings.length + sensitiveOutputFindingCount,
    },
    missingRuntimeInputs,
    sanitizedArtifacts: pack ? [{ path: area.evidencePath, type: "promotion-pack-input" }] : [],
    humanInteractionRequired: pack?.humanInteractionRequired === true,
    humanObserved: pack?.humanObserved === true,
    manualApprovalRequired: pack?.manualApprovalRequired === true,
    simulatedOnly: false,
    dryRunOnly: false,
    productionMutation: "none",
    productionMutationOccurred: false,
    syntheticCanaryCleanupSucceeded: null,
    humanDependent: pack?.humanInteractionRequired === true ||
      pack?.humanObserved === true ||
      pack?.manualApprovalRequired === true ||
      (Array.isArray(pack?.humanRequiredProof) && pack.humanRequiredProof.length > 0),
    secretsPrinted: sensitiveOutputFindingCount > 0,
    piiPrinted: sensitiveOutputFindingCount > 0,
    rawReportBytesPrinted: sensitiveOutputFindingCount > 0,
    signedUrlsPrinted: sensitiveOutputFindingCount > 0,
    sensitiveFindingCount: sensitiveFindings.length + sensitiveOutputFindingCount,
    sensitiveOutputFindingCount,
    sensitiveOutputFindingCodes: unique(commandResults.flatMap((result) => result.sensitiveOutputFindingCodes ?? [])),
    guard: {
      allowed: guardResult?.allowed === true,
      certifying: guardResult?.certifying === true,
      canPromoteProductionAtScale: guardResult?.canPromoteProductionAtScale === true,
      openP0P1Blockers: guardResult?.openP0P1Blockers ?? [],
      reasonCodes: (guardResult?.reasons ?? []).map((reason) => reason.code),
    },
  };
}

function filterPromotionPackSensitiveFindings(findings) {
  return findings.filter((finding) => {
    const path = String(finding.path ?? "");
    const code = String(finding.code ?? "");
    if (/^\$\.staleReferences\..*CommitReferences\[\d+\]$/.test(path) && ["phone", "account-number"].includes(code)) {
      return false;
    }
    return true;
  });
}

function buildSafetySummary(proofResults) {
  const noSecretsPrinted = proofResults.every((result) => result.secretsPrinted === false);
  const noPiiPrinted = proofResults.every((result) => result.piiPrinted === false);
  const noRawReportBytesPrinted = proofResults.every((result) => result.rawReportBytesPrinted === false);
  const noSignedUrlsPrinted = proofResults.every((result) => result.signedUrlsPrinted === false);

  return {
    nonInteractive: true,
    prompted: false,
    stdinRead: false,
    humanInteractionRequired: proofResults.some((result) => result.humanInteractionRequired === true),
    manualApprovalRequired: proofResults.some((result) => result.manualApprovalRequired === true),
    humanObserved: proofResults.some((result) => result.humanObserved === true),
    operatorAcknowledgementRequired: false,
    noSecretsPrinted,
    noPiiPrinted,
    noRawReportBytesPrinted,
    noSignedUrlsPrinted,
    noSecretsPiiRawBytesOrSignedUrlsPrinted:
      noSecretsPrinted && noPiiPrinted && noRawReportBytesPrinted && noSignedUrlsPrinted,
    sensitiveFindingCount: proofResults.reduce((total, result) => total + Number(result.sensitiveFindingCount ?? 0), 0),
    sensitiveOutputFindingCount: proofResults.reduce(
      (total, result) => total + Number(result.sensitiveOutputFindingCount ?? 0),
      0,
    ),
    sensitiveOutputFindingCodes: unique(proofResults.flatMap((result) => result.sensitiveOutputFindingCodes ?? [])),
  };
}

function buildProductionMutationSummary(proofResults) {
  const mutations = proofResults
    .filter((result) => result.productionMutation !== "none")
    .map((result) => ({
      proofArea: result.key,
      blockerId: result.blockerId,
      productionMutation: result.productionMutation,
      productionMutationOccurred: result.productionMutationOccurred === true,
      syntheticCanaryCleanupSucceeded: result.syntheticCanaryCleanupSucceeded,
    }));
  const syntheticCanaryMutations = mutations.filter(
    (mutation) => mutation.productionMutation === "synthetic-canary-cleaned-up",
  );

  return {
    anyProductionMutation: mutations.length > 0,
    mutations,
    syntheticCanaryCleanupSucceeded: syntheticCanaryMutations.length > 0
      ? syntheticCanaryMutations.every((mutation) => mutation.syntheticCanaryCleanupSucceeded === true)
      : null,
  };
}

function buildOpenBlockers(proofResults) {
  return proofResults
    .filter((result) => result.certifying !== true)
    .map((result) => ({
      blockerId: result.blockerId,
      proofArea: result.key,
      label: result.label,
      missingRuntimeInputs: result.missingRuntimeInputs,
      reasons: result.validation?.errors ?? [],
    }));
}

function buildMachineProofSummaryPayload({
  generatedAt,
  resolvedCommit,
  resolvedBranch,
  proofResults,
  areas,
}) {
  const reconciledProofResults = reconcilePromotionGuardMissingInputs(proofResults);
  const openBlockers = buildOpenBlockers(reconciledProofResults);
  const safetySummary = buildSafetySummary(reconciledProofResults);
  const machineProofResults = reconciledProofResults.filter((result) => result.kind === "machine-proof");
  const machineProofSafetySummary = buildSafetySummary(machineProofResults);
  const expectedMachineProofCount = areas.filter((area) => area.kind === "machine-proof").length;
  const productionMutationSummary = buildProductionMutationSummary(reconciledProofResults);
  const allMachineProofsCertifying =
    machineProofResults.length === expectedMachineProofCount &&
    machineProofResults.every((result) => result.certifying === true) &&
    machineProofSafetySummary.humanInteractionRequired === false &&
    machineProofSafetySummary.manualApprovalRequired === false &&
    machineProofSafetySummary.humanObserved === false &&
    machineProofSafetySummary.noSecretsPiiRawBytesOrSignedUrlsPrinted === true;

  return sanitizeProductionEvidenceValue({
    reportName: "production-machine-proof-summary",
    generatedAt,
    commitHash: resolvedCommit,
    branch: resolvedBranch,
    policyVersion: PRODUCTION_MACHINE_PROOF_POLICY_VERSION,
    allMachineProofsCertifying,
    CERTIFYING: allMachineProofsCertifying,
    proofResults: reconciledProofResults,
    openBlockers,
    missingRuntimeInputs: unique(reconciledProofResults.flatMap((result) => result.missingRuntimeInputs ?? [])),
    sanitizedArtifacts: unique(reconciledProofResults.flatMap((result) =>
      (result.sanitizedArtifacts ?? []).map((artifact) => artifact.path ?? artifact))),
    safetySummary,
    productionMutationSummary,
  });
}

function reconcilePromotionGuardMissingInputs(proofResults) {
  const closedInputs = new Set();
  for (const result of proofResults) {
    if (result.certifying !== true) continue;
    for (const input of MACHINE_INPUTS_CLOSED_BY_CERTIFYING_AREA[result.key] ?? []) {
      closedInputs.add(input);
    }
  }
  if (closedInputs.size === 0) return proofResults;

  return proofResults.map((result) => {
    if (result.key !== "productionPromotionPackGuard") return result;
    return {
      ...result,
      missingRuntimeInputs: (result.missingRuntimeInputs ?? []).filter((input) => !closedInputs.has(input)),
    };
  });
}

export async function buildProductionMachineProofSummary({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  now = generatedAt,
  commitHash = null,
  branch = null,
  env = {},
  areas = defaultMachineProofAreas(),
  runCommands = true,
  runCommand = runNonInteractiveCommand,
  currentHead = null,
} = {}) {
  const resolvedCommit = commitHash ?? safeGit(["rev-parse", "HEAD"], rootDir);
  const resolvedBranch = branch ?? safeGit(["branch", "--show-current"], rootDir);
  const proofResults = [];

  for (const area of areas) {
    if (area.kind === "promotion-guard" && runCommands) {
      writeProductionMachineProofSummaryOutputs(buildMachineProofSummaryPayload({
        generatedAt,
        resolvedCommit,
        resolvedBranch,
        proofResults,
        areas,
      }), rootDir);
    }
    const commandResults = await runAreaCommands(area, { rootDir, runCommands, runCommand, env });
    if (area.kind === "promotion-guard") {
      const { parsed: pack, errors } = readJsonIfPresent(rootDir, area.evidencePath);
      const guardResult = validateLatestProductionPromotionPack({
        rootDir,
        packPath: area.evidencePath,
        currentHead: currentHead ?? resolvedCommit,
      });
      proofResults.push(buildPromotionGuardResult(area, pack, errors, commandResults, guardResult));
      continue;
    }

    const { parsed: evidence, errors } = readJsonIfPresent(rootDir, area.config.jsonPath);
    proofResults.push(buildMachineProofResult(area, evidence, errors, commandResults, now));
  }

  return buildMachineProofSummaryPayload({
    generatedAt,
    resolvedCommit,
    resolvedBranch,
    proofResults,
    areas,
  });
}

export function renderProductionMachineProofSummaryMarkdown(summary) {
  const lines = [
    "# Production Machine Proof Summary",
    "",
    `Generated: ${summary.generatedAt}`,
    `Commit: \`${summary.commitHash}\``,
    `Branch: \`${summary.branch}\``,
    `Policy version: \`${summary.policyVersion}\``,
    `allMachineProofsCertifying:${summary.allMachineProofsCertifying ? "true" : "false"}`,
    "",
    "> Supporting evidence only for beta-live. This summary is not the authoritative beta-live readiness decision; run `pnpm run beta-live:certify` and read `docs/production-scale/evidence/latest-beta-live-certification.json` for `SAFE_FOR_BETA_LIVE=true/false`.",
    "",
    "## Safety Summary",
    "",
    `- Non-interactive: ${summary.safetySummary.nonInteractive ? "yes" : "no"}`,
    `- Prompted: ${summary.safetySummary.prompted ? "yes" : "no"}`,
    `- Stdin read: ${summary.safetySummary.stdinRead ? "yes" : "no"}`,
    `- Human interaction required: ${summary.safetySummary.humanInteractionRequired ? "yes" : "no"}`,
    `- Manual approval required: ${summary.safetySummary.manualApprovalRequired ? "yes" : "no"}`,
    `- No secrets/PII/raw bytes/signed URLs printed: ${
      summary.safetySummary.noSecretsPiiRawBytesOrSignedUrlsPrinted ? "yes" : "no"
    }`,
    "",
    "## Proof Results",
    "",
    "| Proof area | Status | Certifying | Evidence | Missing inputs |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const result of summary.proofResults) {
    lines.push(
      `| ${result.label} | ${result.status} | ${result.certifying ? "true" : "false"} | \`${result.evidencePath}\` | ${
        result.missingRuntimeInputs.length ? result.missingRuntimeInputs.join(", ") : "none"
      } |`,
    );
  }

  lines.push(
    "",
    "## Open Blockers",
    "",
    ...(summary.openBlockers.length
      ? summary.openBlockers.map((blocker) =>
          `- ${blocker.blockerId} (${blocker.proofArea}): ${
            blocker.missingRuntimeInputs.length
              ? `missing ${blocker.missingRuntimeInputs.join(", ")}`
              : (blocker.reasons[0] ?? "not certifying")
          }`)
      : ["- None"]),
    "",
    "## Missing Runtime Inputs",
    "",
    ...(summary.missingRuntimeInputs.length
      ? summary.missingRuntimeInputs.map((input) => `- ${input}`)
      : ["- None"]),
    "",
    "## Production Mutation Summary",
    "",
    `- Any production mutation: ${summary.productionMutationSummary.anyProductionMutation ? "yes" : "no"}`,
    `- Synthetic/canary cleanup succeeded: ${
      summary.productionMutationSummary.syntheticCanaryCleanupSucceeded === null
        ? "not applicable"
        : summary.productionMutationSummary.syntheticCanaryCleanupSucceeded ? "yes" : "no"
    }`,
  );

  return `${lines.join("\n")}\n`;
}

export function writeProductionMachineProofSummaryOutputs(summary, rootDir = process.cwd()) {
  const jsonPath = repoPath(rootDir, MACHINE_PROOF_SUMMARY_JSON_PATH);
  const markdownPath = repoPath(rootDir, MACHINE_PROOF_SUMMARY_MD_PATH);
  mkdirSync(path.dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderProductionMachineProofSummaryMarkdown(summary), "utf8");
  return {
    jsonPath: MACHINE_PROOF_SUMMARY_JSON_PATH,
    markdownPath: MACHINE_PROOF_SUMMARY_MD_PATH,
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
  const summary = await buildProductionMachineProofSummary({ rootDir: options.rootDir });
  const outputs = writeProductionMachineProofSummaryOutputs(summary, options.rootDir);

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log("Production machine proof summary generated.");
    console.log(`Markdown: ${outputs.markdownPath}`);
    console.log(`JSON: ${outputs.jsonPath}`);
    console.log(`allMachineProofsCertifying:${summary.allMachineProofsCertifying ? "true" : "false"}`);
    if (summary.missingRuntimeInputs.length) {
      console.log(`Missing machine inputs: ${summary.missingRuntimeInputs.join(", ")}`);
    }
    if (summary.openBlockers.length) {
      console.log(`Open blockers: ${summary.openBlockers.map((blocker) => blocker.blockerId).join(", ")}`);
    }
  }

  if (!summary.allMachineProofsCertifying) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && existsSync(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[production:machine-proofs] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
