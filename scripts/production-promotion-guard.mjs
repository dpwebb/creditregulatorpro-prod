import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_PROMOTION_PACK_JSON } from "./production-promotion-pack.mjs";

const BLOCKING_SEVERITIES = new Set(["p0", "p1", "critical", "high"]);
const CLOSED_CLASSIFICATIONS = new Set([
  "fixed with automated evidence",
  "fixed with staging evidence",
  "fixed with human-observed evidence",
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

function printHelp() {
  console.log([
    "Usage: pnpm run production-scale:promotion-guard -- [options]",
    "",
    "Fails closed unless docs/production-scale/evidence/latest-production-promotion-pack.json is certifying true.",
    "",
    "Options:",
    "  --root <path>          Project root. Defaults to repository root.",
    "  --pack <path>          Promotion pack JSON path relative to root.",
    "  --current-head <sha>   Override current HEAD for test fixtures.",
  ].join("\n"));
}

function parseArgs(args) {
  const options = {
    rootDir: repoRootFromScript(),
    packPath: DEFAULT_PROMOTION_PACK_JSON,
    currentHead: null,
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
    if (arg === "--current-head") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--current-head requires a value.");
      options.currentHead = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = validateLatestProductionPromotionPack(options);
  const summary = renderPromotionGuardSummary(result);
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
