import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { collectDashboardEvidence } from "./production-scale-evidence.mjs";

export const RESPONSE_OPS_READINESS_MD_PATH =
  "docs/production-scale/evidence/latest-response-ops-readiness.md";
export const RESPONSE_OPS_READINESS_JSON_PATH =
  "docs/production-scale/evidence/latest-response-ops-readiness.json";
export const ALERTING_EXCLUSION_TEMPLATE_PATH =
  "docs/production-scale/alerting-exclusion-template.md";
export const ALERTING_LIVE_PROOF_TEMPLATE_JSON_PATH =
  "docs/production-scale/evidence/alerting-live-proof-template.json";
export const ALERTING_LIVE_PROOF_TEMPLATE_MD_PATH =
  "docs/production-scale/evidence/alerting-live-proof-template.md";
export const ALERTING_EXCLUSION_TEMPLATE_JSON_PATH =
  "docs/production-scale/evidence/alerting-exclusion-template.json";
export const ALERTING_EXCLUSION_TEMPLATE_MD_PATH =
  "docs/production-scale/evidence/alerting-exclusion-template.md";
export const ALERTING_EXCLUSION_EVIDENCE_MD_PATH =
  "docs/production-scale/evidence/alerting-exclusion-evidence.md";
export const ALERTING_EXCLUSION_EVIDENCE_JSON_PATH =
  "docs/production-scale/evidence/alerting-exclusion-evidence.json";
export const ALERTING_EXCLUSION_VALIDATION_MD_PATH =
  "docs/production-scale/evidence/latest-alerting-exclusion-validation.md";
export const ALERTING_EXCLUSION_VALIDATION_JSON_PATH =
  "docs/production-scale/evidence/latest-alerting-exclusion-validation.json";
export const ALERTING_ACCEPTANCE_MD_PATH =
  "docs/production-scale/evidence/latest-alerting-acceptance.md";
export const ALERTING_ACCEPTANCE_JSON_PATH =
  "docs/production-scale/evidence/latest-alerting-acceptance.json";
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
    ["webhook-url", /https?:\/\/[^\s]*(?:hooks\.slack\.com\/services|discord(?:app)?\.com\/api\/webhooks|webhook\.office\.com|pagerduty\.com|webhook)[^\s]*/i],
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

function acknowledgesDryRunNotLiveProof(value) {
  if (truthyEvidence(value)) return true;
  const text = String(value ?? "").trim().toLowerCase();
  return /dry[- ]?run/.test(text) && /not\s+live|not\s+external|not\s+delivery/.test(text);
}

function parseDateValue(value) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isFutureOrCurrentDate(value, generatedAt) {
  const timestamp = parseDateValue(value);
  const generatedTimestamp = parseDateValue(generatedAt) ?? Date.now();
  return timestamp !== null && timestamp >= generatedTimestamp;
}

function isPastOrCurrentDate(value, generatedAt) {
  const timestamp = parseDateValue(value);
  const generatedTimestamp = parseDateValue(generatedAt) ?? Date.now();
  return timestamp !== null && timestamp <= generatedTimestamp;
}

function listIncludesText(value, pattern) {
  if (Array.isArray(value)) return value.some((item) => pattern.test(String(item ?? "")));
  return pattern.test(String(value ?? ""));
}

function nonEmptyListOrText(value) {
  if (Array.isArray(value)) return value.some((item) => !isPlaceholder(item));
  return !isPlaceholder(value);
}

