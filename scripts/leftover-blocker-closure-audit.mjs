import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LEFTOVER_BLOCKER_AUDIT_MD_PATH =
  "docs/production-scale/evidence/latest-leftover-blocker-closure-audit.md";
export const LEFTOVER_BLOCKER_AUDIT_JSON_PATH =
  "docs/production-scale/evidence/latest-leftover-blocker-closure-audit.json";
export const DEFAULT_PROMOTION_PACK_JSON_PATH =
  "docs/production-scale/evidence/latest-production-promotion-pack.json";

const PRIOR_LEFTOVER_BLOCKERS = [1, 2, 6, 8, 9, 10, 11, 20, 21, 22, 3, 16, 17, 18];

const MISSING_PROOF = {
  1: {
    missingEvidence: [
      "Filled sanitized human-observed restore drill evidence proving RPO/RTO, auth/session, packet PDF, response queue, cleanup/lifecycle, rollback/cleanup, and signed operator acknowledgement.",
    ],
    exactRequiredCommands: ["pnpm run restore:accept-human-evidence"],
    humanArtifacts: [
      "docs/production-scale/evidence/human-restore-drill-evidence.md",
      "docs/production-scale/evidence/human-restore-drill-evidence.json",
    ],
    codexCanSafelyClose: false,
    operatorActionRequired: true,
  },
  2: {
    missingEvidence: [
      "Accepted operator production queue-depth before/after evidence for a bounded production ingest worker run; simulated worker proof is not production runtime proof.",
    ],
    exactRequiredCommands: ["pnpm run production-worker:readiness-evidence"],
    humanArtifacts: [
      "docs/production-scale/evidence/production-worker-queue-depth-evidence.md",
      "docs/production-scale/evidence/production-worker-queue-depth-evidence.json",
    ],
    codexCanSafelyClose: false,
    operatorActionRequired: true,
  },
  6: {
    missingEvidence: [
      "Sanitized operator acceptance showing inventory ran, remediation plan was approved, remediation was performed by operator/approved process, old inline compatibility was tested, post-remediation counts were recorded, and backup/restore prerequisite was acknowledged.",
    ],
    exactRequiredCommands: ["pnpm run storage:raw-report-remediation-acceptance"],
    humanArtifacts: [
      "docs/production-scale/evidence/storage-raw-report-remediation-acceptance-evidence.md",
      "docs/production-scale/evidence/storage-raw-report-remediation-acceptance-evidence.json",
    ],
    codexCanSafelyClose: false,
    operatorActionRequired: true,
  },
  9: {
    missingEvidence: [
      "Live external alert proof or accepted formal alert exclusion. Existing alert evidence is dry-run/simulated only.",
    ],
    exactRequiredCommands: [
      "pnpm run alerts:exclusion:validate",
      "pnpm run response:ops-readiness-evidence",
    ],
    humanArtifacts: [
      "docs/production-scale/evidence/alerting-exclusion-evidence.md",
      "docs/production-scale/evidence/alerting-exclusion-evidence.json",
      "docs/production-scale/evidence/live-alert-proof.md",
      "docs/production-scale/evidence/live-alert-proof.json",
    ],
    codexCanSafelyClose: false,
    operatorActionRequired: true,
  },
  11: {
    missingEvidence: [
      "Accepted production workflow parity plus rollback/stop evidence, including approved bounded production worker dry-run/apply evidence where applicable.",
    ],
    exactRequiredCommands: [
      "pnpm run production-worker:readiness-evidence",
      "pnpm run production-safe-probes:evidence",
      "pnpm run staging-owner-denial-smoke:evidence",
    ],
    humanArtifacts: [
      "docs/production-scale/evidence/production-worker-queue-depth-evidence.md",
      "docs/production-scale/evidence/production-worker-queue-depth-evidence.json",
    ],
    codexCanSafelyClose: false,
    operatorActionRequired: true,
  },
  15: {
    missingEvidence: [
      "Design/evidence artifact for hidden-risk aggregate semantics, stale-suppression semantics, and a separate bounded pagination plan that does not change aggregate truth.",
    ],
    exactRequiredCommands: [
      "pnpm run sensitive-list-endpoints:evidence",
      "pnpm exec vitest run --config vitest.config.ts tests/api/high-growth-list-limits.spec.ts",
    ],
    humanArtifacts: [],
    codexCanSafelyClose: true,
    operatorActionRequired: false,
  },
  19: {
    missingEvidence: [
      "Accepted heavy PDF/OCR dependency governance tying runtime-size WARN/WAIVED baseline to deterministic OCR/parser regression proof for any future dependency or Docker package change.",
    ],
    exactRequiredCommands: [
      "pnpm run report:runtime-size",
      "pnpm run check:runtime-size",
      "pnpm exec vitest run --config vitest.config.ts tests/unit/deterministic-ocr-readiness.spec.ts",
    ],
    humanArtifacts: [],
    codexCanSafelyClose: true,
    operatorActionRequired: false,
  },
  20: {
    missingEvidence: [
      "Human-observed read-only production-safe privacy probe evidence. Local/staging synthetic owner-denial smoke is not production proof.",
    ],
    exactRequiredCommands: [
      "pnpm run production-safe-probes:evidence",
      "pnpm run staging-owner-denial-smoke:evidence",
    ],
    humanArtifacts: [
      "docs/production-scale/evidence/latest-production-safe-probes.md",
      "docs/production-scale/evidence/latest-production-safe-probes.json",
    ],
    codexCanSafelyClose: false,
    operatorActionRequired: true,
  },
  22: {
    missingEvidence: [
      "Human-observed physical retention archive/restore lifecycle evidence or accepted explicit retention exclusion. Simulated retention proof is not physical recoverability proof.",
    ],
    exactRequiredCommands: [
      "pnpm run retention:archive-restore:simulated",
      "pnpm run restore:accept-human-evidence",
    ],
    humanArtifacts: [
      "docs/production-scale/evidence/human-restore-drill-evidence.md",
      "docs/production-scale/evidence/human-restore-drill-evidence.json",
    ],
    codexCanSafelyClose: false,
    operatorActionRequired: true,
  },
  23: {
    missingEvidence: [
      "Executable route auth contract proof that public legacy handlers remain classified, retired public routes stay reset/410, and public inventory changes require explicit test updates.",
    ],
    exactRequiredCommands: [
      "pnpm run test:contracts",
      "pnpm run production-safe-probes:evidence",
    ],
    humanArtifacts: [],
    codexCanSafelyClose: true,
    operatorActionRequired: false,
  },
  24: {
    missingEvidence: [
      "Stale audit/tracker reference cleanup and aligned promotion-pack evidence after the latest commit, with blocker data still matching the controlling audit.",
    ],
    exactRequiredCommands: [
      "pnpm run production-scale:evidence",
      "pnpm run production-scale:promotion-pack",
      "git diff --check",
    ],
    humanArtifacts: [],
    codexCanSafelyClose: true,
    operatorActionRequired: false,
  },
};

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
}

