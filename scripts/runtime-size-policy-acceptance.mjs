import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_RUNTIME_SIZE_EVIDENCE_DIR,
  DEFAULT_RUNTIME_SIZE_POLICY_PATH,
  formatBytes,
  loadRuntimeSizeThresholdPolicy,
  RUNTIME_SIZE_EVIDENCE_JSON,
} from "./runtime-size-report.mjs";

export const RUNTIME_SIZE_POLICY_ACCEPTANCE_MD_PATH =
  "docs/production-scale/evidence/latest-runtime-size-policy-acceptance.md";
export const RUNTIME_SIZE_POLICY_ACCEPTANCE_JSON_PATH =
  "docs/production-scale/evidence/latest-runtime-size-policy-acceptance.json";

const DEFAULT_MAX_EVIDENCE_AGE_HOURS = 24;

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
}

function readJsonIfPresent(rootDir, relativePath) {
  const target = repoPath(rootDir, relativePath);
  if (!existsSync(target)) return null;
  try {
    return JSON.parse(readFileSync(target, "utf8"));
  } catch {
    return null;
  }
}

function writeText(rootDir, relativePath, text) {
  const target = repoPath(rootDir, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text, "utf8");
}

function parseHours(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 24 * 31) {
    throw new Error("--max-age-hours must be a positive number no greater than 744.");
  }
  return parsed;
}

function evidenceAge(generatedAt, now = new Date()) {
  const generated = new Date(generatedAt);
  if (Number.isNaN(generated.getTime())) {
    return {
      determinable: false,
      ageHours: null,
      recentEnough: false,
      reason: "runtime-size evidence generatedAt is not parseable.",
    };
  }
  const ageHours = Math.max(0, (now.getTime() - generated.getTime()) / (60 * 60 * 1000));
  return {
    determinable: true,
    ageHours: Number(ageHours.toFixed(2)),
    recentEnough: true,
    reason: null,
  };
}

function thresholdById(policy) {
  return new Map((policy.thresholds ?? []).map((threshold) => [threshold.id, threshold]));
}

function hasRemediation(threshold) {
  const remediation = threshold?.remediation;
  return Boolean(
    String(remediation?.ownerRole ?? "").trim() &&
    String(remediation?.targetDate ?? "").trim() &&
    String(remediation?.plan ?? "").trim(),
  );
}

function hasWaiverReason(threshold) {
  return threshold?.waiver?.accepted === true && Boolean(String(threshold.waiver.reason ?? "").trim());
}

function formalWaiverAccepted(policy) {
  const waiver = policy.formalWaiver ?? {};
  return Boolean(
    waiver.accepted === true &&
    String(waiver.reason ?? "").trim() &&
    String(waiver.approvedByRole ?? "").trim() &&
    String(waiver.acceptedAt ?? "").trim(),
  );
}

function summarizeWarningGovernance(evaluations, policy) {
  const thresholds = thresholdById(policy);
  return evaluations
    .filter((evaluation) => evaluation.status === "WARN")
    .map((evaluation) => {
      const threshold = thresholds.get(evaluation.id);
      const remediationAccepted = hasRemediation(threshold);
      const waiverAccepted = hasWaiverReason(threshold);
      return {
        id: evaluation.id,
        label: evaluation.label,
        measuredBytes: evaluation.measuredBytes,
        source: evaluation.source,
        remediationAccepted,
        remediation: remediationAccepted
          ? {
              ownerRole: threshold.remediation.ownerRole,
              targetDate: threshold.remediation.targetDate,
              plan: threshold.remediation.plan,
            }
          : null,
        waiverAccepted,
        waiverReason: waiverAccepted ? threshold.waiver.reason : null,
        accepted: remediationAccepted || waiverAccepted,
      };
    });
}

function summarizeWaivedRows(evaluations) {
  return evaluations
    .filter((evaluation) => evaluation.status === "WAIVED")
    .map((evaluation) => ({
      id: evaluation.id,
      label: evaluation.label,
      measuredBytes: evaluation.measuredBytes,
      source: evaluation.source,
      reason: evaluation.waiverReason ?? evaluation.reason ?? null,
      accepted: Boolean(String(evaluation.waiverReason ?? evaluation.reason ?? "").trim()),
    }));
}

