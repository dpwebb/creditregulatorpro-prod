import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  DEFAULT_PRODUCTION_REPO as DEFAULT_PRODUCTION_REPO_SLUG,
  PLATFORM_CERTIFICATION_JSON_PATH,
  sanitizePromotionGuardText,
  validateProductionHostKeyPinning,
  validateProductionNoWorkerPolicy,
} from "./production-promotion-guard.mjs";
import {
  DEPLOYMENT_CERTIFICATION_MODES,
  isNonPublicDeploymentCertificationMode,
} from "./platform-certification.mjs";

const DEFAULT_PRODUCTION_REPO_URL = "https://github.com/dpwebb/creditregulatorpro-prod.git";
const DEFAULT_SOURCE_BRANCH = "staging";
const DEFAULT_PRODUCTION_BRANCH = "main";

export const NON_PUBLIC_PROMOTION_CONFIRM_FLAG = "--confirm";
export const NON_PUBLIC_PROMOTION_CONFIRM_COMMAND = "pnpm run promote:non-public-production -- --confirm";
export const ALLOWED_NON_PUBLIC_EVIDENCE_DIRTY_PATHS = new Set([
  PLATFORM_CERTIFICATION_JSON_PATH,
  "docs/platform-certification/latest-platform-certification.md",
]);

const STRICT_SHA_RE = /^[a-f0-9]{40}$/i;
const REQUIRED_CORE_STATUS_FIELDS = [
  "infrastructureReadinessStatus",
  "parserConfidenceCertification",
  "packetLifecycleStatus",
  "storageLifecycleStatus",
  "reproducibilityStatus",
  "rollbackReadinessStatus",
];
const REQUIRED_CLEAN_SAFETY_FLAGS = [
  "productionDataMutated",
  "productionConfigurationModified",
  "infrastructureModifiedAutomatically",
  "schemasModified",
  "destructiveCleanupRun",
  "secretsPrinted",
];

function repoRootFromScript() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function strictSha(value) {
  return STRICT_SHA_RE.test(String(value ?? ""));
}

function addReason(reasons, code, message, details = {}) {
  reasons.push({
    code,
    message: sanitizePromotionGuardText(message),
    details,
  });
}