function readJson(rootDir, relativePath) {
  return JSON.parse(readFileSync(repoPath(rootDir, relativePath), "utf8"));
}

function writeText(rootDir, relativePath, text) {
  const target = repoPath(rootDir, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text, "utf8");
}

function isUnresolvedClassification(classification) {
  return !String(classification ?? "").startsWith("fixed with") &&
    classification !== "waived with explicit reason";
}

function closureState(blocker) {
  if (blocker.classification === "fixed with automated evidence") return "closed-automated";
  if (blocker.classification === "fixed with human-observed evidence") return "closed-human-observed";
  if (blocker.classification === "fixed with staging evidence") return "closed-staging";
  if (blocker.classification === "waived with explicit reason") return "waived";
  if (blocker.classification === "human proof required") return "human-required";
  if (blocker.classification === "simulated proof only") return "simulated-only";
  if (blocker.classification === "partial") return "partial";
  return "open";
}

function missingProofFor(blocker) {
  const configured = MISSING_PROOF[blocker.number];
  if (configured) return configured;
  return {
    missingEvidence: [blocker.proofTypeRequired ?? "Accepted blocker-specific evidence is missing."],
    exactRequiredCommands: blocker.allowedProofCommands ?? [],
    humanArtifacts: [],
    codexCanSafelyClose: blocker.humanProofRequired !== true,
    operatorActionRequired: blocker.humanProofRequired === true,
  };
}

