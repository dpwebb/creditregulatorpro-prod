export const PRODUCTION_MACHINE_PROOF_POLICY_VERSION = "production-machine-proof-policy-2026-05-22";

export const MACHINE_PROOF_DEPENDENCY_CLASSES = new Set([
  "certifying-machine-proof",
  "non-certifying-simulated-proof",
  "non-certifying-dry-run-proof",
  "non-certifying-missing-runtime-input-proof",
  "policy-approved-automated-exclusion",
]);

export const HUMAN_PROOF_DEPENDENCY_PATTERNS = [
  /human-observed/i,
  /\bhumanObserved\b/,
  /requires-human-proof/i,
  /awaiting-human-production-evidence/i,
  /operator acknowledg(?:e)?ment/i,
  /manual approval/i,
  /checklist-only/i,
];

export const PRODUCTION_MACHINE_PROOF_REQUIRED_FIELDS = [
  "evidenceType",
  "blockerId",
  "environment",
  "generatedAt",
  "expiresAt",
  "commitHash",
  "branch",
  "generatorScript",
  "command",
  "nonInteractive",
  "machineAttested",
  "humanObserved",
  "manualApprovalRequired",
  "simulatedOnly",
  "dryRunOnly",
  "productionMutation",
  "secretsPrinted",
  "piiPrinted",
  "rawReportBytesPrinted",
  "signedUrlsPrinted",
  "status",
  "certifying",
  "checks",
  "failures",
  "missingRuntimeInputs",
  "sanitizedArtifacts",
  "policyVersion",
];

export const MACHINE_PROOF_BLOCKER_REQUIREMENTS = {
  1: {
    blockerId: "L10-P1-002",
    proofTypeRequired:
      "Non-interactive sanitized restore machine proof with isolated target, RPO/RTO, post-restore checks, cleanup, and rollback verification.",
    proofCategories: ["machine-attested", "automated-local"],
    allowedProofCommands: ["pnpm run restore:machine-proof", "pnpm run restore:machine-proof:validate"],
    recommendedNextAction:
      "Provide CRP_RESTORE_MACHINE_ATTESTATION_JSON from a safe isolated restore target and rerun restore:machine-proof.",
  },
  2: {
    blockerId: "L10-P1-003",
    productionRuntimeProofRequired: true,
    proofTypeRequired:
      "Non-interactive sanitized production worker runtime machine proof with bounded queue processing, queue depth before/after, liveness, counts, cleanup, and stop/rollback verification.",
    proofCategories: ["machine-attested", "automated-local"],
    allowedProofCommands: [
      "pnpm run production-worker:machine-proof",
      "pnpm run production-worker:machine-proof:validate",
    ],
    recommendedNextAction:
      "Provide CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON from a bounded safe canary/runtime proof and rerun production-worker:machine-proof.",
  },
  6: {
    blockerId: "L10-P1-004",
    proofTypeRequired:
      "Non-interactive sanitized raw report byte remediation machine proof with reliable DB connectivity, sanitized inventory, remediation policy verification, and no raw bytes or PII.",
    proofCategories: ["machine-attested", "automated-local"],
    allowedProofCommands: [
      "pnpm run storage:raw-report-machine-inventory",
      "pnpm run storage:raw-report-machine-proof",
      "pnpm run storage:raw-report-machine-proof:validate",
    ],
    recommendedNextAction:
      "Provide reliable sanitized DB inventory and remediation attestation JSON inputs, then rerun the raw report machine proof commands.",
  },
  9: {
    blockerId: "L10-P1-005",
    proofTypeRequired:
      "Non-interactive sanitized alerting machine proof with live synthetic delivery or an explicitly certifying formal exclusion allowed by repo policy.",
    proofCategories: ["machine-attested", "automated-local"],
    allowedProofCommands: [
      "pnpm run alerts:machine-proof",
      "pnpm run alerts:machine-proof:validate",
      "pnpm run alerting:machine-proof",
      "pnpm run alerting:machine-proof:validate",
    ],
    recommendedNextAction:
      "Provide CRP_ALERTING_MACHINE_ATTESTATION_JSON for live delivery or an approved certifying exclusion and rerun alerts:machine-proof.",
  },
  10: {
    blockerId: "L10-P1-006",
    proofTypeRequired:
      "Non-interactive migration governance machine proof showing no active temporary allowlist residuals, no expired allowlist, exact residual classifications, and no release-blocking findings.",
    proofCategories: ["machine-attested", "automated-local"],
    allowedProofCommands: ["pnpm run migrations:machine-proof", "pnpm run migrations:machine-proof:validate"],
    recommendedNextAction:
      "Run migrations:machine-proof and migrations:machine-proof:validate; temporary allowlist residuals cannot certify.",
  },
  22: {
    blockerId: "retention-archive-restore",
    productionRuntimeProofRequired: true,
    proofTypeRequired:
      "Non-interactive sanitized retention archive/restore machine proof with safe archive candidate, archive metadata verification, isolated restore target, restore integrity, cleanup, rollback notes, and target destruction.",
    proofCategories: ["machine-attested", "automated-local"],
    allowedProofCommands: [
      "pnpm run retention:archive-restore-machine-proof",
      "pnpm run retention:archive-restore-machine-proof:validate",
    ],
    recommendedNextAction:
      "Provide CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON with CRP_RETENTION_ARCHIVE_RESTORE_ARCHIVE_ACCESS, CRP_RETENTION_ARCHIVE_RESTORE_ISOLATED_TARGET, and CRP_RETENTION_ARCHIVE_RESTORE_SAFE_CANDIDATE attested fields, then rerun retention:archive-restore-machine-proof.",
  },
};

export function machineProofRequirementForBlocker(blockerNumber) {
  return MACHINE_PROOF_BLOCKER_REQUIREMENTS[Number(blockerNumber)] ?? null;
}

export function machineProofBlockerIdForConfig(config = {}) {
  return config.blockerId ?? config.blockerIdsClosedWhenCertifying?.[0] ?? null;
}

export function isHumanProofDependencyText(value) {
  return HUMAN_PROOF_DEPENDENCY_PATTERNS.some((pattern) => pattern.test(String(value ?? "")));
}

export function classifyHumanProofDependencyHit({ path = "", text = "" } = {}) {
  const normalizedPath = String(path).replace(/\\/g, "/");
  if (/tests\/|fixtures\//i.test(normalizedPath)) return "test fixture";
  if (/docs\/production-scale\/evidence\/|latest-.*\.json$/i.test(normalizedPath)) return "evidence artifact";
  if (/production-at-scale-level-10-audit|production-machine-certification-remediation/i.test(normalizedPath)) {
    return "historical audit text only";
  }
  if (/production-promotion-pack|production-scale-certification|promote-production|restore-evidence|staging-backup-restore-checklist|production-scale-evidence/i.test(normalizedPath)) {
    return /validate|classification|CERTIFYING|canPromoteProductionAtScale|humanProofRequired|requires-human-proof/i.test(text)
      ? "active gate converted to machine-proof requirement"
      : "report wording only";
  }
  return "report wording only";
}
