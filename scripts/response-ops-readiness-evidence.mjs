import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RESPONSE_OPS_READINESS_MD_PATH =
  "docs/production-scale/evidence/latest-response-ops-readiness.md";
export const RESPONSE_OPS_READINESS_JSON_PATH =
  "docs/production-scale/evidence/latest-response-ops-readiness.json";
export const ALERTING_EXCLUSION_TEMPLATE_PATH =
  "docs/production-scale/alerting-exclusion-template.md";
export const ALERTING_EXCLUSION_EVIDENCE_MD_PATH =
  "docs/production-scale/evidence/alerting-exclusion-evidence.md";
export const ALERTING_EXCLUSION_EVIDENCE_JSON_PATH =
  "docs/production-scale/evidence/alerting-exclusion-evidence.json";
export const ALERTING_EXCLUSION_VALIDATION_MD_PATH =
  "docs/production-scale/evidence/latest-alerting-exclusion-validation.md";
export const ALERTING_EXCLUSION_VALIDATION_JSON_PATH =
  "docs/production-scale/evidence/latest-alerting-exclusion-validation.json";
export const LIVE_ALERT_PROOF_JSON_PATH =
  "docs/production-scale/evidence/live-alert-proof.json";
export const LIVE_ALERT_PROOF_MD_PATH =
  "docs/production-scale/evidence/live-alert-proof.md";
export const ALERTS_DRY_RUN_JSON_PATH =
  "docs/production-scale/evidence/latest-alerts-dry-run.json";

const RUNBOOK_PATH = "docs/response-processing-production-ops-runbook.md";
const DASHBOARD_SCRIPT_PATH = "scripts/operator-regression-dashboard.ts";
const ORCHESTRATOR_SCRIPT_PATH = "scripts/response-processing-worker-orchestrator.ts";
const LIFECYCLE_SCRIPT_PATH = "scripts/response-processing-lifecycle.ts";
const REPLAY_SCRIPT_PATH = "scripts/response-processing-replay.ts";
const SOAK_SCRIPT_PATH = "scripts/response-processing-soak-check.ts";

const PRODUCTION_ENV_KEYS = ["NODE_ENV", "CRP_ENV", "FLOOT_ENV", "APP_ENV", "VERCEL_ENV", "DEPLOYMENT_ENV", "ENVIRONMENT"];
const PRODUCTION_SECRET_KEYS = ["FLOOT_DATABASE_URL", "DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "CRP_DATABASE_URL"];
const PLACEHOLDER_VALUES = new Set(["todo", "tbd", "n/a", "na", "none", "null", "placeholder", ""]);

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
}

function readText(rootDir, relativePath) {
  return readFileSync(repoPath(rootDir, relativePath), "utf8");
}