function validateAcceptance({ policy, runtimeEvidence, generatedAt, maxEvidenceAgeHours, now = new Date() }) {
  const errors = [];
  const policyMode = policy?.policyMode;
  const thresholdEvaluation = runtimeEvidence?.thresholdEvaluation;
  const evaluations = thresholdEvaluation?.evaluations ?? [];
  const warningRows = summarizeWarningGovernance(evaluations, policy);
  const waivedRows = summarizeWaivedRows(evaluations);
  const age = evidenceAge(runtimeEvidence?.generatedAt, now);

  if (!policy || typeof policy !== "object") errors.push("Threshold policy must exist.");
  if (!["warning-only", "hard-gate"].includes(policyMode)) errors.push("Runtime-size policy mode must be warning-only or hard-gate.");
  if (!runtimeEvidence) errors.push("Latest runtime-size evidence must exist.");
  if (runtimeEvidence?.report !== "runtime-size-and-dependency-report") errors.push("Runtime-size evidence report name is invalid.");
  if (thresholdEvaluation?.policyMode !== policyMode) {
    errors.push("Runtime-size evidence policy mode does not match the threshold policy.");
  }
  if (!runtimeEvidence?.buildAssets?.distPresent || Number(runtimeEvidence?.buildAssets?.assetCount ?? 0) <= 0) {
    errors.push("Runtime-size evidence must include captured build output.");
  }
  if (!age.determinable) {
    errors.push(age.reason);
  } else if (age.ageHours > maxEvidenceAgeHours) {
    errors.push(`Runtime-size evidence is stale: ${age.ageHours}h old; maximum allowed is ${maxEvidenceAgeHours}h.`);
    age.recentEnough = false;
  }
  for (const row of warningRows) {
    if (!row.accepted) {
      errors.push(`WARN row ${row.id} must include either remediation owner/date/plan or an explicit waiver reason.`);
    }
  }
  for (const row of waivedRows) {
    if (!row.accepted) errors.push(`WAIVED row ${row.id} must include an explicit reason.`);
  }

  let acceptanceKind = "not-accepted";
  if (policyMode === "warning-only") {
    if (!formalWaiverAccepted(policy)) {
      errors.push("Warning-only runtime-size policy requires accepted formal waiver evidence.");
    }
    if (runtimeEvidence?.safety?.buildFailsOnThresholds === true || thresholdEvaluation?.hasBlockingFailures === true) {
      errors.push("Warning-only evidence must not claim hard-gate build behavior.");
    }
    acceptanceKind = "warning-only-waiver";
  }

  if (policyMode === "hard-gate") {
    if (thresholdEvaluation?.hasBlockingFailures === true || evaluations.some((evaluation) => evaluation.status === "WARN")) {
      errors.push("Hard-gate runtime-size policy cannot be accepted while thresholds are exceeded.");
    }
    acceptanceKind = "hard-gate";
  }

  const accepted = errors.length === 0;
  return {
    ok: accepted,
    accepted,
    status: accepted
      ? (acceptanceKind === "hard-gate" ? "accepted-hard-gate" : "accepted-warning-only-waiver")
      : "failed",
    acceptanceKind: accepted ? acceptanceKind : "not-accepted",
    errors,
    warningRows,
    waivedRows,
    evidenceAge: age,
    generatedAt,
  };
}