function summarizeBlocker(blocker) {
  const unresolved = isUnresolvedClassification(blocker.classification);
  const proof = unresolved ? missingProofFor(blocker) : null;
  return {
    number: blocker.number,
    title: blocker.title,
    severity: blocker.severity,
    area: blocker.area,
    currentStatus: blocker.currentStatus,
    classification: blocker.classification,
    closureState: closureState(blocker),
    waiverReason: blocker.waiverReason ?? null,
    missingEvidence: proof?.missingEvidence ?? [],
    exactRequiredCommands: proof?.exactRequiredCommands ?? [],
    humanArtifacts: proof?.humanArtifacts ?? [],
    codexCanSafelyClose: proof?.codexCanSafelyClose ?? null,
    operatorActionRequired: proof?.operatorActionRequired ?? false,
  };
}

function classifyEvidenceReference(ref) {
  return {
    path: ref.path,
    exists: ref.exists === true,
    reportName: ref.reportName ?? null,
    evidenceType: ref.evidenceType ?? null,
    status: ref.status ?? null,
    productionProof: ref.productionProof === true,
  };
}

export function validateLeftoverBlockerClosureAuditReport(report) {
  const errors = [];
  const remainingNumbers = new Set((report.remainingBlockers ?? []).map((blocker) => blocker.number));
  const unresolvedNumbers = new Set(
    (report.allBlockers ?? [])
      .filter((blocker) => isUnresolvedClassification(blocker.classification))
      .map((blocker) => blocker.number),
  );
  for (const number of unresolvedNumbers) {
    if (!remainingNumbers.has(number)) errors.push(`Unresolved blocker ${number} is missing from remainingBlockers.`);
  }
  for (const blocker of report.remainingBlockers ?? []) {
    if (!Array.isArray(blocker.missingEvidence) || blocker.missingEvidence.length === 0) {
      errors.push(`Remaining blocker ${blocker.number} is missing exact missing evidence.`);
    }
    if (!Array.isArray(blocker.exactRequiredCommands) || blocker.exactRequiredCommands.length === 0) {
      errors.push(`Remaining blocker ${blocker.number} is missing exact required commands.`);
    }
  }
  for (const blocker of report.allBlockers ?? []) {
    if (blocker.classification === "simulated proof only" && blocker.closureState !== "simulated-only") {
      errors.push(`Simulated-only blocker ${blocker.number} was not kept simulated-only.`);
    }
    if (blocker.classification === "human proof required" && blocker.closureState !== "human-required") {
      errors.push(`Human-required blocker ${blocker.number} was not kept human-required.`);
    }
    if (blocker.classification === "waived with explicit reason" && !blocker.waiverReason) {
      errors.push(`Waived blocker ${blocker.number} is missing an explicit waiver reason.`);
    }
  }
  if (report.safety?.simulatedProofPromotedToProductionProof === true) {
    errors.push("Simulated proof was promoted to production proof.");
  }
  if (report.safety?.dashboardSkipTreatedAsPass === true) {
    errors.push("Dashboard SKIP was treated as PASS.");
  }
  if (
    report.remainingBlockers?.length > 0 &&
    report.readinessClassification?.value === "production-at-scale"
  ) {
    errors.push("Readiness claims production-at-scale while blockers remain.");
  }
  if (
    report.remainingBlockers?.length === 0 &&
    report.readinessClassification?.value !== "production-at-scale"
  ) {
    errors.push("Readiness is not production-at-scale even though no blockers remain.");
  }
  return { ok: errors.length === 0, errors };
}