function writeText(rootDir, relativePath, text) {
  const target = repoPath(rootDir, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text, "utf8");
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

function safeGit(args, rootDir, fallback = "unknown") {
  try {
    const output = execFileSync("git", args, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return output || fallback;
  } catch {
    return fallback;
  }
}

function packageScripts(rootDir) {
  return JSON.parse(readText(rootDir, "package.json")).scripts ?? {};
}

export function detectResponseOpsProductionEnvironment(env = process.env) {
  for (const key of PRODUCTION_ENV_KEYS) {
    const value = String(env[key] ?? "").trim().toLowerCase();
    if (value === "production" || value === "prod" || value.includes("production")) {
      return { productionLike: true, reason: `${key} indicates a production environment.` };
    }
  }
  for (const key of PRODUCTION_SECRET_KEYS) {
    const value = String(env[key] ?? "").trim().toLowerCase();
    if (!value) continue;
    if (value.includes("creditregulatorpro-prod") || value.includes("production") || value.includes("/prod") || value.includes("prod.")) {
      return { productionLike: true, reason: `${key} appears to reference a production database target.` };
    }
  }
  return { productionLike: false, reason: "" };
}

export function scanResponseOpsEvidenceSensitiveContent(text) {
  const findings = [];
  const patterns = [
    ["database-url", /\b(?:postgres|postgresql|mysql|mongodb):\/\/[^\s)]+/i],
    ["private-key-block", /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i],
    ["api-token", /\b(?:sk|ghp|github_pat|xox[baprs])[_-][A-Za-z0-9_-]{12,}\b/i],
    ["bearer-token", /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/i],
    ["access-key", /\bAKIA[0-9A-Z]{16}\b/i],
    ["session-cookie", /\b(?:session|cookie|floot_built_app_session)=\S{12,}/i],
    ["raw-pdf-or-base64", /(?:%PDF-|JVBERi0|data:application\/pdf;base64,)/i],
    ["raw-response-or-report-text", /\b(?:raw\s+response\s+text|raw\s+report\s+text|full\s+email\s+body|full\s+credit\s+report\s+text)\s*[:=]/i],
    ["long-base64-blob", /\b[A-Za-z0-9+/]{160,}={0,2}\b/],
    ["signed-url", /https?:\/\/[^\s]+(?:X-Amz-Signature|X-Goog-Signature|GoogleAccessId|Signature=|[?&]sig=|[?&]sv=)[^\s]*/i],
    ["ssn-or-sin", /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b|\b\d{3}[- ]?\d{3}[- ]?\d{3}\b/],
    ["obvious-email-pii", /\b[A-Z0-9._%+-]+@(?!example\.test\b|example\.invalid\b|example\.com\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ];
  for (const [name, pattern] of patterns) {
    if (pattern.test(text)) findings.push(name);
  }
  return findings;
}

function isPlaceholder(value) {
  return PLACEHOLDER_VALUES.has(String(value ?? "").trim().toLowerCase());
}

function parseMarkdownTableFields(text) {
  const fields = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 2) continue;
    if (/^-+$/.test(cells[0].replace(/:/g, "")) || /^field$/i.test(cells[0])) continue;
    fields[cells[0]] = cells[1];
  }
  return fields;
}

function normalizeEvidenceObject(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return {};
  return evidence;
}

function evidenceValue(evidence, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(evidence, key)) return evidence[key];
  }
  return undefined;
}

function truthyEvidence(value) {
  if (value === true) return true;
  return /^(true|yes|signed|acknowledged|accepted|approved)$/i.test(String(value ?? "").trim());
}

function falseEvidence(value) {
  if (value === false) return true;
  return /^(false|no|0)$/i.test(String(value ?? "").trim());
}

