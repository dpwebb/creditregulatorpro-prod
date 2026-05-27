import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEPLOYMENT_CERTIFICATION_MODES,
  isDeferrableAdminCredentialLiveBlocker,
  isNonPublicDeploymentCertificationMode,
  resolveDeploymentCertificationMode,
} from "./platform-certification.mjs";
import { DEFAULT_PROMOTION_PACK_JSON } from "./production-promotion-pack.mjs";

export const PLATFORM_CERTIFICATION_JSON_PATH = "docs/platform-certification/latest-platform-certification.json";
export const REQUIRED_PRODUCTION_HOST_KEY_INPUT = "PRODUCTION_SSH_HOST_KEY_SHA256";
export const DEFAULT_PRODUCTION_REPO = "dpwebb/creditregulatorpro-prod";

const BLOCKING_SEVERITIES = new Set(["p0", "p1", "critical", "high"]);
const CLOSED_CLASSIFICATIONS = new Set([
  "fixed with automated evidence",
  "fixed with staging evidence",
  "waived with explicit reason",
]);

const SENSITIVE_PATTERNS = [
  { pattern: /-----BEGIN [\s\S]*?-----END [^-]+-----/g, replacement: "[REDACTED_SECRET]" },
  { pattern: /\bsk-proj-[A-Za-z0-9_-]{8,}\b/g, replacement: "[REDACTED_SECRET]" },
  { pattern: /\bsk-[A-Za-z0-9_-]{8,}\b/g, replacement: "[REDACTED_SECRET]" },
  { pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, replacement: "[REDACTED_SECRET]" },
  { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: "[REDACTED_EMAIL]" },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[REDACTED_PII]" },
  { pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: "[REDACTED_PII]" },
  { pattern: /https?:\/\/[^\s?#)]+[^\s)]*[?&](?:X-Amz-Signature|Signature|sig|token|expires|X-Amz-Credential)=[^\s)]*/gi, replacement: "[REDACTED_SIGNED_URL]" },
  { pattern: /\braw report bytes?\b/gi, replacement: "[REDACTED_SENSITIVE_DATA]" },
  { pattern: /\bsigned urls?\b/gi, replacement: "[REDACTED_SIGNED_URL]" },
];

function repoRootFromScript() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function safeGit(args, rootDir) {
  try {
    return execFileSync("git", args, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

export function sanitizePromotionGuardText(value) {
  let text = String(value ?? "");
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  return text.length > 280 ? `${text.slice(0, 277)}...` : text;
}

function strictSha(value) {
  return /^[a-f0-9]{40}$/i.test(String(value ?? ""));
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function blockerKey(blocker) {
  return firstString(blocker?.id, blocker?.blockerId, blocker?.number && `#${blocker.number}`, blocker?.title) ?? "unknown";
}

function blockerSeverity(blocker) {
  return String(blocker?.severity ?? blocker?.priority ?? "").trim().toLowerCase();
}

function blockerClassification(blocker) {
  return String(blocker?.classification ?? blocker?.status ?? blocker?.currentStatus ?? "").trim().toLowerCase();
}

function isOpenBlocker(blocker) {
  const classification = blockerClassification(blocker);
  if (CLOSED_CLASSIFICATIONS.has(classification)) return false;
  if (!classification && String(blocker?.currentStatus ?? "").toLowerCase() === "fixed") return false;
  if (blocker?.open === false || blocker?.closed === true || blocker?.resolved === true) return false;
  return true;
}

function isP0P1Blocker(blocker) {
  return BLOCKING_SEVERITIES.has(blockerSeverity(blocker));
}

export function collectOpenP0P1Blockers(report) {
  const byKey = new Map();
  const candidates = [
    ...(Array.isArray(report?.blockerClassifications) ? report.blockerClassifications : []),
    ...(Array.isArray(report?.unresolvedProductionBlockers) ? report.unresolvedProductionBlockers : []),
    ...(Array.isArray(report?.unresolvedScaleBlockers) ? report.unresolvedScaleBlockers : []),
    ...(Array.isArray(report?.openP0P1Blockers) ? report.openP0P1Blockers : []),
  ];

  for (const blocker of candidates) {
    if (!isOpenBlocker(blocker) || !isP0P1Blocker(blocker)) continue;
    byKey.set(blockerKey(blocker), {
      number: blocker?.number ?? null,
      id: blocker?.id ?? blocker?.blockerId ?? null,
      title: sanitizePromotionGuardText(blocker?.title ?? blocker?.name ?? "Untitled blocker"),
      severity: sanitizePromotionGuardText(blocker?.severity ?? blocker?.priority ?? "unknown"),
      classification: sanitizePromotionGuardText(blocker?.classification ?? blocker?.status ?? blocker?.currentStatus ?? "open"),
    });
  }

  return [...byKey.values()];
}

function addReason(reasons, code, message, details = {}) {
  reasons.push({
    code,
    message: sanitizePromotionGuardText(message),
    details,
  });
}

function evidenceHeadFields(report) {
  return {
    currentCommitHash: firstString(report?.currentCommitHash),
    currentHead: firstString(report?.currentHead),
    targetSha: firstString(report?.targetSha),
  };
}

function evidencePolicyFileOnly(filePath) {
  const normalized = String(filePath ?? "").replace(/\\/g, "/");
  return normalized.startsWith("docs/production-scale/evidence/");
}

function controlledGoLiveEvidenceFileOnly(filePath) {
  const normalized = String(filePath ?? "").replace(/\\/g, "/");
  return (
    normalized === "docs/environment-parity.md" ||
    normalized.startsWith("docs/platform-certification/") ||
    normalized.startsWith("docs/production-scale/evidence/")
  );
}

function changedFilesBetween(rootDir, base, head) {
  const changed = safeGit(["diff", "--name-only", `${base}..${head}`], rootDir);
  return String(changed ?? "").split(/\r?\n/).filter(Boolean);
}

function commitIsAncestor(rootDir, maybeAncestor, head) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", maybeAncestor, head], {
      cwd: rootDir,
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

export function certifiedCommitAcceptedByGoLiveEvidencePolicy(rootDir, certifiedCommit, currentHead) {
  if (!strictSha(certifiedCommit) || !strictSha(currentHead)) return false;
  if (certifiedCommit === currentHead) return true;
  if (!commitIsAncestor(rootDir, certifiedCommit, currentHead)) return false;
  const changedFiles = changedFilesBetween(rootDir, certifiedCommit, currentHead);
  return changedFiles.length > 0 && changedFiles.every(controlledGoLiveEvidenceFileOnly);
}

function acceptedEvidencePolicyHeads(rootDir, currentHead) {
  if (!currentHead || !strictSha(currentHead)) return [];
  const parentHead = safeGit(["rev-parse", `${currentHead}^`], rootDir);
  if (!parentHead || !strictSha(parentHead)) return [];
  const changed = safeGit(["diff", "--name-only", `${parentHead}..${currentHead}`], rootDir);
  const changedFiles = String(changed ?? "").split(/\r?\n/).filter(Boolean);
  if (changedFiles.length > 0 && changedFiles.every(evidencePolicyFileOnly)) {
    return [parentHead];
  }
  return [];
}

export function validatePromotionPackForProduction(report, {
  currentHead = null,
  packPath = DEFAULT_PROMOTION_PACK_JSON,
  acceptedEvidenceHeads = [],
} = {}) {
  const reasons = [];
  const current = currentHead && strictSha(currentHead) ? currentHead : null;
  const acceptedHeads = new Set([
    ...(current ? [current] : []),
    ...acceptedEvidenceHeads.filter(strictSha),
    ...(Array.isArray(report?.acceptedEvidencePolicy?.acceptedCommitHashes)
      ? report.acceptedEvidencePolicy.acceptedCommitHashes.filter(strictSha)
      : []),
  ]);

  if (!report || typeof report !== "object" || Array.isArray(report)) {
    addReason(reasons, "invalid-pack", "Promotion pack JSON did not parse to an object.");
    return {
      allowed: false,
      packPath,
      currentHead: current,
      reasons,
      openP0P1Blockers: [],
      certifying: false,
      canPromoteProductionAtScale: false,
    };
  }

  if (report.CERTIFYING !== true) {
    addReason(reasons, "non-certifying-pack", "latest-production-promotion-pack.json has CERTIFYING !== true.");
  }
  if (Object.prototype.hasOwnProperty.call(report, "certifying") && report.certifying !== true) {
    addReason(reasons, "non-certifying-lowercase", "Promotion pack certifying flag is not true.");
  }
  if (report.promotionCertification && report.promotionCertification.CERTIFYING !== true) {
    addReason(reasons, "non-certifying-promotion-checks", "Promotion certification checks are not certifying.");
  }
  if (report.machineProofSummary) {
    if (report.machineProofSummary.CERTIFYING !== true || report.machineProofSummary.allMachineProofsCertifying !== true) {
      addReason(reasons, "non-certifying-machine-proof-summary", "Latest machine proof summary is not certifying.");
    }
  } else {
    addReason(reasons, "missing-machine-proof-summary", "Promotion pack is missing latest machine proof summary.");
  }

  const canPromoteProductionAtScale =
    Object.prototype.hasOwnProperty.call(report, "canPromoteProductionAtScale")
      ? report.canPromoteProductionAtScale
      : report.readinessClassification?.canPromoteProductionAtScale;
  if (canPromoteProductionAtScale !== true) {
    addReason(reasons, "cannot-promote-production-at-scale", "Promotion pack does not allow production-at-scale promotion.");
  }

  const openP0P1Blockers = collectOpenP0P1Blockers(report);
  if (openP0P1Blockers.length > 0) {
    addReason(
      reasons,
      "open-p0-p1-blockers",
      `Promotion pack has ${openP0P1Blockers.length} open P0/P1 production blocker(s).`,
    );
  }
  const humanProofClassifications = (Array.isArray(report?.blockerClassifications) ? report.blockerClassifications : [])
    .filter((blocker) => /human/i.test(blockerClassification(blocker)));
  if (humanProofClassifications.length > 0 || report?.humanInteractionRequired === true || (report?.humanRequiredProof?.length ?? 0) > 0) {
    addReason(
      reasons,
      "human-proof-dependency",
      "Promotion pack contains a human-proof dependency; production certification requires non-interactive machine proof.",
    );
  }

  const machineProofs = Object.values(report?.machineProofs ?? {});
  const summaryProofResults = Array.isArray(report?.machineProofSummary?.proofResults)
    ? report.machineProofSummary.proofResults
    : [];
  const proofResults = [...machineProofs, ...summaryProofResults];
  if (proofResults.some((proof) =>
    proof?.humanDependent === true ||
    proof?.humanInteractionRequired === true ||
    proof?.humanObserved === true ||
    proof?.manualApprovalRequired === true
  )) {
    addReason(reasons, "human-dependent-machine-proof", "At least one machine proof is human-dependent.");
  }
  if (proofResults.some((proof) => proof?.simulatedOnly === true)) {
    addReason(reasons, "simulated-machine-proof", "At least one machine proof is simulated-only.");
  }
  if (proofResults.some((proof) => proof?.validation?.stale === true)) {
    addReason(reasons, "stale-machine-proof", "At least one machine proof is stale.");
  }
  const migrationProof = report?.machineProofs?.migration;
  if (
    report?.migrationGateEvidence?.temporaryAllowlistActive === true ||
    report?.migrationGateEvidence?.status === "accepted-temporary-allowlist" ||
    migrationProof?.metadata?.temporaryAllowlistActive === true ||
    Number(migrationProof?.metadata?.unresolvedResidualCount ?? 0) > 0 ||
    Number(migrationProof?.metadata?.expiredResidualCount ?? 0) > 0
  ) {
    addReason(reasons, "unresolved-migration-allowlist", "Migration governance still has unresolved or expired temporary allowlist residuals.");
  }

  const heads = evidenceHeadFields(report);
  const evidenceCommit = heads.currentCommitHash ?? heads.currentHead ?? heads.targetSha;
  if (!current) {
    addReason(reasons, "current-head-unresolved", "Current git HEAD could not be resolved for promotion evidence validation.");
  }
  if (!strictSha(evidenceCommit)) {
    addReason(reasons, "missing-evidence-head", "Promotion pack is missing a strict evidence commit hash.");
  }
  for (const [field, value] of Object.entries(heads)) {
    if (value && !strictSha(value)) {
      addReason(reasons, "invalid-evidence-head", `Promotion pack ${field} is not a strict 40-hex commit hash.`);
    } else if (value && current && !acceptedHeads.has(value)) {
      addReason(reasons, "stale-evidence-head", `Promotion pack ${field} does not match current HEAD or accepted evidence policy.`);
    }
  }

  const certification = report.promotionCertification ?? {};
  for (const field of ["missingRequiredChecks", "staleChecks", "nonAutomatedChecks", "skippedChecks", "failedChecks"]) {
    if (Array.isArray(certification[field]) && certification[field].length > 0) {
      addReason(reasons, `promotion-certification-${field}`, `Promotion certification has ${field}.`);
    }
  }
  if (report.staleReferences?.auditCommitReferenceStale === true) {
    addReason(reasons, "stale-audit-reference", "Promotion pack audit commit reference is stale.");
  }

  return {
    allowed: reasons.length === 0,
    packPath,
    currentHead: current,
    evidenceCommit,
    certifying: report.CERTIFYING === true,
    canPromoteProductionAtScale: canPromoteProductionAtScale === true,
    reasons,
    openP0P1Blockers,
  };
}

export function validateLatestProductionPromotionPack({
  rootDir = repoRootFromScript(),
  packPath = DEFAULT_PROMOTION_PACK_JSON,
  currentHead = null,
} = {}) {
  const absolutePackPath = path.resolve(rootDir, packPath);
  const resolvedCurrentHead = currentHead ?? safeGit(["rev-parse", "HEAD"], rootDir);

  if (!existsSync(absolutePackPath)) {
    return {
      allowed: false,
      packPath,
      currentHead: resolvedCurrentHead,
      certifying: false,
      canPromoteProductionAtScale: false,
      openP0P1Blockers: [],
      reasons: [
        {
          code: "missing-pack",
          message: "Required production promotion pack JSON is missing.",
          details: { packPath },
        },
      ],
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(absolutePackPath, "utf8"));
  } catch {
    return {
      allowed: false,
      packPath,
      currentHead: resolvedCurrentHead,
      certifying: false,
      canPromoteProductionAtScale: false,
      openP0P1Blockers: [],
      reasons: [
        {
          code: "unreadable-pack",
          message: "Required production promotion pack JSON is unreadable.",
          details: { packPath },
        },
      ],
    };
  }

  return validatePromotionPackForProduction(parsed, {
    currentHead: resolvedCurrentHead,
    packPath,
    acceptedEvidenceHeads: acceptedEvidencePolicyHeads(rootDir, resolvedCurrentHead),
  });
}

function readJsonFile(rootDir, relativePath) {
  const absolutePath = path.resolve(rootDir, relativePath);
  if (!existsSync(absolutePath)) return { exists: false, value: null, error: null };
  try {
    return {
      exists: true,
      value: JSON.parse(readFileSync(absolutePath, "utf8")),
      error: null,
    };
  } catch (error) {
    return {
      exists: true,
      value: null,
      error,
    };
  }
}

function unresolvedBlockerCount(report) {
  if (Array.isArray(report?.unresolvedBlockers)) return report.unresolvedBlockers.length;
  if (Array.isArray(report?.blockers)) return report.blockers.length;
  if (typeof report?.blockers === "number") return report.blockers;
  return null;
}

function commandFailureCount(report) {
  const failedFromCounts = Number(report?.commandCounts?.failed ?? 0);
  const failedFromGates = Array.isArray(report?.gates)
    ? report.gates.filter((gate) => gate?.status === "failed").length
    : 0;
  return Math.max(failedFromCounts, failedFromGates);
}

function runtimeAuditIsIncomplete(report) {
  if (report?.gateStatus?.runtimeAudit === "incomplete") return true;
  return Array.isArray(report?.gates)
    ? report.gates.some((gate) => gate?.id === "runtimeAudit" && gate?.status === "incomplete")
    : false;
}

function safetyFlagsClean(report) {
  const safety = report?.safety;
  if (!safety || typeof safety !== "object" || Array.isArray(safety)) return true;
  return Object.values(safety).every((value) => value === false);
}

function acceptedPlatformCertificationStatus(status) {
  return status === "PASS" || status === "PASS_WITH_WARNINGS";
}

export function validatePlatformCertificationForGoLive(report, {
  rootDir = repoRootFromScript(),
  currentHead = null,
  platformCertificationPath = PLATFORM_CERTIFICATION_JSON_PATH,
  env = process.env,
} = {}) {
  const reasons = [];
  const current = currentHead && strictSha(currentHead) ? currentHead : null;
  const certifiedCommit = firstString(report?.currentCommit);
  const blockers = unresolvedBlockerCount(report);
  const certificationMode = resolveDeploymentCertificationMode(env);
  const reportCertificationMode = firstString(report?.certificationMode) ?? DEPLOYMENT_CERTIFICATION_MODES.LIVE_PRODUCTION;
  const nonPublicMode = isNonPublicDeploymentCertificationMode(certificationMode);
  const unresolvedBlockers = Array.isArray(report?.unresolvedBlockers) ? report.unresolvedBlockers : [];
  const deferredLiveProductionBlockers = Array.isArray(report?.deferredLiveProductionBlockers)
    ? report.deferredLiveProductionBlockers
    : [];
  const hardUnresolvedBlockers = unresolvedBlockers.filter((blocker) => !isDeferrableAdminCredentialLiveBlocker(blocker));
  const failedCommands = commandFailureCount(report);
  const runtimeIncomplete = runtimeAuditIsIncomplete(report);
  const safetyClean = safetyFlagsClean(report);
  const nonPublicDeploymentAcceptable =
    nonPublicMode &&
    report?.nonPublicDeploymentAcceptable === true &&
    isNonPublicDeploymentCertificationMode(reportCertificationMode) &&
    hardUnresolvedBlockers.length === 0 &&
    unresolvedBlockers.every(isDeferrableAdminCredentialLiveBlocker) &&
    failedCommands === 0 &&
    runtimeIncomplete === false &&
    safetyClean;
  const targetAccepted =
    current && certifiedCommit
      ? certifiedCommitAcceptedByGoLiveEvidencePolicy(rootDir, certifiedCommit, current)
      : false;

  if (!report || typeof report !== "object" || Array.isArray(report)) {
    addReason(reasons, "invalid-platform-certification", "Platform certification JSON did not parse to an object.");
  }

  if (nonPublicMode) {
    if (!isNonPublicDeploymentCertificationMode(reportCertificationMode)) {
      addReason(
        reasons,
        "platform-certification-mode-mismatch",
        "Platform certification evidence was not generated in a non-public/offline deployment mode.",
        { requestedMode: certificationMode, reportCertificationMode },
      );
    }
    if (report?.nonPublicDeploymentAcceptable !== true) {
      addReason(
        reasons,
        "platform-certification-non-public-not-acceptable",
        "Platform certification does not mark non-public deployment as acceptable.",
      );
    }
    if (report?.certificationStatus === "FAIL") {
      addReason(reasons, "platform-certification-failed", "Platform certification has failed commands.");
    }
    if (failedCommands !== 0) {
      addReason(reasons, "platform-certification-failed-commands", "Platform certification has failed command results.");
    }
    if (runtimeIncomplete) {
      addReason(reasons, "platform-certification-runtime-incomplete", "Runtime audit is incomplete and cannot be deferred in non-public mode.");
    }
    if (hardUnresolvedBlockers.length > 0) {
      addReason(
        reasons,
        "platform-certification-hard-blockers",
        "Platform certification has unresolved blockers outside the deferrable admin credential/click-through class.",
      );
    }
    if (!unresolvedBlockers.every(isDeferrableAdminCredentialLiveBlocker)) {
      addReason(
        reasons,
        "platform-certification-non-deferrable-blockers",
        "Platform certification unresolved blockers are not exclusively deferrable admin credential/click-through blockers.",
      );
    }
    if (!safetyClean) {
      addReason(reasons, "platform-certification-safety-flags", "Platform certification safety flags are not clean.");
    }
  } else {
    if (!acceptedPlatformCertificationStatus(report?.certificationStatus)) {
      addReason(reasons, "platform-certification-not-pass", "Platform certification status is not PASS or PASS_WITH_WARNINGS.");
    }
    if (report?.deploymentReadinessScore !== 100) {
      addReason(reasons, "platform-certification-score", "Platform certification readiness score is not 100.");
    }
    if (report?.BLOCKED_BY_INPUTS !== false) {
      addReason(reasons, "platform-certification-blocked-inputs", "Platform certification is still blocked by inputs.");
    }
    if (report?.CERTIFYING !== true) {
      addReason(reasons, "platform-certification-not-certifying", "Platform certification CERTIFYING flag is not true.");
    }
    if (blockers !== 0) {
      addReason(reasons, "platform-certification-blockers", "Platform certification has unresolved blockers.");
    }
  }
  if (!strictSha(certifiedCommit)) {
    addReason(reasons, "platform-certification-missing-target", "Platform certification is missing a strict currentCommit target.");
  }
  if (!current) {
    addReason(reasons, "current-head-unresolved", "Current git HEAD could not be resolved for controlled go-live validation.");
  } else if (!targetAccepted) {
    addReason(
      reasons,
      "platform-certification-target-mismatch",
      "Platform certification currentCommit does not match current HEAD or an accepted evidence-only descendant.",
      { certifiedCommit, currentHead: current },
    );
  }

  return {
    allowed: reasons.length === 0,
    path: platformCertificationPath,
    currentHead: current,
    certifiedCommit,
    certificationStatus: report?.certificationStatus ?? null,
    certificationMode,
    reportCertificationMode,
    deploymentReadinessScore: report?.deploymentReadinessScore ?? null,
    blockedByInputs: report?.BLOCKED_BY_INPUTS ?? null,
    certifying: report?.CERTIFYING === true,
    liveProductionCertified: report?.liveProductionCertified === true,
    nonPublicDeploymentAcceptable,
    deferredLiveProductionBlockers,
    hardUnresolvedBlockers,
    failedCommands,
    runtimeIncomplete,
    blockers,
    targetAccepted,
    reasons,
  };
}

function hostKeyValueFromEnv(env = process.env) {
  const value = firstString(env?.[REQUIRED_PRODUCTION_HOST_KEY_INPUT]);
  return value;
}

function hostKeyValueFromGitHubVariable({
  repo = DEFAULT_PRODUCTION_REPO,
  env = process.env,
} = {}) {
  if (env?.CRP_DISABLE_GITHUB_HOST_KEY_LOOKUP === "true") return null;
  try {
    const raw = execFileSync("gh", ["variable", "list", "--repo", repo, "--json", "name,value"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const variables = JSON.parse(raw);
    const match = Array.isArray(variables)
      ? variables.find((variable) => variable?.name === REQUIRED_PRODUCTION_HOST_KEY_INPUT)
      : null;
    return firstString(match?.value);
  } catch {
    return null;
  }
}

function normalizeHostKeyFingerprints(value) {
  return String(value ?? "")
    .split(/[,\s;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function validateProductionHostKeyPinning({
  rootDir = repoRootFromScript(),
  env = process.env,
  productionRepo = DEFAULT_PRODUCTION_REPO,
} = {}) {
  const reasons = [];
  const workflowPath = ".github/workflows/deploy-production.yml";
  const workflowText = existsSync(path.resolve(rootDir, workflowPath))
    ? readFileSync(path.resolve(rootDir, workflowPath), "utf8")
    : "";
  const value = hostKeyValueFromEnv(env) ?? hostKeyValueFromGitHubVariable({ repo: productionRepo, env });
  const fingerprints = normalizeHostKeyFingerprints(value);
  const workflowFailsClosed =
    workflowText.includes(REQUIRED_PRODUCTION_HOST_KEY_INPUT) &&
    workflowText.includes(`Refusing production deploy: ${REQUIRED_PRODUCTION_HOST_KEY_INPUT} is required`) &&
    workflowText.includes("verify_production_ssh_host_key") &&
    workflowText.includes('grep -Fx -f "$expected_fingerprints_tmp" "$scanned_fingerprints_tmp"');

  if (!workflowFailsClosed) {
    addReason(reasons, "host-key-workflow-not-fail-closed", "Production workflow does not fail closed on SSH host-key pinning.");
  }
  if (fingerprints.length === 0) {
    addReason(
      reasons,
      "host-key-input-missing",
      `${REQUIRED_PRODUCTION_HOST_KEY_INPUT} is missing from the environment or GitHub production repo variable.`,
    );
  }
  if (fingerprints.some((fingerprint) => !/^SHA256:[A-Za-z0-9+/=]+$/.test(fingerprint))) {
    addReason(
      reasons,
      "host-key-input-invalid",
      `${REQUIRED_PRODUCTION_HOST_KEY_INPUT} must contain one or more SHA256: SSH host-key fingerprints.`,
    );
  }

  return {
    allowed: reasons.length === 0,
    inputName: REQUIRED_PRODUCTION_HOST_KEY_INPUT,
    source: hostKeyValueFromEnv(env) ? "environment" : value ? "github-variable" : "missing",
    fingerprintCount: fingerprints.length,
    workflowFailsClosed,
    reasons,
  };
}

export function validateProductionNoWorkerPolicy({ rootDir = repoRootFromScript() } = {}) {
  const reasons = [];
  const workflowPath = ".github/workflows/deploy-production.yml";
  const composePath = "docker-compose.production.yml";
  const workflowText = existsSync(path.resolve(rootDir, workflowPath))
    ? readFileSync(path.resolve(rootDir, workflowPath), "utf8")
    : "";
  const composeText = existsSync(path.resolve(rootDir, composePath))
    ? readFileSync(path.resolve(rootDir, composePath), "utf8")
    : "";
  const normalDeployAppOnly =
    workflowText.includes("docker compose -f docker-compose.production.yml up -d --build creditregulatorpro") &&
    !workflowText.includes("docker compose -f docker-compose.production.yml up -d --build creditregulatorpro creditregulatorpro-ingest-worker");
  const rollbackDeployAppOnly =
    workflowText.includes("docker compose -f docker-compose.production.yml up -d --no-build --force-recreate creditregulatorpro") &&
    !workflowText.includes("docker compose -f docker-compose.production.yml up -d --no-build --force-recreate creditregulatorpro creditregulatorpro-ingest-worker");
  const noComposeWorker = !/^\s{2}creditregulatorpro-ingest-worker:/m.test(composeText);
  const manualWorkerStillGuarded =
    workflowText.includes("run_ingest_worker:") &&
    workflowText.includes("Skipping production ingest worker. Manual workflow_dispatch input is required.") &&
    workflowText.includes("run_ingest_worker=true is required before dry-run or apply") &&
    workflowText.includes("pnpm run ingest:worker --dry-run") &&
    workflowText.includes("pnpm run ingest:worker --apply");
  const defaultDeployRefusesUnexpectedWorker =
    workflowText.includes("production ingest worker started during default no-worker deploy") &&
    workflowText.includes("grep -qx 'creditregulatorpro-ingest-worker'");

  if (!noComposeWorker) {
    addReason(reasons, "worker-compose-service-present", "docker-compose.production.yml still defines an automatic production ingest-worker service.");
  }
  if (!normalDeployAppOnly) {
    addReason(reasons, "worker-normal-deploy-starts", "Production deploy workflow still starts the ingest worker during normal deploy.");
  }
  if (!rollbackDeployAppOnly) {
    addReason(reasons, "worker-rollback-deploy-starts", "Production rollback workflow still starts the ingest worker during rollback.");
  }
  if (!manualWorkerStillGuarded) {
    addReason(reasons, "worker-manual-guards-missing", "Manual production ingest worker dry-run/apply guards are missing.");
  }
  if (!defaultDeployRefusesUnexpectedWorker) {
    addReason(reasons, "worker-default-assertion-missing", "Production deploy workflow does not assert the worker remains stopped by default.");
  }

  return {
    allowed: reasons.length === 0,
    policy: "no-worker-production-deploy",
    noComposeWorker,
    normalDeployAppOnly,
    rollbackDeployAppOnly,
    manualWorkerStillGuarded,
    defaultDeployRefusesUnexpectedWorker,
    reasons,
  };
}

export function validateControlledGoLivePromotion({
  rootDir = repoRootFromScript(),
  platformCertificationPath = PLATFORM_CERTIFICATION_JSON_PATH,
  currentHead = null,
  env = process.env,
  productionRepo = DEFAULT_PRODUCTION_REPO,
} = {}) {
  const resolvedCurrentHead = currentHead ?? safeGit(["rev-parse", "HEAD"], rootDir);
  const certificationFile = readJsonFile(rootDir, platformCertificationPath);
  const certification = validatePlatformCertificationForGoLive(certificationFile.value, {
    rootDir,
    currentHead: resolvedCurrentHead,
    platformCertificationPath,
    env,
  });
  const hostKeyPinning = validateProductionHostKeyPinning({ rootDir, env, productionRepo });
  const workerPolicy = validateProductionNoWorkerPolicy({ rootDir });
  const reasons = [
    ...(!certificationFile.exists
      ? [{
          code: "platform-certification-missing",
          message: "Required Level 5 platform certification evidence is missing.",
          details: { path: platformCertificationPath },
        }]
      : []),
    ...(certificationFile.error
      ? [{
          code: "platform-certification-unreadable",
          message: "Required Level 5 platform certification evidence is unreadable.",
          details: { path: platformCertificationPath },
        }]
      : []),
    ...certification.reasons,
    ...hostKeyPinning.reasons,
    ...workerPolicy.reasons,
  ];

  return {
    allowed: reasons.length === 0,
    mode: "controlled-go-live",
    currentHead: resolvedCurrentHead,
    platformCertificationPath,
    certification,
    hostKeyPinning,
    workerPolicy,
    reasons,
  };
}

export function renderPromotionGuardSummary(result) {
  const lines = [];
  if (result.allowed) {
    lines.push("Production promotion evidence guard passed.");
  } else {
    lines.push("Production promotion blocked: latest production promotion pack is not certifying for production-at-scale.");
  }

  lines.push(`Evidence pack: ${sanitizePromotionGuardText(result.packPath ?? DEFAULT_PROMOTION_PACK_JSON)}`);
  lines.push(`CERTIFYING: ${result.certifying ? "true" : "false"}`);
  lines.push(`Can promote production-at-scale: ${result.canPromoteProductionAtScale ? "true" : "false"}`);
  if (result.currentHead) lines.push(`Current HEAD: ${sanitizePromotionGuardText(result.currentHead)}`);
  if (result.evidenceCommit) lines.push(`Evidence commit: ${sanitizePromotionGuardText(result.evidenceCommit)}`);

  if (result.openP0P1Blockers?.length) {
    lines.push("Open P0/P1 blockers:");
    for (const blocker of result.openP0P1Blockers.slice(0, 10)) {
      const id = blocker.number ? `#${blocker.number}` : blocker.id ?? "unknown";
      lines.push(`- ${sanitizePromotionGuardText(id)} ${blocker.title} (${blocker.severity}; ${blocker.classification})`);
    }
  }

  if (result.reasons?.length) {
    lines.push("Blocking reasons:");
    for (const reason of result.reasons.slice(0, 12)) {
      lines.push(`- ${sanitizePromotionGuardText(reason.message)}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function renderControlledGoLivePromotionSummary(result) {
  const lines = [];
  if (result.allowed) {
    if (isNonPublicDeploymentCertificationMode(result.certification?.certificationMode)) {
      lines.push("Non-public production test promotion guard passed. LIVE Production remains uncertified.");
    } else {
      lines.push("Controlled production go-live guard passed.");
    }
  } else {
    lines.push("Controlled production go-live guard blocked promotion.");
  }

  lines.push(`Mode: ${result.mode ?? "controlled-go-live"}`);
  lines.push(`Current HEAD: ${sanitizePromotionGuardText(result.currentHead ?? "unknown")}`);
  lines.push(`Platform certification: ${sanitizePromotionGuardText(result.platformCertificationPath ?? PLATFORM_CERTIFICATION_JSON_PATH)}`);
  lines.push(`Requested certification mode: ${sanitizePromotionGuardText(result.certification?.certificationMode ?? "unknown")}`);
  lines.push(`Report certification mode: ${sanitizePromotionGuardText(result.certification?.reportCertificationMode ?? "unknown")}`);
  lines.push(`Certification status: ${sanitizePromotionGuardText(result.certification?.certificationStatus ?? "unknown")}`);
  lines.push(`LIVE production certified: ${result.certification?.liveProductionCertified ? "true" : "false"}`);
  lines.push(`Non-public deployment acceptable: ${result.certification?.nonPublicDeploymentAcceptable ? "true" : "false"}`);
  lines.push(`Deferred LIVE blockers: ${sanitizePromotionGuardText(result.certification?.deferredLiveProductionBlockers?.length ?? 0)}`);
  lines.push(`Readiness score: ${sanitizePromotionGuardText(result.certification?.deploymentReadinessScore ?? "unknown")}`);
  lines.push(`Certification blockers: ${sanitizePromotionGuardText(result.certification?.blockers ?? "unknown")}`);
  lines.push(`Certified commit: ${sanitizePromotionGuardText(result.certification?.certifiedCommit ?? "unknown")}`);
  lines.push(`Certified target accepted: ${result.certification?.targetAccepted ? "true" : "false"}`);
  lines.push(`Host-key input: ${sanitizePromotionGuardText(result.hostKeyPinning?.inputName ?? REQUIRED_PRODUCTION_HOST_KEY_INPUT)}`);
  lines.push(`Host-key source: ${sanitizePromotionGuardText(result.hostKeyPinning?.source ?? "unknown")}`);
  lines.push(`Host-key fingerprint count: ${sanitizePromotionGuardText(result.hostKeyPinning?.fingerprintCount ?? 0)}`);
  lines.push(`Production worker policy: ${sanitizePromotionGuardText(result.workerPolicy?.policy ?? "unknown")}`);
  lines.push(`No-worker policy cleared: ${result.workerPolicy?.allowed ? "true" : "false"}`);

  if (result.reasons?.length) {
    lines.push("Blocking reasons:");
    for (const reason of result.reasons.slice(0, 16)) {
      lines.push(`- ${sanitizePromotionGuardText(reason.message)}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function printHelp() {
  console.log([
    "Usage: pnpm run production-scale:promotion-guard -- [options]",
    "",
    "Defaults to the controlled production go-live guard: Level 5 PASS/100 evidence, host-key pinning input, and no-worker deploy policy.",
    "",
    "Options:",
    "  --root <path>          Project root. Defaults to repository root.",
    "  --pack <path>          Promotion pack JSON path relative to root.",
    "  --platform-cert <path> Platform certification JSON path relative to root.",
    "  --current-head <sha>   Override current HEAD for test fixtures.",
    "  --legacy-pack          Run the legacy production-at-scale promotion-pack guard.",
  ].join("\n"));
}

function parseArgs(args) {
  const options = {
    rootDir: repoRootFromScript(),
    packPath: DEFAULT_PROMOTION_PACK_JSON,
    platformCertificationPath: PLATFORM_CERTIFICATION_JSON_PATH,
    currentHead: null,
    legacyPack: false,
  };

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
    if (arg === "--pack") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--pack requires a value.");
      options.packPath = value;
      index += 1;
      continue;
    }
    if (arg === "--platform-cert") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--platform-cert requires a value.");
      options.platformCertificationPath = value;
      index += 1;
      continue;
    }
    if (arg === "--current-head") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--current-head requires a value.");
      options.currentHead = value;
      index += 1;
      continue;
    }
    if (arg === "--legacy-pack") {
      options.legacyPack = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = options.legacyPack
    ? validateLatestProductionPromotionPack(options)
    : validateControlledGoLivePromotion(options);
  const summary = options.legacyPack
    ? renderPromotionGuardSummary(result)
    : renderControlledGoLivePromotionSummary(result);
  if (result.allowed) {
    console.log(summary.trimEnd());
    return;
  }
  console.error(summary.trimEnd());
  process.exitCode = 1;
}

if (process.argv[1] && existsSync(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[ERROR] ${sanitizePromotionGuardText(error instanceof Error ? error.message : String(error))}`);
    process.exitCode = 1;
  });
}