export function buildLeftoverBlockerClosureAuditReport({
  rootDir = process.cwd(),
  promotionPack = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const pack = promotionPack ?? readJson(rootDir, DEFAULT_PROMOTION_PACK_JSON_PATH);
  const allBlockers = (pack.blockerClassifications ?? []).map(summarizeBlocker);
  const remainingBlockers = allBlockers.filter((blocker) => isUnresolvedClassification(blocker.classification));
  const priorTrackedBlockers = PRIOR_LEFTOVER_BLOCKERS
    .map((number) => allBlockers.find((blocker) => blocker.number === number))
    .filter(Boolean);
  const missingEvidenceFiles = (pack.generatedEvidenceFileReferences ?? [])
    .map(classifyEvidenceReference)
    .filter((ref) => !ref.exists);
  const report = {
    reportName: "leftover-blocker-closure-audit",
    generatedAt,
    sourcePromotionPack: DEFAULT_PROMOTION_PACK_JSON_PATH,
    sourcePromotionPackGeneratedAt: pack.generatedAt,
    currentBranch: pack.currentBranch,
    currentCommitHash: pack.currentCommitHash,
    readinessClassification: pack.readinessClassification,
    summary: {
      totalBlockers: allBlockers.length,
      remainingBlockerCount: remainingBlockers.length,
      remainingProductionBlockerCount: pack.unresolvedProductionBlockers?.length ?? 0,
      remainingScaleBlockerCount: pack.unresolvedScaleBlockers?.length ?? 0,
      humanRequiredCount: allBlockers.filter((blocker) => blocker.closureState === "human-required").length,
      simulatedOnlyCount: allBlockers.filter((blocker) => blocker.closureState === "simulated-only").length,
      waivedCount: allBlockers.filter((blocker) => blocker.closureState === "waived").length,
      fixedOrWaivedCount: allBlockers.filter((blocker) =>
        blocker.closureState.startsWith("closed") || blocker.closureState === "waived",
      ).length,
    },
    priorTrackedBlockers,
    allBlockers,
    remainingBlockers,
    remainingProductionBlockers: (pack.unresolvedProductionBlockers ?? []).map(summarizeBlocker),
    remainingScaleBlockers: (pack.unresolvedScaleBlockers ?? []).map(summarizeBlocker),
    missingEvidenceFiles,
    referencedEvidenceFiles: (pack.generatedEvidenceFileReferences ?? []).map(classifyEvidenceReference),
    safety: {
      productionDataMutated: false,
      liveProvidersUsed: false,
      realPiiUsed: false,
      simulatedProofPromotedToProductionProof: pack.safety?.simulatedProofIsProductionProof === true,
      dashboardSkipTreatedAsPass:
        pack.skippedChecks?.treatsSkipAsPass === true ||
        pack.skippedChecks?.dashboardPassAloneIsReleaseEvidence === true,
      productionAtScaleClaimedWithOpenBlockers:
        pack.readinessClassification?.value === "production-at-scale" && remainingBlockers.length > 0,
    },
  };
  const validation = validateLeftoverBlockerClosureAuditReport(report);
  return {
    ...report,
    validation,
  };
}

function renderBlockerLine(blocker) {
  const commandText = blocker.exactRequiredCommands.length > 0
    ? blocker.exactRequiredCommands.map((command) => `\`${command}\``).join(", ")
    : "none";
  const artifactText = blocker.humanArtifacts.length > 0
    ? blocker.humanArtifacts.map((artifact) => `\`${artifact}\``).join(", ")
    : "none";
  return [
    `- #${blocker.number} ${blocker.title}: ${blocker.classification}`,
    `  - Missing evidence: ${blocker.missingEvidence.join(" ") || "none"}`,
    `  - Required command/artifact: ${commandText}; artifacts: ${artifactText}`,
    `  - Closure path: ${blocker.operatorActionRequired ? "operator action required" : "Codex can close in a separate scoped evidence task"}`,
  ];
}

export function renderLeftoverBlockerClosureAuditMarkdown(report) {
  const lines = [
    "# Leftover Blocker Closure Audit",
    "",
    `Generated at: ${report.generatedAt}`,
    `Source promotion pack: \`${report.sourcePromotionPack}\``,
    `Source promotion pack generated at: ${report.sourcePromotionPackGeneratedAt}`,
    `Branch: \`${report.currentBranch}\``,
    `Commit: \`${report.currentCommitHash}\``,
    `Readiness: **${report.readinessClassification?.value ?? "unknown"}**`,
    `Can promote production-at-scale: ${report.readinessClassification?.canPromoteProductionAtScale ? "yes" : "no"}`,
    "",
    "## Summary",
    "",
    `- Total blockers: ${report.summary.totalBlockers}`,
    `- Remaining blockers: ${report.summary.remainingBlockerCount}`,
    `- Remaining production blockers: ${report.summary.remainingProductionBlockerCount}`,
    `- Remaining scale blockers: ${report.summary.remainingScaleBlockerCount}`,
    `- Human-required blockers: ${report.summary.humanRequiredCount}`,
    `- Simulated-only blockers: ${report.summary.simulatedOnlyCount}`,
    `- Waived blockers: ${report.summary.waivedCount}`,
    "",
    "## Prior Leftover Blockers",
    "",
    ...report.priorTrackedBlockers.map((blocker) =>
      `- #${blocker.number} ${blocker.title}: ${blocker.classification}${blocker.waiverReason ? `; waiver=${blocker.waiverReason}` : ""}`,
    ),
    "",
    "## Remaining Blockers",
    "",
    ...(report.remainingBlockers.length === 0
      ? ["- None."]
      : report.remainingBlockers.flatMap(renderBlockerLine)),
    "",
    "## Missing Evidence Files",
    "",
    ...(report.missingEvidenceFiles.length === 0
      ? ["- None."]
      : report.missingEvidenceFiles.map((file) => `- \`${file.path}\``)),
    "",
    "## Safety",
    "",
    `- Production data mutated: ${report.safety.productionDataMutated ? "yes" : "no"}`,
    `- Live providers used: ${report.safety.liveProvidersUsed ? "yes" : "no"}`,
    `- Real PII used: ${report.safety.realPiiUsed ? "yes" : "no"}`,
    `- Simulated proof promoted to production proof: ${report.safety.simulatedProofPromotedToProductionProof ? "yes" : "no"}`,
    `- Dashboard SKIP treated as PASS: ${report.safety.dashboardSkipTreatedAsPass ? "yes" : "no"}`,
    `- Production-at-scale claimed with open blockers: ${report.safety.productionAtScaleClaimedWithOpenBlockers ? "yes" : "no"}`,
  ];
  if (!report.validation.ok) {
    lines.push("", "## Validation Errors", "", ...report.validation.errors.map((error) => `- ${error}`));
  }
  return `${lines.join("\n")}\n`;
}

export function writeLeftoverBlockerClosureAuditOutputs(report, { rootDir = process.cwd() } = {}) {
  writeText(rootDir, LEFTOVER_BLOCKER_AUDIT_MD_PATH, renderLeftoverBlockerClosureAuditMarkdown(report));
  writeText(rootDir, LEFTOVER_BLOCKER_AUDIT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  return {
    markdownPath: LEFTOVER_BLOCKER_AUDIT_MD_PATH,
    jsonPath: LEFTOVER_BLOCKER_AUDIT_JSON_PATH,
  };
}

async function main() {
  const report = buildLeftoverBlockerClosureAuditReport();
  const outputs = writeLeftoverBlockerClosureAuditOutputs(report);
  console.log("Leftover blocker closure audit generated.");
  console.log(`Readiness: ${report.readinessClassification?.value ?? "unknown"}`);
  console.log(`Remaining blockers: ${report.summary.remainingBlockerCount}`);
  console.log(`Remaining production blockers: ${report.summary.remainingProductionBlockerCount}`);
  console.log(`Remaining scale blockers: ${report.summary.remainingScaleBlockerCount}`);
  console.log(`Markdown: ${outputs.markdownPath}`);
  console.log(`JSON: ${outputs.jsonPath}`);
  if (!report.validation.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