export function validateAlertingExclusionEvidence(evidenceInput) {
  const evidence = normalizeEvidenceObject(evidenceInput);
  const serialized = JSON.stringify(evidenceInput ?? {});
  const sensitiveFindings = scanResponseOpsEvidenceSensitiveContent(serialized);
  const errors = [];

  const fieldGroups = [
    ["evidenceType", ["evidenceType", "Evidence type"]],
    ["operatorNameOrRole", ["operatorNameOrRole", "Operator name or role", "Operator"]],
    ["acknowledgedAt", ["acknowledgedAt", "Acknowledged at", "Date/time"]],
    ["environment", ["environment", "Environment"]],
    ["exclusionScope", ["exclusionScope", "Exclusion scope"]],
    ["exclusionReason", ["exclusionReason", "Exclusion reason"]],
    ["humanMonitoringCadence", ["humanMonitoringCadence", "Human monitoring cadence", "Monitoring cadence"]],
    ["manualEscalationPath", ["manualEscalationPath", "Manual escalation path"]],
    ["dashboardCommand", ["dashboardCommand", "Dashboard command"]],
    ["soakCommand", ["soakCommand", "Response soak command", "Soak command"]],
    ["alertsDryRunCommand", ["alertsDryRunCommand", "Alerts dry-run command"]],
    ["alertsDryRunEvidencePath", ["alertsDryRunEvidencePath", "Alerts dry-run evidence path"]],
    ["sanitizedEvidenceStatement", ["sanitizedEvidenceStatement", "Sanitized evidence statement"]],
  ];

  const normalized = {};
  for (const [key, aliases] of fieldGroups) {
    const value = evidenceValue(evidence, aliases);
    normalized[key] = value;
    if (isPlaceholder(value)) errors.push(`${key} is required and cannot be a placeholder.`);
  }

  if (normalized.evidenceType !== "FORMAL_ALERTING_EXCLUSION") {
    errors.push("evidenceType must be FORMAL_ALERTING_EXCLUSION.");
  }
  if (!/production|limited beta|staging/i.test(String(normalized.environment ?? ""))) {
    errors.push("environment must identify the target operations environment.");
  }
  if (!/sanitiz/i.test(String(normalized.sanitizedEvidenceStatement ?? ""))) {
    errors.push("Evidence must explicitly state that it is sanitized.");
  }

  const noExternalProvider = evidenceValue(evidence, ["noExternalAlertProviderUsed", "No external alert provider used"]);
  const operatorAck = evidenceValue(evidence, ["operatorAcknowledgementSigned", "Operator acknowledgement signed", "Operator acknowledgement"]);
  const productionDataMutatedByCodex = evidenceValue(evidence, ["productionDataMutatedByCodex", "Production data mutated by Codex"]);
  const liveAlertsSent = evidenceValue(evidence, ["liveAlertsSent", "Live alerts sent"]);

  if (!truthyEvidence(noExternalProvider)) {
    errors.push("noExternalAlertProviderUsed must be true for a formal alert exclusion.");
  }
  if (!truthyEvidence(operatorAck)) {
    errors.push("operatorAcknowledgementSigned must be true when no external alert provider will be used.");
  }
  if (!falseEvidence(productionDataMutatedByCodex)) {
    errors.push("productionDataMutatedByCodex must be false.");
  }
  if (!falseEvidence(liveAlertsSent)) {
    errors.push("liveAlertsSent must be false for an alerting exclusion.");
  }
  if (sensitiveFindings.length > 0) {
    errors.push(`Sensitive content detected: ${sensitiveFindings.join(", ")}.`);
  }

  return {
    accepted: errors.length === 0,
    status: errors.length === 0 ? "accepted" : "failed",
    errors,
    sensitiveFindings,
    blockerCoverage: {
      observabilityAlerting: errors.length === 0,
    },
  };
}

function resolveAlertingExclusionPath(rootDir, evidencePath = null) {
  if (evidencePath) {
    const normalized = normalizeRelativePath(evidencePath);
    return {
      path: normalized,
      exists: existsSync(repoPath(rootDir, normalized)),
      explicit: true,
      type: normalized.endsWith(".json") ? "json" : normalized.endsWith(".md") ? "markdown" : "unsupported",
    };
  }
  if (existsSync(repoPath(rootDir, ALERTING_EXCLUSION_EVIDENCE_JSON_PATH))) {
    return {
      path: ALERTING_EXCLUSION_EVIDENCE_JSON_PATH,
      exists: true,
      explicit: false,
      type: "json",
    };
  }
  if (existsSync(repoPath(rootDir, ALERTING_EXCLUSION_EVIDENCE_MD_PATH))) {
    return {
      path: ALERTING_EXCLUSION_EVIDENCE_MD_PATH,
      exists: true,
      explicit: false,
      type: "markdown",
    };
  }
  return { path: null, exists: false, explicit: false, type: "missing" };
}