export function validateAlertingExclusionEvidence(evidenceInput, { generatedAt = new Date().toISOString() } = {}) {
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
    ["namedBlockerScope", ["namedBlockerScope", "Named blocker scope", "Blocker scope"]],
    ["exclusionReason", ["exclusionReason", "Exclusion reason"]],
    ["compensatingControls", ["compensatingControls", "Compensating controls"]],
    ["humanMonitoringCadence", ["humanMonitoringCadence", "Human monitoring cadence", "Monitoring cadence"]],
    ["manualEscalationPath", ["manualEscalationPath", "Manual escalation path"]],
    ["acceptedRiskStatement", ["acceptedRiskStatement", "riskAcceptanceStatement", "Accepted risk statement", "Risk acceptance statement"]],
    ["reviewOrExpiryDate", ["reviewOrExpiryDate", "Review/expiry date", "Review date", "Expiry date"]],
    ["expiresOn", ["expiresOn", "Expires on", "Expiration date"]],
    ["nextReviewDate", ["nextReviewDate", "Next review date"]],
    ["approvedByOperatorIdOrRole", ["approvedByOperatorIdOrRole", "approvedByRole", "Approved by"]],
    ["approvedAt", ["approvedAt", "Approved at"]],
    [
      "dryRunNotLiveProofAcknowledgement",
      [
        "dryRunNotLiveProofAcknowledgement",
        "Dry-run not live proof acknowledgement",
        "Dry-run is not live alert delivery proof",
      ],
    ],
    ["dashboardCommand", ["dashboardCommand", "Dashboard command"]],
    ["soakCommand", ["soakCommand", "Response soak command", "Soak command"]],
    ["alertsDryRunCommand", ["alertsDryRunCommand", "Alerts dry-run command"]],
    ["alertsDryRunEvidencePath", ["alertsDryRunEvidencePath", "Alerts dry-run evidence path"]],
    ["sanitizedEvidenceStatement", ["sanitizedEvidenceStatement", "Sanitized evidence statement"]],
    [
      "productionAtScalePassStatement",
      [
        "exclusionDoesNotMeanProductionAtScalePassUnlessPolicyAllows",
        "Exclusion does not mean production-at-scale PASS unless policy allows it",
      ],
    ],
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
  if (!listIncludesText(normalized.namedBlockerScope, /L10-P1-005|observability|alerting|blocker\s*9/i)) {
    errors.push("namedBlockerScope must name L10-P1-005 or observability/alerting blocker coverage.");
  }
  if (!nonEmptyListOrText(normalized.compensatingControls)) {
    errors.push("compensatingControls must describe the compensating monitoring controls.");
  }
  if (!/sanitiz/i.test(String(normalized.sanitizedEvidenceStatement ?? ""))) {
    errors.push("Evidence must explicitly state that it is sanitized.");
  }
  if (!/accept/i.test(String(normalized.acceptedRiskStatement ?? "")) || !/risk/i.test(String(normalized.acceptedRiskStatement ?? ""))) {
    errors.push("acceptedRiskStatement must explicitly accept the operational risk.");
  }
  if (Number.isNaN(Date.parse(String(normalized.reviewOrExpiryDate ?? "")))) {
    errors.push("reviewOrExpiryDate must be a parseable review or expiry date.");
  }
  if (parseDateValue(normalized.expiresOn) === null) {
    errors.push("expiresOn must be a parseable expiration date.");
  } else if (!isFutureOrCurrentDate(normalized.expiresOn, generatedAt)) {
    errors.push("expiresOn is stale and cannot close the alerting blocker.");
  }
  if (parseDateValue(normalized.nextReviewDate) === null) {
    errors.push("nextReviewDate must be a parseable review date.");
  } else if (!isFutureOrCurrentDate(normalized.nextReviewDate, generatedAt)) {
    errors.push("nextReviewDate is stale and cannot close the alerting blocker.");
  }
  if (parseDateValue(normalized.approvedAt) === null || !isPastOrCurrentDate(normalized.approvedAt, generatedAt)) {
    errors.push("approvedAt must be parseable and not future-dated.");
  }

  const noExternalProvider = evidenceValue(evidence, ["noExternalAlertProviderUsed", "No external alert provider used"]);
  const operatorAck = evidenceValue(evidence, ["operatorAcknowledgementSigned", "Operator acknowledgement signed", "Operator acknowledgement"]);
  const productionDataMutatedByCodex = evidenceValue(evidence, ["productionDataMutatedByCodex", "Production data mutated by Codex"]);
  const liveAlertsSent = evidenceValue(evidence, ["liveAlertsSent", "Live alerts sent"]);
  const policyAllowsFormalExclusion = evidenceValue(evidence, [
    "policyAllowsFormalExclusion",
    "formalExclusionPolicyAllowed",
    "Policy allows formal exclusion",
  ]);
  const noPiiSecretsWebhookUrls = evidenceValue(evidence, [
    "noPiiNoSecretsNoWebhookUrls",
    "noSecretsOrWebhookUrls",
    "No PII, secrets, or webhook URLs",
  ]);
  const dryRunEqualsLiveProof = evidenceValue(evidence, [
    "dryRunEqualsLiveAlertProof",
    "dryRunEvidenceIsLiveProof",
    "dryRunOnlyIsLiveProof",
    "Dry-run equals live alert proof",
  ]);

  if (!truthyEvidence(noExternalProvider)) {
    errors.push("noExternalAlertProviderUsed must be true for a formal alert exclusion.");
  }
  if (!truthyEvidence(operatorAck)) {
    errors.push("operatorAcknowledgementSigned must be true when no external alert provider will be used.");
  }
  if (!truthyEvidence(policyAllowsFormalExclusion)) {
    errors.push("policyAllowsFormalExclusion must be true before a formal exclusion can close alerting proof.");
  }
  if (!truthyEvidence(noPiiSecretsWebhookUrls)) {
    errors.push("noPiiNoSecretsNoWebhookUrls must be true.");
  }
  if (!falseEvidence(productionDataMutatedByCodex)) {
    errors.push("productionDataMutatedByCodex must be false.");
  }
  if (!falseEvidence(liveAlertsSent)) {
    errors.push("liveAlertsSent must be false for an alerting exclusion.");
  }
  if (!acknowledgesDryRunNotLiveProof(normalized.dryRunNotLiveProofAcknowledgement)) {
    errors.push("dryRunNotLiveProofAcknowledgement must acknowledge that dry-run evidence is not live alert delivery proof.");
  }
  if (
    normalized.productionAtScalePassStatement !== true &&
    !/not\s+(?:mean|equal|claim).*production-at-scale\s+pass|production-at-scale\s+pass.*unless\s+policy/i.test(
      String(normalized.productionAtScalePassStatement ?? ""),
    )
  ) {
    errors.push("exclusionDoesNotMeanProductionAtScalePassUnlessPolicyAllows must be explicitly acknowledged.");
  }
  if (truthyEvidence(dryRunEqualsLiveProof)) {
    errors.push("Dry-run evidence cannot be claimed as live alert delivery proof.");
  }
  if (/dry[- ]?run\s+(?:equals|is)\s+live/i.test(serialized)) {
    errors.push("Evidence text cannot claim that dry-run evidence equals live alert proof.");
  }
  if (sensitiveFindings.length > 0) {
    errors.push(`Sensitive content detected: ${sensitiveFindings.join(", ")}.`);
  }

  return {
    accepted: errors.length === 0,
    status: errors.length === 0 ? "accepted" : "failed",
    errors,
    sensitiveFindings,
    stale: errors.some((error) => /stale/i.test(error)),
    policyAllowsFormalExclusion: truthyEvidence(policyAllowsFormalExclusion),
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
    : validateAlertingExclusionEvidence(parsed, { generatedAt });

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

export function validateLiveAlertProofEvidence(evidence, { generatedAt = new Date().toISOString(), maxAgeDays = 90 } = {}) {
  if (!evidence || typeof evidence !== "object") {
    return {
      accepted: false,
      status: "not-submitted",
      errors: ["No live alert proof evidence has been submitted."],
      sensitiveFindings: [],
      blockerCoverage: {
        observabilityAlerting: false,
      },
    };
  }
  const errors = [];
  const sensitiveFindings = scanResponseOpsEvidenceSensitiveContent(JSON.stringify(evidence));
  const observedAt = parseDateValue(evidence.observedAt ?? evidence.timestamp);
  const generatedTimestamp = parseDateValue(generatedAt) ?? Date.now();
  const ageDays = observedAt === null ? null : Math.max(0, (generatedTimestamp - observedAt) / 86_400_000);

  if (isPlaceholder(evidence.evidenceId)) errors.push("evidenceId is required and cannot be a placeholder.");
  if (evidence.evidenceType !== "HUMAN_OBSERVED_LIVE_ALERT_DELIVERY") {
    errors.push("evidenceType must be HUMAN_OBSERVED_LIVE_ALERT_DELIVERY.");
  }
  if (!/production|limited beta production/i.test(String(evidence.environment ?? ""))) {
    errors.push("environment must identify production or limited beta production operations.");
  }
  if (isPlaceholder(evidence.alertChannelId) || /^https?:\/\//i.test(String(evidence.alertChannelId ?? ""))) {
    errors.push("alertChannelId must be a sanitized opaque channel ID, not a URL.");
  }
  if (isPlaceholder(evidence.alertTypeTested)) errors.push("alertTypeTested is required.");
  if (observedAt === null) {
    errors.push("observedAt must be a parseable timestamp.");
  } else if (observedAt > generatedTimestamp) {
    errors.push("observedAt must not be future-dated.");
  } else if (ageDays !== null && ageDays > maxAgeDays) {
    errors.push(`Live alert proof is stale; observedAt is older than ${maxAgeDays} days.`);
  }
  if (evidence.deliverySuccess !== true) errors.push("deliverySuccess must be true.");
  if (evidence.liveAlertDeliveryVerified !== true) errors.push("liveAlertDeliveryVerified must be true.");
  if (evidence.sanitizedEvidence !== true) errors.push("sanitizedEvidence must be true.");
  if (evidence.operatorAcknowledgementSigned !== true) errors.push("operatorAcknowledgementSigned must be true.");
  if (evidence.noSecretsOrWebhookUrls !== true) errors.push("noSecretsOrWebhookUrls must be true.");
  if (evidence.noPii !== true) errors.push("noPii must be true.");
  if (isPlaceholder(evidence.correlationId)) errors.push("correlationId is required.");
  if (isPlaceholder(evidence.retryOrFailureBehavior)) {
    errors.push("retryOrFailureBehavior must describe retry/failure behavior or explicitly state that no retry was required.");
  }
  if (evidence.productionDataMutatedByCodex !== false) errors.push("productionDataMutatedByCodex must be false.");
  if (sensitiveFindings.length > 0) errors.push(`Sensitive content detected: ${sensitiveFindings.join(", ")}.`);
  return {
    accepted: errors.length === 0,
    status: errors.length === 0 ? "accepted" : "failed",
    errors,
    sensitiveFindings,
    ageDays,
    stale: errors.some((error) => /stale/i.test(error)),
    blockerCoverage: {
      observabilityAlerting: errors.length === 0,
    },
  };
}

function readLiveAlertProof(rootDir, liveAlertProofEvidence = null, generatedAt = new Date().toISOString()) {
  const evidence = liveAlertProofEvidence ?? readJsonIfPresent(rootDir, LIVE_ALERT_PROOF_JSON_PATH);
  const validation = validateLiveAlertProofEvidence(evidence, { generatedAt });
  return {
    status: validation.status,
    accepted: validation.accepted,
    evidencePath: evidence ? LIVE_ALERT_PROOF_JSON_PATH : null,
    alertChannelId: evidence?.alertChannelId ?? null,
    alertTypeTested: evidence?.alertTypeTested ?? null,
    environment: evidence?.environment ?? null,
    correlationId: evidence?.correlationId ?? null,
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

export function buildAlertingAcceptanceReport({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  alertingExclusionValidation = null,
  liveAlertProofEvidence = null,
  alertsDryRunEvidence = null,
} = {}) {
  const liveAlertProof = readLiveAlertProof(rootDir, liveAlertProofEvidence, generatedAt);
  const exclusionValidation =
    alertingExclusionValidation ?? buildAlertingExclusionValidationReport({ rootDir, generatedAt });
  const dryRunAlerts = alertsDryRunEvidence ?? alertsDryRunSummary(rootDir);
  const acceptedByLiveProof = liveAlertProof.accepted === true;
  const acceptedByFormalExclusion = exclusionValidation.accepted === true;
  const accepted = acceptedByLiveProof || acceptedByFormalExclusion;
  const alertingStatus = acceptedByLiveProof
    ? "live-evidenced"
    : acceptedByFormalExclusion
      ? "formally-excluded"
      : dryRunAlerts.exists
        ? "dry-run-only"
        : "not-submitted";
  const errors = acceptedByLiveProof
    ? []
    : acceptedByFormalExclusion
      ? []
      : [
          "No accepted live alert proof or policy-allowed formal alerting exclusion exists.",
          ...((liveAlertProof.validation?.errors ?? []).map((error) => `Live alert proof: ${error}`)),
          ...((exclusionValidation.validation?.errors ?? []).map((error) => `Formal exclusion: ${error}`)),
        ];

  return {
    reportName: "alerting-acceptance",
    evidenceType: "ALERTING_ACCEPTANCE",
    generatedAt,
    status: accepted ? alertingStatus : alertingStatus,
    accepted,
    alertingStatus,
    acceptancePath: acceptedByLiveProof ? "live-alert-proof" : acceptedByFormalExclusion ? "formal-exclusion" : "none",
    productionProof: acceptedByLiveProof,
    formalExclusionAccepted: acceptedByFormalExclusion,
    liveAlertProofAccepted: acceptedByLiveProof,
    dryRunOnlyRejectedAsProductionProof: dryRunAlerts.exists && !accepted,
    dryRunEvidence: dryRunAlerts,
    liveAlertProof,
    exclusionValidation: {
      reportName: exclusionValidation.reportName,
      status: exclusionValidation.status,
      accepted: exclusionValidation.accepted === true,
      evidencePath: exclusionValidation.evidencePath,
      validation: exclusionValidation.validation,
    },
    validation: {
      accepted,
      errors,
      sensitiveFindings: Array.from(
        new Set([
          ...(liveAlertProof.validation?.sensitiveFindings ?? []),
          ...(exclusionValidation.validation?.sensitiveFindings ?? []),
        ]),
      ),
      stale:
        liveAlertProof.validation?.stale === true ||
        exclusionValidation.validation?.stale === true,
    },
    blockerCoverage: {
      observabilityAlerting: accepted,
    },
    safety: {
      liveAlertsSentByCodex: false,
      productionDataMutatedByCodex: false,
      dryRunAlertsAreLiveProof: false,
      webhookUrlsAccepted: false,
      piiAccepted: false,
      secretsAccepted: false,
    },
    requiredStatements: [
      "Dry-run alert evidence alone cannot close production observability/alerting proof.",
      "A formal exclusion closes alerting proof only when policyAllowsFormalExclusion is true and the exclusion is not stale.",
      "Accepted exclusion evidence does not claim production-at-scale PASS unless policy explicitly allows that limited scope.",
      "Evidence containing secrets, PII, raw report data, signed URLs, or webhook URLs is rejected.",
    ],
    outputPaths: {
      markdown: ALERTING_ACCEPTANCE_MD_PATH,
      json: ALERTING_ACCEPTANCE_JSON_PATH,
    },
  };
}

export function renderAlertingAcceptanceMarkdown(report) {
  const lines = [
    "# Alerting Acceptance",
    "",
    `Generated at: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Accepted: ${report.accepted ? "yes" : "no"}`,
    `Acceptance path: ${report.acceptancePath}`,
    `Alerting status: ${report.alertingStatus}`,
    "",
    "## Required Statements",
    "",
    ...report.requiredStatements.map((statement) => `- ${statement}`),
    "",
    "## Live Alert Proof",
    "",
    `- Accepted: ${report.liveAlertProofAccepted ? "yes" : "no"}`,
    `- Evidence path: \`${report.liveAlertProof.evidencePath ?? "not submitted"}\``,
    `- Alert channel ID: ${report.liveAlertProof.alertChannelId ?? "not submitted"}`,
    `- Alert type tested: ${report.liveAlertProof.alertTypeTested ?? "not submitted"}`,
    `- Correlation ID: ${report.liveAlertProof.correlationId ?? "not submitted"}`,
    "",
    "## Formal Exclusion",
    "",
    `- Accepted: ${report.formalExclusionAccepted ? "yes" : "no"}`,
    `- Evidence path: \`${report.exclusionValidation.evidencePath ?? "not submitted"}\``,
    `- Status: ${report.exclusionValidation.status}`,
    "",
    "## Dry-Run Boundary",
    "",
    `- Dry-run evidence exists: ${report.dryRunEvidence.exists ? "yes" : "no"}`,
    `- Dry-run-only rejected as production proof: ${report.dryRunOnlyRejectedAsProductionProof ? "yes" : "no"}`,
    "",
    "## Validation",
    "",
  ];
  if (report.validation.errors.length) lines.push(...report.validation.errors.map((error) => `- ${error}`));
  else lines.push("- Alerting proof path passed strict acceptance validation.");
  lines.push(
    "",
    "## Safety",
    "",
    "- This command sends no live alerts.",
    "- This command mutates no production data.",
    "- Webhook URLs, secrets, PII, signed URLs, and raw report data are not accepted.",
  );
  return `${lines.join("\n")}\n`;
}

export function writeAlertingAcceptanceReport(report, { rootDir = process.cwd() } = {}) {
  writeText(rootDir, ALERTING_ACCEPTANCE_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  writeText(rootDir, ALERTING_ACCEPTANCE_MD_PATH, renderAlertingAcceptanceMarkdown(report));
  return {
    markdownPath: ALERTING_ACCEPTANCE_MD_PATH,
    jsonPath: ALERTING_ACCEPTANCE_JSON_PATH,
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
  dashboardEvidence = null,
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
  const dryRunAlerts = alertsDryRunEvidence ?? alertsDryRunSummary(rootDir);
  const alertingAcceptance = buildAlertingAcceptanceReport({
    rootDir,
    generatedAt,
    alertingExclusionValidation: exclusionValidation,
    liveAlertProofEvidence,
    alertsDryRunEvidence: dryRunAlerts,
  });
  const liveAlertProof = alertingAcceptance.liveAlertProof;
  const dashboard = dashboardEvidence ?? {
    available: false,
    command: "pnpm run operator:dashboard -- --json",
    exitCode: null,
    skipCount: null,
    checksSkipped: "not-collected-by-builder",
    treatsSkipAsPass: false,
    summary: null,
    releaseEvidenceSemantics: {
      skippedChecksVisible: false,
      passImpliesSkippedChecksPassed: false,
      dashboardPassAloneIsReleaseEvidence: false,
    },
  };

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
        dashboardText.includes("Dashboard PASS alone is not sufficient release evidence.") &&
        dashboard.treatsSkipAsPass !== true,
      {
        dashboardCommand: dashboard.command,
        skipCount: dashboard.skipCount,
        skippedChecksVisible:
          dashboard.releaseEvidenceSemantics?.skippedChecksVisible === true ||
          Number(dashboard.skipCount ?? 0) > 0,
      },
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

  const alertingStatus = alertingAcceptance.alertingStatus === "not-submitted" ? "dry-run-missing" : alertingAcceptance.alertingStatus;
  const responseOpsStaticReady = failedChecks.filter((check) => check.name !== "alert dry-run remains non-live proof").length === 0;
  const alertingAccepted = alertingAcceptance.accepted === true;

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
    responseSoak: {
      status: checks[3].passed ? "command-available" : "missing",
      command: "pnpm run response:soak-check",
      productionRunExecutedByThisCommand: false,
      syntheticSoakOnly: true,
      externalAlertDeliveryUsed: false,
      liveMailboxIntegrationUsed: false,
    },
    dashboard: {
      status: dashboard.available ? "available" : "not-collected",
      command: dashboard.command,
      exitCode: dashboard.exitCode,
      skipCount: dashboard.skipCount,
      checksSkipped: dashboard.checksSkipped,
      skippedChecksVisible:
        dashboard.releaseEvidenceSemantics?.skippedChecksVisible === true ||
        Number(dashboard.skipCount ?? 0) > 0,
      treatsSkipAsPass: dashboard.treatsSkipAsPass === true,
      dashboardPassAloneIsReleaseEvidence:
        dashboard.releaseEvidenceSemantics?.dashboardPassAloneIsReleaseEvidence === true,
      summary: dashboard.summary,
    },
    alerting: {
      status: alertingStatus,
      acceptance: alertingAcceptance,
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
    `- Response soak status: ${report.responseSoak.status}`,
    `- Dashboard status: ${report.dashboard.status}`,
    `- Dashboard SKIP count: ${report.dashboard.skipCount ?? "not collected"}`,
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
    "Usage: pnpm run response-ops:readiness-evidence -- [options]",
    "       pnpm run response:ops-readiness-evidence -- [options]",
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
  console.log(`Response soak status: ${report.responseSoak.status}`);
  console.log(`Dashboard SKIP count: ${report.dashboard.skipCount ?? "not collected"}`);
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
    const acceptance = buildAlertingAcceptanceReport({
      rootDir: options.rootDir,
      generatedAt: report.generatedAt,
      alertingExclusionValidation: report,
    });
    const outputs = options.noWrite ? null : writeAlertingExclusionValidationReport(report, { rootDir: options.rootDir });
    if (!options.noWrite) writeAlertingAcceptanceReport(acceptance, { rootDir: options.rootDir });
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else printExclusionReport(report, outputs);
    if (report.status === "failed") process.exitCode = 1;
    return;
  }

  const report = buildResponseOpsReadinessEvidenceReport({
    rootDir: options.rootDir,
    dashboardEvidence: collectDashboardEvidence({ rootDir: options.rootDir }),
  });
  const outputs = options.noWrite ? null : writeResponseOpsReadinessEvidence(report, { rootDir: options.rootDir });
  if (!options.noWrite) writeAlertingAcceptanceReport(report.alerting.acceptance, { rootDir: options.rootDir });
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