function normalizeRepoPath(filePath) {
  return String(filePath ?? "").replace(/\\/g, "/").replace(/^\.?\//, "");
}

function run(command, commandArgs, options = {}) {
  const output = execFileSync(command, commandArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
  return typeof output === "string" ? output.trim() : "";
}

function runGit(commandArgs, options = {}) {
  return run("git", commandArgs, options);
}

function fail(message) {
  console.error(`ERROR: ${sanitizePromotionGuardText(message)}`);
  process.exit(1);
}

function readJsonFile(rootDir, relativePath) {
  const absolutePath = path.resolve(rootDir, relativePath);
  if (!existsSync(absolutePath)) {
    return { exists: false, value: null, error: null };
  }
  try {
    return {
      exists: true,
      value: JSON.parse(readFileSync(absolutePath, "utf8")),
      error: null,
    };
  } catch (error) {
    return { exists: true, value: null, error };
  }
}

function blockerText(blocker) {
  return [
    blocker?.subsystem,
    blocker?.gateId,
    blocker?.gateLabel,
    blocker?.reason,
    blocker?.message,
  ]
    .filter(Boolean)
    .join(" ");
}

export function isAdminCredentialOrClickThroughDeferral(blocker) {
  if (!blocker || typeof blocker !== "object" || Array.isArray(blocker)) return false;
  if (blocker.deferrableForNonPublicDeployment !== true) return false;
  if (blocker.deferredUntilCertificationMode !== DEPLOYMENT_CERTIFICATION_MODES.LIVE_PRODUCTION) return false;
  if (
    Object.prototype.hasOwnProperty.call(blocker, "requiredBeforeLiveProduction") &&
    blocker.requiredBeforeLiveProduction !== true
  ) {
    return false;
  }

  const text = blockerText(blocker);
  const adminOrCredentialScope =
    /admin/i.test(text) ||
    /E2E_ADMIN|STAGING_ADMIN|admin packet workflow|admin packet probe/i.test(text);
  const inputOrClickThroughScope =
    /credential|credentials|session|cookie|click-through|click through|probe was skipped|not supplied|missing|absent|stale|failed login/i.test(text);
  const realFailureScope =
    /route authorization failure|privacy failure|server error|static test failed|parser failure|packet lifecycle failure|runtime failure/i.test(text);

  return adminOrCredentialScope && inputOrClickThroughScope && !realFailureScope;
}

function blockerKey(blocker) {
  return [
    blocker?.gateId ?? blocker?.id ?? "",
    blocker?.subsystem ?? "",
    blocker?.reason ?? blocker?.message ?? "",
  ].join("|");
}

function everyUnresolvedBlockerIsDeferredAdminCredential(report, deferredLiveProductionBlockers) {
  const unresolvedBlockers = Array.isArray(report?.unresolvedBlockers) ? report.unresolvedBlockers : [];
  if (unresolvedBlockers.length === 0) return true;

  const deferredKeys = new Set(deferredLiveProductionBlockers.map(blockerKey));
  return unresolvedBlockers.every((blocker) => {
    if (!isAdminCredentialOrClickThroughDeferral(blocker)) return false;
    return deferredKeys.has(blockerKey(blocker)) || deferredLiveProductionBlockers.some((deferred) =>
      (blocker?.gateId && deferred?.gateId === blocker.gateId) ||
      (blocker?.reason && deferred?.reason === blocker.reason)
    );
  });
}

export function validateNonPublicCertificationEvidence(report, { currentHead = null } = {}) {
  const reasons = [];
  const current = strictSha(currentHead) ? currentHead : null;

  if (!report || typeof report !== "object" || Array.isArray(report)) {
    addReason(reasons, "invalid-platform-certification", "Platform certification JSON did not parse to an object.");
    return {
      allowed: false,
      currentHead: current,
      certifiedCommit: null,
      certificationMode: null,
      deferredLiveProductionBlockers: [],
      reasons,
    };
  }

  const certificationMode = String(report.certificationMode ?? "");
  const certifiedCommit = String(report.currentCommit ?? "");
  const deferredLiveProductionBlockers = Array.isArray(report.deferredLiveProductionBlockers)
    ? report.deferredLiveProductionBlockers
    : [];
  const hardUnresolvedBlockers = Array.isArray(report.hardUnresolvedBlockers)
    ? report.hardUnresolvedBlockers
    : report.hardUnresolvedBlockers == null
      ? []
      : null;

  if (!isNonPublicDeploymentCertificationMode(certificationMode)) {
    addReason(
      reasons,
      "non-public-certification-mode-required",
      "Platform certification evidence must be generated in NON_PUBLIC_PRODUCTION_TEST or OFFLINE_DEPLOYMENT mode.",
      { certificationMode },
    );
  }
  if (certificationMode === DEPLOYMENT_CERTIFICATION_MODES.LIVE_PRODUCTION) {
    addReason(
      reasons,
      "live-production-mode-not-allowed",
      "The non-public promotion command refuses LIVE_PRODUCTION certification evidence.",
    );
  }
  if (report.nonPublicDeploymentAcceptable !== true) {
    addReason(
      reasons,
      "non-public-deployment-not-acceptable",
      "Platform certification evidence does not mark non-public deployment as acceptable.",
    );
  }
  if (!strictSha(certifiedCommit)) {
    addReason(reasons, "missing-current-commit", "Platform certification evidence is missing a strict currentCommit hash.");
  }
  if (!current) {
    addReason(reasons, "current-head-unresolved", "Current git HEAD could not be resolved.");
  } else if (certifiedCommit !== current) {
    addReason(
      reasons,
      "stale-platform-certification",
      "Platform certification currentCommit does not match current git HEAD.",
      { certifiedCommit, currentHead: current },
    );
  }

  if (Number(report.commandCounts?.failed) !== 0) {
    addReason(reasons, "failed-certification-commands", "Platform certification commandCounts.failed must be 0.");
  }

  if (!Array.isArray(hardUnresolvedBlockers)) {
    addReason(reasons, "invalid-hard-blockers", "Platform certification hardUnresolvedBlockers must be absent or an array.");
  } else if (hardUnresolvedBlockers.length > 0) {
    addReason(reasons, "hard-unresolved-blockers", "Platform certification has hard unresolved blockers.");
  }

  if (!report.safety || typeof report.safety !== "object" || Array.isArray(report.safety)) {
    addReason(reasons, "missing-safety-flags", "Platform certification safety flags are missing.");
  } else {
    for (const flag of REQUIRED_CLEAN_SAFETY_FLAGS) {
      if (report.safety[flag] !== false) {
        addReason(reasons, "dirty-safety-flag", `Platform certification safety.${flag} must be false.`, { flag });
      }
    }
  }

  for (const field of REQUIRED_CORE_STATUS_FIELDS) {
    if (report[field] !== "PASS") {
      addReason(reasons, "core-status-not-pass", `Platform certification ${field} must be PASS.`, { field });
    }
  }

  const invalidDeferredBlockers = deferredLiveProductionBlockers.filter(
    (blocker) => !isAdminCredentialOrClickThroughDeferral(blocker),
  );
  if (invalidDeferredBlockers.length > 0) {
    addReason(
      reasons,
      "non-deferrable-live-blocker",
      "Deferred LIVE-production blockers must be explicit admin credential/session or click-through deferrals.",
      { count: invalidDeferredBlockers.length },
    );
  }

  if (
    report.adminCertificationStatus !== "PASS" &&
    (deferredLiveProductionBlockers.length === 0 || !deferredLiveProductionBlockers.every(isAdminCredentialOrClickThroughDeferral))
  ) {
    addReason(
      reasons,
      "admin-certification-not-pass",
      "Admin certification must be PASS or explicitly deferred only as an admin credential/session or click-through LIVE blocker.",
    );
  }

  if (!everyUnresolvedBlockerIsDeferredAdminCredential(report, deferredLiveProductionBlockers)) {
    addReason(
      reasons,
      "unresolved-blocker-not-deferred",
      "Any unresolved blocker must be represented as an explicit deferred LIVE-production admin credential/click-through blocker.",
    );
  }

  return {
    allowed: reasons.length === 0,
    currentHead: current,
    certifiedCommit,
    certificationMode,
    liveProductionCertified: report.liveProductionCertified === true,
    nonPublicDeploymentAcceptable: report.nonPublicDeploymentAcceptable === true,
    deferredLiveProductionBlockers,
    hardUnresolvedBlockers: Array.isArray(hardUnresolvedBlockers) ? hardUnresolvedBlockers : [],
    reasons,
  };
}

function parsePorcelainStatusLine(line) {
  if (!line) return null;
  const rawPath = line.slice(3);
  const filePath = rawPath.includes(" -> ") ? rawPath.split(" -> ").pop() : rawPath;
  return normalizeRepoPath(filePath);
}

export function validateWorkingTreeAllowsNonPublicPromotion(statusText) {
  const changedPaths = String(statusText ?? "")
    .split(/\r?\n/)
    .map(parsePorcelainStatusLine)
    .filter(Boolean);
  const blockingPaths = changedPaths.filter((filePath) => !ALLOWED_NON_PUBLIC_EVIDENCE_DIRTY_PATHS.has(filePath));

  return {
    allowed: blockingPaths.length === 0,
    changedPaths,
    blockingPaths,
    reasons: blockingPaths.length === 0
      ? []
      : [
          {
            code: "working-tree-dirty",
            message: "Working tree has uncommitted changes outside platform certification evidence.",
            details: { blockingPaths },
          },
        ],
  };
}

export function parseNonPublicPromotionArgs(args) {
  const options = {
    confirm: false,
    allowNonFastForward: false,
    help: false,
  };

  for (const arg of args) {
    if (arg === NON_PUBLIC_PROMOTION_CONFIRM_FLAG) {
      options.confirm = true;
      continue;
    }
    if (arg === "--allow-non-fast-forward") {
      options.allowNonFastForward = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

export function renderNonPublicPromotionSummary(result) {
  const lines = [
    "NON-PUBLIC PRODUCTION TEST DEPLOYMENT",
    "NOT LIVE PRODUCTION CERTIFIED",
    "",
  ];

  if (result.allowed) {
    lines.push("Non-public production-test promotion checks passed.");
  } else {
    lines.push("Non-public production-test promotion blocked.");
  }

  lines.push(`Current HEAD: ${sanitizePromotionGuardText(result.currentHead ?? "unknown")}`);
  lines.push(`Certified commit: ${sanitizePromotionGuardText(result.certification?.certifiedCommit ?? "unknown")}`);
  lines.push(`Certification mode: ${sanitizePromotionGuardText(result.certification?.certificationMode ?? "unknown")}`);
  lines.push(`Non-public deployment acceptable: ${result.certification?.nonPublicDeploymentAcceptable ? "true" : "false"}`);
  lines.push(`LIVE production certified: ${result.certification?.liveProductionCertified ? "true" : "false"}`);
  lines.push(`Deferred LIVE blockers: ${sanitizePromotionGuardText(result.certification?.deferredLiveProductionBlockers?.length ?? 0)}`);

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
    "Usage: pnpm run promote:non-public-production -- --confirm [--allow-non-fast-forward]",
    "",
    "Promotes the current staging commit to the production deployment target only for the private/offline production-test phase.",
    "This is not LIVE Production certification.",
    "",
    "Required confirmation:",
    `  ${NON_PUBLIC_PROMOTION_CONFIRM_COMMAND}`,
  ].join("\n"));
}

function cleanupTempRef(tempRef) {
  try {
    runGit(["update-ref", "-d", tempRef]);
  } catch {
    // Best effort cleanup only.
  }
}

async function main() {
  const options = parseNonPublicPromotionArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  console.log("NON-PUBLIC PRODUCTION TEST DEPLOYMENT");
  console.log("NOT LIVE PRODUCTION CERTIFIED");
  console.log("");

  if (!options.confirm) {
    console.error("ERROR: confirmation is required.");
    console.error(`Rerun with: ${NON_PUBLIC_PROMOTION_CONFIRM_COMMAND}`);
    process.exitCode = 1;
    return;
  }

  const rootDir = repoRootFromScript();
  const productionRepo = process.env.PRODUCTION_REPO_URL || DEFAULT_PRODUCTION_REPO_URL;
  const sourceBranch = process.env.SOURCE_BRANCH || DEFAULT_SOURCE_BRANCH;
  const productionBranch = process.env.PRODUCTION_BRANCH || DEFAULT_PRODUCTION_BRANCH;
  const tempRef = `refs/tmp/non-public-production-promotion/${productionBranch}`;

  try {
    runGit(["rev-parse", "--is-inside-work-tree"], { cwd: rootDir });
  } catch {
    fail("current directory is not a git repository");
  }

  const branch = runGit(["branch", "--show-current"], { cwd: rootDir });
  if (branch !== sourceBranch) {
    fail(`promotions must run from '${sourceBranch}', but current branch is '${branch || "detached HEAD"}'`);
  }

  let upstream = "";
  try {
    upstream = runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { cwd: rootDir });
  } catch {
    fail(`branch '${branch}' has no upstream configured`);
  }

  console.log(`Source branch: ${branch}`);
  console.log(`Source upstream: ${upstream}`);
  console.log(`Production repo: ${productionRepo}`);
  console.log(`Production branch: ${productionBranch}`);
  console.log("");

  console.log("Fetching source upstream...");
  const upstreamRemote = upstream.split("/")[0];
  runGit(["fetch", "--prune", upstreamRemote], { cwd: rootDir, stdio: "inherit" });

  const statusText = runGit(["status", "--porcelain"], { cwd: rootDir });
  const workingTree = validateWorkingTreeAllowsNonPublicPromotion(statusText);
  if (!workingTree.allowed) {
    console.error(renderNonPublicPromotionSummary({
      allowed: false,
      currentHead: runGit(["rev-parse", "HEAD"], { cwd: rootDir }),
      certification: null,
      reasons: workingTree.reasons,
    }).trimEnd());
    process.exitCode = 1;
    return;
  }

  const localHead = runGit(["rev-parse", "HEAD"], { cwd: rootDir });
  const upstreamHead = runGit(["rev-parse", upstream], { cwd: rootDir });
  if (localHead !== upstreamHead) {
    fail(`local HEAD ${localHead} does not match ${upstream} ${upstreamHead}`);
  }

  const certificationFile = readJsonFile(rootDir, PLATFORM_CERTIFICATION_JSON_PATH);
  const certification = validateNonPublicCertificationEvidence(certificationFile.value, { currentHead: localHead });
  const hostKeyPinning = validateProductionHostKeyPinning({
    rootDir,
    env: process.env,
    productionRepo: DEFAULT_PRODUCTION_REPO_SLUG,
  });
  const workerPolicy = validateProductionNoWorkerPolicy({ rootDir });
  const reasons = [
    ...(!certificationFile.exists
      ? [{
          code: "platform-certification-missing",
          message: "Required non-public platform certification evidence is missing.",
          details: { path: PLATFORM_CERTIFICATION_JSON_PATH },
        }]
      : []),
    ...(certificationFile.error
      ? [{
          code: "platform-certification-unreadable",
          message: "Required non-public platform certification evidence is unreadable.",
          details: { path: PLATFORM_CERTIFICATION_JSON_PATH },
        }]
      : []),
    ...certification.reasons,
    ...hostKeyPinning.reasons,
    ...workerPolicy.reasons,
  ];
  const result = {
    allowed: reasons.length === 0,
    currentHead: localHead,
    certification,
    hostKeyPinning,
    workerPolicy,
    reasons,
  };

  const summary = renderNonPublicPromotionSummary(result);
  if (!result.allowed) {
    console.error(summary.trimEnd());
    process.exitCode = 1;
    return;
  }
  console.log(summary.trimEnd());

  console.log("");
  console.log("Fetching production branch for comparison...");
  cleanupTempRef(tempRef);
  runGit(["fetch", "--no-tags", productionRepo, `refs/heads/${productionBranch}:${tempRef}`], {
    cwd: rootDir,
    stdio: "inherit",
  });

  const productionHead = runGit(["rev-parse", tempRef], { cwd: rootDir });
  let isFastForward = false;
  try {
    runGit(["merge-base", "--is-ancestor", productionHead, localHead], { cwd: rootDir, stdio: "ignore" });
    isFastForward = true;
  } catch {
    isFastForward = false;
  }

  console.log("");
  console.log(`Approved non-public staging commit: ${localHead}`);
  console.log(`Current production commit: ${productionHead}`);
  console.log(`Fast-forward promotion: ${isFastForward ? "yes" : "no"}`);

  if (!isFastForward && !options.allowNonFastForward) {
    cleanupTempRef(tempRef);
    fail(
      "production branch is not an ancestor of this staging commit. " +
        "Review history first, then rerun with --allow-non-fast-forward only if replacing production with staging is intended.",
    );
  }

  console.log("");
  console.log("Pushing approved staging commit to non-public production-test target...");
  runGit([
    "push",
    `--force-with-lease=refs/heads/${productionBranch}:${productionHead}`,
    productionRepo,
    `HEAD:refs/heads/${productionBranch}`,
  ], {
    cwd: rootDir,
    stdio: "inherit",
  });
  cleanupTempRef(tempRef);

  console.log("");
  console.log(`Non-public production-test promotion complete: ${localHead} -> ${productionRepo} ${productionBranch}`);
  console.log("NOT LIVE PRODUCTION CERTIFIED");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(`[promote:non-public-production] ${sanitizePromotionGuardText(error instanceof Error ? error.stack ?? error.message : String(error))}`);
    process.exitCode = 1;
  });
}