export function buildAlertingExclusionValidationReport({
  rootDir = process.cwd(),
  evidencePath = null,
  generatedAt = new Date().toISOString(),
  alertingExclusionEvidence = null,
} = {}) {
  const resolved = alertingExclusionEvidence
    ? { path: evidencePath ?? "injected-evidence", exists: true, explicit: false, type: "json" }
    : resolveAlertingExclusionPath(rootDir, evidencePath);

  if (!resolved.exists) {
    const status = resolved.explicit ? "failed" : "not-submitted";
    return {
      reportName: "alerting-exclusion-validation",
      evidenceType: "ALERTING_EXCLUSION_VALIDATION",
      generatedAt,
      status,
      accepted: false,
      evidencePath: resolved.path,
      defaultEvidencePaths: [ALERTING_EXCLUSION_EVIDENCE_JSON_PATH, ALERTING_EXCLUSION_EVIDENCE_MD_PATH],
      validation: {
        accepted: false,
        status,
        errors: resolved.explicit
          ? [`Submitted alerting exclusion evidence file is missing: ${resolved.path}.`]
          : ["No formal alerting exclusion evidence has been submitted."],
        sensitiveFindings: [],
        blockerCoverage: {
          observabilityAlerting: false,
        },
      },
      blockerCoverage: {
        observabilityAlerting: false,
      },
      safety: {
        liveAlertsSent: false,
        productionDataMutatedByCodex: false,
        rawSensitiveValuesAccepted: false,
      },
    };
  }

  let parsed = alertingExclusionEvidence;
  let readError = null;
  if (!parsed) {
    try {
      if (resolved.type === "json") {
        parsed = JSON.parse(readText(rootDir, resolved.path));
      } else if (resolved.type === "markdown") {
        parsed = parseMarkdownTableFields(readText(rootDir, resolved.path));
      } else {
        readError = "Alerting exclusion evidence must be submitted as JSON or Markdown.";
      }
    } catch {
      readError = "Alerting exclusion evidence could not be parsed.";
    }
  }

  const validation = readError
    ? {
        accepted: false,
        status: "failed",
        errors: [readError],
        sensitiveFindings: [],
        blockerCoverage: {
          observabilityAlerting: false,
        },
      }
    : validateAlertingExclusionEvidence(parsed);

  return {
    reportName: "alerting-exclusion-validation",
    evidenceType: "ALERTING_EXCLUSION_VALIDATION",
    generatedAt,
    status: validation.accepted ? "accepted" : "failed",
    accepted: validation.accepted,
    evidencePath: resolved.path,
    defaultEvidencePaths: [ALERTING_EXCLUSION_EVIDENCE_JSON_PATH, ALERTING_EXCLUSION_EVIDENCE_MD_PATH],
    validation,
    blockerCoverage: validation.blockerCoverage,
    safety: {
      liveAlertsSent: false,
      productionDataMutatedByCodex: false,
      rawSensitiveValuesAccepted: validation.sensitiveFindings.length > 0 && validation.accepted,
    },
  };
}

function validateLiveAlertProof(evidence) {
  if (!evidence || typeof evidence !== "object") {
    return { accepted: false, status: "not-submitted", errors: ["No live alert proof evidence has been submitted."], sensitiveFindings: [] };
  }
  const errors = [];
  const sensitiveFindings = scanResponseOpsEvidenceSensitiveContent(JSON.stringify(evidence));
  if (evidence.evidenceType !== "HUMAN_OBSERVED_LIVE_ALERT_DELIVERY") {
    errors.push("evidenceType must be HUMAN_OBSERVED_LIVE_ALERT_DELIVERY.");
  }
  if (evidence.liveAlertDeliveryVerified !== true) errors.push("liveAlertDeliveryVerified must be true.");
  if (evidence.sanitizedEvidence !== true) errors.push("sanitizedEvidence must be true.");
  if (evidence.operatorAcknowledgementSigned !== true) errors.push("operatorAcknowledgementSigned must be true.");
  if (evidence.productionDataMutatedByCodex !== false) errors.push("productionDataMutatedByCodex must be false.");
  if (sensitiveFindings.length > 0) errors.push(`Sensitive content detected: ${sensitiveFindings.join(", ")}.`);
  return {
    accepted: errors.length === 0,
    status: errors.length === 0 ? "accepted" : "failed",
    errors,
    sensitiveFindings,
  };
}

function readLiveAlertProof(rootDir, liveAlertProofEvidence = null) {
  const evidence = liveAlertProofEvidence ?? readJsonIfPresent(rootDir, LIVE_ALERT_PROOF_JSON_PATH);
  const validation = validateLiveAlertProof(evidence);
  return {
    status: validation.status,
    accepted: validation.accepted,
    evidencePath: evidence ? LIVE_ALERT_PROOF_JSON_PATH : null,
    validation,
  };
}