export function buildRuntimeSizePolicyAcceptanceReport({
  rootDir = process.cwd(),
  policyPath = DEFAULT_RUNTIME_SIZE_POLICY_PATH,
  evidencePath = `docs/production-scale/evidence/${RUNTIME_SIZE_EVIDENCE_JSON}`,
  maxEvidenceAgeHours = DEFAULT_MAX_EVIDENCE_AGE_HOURS,
  generatedAt = new Date().toISOString(),
  now = new Date(),
} = {}) {
  let policy = null;
  const policyErrors = [];
  try {
    policy = loadRuntimeSizeThresholdPolicy({
      rootDir,
      policyPath,
      explicitPolicyPath: true,
    });
  } catch (error) {
    policyErrors.push(error instanceof Error ? error.message : String(error));
  }
  const runtimeEvidence = readJsonIfPresent(rootDir, evidencePath);
  const validation = policy
    ? validateAcceptance({ policy, runtimeEvidence, generatedAt, maxEvidenceAgeHours, now })
    : {
        ok: false,
        accepted: false,
        status: "failed",
        acceptanceKind: "not-accepted",
        errors: policyErrors,
        warningRows: [],
        waivedRows: [],
        evidenceAge: { determinable: false, ageHours: null, recentEnough: false, reason: "policy unavailable" },
        generatedAt,
      };
  if (policyErrors.length > 0 && validation.errors) validation.errors.unshift(...policyErrors);

  const policyMode = policy?.policyMode ?? "unknown";
  const acceptanceKind = validation.acceptanceKind;
  const hardGateAccepted = validation.accepted && acceptanceKind === "hard-gate";
  const warningOnlyWaiverAccepted = validation.accepted && acceptanceKind === "warning-only-waiver";
  return {
    reportName: "runtime-size-policy-acceptance",
    generatedAt,
    status: validation.status,
    accepted: validation.accepted,
    acceptanceKind,
    policyPath,
    evidencePath,
    policyMode,
    formalWaiver: {
      accepted: policy?.formalWaiver?.accepted === true,
      reason: policy?.formalWaiver?.reason ?? null,
      approvedByRole: policy?.formalWaiver?.approvedByRole ?? null,
      acceptedAt: policy?.formalWaiver?.acceptedAt ?? null,
      expiresOn: policy?.formalWaiver?.expiresOn ?? null,
    },
    runtimeEvidence: runtimeEvidence
      ? {
          generatedAt: runtimeEvidence.generatedAt,
          commit: runtimeEvidence.commit ?? null,
          workingTreeClean: runtimeEvidence.workingTreeClean === true,
          overallStatus: runtimeEvidence.thresholdEvaluation?.overallStatus ?? "unknown",
          hasBlockingFailures: runtimeEvidence.thresholdEvaluation?.hasBlockingFailures === true,
          statusCounts: runtimeEvidence.thresholdEvaluation?.statusCounts ?? {},
          largestJsRawBytes: runtimeEvidence.buildAssets?.largestJsAsset?.rawBytes ?? null,
          largestJsGzipBytes: runtimeEvidence.buildAssets?.largestJsAsset?.gzipBytes ?? null,
          largestCssRawBytes: runtimeEvidence.buildAssets?.largestCssAsset?.rawBytes ?? null,
          largestCssGzipBytes: runtimeEvidence.buildAssets?.largestCssAsset?.gzipBytes ?? null,
        }
      : null,
    warningRows: validation.warningRows,
    waivedRows: validation.waivedRows,
    evidenceAge: validation.evidenceAge,
    blockerCoverage: {
      runtimeSizeGovernance: validation.accepted,
      acceptedHardGate: hardGateAccepted,
      acceptedWarningOnlyWaiver: warningOnlyWaiverAccepted,
    },
    validation: {
      ok: validation.ok,
      errors: validation.errors,
    },
    safety: {
      nonMutating: true,
      productionDataMutated: false,
      dependencyVersionsChanged: false,
      buildChunkingChanged: false,
      buildBehaviorChanged: false,
      pdfOcrBehaviorChanged: false,
      hardGateClaimedWhenWarningOnly: policyMode === "warning-only" && hardGateAccepted,
    },
  };
}

export function renderRuntimeSizePolicyAcceptanceMarkdown(report) {
  const lines = [
    "# Runtime Size Policy Acceptance",
    "",
    "This acceptance evidence validates runtime-size policy governance only. It does not change dependency versions, build chunks, OCR/PDF behavior, or production data.",
    "",
    `Generated at: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Accepted: ${report.accepted ? "yes" : "no"}`,
    `Acceptance kind: ${report.acceptanceKind}`,
    `Policy mode: ${report.policyMode}`,
    `Policy path: \`${report.policyPath}\``,
    `Runtime-size evidence path: \`${report.evidencePath}\``,
    "",
    "## Formal Waiver",
    "",
    `- Accepted: ${report.formalWaiver.accepted ? "yes" : "no"}`,
    `- Approved by role: ${report.formalWaiver.approvedByRole ?? "n/a"}`,
    `- Accepted at: ${report.formalWaiver.acceptedAt ?? "n/a"}`,
    `- Expires on: ${report.formalWaiver.expiresOn ?? "n/a"}`,
    `- Reason: ${report.formalWaiver.reason ?? "n/a"}`,
    "",
    "## Runtime Evidence",
    "",
    `- Generated at: ${report.runtimeEvidence?.generatedAt ?? "missing"}`,
    `- Age hours: ${report.evidenceAge.ageHours ?? "unknown"}`,
    `- Overall status: ${report.runtimeEvidence?.overallStatus ?? "missing"}`,
    `- Blocking failures: ${report.runtimeEvidence?.hasBlockingFailures ? "yes" : "no"}`,
    `- Largest JS raw/gzip: ${formatBytes(report.runtimeEvidence?.largestJsRawBytes)}/${formatBytes(report.runtimeEvidence?.largestJsGzipBytes)}`,
    `- Largest CSS raw/gzip: ${formatBytes(report.runtimeEvidence?.largestCssRawBytes)}/${formatBytes(report.runtimeEvidence?.largestCssGzipBytes)}`,
    "",
    "## WARN Row Governance",
    "",
    ...(report.warningRows.length === 0
      ? ["- No WARN rows."]
      : report.warningRows.map((row) =>
          `- ${row.accepted ? "accepted" : "missing"}: \`${row.id}\` ${row.label}; owner=${row.remediation?.ownerRole ?? "n/a"}; target=${row.remediation?.targetDate ?? "n/a"}; waiver=${row.waiverReason ?? "n/a"}`,
        )),
    "",
    "## WAIVED Rows",
    "",
    ...(report.waivedRows.length === 0
      ? ["- No WAIVED rows."]
      : report.waivedRows.map((row) => `- ${row.accepted ? "accepted" : "missing"}: \`${row.id}\` ${row.label}; reason=${row.reason ?? "n/a"}`)),
    "",
    "## Safety",
    "",
    "- Non-mutating: yes",
    "- Production data mutated: no",
    "- Dependency versions changed: no",
    "- Build chunking changed: no",
    "- Build behavior changed: no",
    "- PDF/OCR behavior changed: no",
    `- Hard gate claimed while warning-only: ${report.safety.hardGateClaimedWhenWarningOnly ? "yes" : "no"}`,
  ];
  if (report.validation.errors.length > 0) {
    lines.push("", "## Validation Errors", "", ...report.validation.errors.map((error) => `- ${error}`));
  }
  return `${lines.join("\n")}\n`;
}