function alertsDryRunSummary(rootDir) {
  const parsed = readJsonIfPresent(rootDir, ALERTS_DRY_RUN_JSON_PATH);
  if (!parsed) {
    return {
      path: ALERTS_DRY_RUN_JSON_PATH,
      exists: false,
      status: "missing",
      evidenceType: null,
      deliveryMode: null,
      liveProof: false,
    };
  }
  return {
    path: ALERTS_DRY_RUN_JSON_PATH,
    exists: true,
    status: parsed.validation?.ok === true || parsed.sanitization?.payloadsSanitized === true ? "present" : "failed-or-unknown",
    evidenceType: parsed.evidenceType ?? null,
    deliveryMode: parsed.deliveryMode ?? null,
    liveProof: false,
    liveExternalAlertsSent: parsed.safety?.liveExternalAlertsSent ?? null,
    liveExternalProviderCallsMade: parsed.safety?.liveExternalProviderCallsMade ?? null,
  };
}

function staticCheck(name, passed, details = {}) {
  return {
    name,
    status: passed ? "passed" : "failed",
    passed,
    ...details,
  };
}

export function buildResponseOpsReadinessEvidenceReport({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  env = process.env,
  alertingExclusionValidation = null,
  liveAlertProofEvidence = null,
  alertsDryRunEvidence = null,
} = {}) {
  const productionEnvironment = detectResponseOpsProductionEnvironment(env);
  if (productionEnvironment.productionLike) {
    throw new Error(`Refusing response ops readiness evidence in a production-like environment: ${productionEnvironment.reason}`);
  }

  const scripts = packageScripts(rootDir);
  const runbookText = readText(rootDir, RUNBOOK_PATH);
  const dashboardText = readText(rootDir, DASHBOARD_SCRIPT_PATH);
  const orchestratorText = readText(rootDir, ORCHESTRATOR_SCRIPT_PATH);
  const lifecycleText = readText(rootDir, LIFECYCLE_SCRIPT_PATH);
  const replayText = readText(rootDir, REPLAY_SCRIPT_PATH);
  const soakText = readText(rootDir, SOAK_SCRIPT_PATH);
  const exclusionValidation = alertingExclusionValidation ?? buildAlertingExclusionValidationReport({ rootDir, generatedAt });
  const liveAlertProof = readLiveAlertProof(rootDir, liveAlertProofEvidence);
  const dryRunAlerts = alertsDryRunEvidence ?? alertsDryRunSummary(rootDir);

  const checks = [
    staticCheck(
      "live scheduler default disabled",
      runbookText.includes("Do not enable a live scheduler automatically") &&
        orchestratorText.includes("Defaults to a dry-run preview") &&
        orchestratorText.includes("No daemon or infinite loop is started"),
    ),
    staticCheck(
      "backfill dry-run/apply guarded",
      scripts["response:replay"] === "tsx scripts/response-processing-replay.ts" &&
        replayText.includes('mode: "dry_run"') &&
        replayText.includes("Apply mode requires --confirm-apply.") &&
        replayText.includes("Apply mode requires --actor-user-id."),
    ),
    staticCheck(
      "purge/archive deferred and append-only",
      scripts["response:lifecycle"] === "tsx scripts/response-processing-lifecycle.ts" &&
        lifecycleText.includes("Defaults to a dry-run retention preview") &&
        lifecycleText.includes("--confirm-cleanup") &&
        lifecycleText.includes("No jobs, job events, orchestration runs, replay events, or evidence are deleted."),
    ),
    staticCheck(
      "soak evidence command available",
      scripts["response:soak-check"] === "tsx scripts/response-processing-soak-check.ts" &&
        soakText.includes("externalAlertDeliveryUsed: false") &&
        soakText.includes("liveMailboxIntegrationUsed: false"),
    ),
    staticCheck(
      "dashboard skip semantics visible",
      dashboardText.includes("skippedChecksVisible") &&
        dashboardText.includes("passImpliesSkippedChecksPassed: false") &&
        dashboardText.includes("Dashboard PASS alone is not sufficient release evidence."),
    ),
    staticCheck(
      "alert dry-run remains non-live proof",
      dryRunAlerts.exists &&
        dryRunAlerts.evidenceType === "SIMULATED" &&
        dryRunAlerts.deliveryMode === "DRY RUN" &&
        dryRunAlerts.liveProof === false,
      { alertDryRunEvidence: dryRunAlerts },
    ),
  ];
  const failedChecks = checks.filter((check) => !check.passed);

  const alertingStatus = liveAlertProof.accepted
    ? "live-evidenced"
    : exclusionValidation.accepted
      ? "formally-excluded"
      : dryRunAlerts.exists
        ? "dry-run-only"
        : "dry-run-missing";
  const responseOpsStaticReady = failedChecks.filter((check) => check.name !== "alert dry-run remains non-live proof").length === 0;
  const alertingAccepted = alertingStatus === "live-evidenced" || alertingStatus === "formally-excluded";

  return {
    reportName: "response-ops-readiness-evidence",
    evidenceType: "RESPONSE_OPS_READINESS_EVIDENCE",
    generatedAt,
    branch: safeGit(["branch", "--show-current"], rootDir),
    commit: safeGit(["rev-parse", "HEAD"], rootDir),
    status: responseOpsStaticReady ? "operator-ready-with-deferred-controls" : "failed",
    productionProof: false,
    staticValidation: {
      status: failedChecks.length === 0 ? "passed" : "failed",
      checks,
      failedChecks,
    },
    liveScheduler: {
      status: "disabled",
      defaultEnabled: false,
      productionEvidenceAccepted: false,
      command: "pnpm run response:worker-orchestrate -- --dry-run",
      operatorControls: [
        "live scheduler is not enabled by default",
        "--run is bounded and operator-supervised",
        "--scheduled requires --run",
        "--max-jobs must be explicit before a supervised run",
        "overlap skips and stale-lock skips require operator review",
      ],
    },
    backfillReadiness: {
      status: "operator-controlled-deferred",
      dryRunCommand: "pnpm run response:replay -- --dry-run",
      applyRequires: ["--apply", "--confirm-apply", "--actor-user-id <operator-user-id>", "--limit <n>"],
      noRawResponseTextRequired: true,
    },
    purgeArchiveReadiness: {
      status: "operator-controlled-deferred",
      dryRunCommand: "pnpm run response:lifecycle -- --dry-run",
      applyRequires: ["--apply", "--confirm-cleanup", "--actor-user-id <operator-user-id>", "--limit <n>"],
      physicalPurgeArchiveDeferred: true,
      appendOnlyLifecycleMarkersOnly: true,
    },
    alerting: {
      status: alertingStatus,
      dryRunEvidence: dryRunAlerts,
      liveAlertProof,
      exclusionValidation: {
        status: exclusionValidation.status,
        accepted: exclusionValidation.accepted === true,
        evidencePath: exclusionValidation.evidencePath,
      },
      dryRunOnlyIsLiveProof: false,
    },
    operatorMonitoringCadence: [
      "Run pnpm run operator:dashboard before and after any supervised response operations window.",
      "Run pnpm run response:soak-check before promotion decisions and after response-queue changes.",
      "During limited beta, review dashboard response operations rows at least daily and immediately after any worker/replay/lifecycle operation.",
      "Escalate any dead-letter, stale-running, lifecycle drift, or dashboard SKIP regression before continuing operations.",
    ],
    manualFallbackSteps: [
      "Leave live scheduler disabled.",
      "Use dry-run commands first for worker orchestration, replay/backfill, and lifecycle retention.",
      "Use admin remediation endpoints for failed, dead-lettered, or stale-running jobs.",
      "Stop on sensitive-output detection, unexpected dashboard FAIL, stale-running auto-reclaim, physical delete, or live alert delivery attempt.",
      "Capture sanitized evidence and operator signoff before any non-dry response operation.",
    ],
    dashboardCommandReferences: [
      "pnpm run operator:dashboard",
      "pnpm run response:orchestration-check",
      "pnpm run response:lifecycle -- --dry-run",
      "pnpm run response:replay -- --dry-run",
    ],
    responseSoakResultReferences: [
      "pnpm run response:soak-check",
      "docs/response-processing-production-ops-runbook.md",
    ],
    unresolvedRisks: [
      ...(alertingAccepted ? [] : ["External alerting remains dry-run-only until live proof or accepted formal exclusion exists."]),
      "Production live scheduler operation is not enabled by default and is not production-evidenced by this command.",
      "Physical purge/archive remains deferred; lifecycle tooling appends markers only.",
      "Historical backfill remains dry-run/apply-guarded and cannot rehydrate records without sanitized summaries.",
    ],
    blockerCoverage: {
      responseOperationsMaturity: responseOpsStaticReady,
      observabilityAlerting: alertingAccepted,
      releaseEvidenceExactCommands: true,
    },
    safety: {
      liveSchedulerEnabledByCodex: false,
      liveAlertsSentByCodex: false,
      productionDataMutated: false,
      productionRecordsPurgedOrArchived: false,
      responseQueueSemanticsChanged: false,
      rawSensitiveValuesIncluded: false,
      dryRunAlertsAreLiveProof: false,
    },
    requiredStatements: [
      "Live scheduler remains disabled by default.",
      "Dry-run alert evidence is not live external alert proof.",
      "No production data was mutated, purged, archived, or backfilled by Codex.",
      "Response queue semantics were not changed.",
      "Blocker 9 requires live alert proof or accepted formal alert exclusion.",
    ],
    outputPaths: {
      markdown: RESPONSE_OPS_READINESS_MD_PATH,
      json: RESPONSE_OPS_READINESS_JSON_PATH,
    },
  };
}

export function renderAlertingExclusionValidationMarkdown(report) {
  const lines = [
    "# Alerting Exclusion Validation",
    "",
    `Generated at: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Accepted: ${report.accepted ? "yes" : "no"}`,
    `Evidence path: ${report.evidencePath ?? "not submitted"}`,
    "",
    "## Validation",
    "",
  ];
  if (report.validation?.errors?.length) lines.push(...report.validation.errors.map((error) => `- ${error}`));
  else lines.push("- Formal alerting exclusion evidence passed strict validation.");
  lines.push(
    "",
    "## Safety",
    "",
    "- This command sends no live alerts.",
    "- This command mutates no production data.",
    "- Evidence containing PII, secrets, raw report data, signed URLs, or database URLs is rejected.",
  );
  return `${lines.join("\n")}\n`;
}

export function writeAlertingExclusionValidationReport(report, { rootDir = process.cwd() } = {}) {
  writeText(rootDir, ALERTING_EXCLUSION_VALIDATION_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  writeText(rootDir, ALERTING_EXCLUSION_VALIDATION_MD_PATH, renderAlertingExclusionValidationMarkdown(report));
  return {
    markdownPath: ALERTING_EXCLUSION_VALIDATION_MD_PATH,
    jsonPath: ALERTING_EXCLUSION_VALIDATION_JSON_PATH,
  };
}

export function renderResponseOpsReadinessMarkdown(report) {
  const lines = [
    "# Response Operations Readiness Evidence",
    "",
    `Generated at: ${report.generatedAt}`,
    `Branch: \`${report.branch}\``,
    `Commit: \`${report.commit}\``,
    `Status: ${report.status}`,
    `Production proof: ${report.productionProof ? "yes" : "no"}`,
    "",
    "## Required Statements",
    "",
    ...report.requiredStatements.map((statement) => `- ${statement}`),
    "",
    "## Status Summary",
    "",
    `- Live scheduler status: ${report.liveScheduler.status}`,
    `- Backfill readiness status: ${report.backfillReadiness.status}`,
    `- Purge/archive readiness status: ${report.purgeArchiveReadiness.status}`,
    `- Alerting status: ${report.alerting.status}`,
    `- Dry-run alerts treated as live proof: ${report.alerting.dryRunOnlyIsLiveProof ? "yes" : "no"}`,
    "",
    "## Operator Monitoring Cadence",
    "",
    ...report.operatorMonitoringCadence.map((item) => `- ${item}`),
    "",
    "## Manual Fallback Steps",
    "",
    ...report.manualFallbackSteps.map((item) => `- ${item}`),
    "",
    "## Command References",
    "",
    ...report.dashboardCommandReferences.map((command) => `- \`${command}\``),
    ...report.responseSoakResultReferences.map((command) => `- \`${command}\``),
    "",
    "## Unresolved Risks",
    "",
    ...(report.unresolvedRisks.length ? report.unresolvedRisks.map((risk) => `- ${risk}`) : ["- None for blocker 8 operator-ready scope."]),
    "",
    "## Blocker Coverage",
    "",
    `- Blocker 8 response operations maturity: ${report.blockerCoverage.responseOperationsMaturity ? "accepted" : "not accepted"}`,
    `- Blocker 9 observability/alerting: ${report.blockerCoverage.observabilityAlerting ? "accepted" : "not accepted"}`,
    `- Blocker 21 exact evidence commands: ${report.blockerCoverage.releaseEvidenceExactCommands ? "present" : "missing"}`,
  ];
  return `${lines.join("\n")}\n`;
}

export function writeResponseOpsReadinessEvidence(report, { rootDir = process.cwd() } = {}) {
  writeText(rootDir, RESPONSE_OPS_READINESS_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  writeText(rootDir, RESPONSE_OPS_READINESS_MD_PATH, renderResponseOpsReadinessMarkdown(report));
  return {
    markdownPath: RESPONSE_OPS_READINESS_MD_PATH,
    jsonPath: RESPONSE_OPS_READINESS_JSON_PATH,
  };
}

function parseArgs(args) {
  const options = {
    rootDir: process.cwd(),
    json: false,
    validateAlertExclusion: false,
    evidencePath: null,
    noWrite: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const nextValue = () => {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--validate-alert-exclusion") {
      options.validateAlertExclusion = true;
      continue;
    }
    if (arg === "--no-write") {
      options.noWrite = true;
      continue;
    }
    if (arg === "--root") {
      options.rootDir = path.resolve(nextValue());
      continue;
    }
    if (arg === "--evidence") {
      options.evidencePath = normalizeRelativePath(nextValue());
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log([
    "Usage: pnpm run response:ops-readiness-evidence -- [options]",
    "       pnpm run alerts:exclusion:validate -- [options]",
    "",
    "Writes non-mutating response operations readiness evidence or validates formal alert exclusion evidence.",
    "",
    "Options:",
    "  --json              Also print JSON.",
    "  --root <path>       Project root. Defaults to current working directory.",
    "  --evidence <path>   Alert exclusion evidence path for validation.",
    "  --no-write          Do not write latest evidence output.",
  ].join("\n"));
}

function printExclusionReport(report, outputs) {
  if (report.status === "not-submitted") {
    console.log("No formal alerting exclusion evidence submitted.");
    console.log("Alerting remains dry-run-only unless live proof exists.");
  } else if (report.status === "failed") {
    console.error("Alerting exclusion validation failed.");
    for (const error of report.validation?.errors ?? []) console.error(`[FAIL] ${error}`);
  } else {
    console.log("Formal alerting exclusion evidence accepted.");
  }
  console.log(`Blocker 9 coverage: ${report.blockerCoverage?.observabilityAlerting ? "accepted" : "not accepted"}`);
  if (outputs) {
    console.log(`Markdown: ${outputs.markdownPath}`);
    console.log(`JSON: ${outputs.jsonPath}`);
  }
}

function printReadinessReport(report, outputs) {
  console.log("Response operations readiness evidence generated.");
  console.log(`Live scheduler status: ${report.liveScheduler.status}`);
  console.log(`Alerting status: ${report.alerting.status}`);
  console.log("No live scheduler was enabled and no live alerts were sent by Codex.");
  if (outputs) {
    console.log(`Markdown: ${outputs.markdownPath}`);
    console.log(`JSON: ${outputs.jsonPath}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (options.validateAlertExclusion) {
    const report = buildAlertingExclusionValidationReport({
      rootDir: options.rootDir,
      evidencePath: options.evidencePath,
    });
    const outputs = options.noWrite ? null : writeAlertingExclusionValidationReport(report, { rootDir: options.rootDir });
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else printExclusionReport(report, outputs);
    if (report.status === "failed") process.exitCode = 1;
    return;
  }

  const report = buildResponseOpsReadinessEvidenceReport({
    rootDir: options.rootDir,
  });
  const outputs = options.noWrite ? null : writeResponseOpsReadinessEvidence(report, { rootDir: options.rootDir });
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else printReadinessReport(report, outputs);
  if (report.staticValidation.status === "failed") process.exitCode = 1;
}

if (process.argv[1] && existsSync(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