export function writeRuntimeSizePolicyAcceptanceOutputs(report, {
  rootDir = process.cwd(),
} = {}) {
  writeText(rootDir, RUNTIME_SIZE_POLICY_ACCEPTANCE_MD_PATH, renderRuntimeSizePolicyAcceptanceMarkdown(report));
  writeText(rootDir, RUNTIME_SIZE_POLICY_ACCEPTANCE_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  return {
    markdownPath: RUNTIME_SIZE_POLICY_ACCEPTANCE_MD_PATH,
    jsonPath: RUNTIME_SIZE_POLICY_ACCEPTANCE_JSON_PATH,
  };
}

export function parseRuntimeSizePolicyAcceptanceArgs(args) {
  const options = {
    rootDir: process.cwd(),
    policyPath: DEFAULT_RUNTIME_SIZE_POLICY_PATH,
    evidencePath: `docs/production-scale/evidence/${RUNTIME_SIZE_EVIDENCE_JSON}`,
    maxEvidenceAgeHours: DEFAULT_MAX_EVIDENCE_AGE_HOURS,
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const nextValue = () => {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--root") {
      options.rootDir = path.resolve(nextValue());
      continue;
    }
    if (arg === "--policy") {
      options.policyPath = normalizeRelativePath(nextValue());
      continue;
    }
    if (arg === "--evidence") {
      options.evidencePath = normalizeRelativePath(nextValue());
      continue;
    }
    if (arg === "--max-age-hours") {
      options.maxEvidenceAgeHours = parseHours(nextValue(), DEFAULT_MAX_EVIDENCE_AGE_HOURS);
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

function printHelp() {
  console.log([
    "Usage: pnpm run runtime-size:policy-acceptance -- [options]",
    "",
    "Validates runtime-size threshold policy acceptance without changing dependencies, build chunks, OCR/PDF behavior, or production data.",
    "",
    "Options:",
    "  --json                         Print JSON report.",
    "  --root <path>                  Project root. Defaults to current working directory.",
    "  --policy <path>                Threshold policy JSON.",
    "  --evidence <path>              Latest runtime-size evidence JSON.",
    "  --max-age-hours <hours>        Maximum evidence age. Defaults to 24.",
  ].join("\n"));
}

async function main() {
  const options = parseRuntimeSizePolicyAcceptanceArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const report = buildRuntimeSizePolicyAcceptanceReport(options);
  const outputs = writeRuntimeSizePolicyAcceptanceOutputs(report, { rootDir: options.rootDir });
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("Runtime-size policy acceptance generated.");
    console.log(`Status: ${report.status}`);
    console.log(`Accepted: ${report.accepted ? "yes" : "no"}`);
    console.log(`Acceptance kind: ${report.acceptanceKind}`);
    console.log(`Policy mode: ${report.policyMode}`);
    console.log(`Markdown: ${outputs.markdownPath}`);
    console.log(`JSON: ${outputs.jsonPath}`);
  }
  if (!report.accepted) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
