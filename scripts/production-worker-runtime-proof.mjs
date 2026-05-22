import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PRODUCTION_WORKER_RUNTIME_PROOF_JSON_PATH =
  "docs/production-scale/evidence/latest-production-worker-runtime-proof.json";
export const PRODUCTION_WORKER_RUNTIME_PROOF_MD_PATH =
  "docs/production-scale/evidence/latest-production-worker-runtime-proof.md";
export const PRODUCTION_WORKER_RUNTIME_PROOF_TEMPLATE_JSON_PATH =
  "docs/production-scale/evidence/production-worker-runtime-proof-template.json";
export const PRODUCTION_WORKER_RUNTIME_PROOF_TEMPLATE_MD_PATH =
  "docs/production-scale/evidence/production-worker-runtime-proof-template.md";
export const DEFAULT_PRODUCTION_WORKER_RUNTIME_PROOF_SUBMISSION_JSON_PATH =
  "docs/production-scale/evidence/production-worker-runtime-proof-submission.json";

export const PRODUCTION_WORKER_RUNTIME_PROOF_MAX_AGE_DAYS = 14;
export const PRODUCTION_WORKER_RUNTIME_PROOF_MAX_JOBS = 5;
export const PRODUCTION_WORKER_RUNTIME_APPLY_GUARD = "explicit-bounded-production-ingest-worker-apply";
export const PRODUCTION_WORKER_RUNTIME_SOURCE = "authenticated_ingest_process";
export const PRODUCTION_WORKER_RUNTIME_DRY_RUN_COMMAND =
  "pnpm run ingest:worker --dry-run --max-jobs 1 --concurrency 1 --worker-id production-ingest-worker-dry-run --source authenticated_ingest_process";
export const PRODUCTION_WORKER_RUNTIME_APPLY_COMMAND =
  "pnpm run ingest:worker --apply --max-jobs <1-5> --concurrency 1 --worker-id production-bounded-ingest-worker --source authenticated_ingest_process";

const SAFE_ATTACHMENT_PREFIX = "docs/production-scale/evidence/";
const SAFE_OPERATOR_ID_PATTERN = /^[A-Z0-9][A-Z0-9_.:-]{1,63}$/i;
const SAFE_TOKEN_PATTERN = /^[A-Z0-9][A-Z0-9_.:-]{1,119}$/i;
const SUCCESS_PATTERN = /\b(pass|passed|success|successful|succeeded|verified|complete|completed|stopped|idle|succeeded)\b/i;
const PLACEHOLDER_PATTERN = /^(?:tbd|todo|n\/a|na|none|null|-|replace[_ -]?me|example)$/i;

export const PRODUCTION_WORKER_RUNTIME_REQUIRED_GUARDS = [
  "CRP_ENV=production",
  `CRP_PRODUCTION_INGEST_WORKER_APPLY=${PRODUCTION_WORKER_RUNTIME_APPLY_GUARD}`,
  "CRP_PRODUCTION_INGEST_WORKER_ONE_SHOT=true",
  "CRP_PRODUCTION_INGEST_WORKER_MAX_JOBS matching --max-jobs",
  "CRP_PRODUCTION_INGEST_WORKER_OPERATOR set to a safe token",
  "--max-jobs explicitly set to 1-5",
  "--concurrency=1",
  "--source=authenticated_ingest_process",
  "--worker-id present",
];

export const PRODUCTION_WORKER_RUNTIME_SENSITIVE_PATTERNS = [
  ["database-url", /\b(?:postgres|postgresql|mysql|mongodb):\/\/[^\s)]+/i],
  ["private-key-block", /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i],
  ["api-token", /\b(?:sk|ghp|github_pat|xox[baprs])[_-][A-Za-z0-9_-]{12,}\b/i],
  ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["bearer-token", /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/i],
  ["password-assignment", /\b(?:password|passwd|pwd)\s*[:=]\s*\S{6,}\b/i],
  ["session-cookie", /\bfloot_built_app_session=[A-Za-z0-9._~+/=-]{12,}\b/i],
  ["raw-pdf-bytes", /(?:%PDF-|JVBERi0)/i],
  ["raw-report-text", /\b(?:rawExtractedText|raw\s+report\s+text|full\s+credit\s+report\s+text)\s*[:=]/i],
  ["raw-base64-block", /\b(?:base64|fileDataBase64|rawBase64|rawReportBytes)\s*[:=]\s*[A-Za-z0-9+/]{40,}={0,2}\b/i],
  ["long-raw-base64-like-block", /\b[A-Za-z0-9+/]{160,}={0,2}\b/],
  ["signed-url", /https?:\/\/[^\s]+(?:X-Amz-Signature|X-Goog-Signature|GoogleAccessId|Signature=|[?&]sig=|[?&]sv=)[^\s]*/i],
  ["obvious-email-pii", /\b[A-Z0-9._%+-]+@(?!example\.test\b|example\.invalid\b|example\.com\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ["obvious-ssn-or-sin", /\b(?:\d{3}-\d{2}-\d{4}|\d{3}[- ]?\d{3}[- ]?\d{3})\b/],
  ["obvious-phone-pii", /\b(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b/],
];

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (path.isAbsolute(normalized)) return normalized;
  return path.join(rootDir, ...normalized.split("/").filter(Boolean));
}

function readRootText(rootDir, relativePath) {
  return readFileSync(repoPath(rootDir, relativePath), "utf8");
}

function readRootJson(rootDir, relativePath) {
  return JSON.parse(readRootText(rootDir, relativePath));
}

function writeRootText(rootDir, relativePath, text) {
  const absolutePath = repoPath(rootDir, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, text, "utf8");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPlaceholder(value) {
  const normalized = String(value ?? "").trim();
  return !normalized || PLACEHOLDER_PATTERN.test(normalized);
}

export function scanProductionWorkerRuntimeSensitiveContent(text) {
  return PRODUCTION_WORKER_RUNTIME_SENSITIVE_PATTERNS
    .filter(([, pattern]) => pattern.test(String(text ?? "")))
    .map(([name]) => name);
}

export function redactProductionWorkerRuntimeText(value) {
  return String(value ?? "")
    .replace(/\b(?:postgres|postgresql|mysql|mongodb):\/\/[^\s)]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gi, "[REDACTED_PRIVATE_KEY]")
    .replace(/\b(?:sk|ghp|github_pat|xox[baprs])[_-][A-Za-z0-9_-]{12,}\b/gi, "[REDACTED_TOKEN]")
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "[REDACTED_ACCESS_KEY]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/gi, "[REDACTED_BEARER_TOKEN]")
    .replace(/\b(?:password|passwd|pwd)\s*[:=]\s*\S{6,}\b/gi, "[REDACTED_PASSWORD]")
    .replace(/\bfloot_built_app_session=[A-Za-z0-9._~+/=-]{12,}\b/gi, "[REDACTED_SESSION_COOKIE]")
    .replace(/https?:\/\/[^\s]+(?:X-Amz-Signature|X-Goog-Signature|GoogleAccessId|Signature=|[?&]sig=|[?&]sv=)[^\s]*/gi, "[REDACTED_SIGNED_URL]")
    .replace(/\b[A-Z0-9._%+-]+@(?!example\.test\b|example\.invalid\b|example\.com\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/\b(?:\d{3}-\d{2}-\d{4}|\d{3}[- ]?\d{3}[- ]?\d{3})\b/g, "[REDACTED_ID_NUMBER]")
    .replace(/\b(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b/g, "[REDACTED_PHONE]")
    .replace(/(?:%PDF-|JVBERi0)/gi, "[REDACTED_RAW_PDF_BYTES]")
    .replace(/\b(?:base64|fileDataBase64|rawBase64|rawReportBytes)\s*[:=]\s*[A-Za-z0-9+/]{40,}={0,2}\b/gi, "[REDACTED_RAW_BYTES]")
    .replace(/\b[A-Za-z0-9+/]{160,}={0,2}\b/g, "[REDACTED_LONG_BASE64]");
}

function safeSummary(value, limit = 180) {
  const redacted = redactProductionWorkerRuntimeText(value).replace(/\s+/g, " ").trim();
  if (redacted.length <= limit) return redacted;
  return `${redacted.slice(0, limit - 3)}...`;
}

function parseTimestamp(value, errors) {
  if (isPlaceholder(value)) {
    errors.push("timestamp is required.");
    return null;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    errors.push("timestamp must be parseable.");
    return null;
  }
  return new Date(parsed).toISOString();
}

function evidenceAgeDays(observedAt, generatedAt) {
  const observed = Date.parse(observedAt);
  const generated = Date.parse(generatedAt);
  if (!Number.isFinite(observed) || !Number.isFinite(generated)) return null;
  return Math.round(((generated - observed) / 86_400_000) * 100) / 100;
}

function readPositiveInteger(value, errors, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    errors.push(`${label} must be an integer between ${min} and ${max}.`);
    return null;
  }
  return parsed;
}

function readRequiredString(value, errors, label, pattern = null) {
  if (isPlaceholder(value)) {
    errors.push(`${label} is required and must not be a placeholder.`);
    return null;
  }
  const text = String(value).trim();
  if (pattern && !pattern.test(text)) errors.push(`${label} must be a safe internal token.`);
  return safeSummary(text);
}

function readQueueDepth(value, errors, label) {
  if (!isPlainObject(value)) {
    errors.push(`${label} queue depth is required.`);
    return null;
  }
  const queued = readPositiveInteger(value.queued, errors, `${label}.queued`);
  const running = readPositiveInteger(value.running, errors, `${label}.running`);
  const failed = readPositiveInteger(value.failed, errors, `${label}.failed`);
  const deadLettered = readPositiveInteger(value.deadLettered, errors, `${label}.deadLettered`);
  const staleRunning = readPositiveInteger(value.staleRunning, errors, `${label}.staleRunning`);
  const total =
    value.total === undefined
      ? [queued, running, failed, deadLettered].every((item) => item !== null)
        ? queued + running + failed + deadLettered
        : null
      : readPositiveInteger(value.total, errors, `${label}.total`);
  return {
    total,
    queued,
    running,
    failed,
    deadLettered,
    staleRunning,
  };
}

function requireTrue(value, errors, label) {
  if (value !== true) errors.push(`${label} must be true.`);
}

function validateAttachments(rootDir, evidence, errors) {
  if (!Array.isArray(evidence.evidenceAttachments) || evidence.evidenceAttachments.length === 0) {
    errors.push("evidenceAttachments must include at least one sanitized artifact path.");
    return [];
  }

  return evidence.evidenceAttachments.map((attachment, index) => {
    const normalized = normalizeRelativePath(attachment);
    if (path.isAbsolute(normalized) || normalized.includes("..") || !normalized.startsWith(SAFE_ATTACHMENT_PREFIX)) {
      errors.push(`evidenceAttachments[${index}] must be a relative path under ${SAFE_ATTACHMENT_PREFIX}.`);
    }
    if (/\.env(?:\.|$)|secret|credential|private-key/i.test(normalized)) {
      errors.push(`evidenceAttachments[${index}] cannot reference secret or credential artifacts.`);
    }
    if (!existsSync(repoPath(rootDir, normalized))) {
      errors.push(`evidenceAttachments[${index}] does not exist: ${normalized}.`);
    }
    return normalized;
  });
}

function detectDefaultOffEvidence(value) {
  const text = JSON.stringify(value ?? {}).toLowerCase();
  return (
    value?.evidenceType === "PRODUCTION_WORKER_ACTIVATION_EVIDENCE" ||
    value?.productionActivationDeferred === true ||
    value?.productionWorkerDefaultOff === true ||
    /default-off|activation evidence|activation remains deferred/.test(text)
  );
}

function inspectDockerCompose(rootDir) {
  const productionPath = "docker-compose.production.yml";
  const stagingPath = "docker-compose.yml";
  const productionText = existsSync(repoPath(rootDir, productionPath)) ? readRootText(rootDir, productionPath) : "";
  const stagingText = existsSync(repoPath(rootDir, stagingPath)) ? readRootText(rootDir, stagingPath) : "";
  return {
    productionComposePath: productionPath,
    stagingComposePath: stagingPath,
    productionWorkerServicePresent: /creditregulatorpro-ingest-worker:/i.test(productionText),
    productionWorkerRestartUnlessStopped: /creditregulatorpro-ingest-worker:[\s\S]*?restart:\s*unless-stopped/i.test(productionText),
    productionWorkerCommandApplyLoopPresent: /while true; do pnpm run ingest:worker --apply/i.test(productionText),
    stagingWorkerServicePresent: /creditregulatorpro-staging-ingest-worker:/i.test(stagingText),
    composeRuntimeProofAccepted: false,
    note: "Compose inspection is recorded for operational awareness only; compose configuration is not accepted as runtime proof.",
  };
}

export function validateProductionWorkerRuntimeProofEvidence(evidence, {
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  maxAgeDays = PRODUCTION_WORKER_RUNTIME_PROOF_MAX_AGE_DAYS,
} = {}) {
  const errors = [];
  if (!isPlainObject(evidence)) {
    return {
      ok: false,
      accepted: false,
      productionProof: false,
      stagingProof: false,
      status: "failed",
      errors: ["Production worker runtime evidence must be a JSON object."],
      sensitiveFindings: [],
      blockerCoverage: {
        productionIngestRuntime: false,
        productionWorkflowParityAndRollback: false,
      },
    };
  }

  const sensitiveFindings = Array.from(new Set(scanProductionWorkerRuntimeSensitiveContent(JSON.stringify(evidence))));
  if (sensitiveFindings.length > 0) errors.push(`Sensitive content detected: ${sensitiveFindings.join(", ")}.`);
  if (detectDefaultOffEvidence(evidence)) {
    errors.push("Default-off or deferred activation evidence cannot be accepted as production runtime proof.");
  }

  const evidenceType = readRequiredString(evidence.evidenceType, errors, "evidenceType");
  if (evidenceType && evidenceType !== "PRODUCTION_WORKER_RUNTIME_PROOF") {
    errors.push("evidenceType must be PRODUCTION_WORKER_RUNTIME_PROOF.");
  }

  const environment = String(evidence.environment ?? "").trim().toLowerCase();
  if (!["staging", "production"].includes(environment)) errors.push("environment must be staging or production.");

  const mode = String(evidence.mode ?? "").trim().toLowerCase();
  if (!["apply", "dry-run"].includes(mode)) errors.push("mode must be apply or dry-run.");
  if (mode === "dry-run" || evidence.dryRunOnly === true) {
    errors.push("Dry-run-only production worker evidence cannot be accepted as production proof.");
  }

  const evidenceId = readRequiredString(evidence.evidenceId, errors, "evidenceId", SAFE_TOKEN_PATTERN);
  const machineActorId = readRequiredString(
    evidence.machineActorId ?? evidence.operatorId,
    errors,
    "machineActorId",
    SAFE_OPERATOR_ID_PATTERN,
  );
  const workerId = readRequiredString(evidence.workerId, errors, "workerId", SAFE_TOKEN_PATTERN);
  const source = readRequiredString(evidence.source, errors, "source", SAFE_TOKEN_PATTERN);
  const observedAt = parseTimestamp(evidence.timestamp, errors);
  const ageDays = observedAt ? evidenceAgeDays(observedAt, generatedAt) : null;
  const stale = ageDays != null && ageDays > maxAgeDays;
  const futureDated = ageDays != null && ageDays < -1;
  if (stale) errors.push(`Production worker runtime proof is stale: ${ageDays} days old; maximum allowed is ${maxAgeDays} days.`);
  if (futureDated) errors.push("Production worker runtime proof timestamp is future-dated.");

  const maxJobs = readPositiveInteger(evidence.maxJobs, errors, "maxJobs", {
    min: 1,
    max: PRODUCTION_WORKER_RUNTIME_PROOF_MAX_JOBS,
  });
  const processedCount = readPositiveInteger(evidence.processedCount, errors, "processedCount", { min: 0 });
  const failedCount = readPositiveInteger(evidence.failedCount, errors, "failedCount", { min: 0 });
  const deadLetterCount = readPositiveInteger(evidence.deadLetterCount, errors, "deadLetterCount", { min: 0 });
  const staleCount = readPositiveInteger(evidence.staleCount, errors, "staleCount", { min: 0 });
  const workerExitCode = readPositiveInteger(evidence.workerExitCode, errors, "workerExitCode", { min: 0, max: 255 });
  const queueBefore = readQueueDepth(evidence.queueDepth?.before, errors, "queueDepth.before");
  const queueAfter = readQueueDepth(evidence.queueDepth?.after, errors, "queueDepth.after");

  if (environment === "production") {
    if (processedCount !== null && processedCount < 1) errors.push("processedCount must be at least 1 for production runtime proof.");
    if (source !== PRODUCTION_WORKER_RUNTIME_SOURCE) errors.push(`source must be ${PRODUCTION_WORKER_RUNTIME_SOURCE}.`);
  }
  if (maxJobs !== null && processedCount !== null && processedCount > maxJobs) {
    errors.push("processedCount must not exceed maxJobs.");
  }
  if (failedCount !== 0) errors.push("failedCount must be 0.");
  if (deadLetterCount !== 0) errors.push("deadLetterCount must be 0.");
  if (staleCount !== 0) errors.push("staleCount must be 0.");
  if (workerExitCode !== 0) errors.push("workerExitCode must be 0.");
  if (queueBefore?.queued != null && queueAfter?.queued != null && queueAfter.queued > queueBefore.queued) {
    errors.push("queueDepth.after.queued must not exceed queueDepth.before.queued.");
  }

  const liveness = isPlainObject(evidence.workerLivenessCheck) ? evidence.workerLivenessCheck : {};
  requireTrue(liveness.observed, errors, "workerLivenessCheck.observed");
  if (isPlaceholder(liveness.status) || !SUCCESS_PATTERN.test(liveness.status)) {
    errors.push("workerLivenessCheck.status must record a safe passed/idle/succeeded result.");
  }

  const rollback = isPlainObject(evidence.rollbackStopVerification) ? evidence.rollbackStopVerification : {};
  requireTrue(rollback.verified, errors, "rollbackStopVerification.verified");
  if (isPlaceholder(rollback.evidenceSummary)) {
    errors.push("rollbackStopVerification.evidenceSummary is required.");
  }

  if (Object.prototype.hasOwnProperty.call(evidence, "operatorAcknowledgement")) {
    errors.push("operatorAcknowledgement is legacy manual proof and is not accepted; use machineAttestation.");
  }
  if (evidence.operatorAcknowledgementSigned === true) {
    errors.push("operatorAcknowledgementSigned is legacy manual proof and is not accepted.");
  }
  if (evidence.humanObserved === true) {
    errors.push("humanObserved must be false for machine production worker proof.");
  }
  if (evidence.manualApprovalRequired === true) {
    errors.push("manualApprovalRequired must be false for machine production worker proof.");
  }

  const machineAttestation = isPlainObject(evidence.machineAttestation) ? evidence.machineAttestation : {};
  requireTrue(machineAttestation.nonInteractive, errors, "machineAttestation.nonInteractive");
  requireTrue(machineAttestation.machineAttested, errors, "machineAttestation.machineAttested");
  if (machineAttestation.humanObserved === true) {
    errors.push("machineAttestation.humanObserved must be false.");
  }
  if (machineAttestation.manualApprovalRequired === true) {
    errors.push("machineAttestation.manualApprovalRequired must be false.");
  }
  if (isPlaceholder(machineAttestation.evidenceSummary)) {
    errors.push("machineAttestation.evidenceSummary is required.");
  }

  if (environment === "production") {
    const guard = isPlainObject(evidence.productionGuard) ? evidence.productionGuard : {};
    for (const [key, label] of [
      ["crpEnvProduction", "productionGuard.crpEnvProduction"],
      ["applyGuardAcknowledged", "productionGuard.applyGuardAcknowledged"],
      ["oneShot", "productionGuard.oneShot"],
      ["maxJobsMatched", "productionGuard.maxJobsMatched"],
      ["operatorTokenPresent", "productionGuard.operatorTokenPresent"],
      ["sourceMatched", "productionGuard.sourceMatched"],
      ["concurrencyOne", "productionGuard.concurrencyOne"],
      ["workerIdPresent", "productionGuard.workerIdPresent"],
    ]) {
      requireTrue(guard[key], errors, label);
    }
  }

  const attestations = isPlainObject(evidence.attestations) ? evidence.attestations : {};
  requireTrue(attestations.noRawReportBytesPrinted, errors, "attestations.noRawReportBytesPrinted");
  requireTrue(attestations.noPiiPrinted, errors, "attestations.noPiiPrinted");
  requireTrue(attestations.noSecretsPrinted, errors, "attestations.noSecretsPrinted");
  requireTrue(attestations.noSignedUrlsPrinted, errors, "attestations.noSignedUrlsPrinted");
  requireTrue(attestations.sanitizedForAudit, errors, "attestations.sanitizedForAudit");

  const evidenceAttachments = validateAttachments(rootDir, evidence, errors);
  const accepted = errors.length === 0;
  const productionProof = accepted && environment === "production";
  const stagingProof = accepted && environment === "staging";

  return {
    ok: accepted,
    accepted,
    status: accepted ? (productionProof ? "accepted-production" : "accepted-staging") : "failed",
    evidenceType: evidenceType ?? null,
    environment: environment || "unknown",
    mode,
    dryRunOnly: mode === "dry-run" || evidence.dryRunOnly === true,
    productionProof,
    stagingProof,
    currentOperationalProof: accepted && !stale && !futureDated,
    stale,
    futureDated,
    maxAgeDays,
    observedAt,
    ageDays,
    evidenceId,
    machineActorId,
    workerId,
    source,
    maxJobs,
    queueDepth: {
      before: queueBefore,
      after: queueAfter,
    },
    processedCount,
    failedCount,
    deadLetterCount,
    staleCount,
    workerExitCode,
    workerLivenessCheck: {
      observed: liveness.observed === true,
      status: safeSummary(liveness.status),
    },
    rollbackStopVerification: {
      verified: rollback.verified === true,
      evidenceSummary: isPlaceholder(rollback.evidenceSummary) ? null : safeSummary(rollback.evidenceSummary),
    },
    machineAttestation: {
      nonInteractive: machineAttestation.nonInteractive === true,
      machineAttested: machineAttestation.machineAttested === true,
      humanObserved: machineAttestation.humanObserved === true,
      manualApprovalRequired: machineAttestation.manualApprovalRequired === true,
      evidenceSummary: isPlaceholder(machineAttestation.evidenceSummary) ? null : safeSummary(machineAttestation.evidenceSummary),
    },
    evidenceAttachments,
    sensitiveFindings,
    errors,
    blockerCoverage: {
      productionIngestRuntime: productionProof,
      productionWorkflowParityAndRollback: productionProof && rollback.verified === true,
    },
  };
}

export function validateProductionWorkerRuntimeCliSafety({
  mode = "dry-run",
  maxJobs = 1,
  env = process.env,
} = {}) {
  const errors = [];
  const normalizedMode = String(mode ?? "dry-run").trim().toLowerCase();
  const parsedMaxJobs = Number(maxJobs);
  if (normalizedMode !== "apply") return { ok: true, errors: [] };

  if (env.CRP_ENV !== "production") errors.push("CRP_ENV=production");
  if (env.CRP_PRODUCTION_INGEST_WORKER_APPLY !== PRODUCTION_WORKER_RUNTIME_APPLY_GUARD) {
    errors.push("CRP_PRODUCTION_INGEST_WORKER_APPLY");
  }
  if (env.CRP_PRODUCTION_INGEST_WORKER_ONE_SHOT !== "true") errors.push("CRP_PRODUCTION_INGEST_WORKER_ONE_SHOT=true");
  if (env.CRP_PRODUCTION_INGEST_WORKER_MAX_JOBS !== String(parsedMaxJobs)) {
    errors.push("CRP_PRODUCTION_INGEST_WORKER_MAX_JOBS matching --max-jobs");
  }
  if (!Number.isInteger(parsedMaxJobs) || parsedMaxJobs < 1 || parsedMaxJobs > PRODUCTION_WORKER_RUNTIME_PROOF_MAX_JOBS) {
    errors.push(`--max-jobs 1-${PRODUCTION_WORKER_RUNTIME_PROOF_MAX_JOBS}`);
  }
  if (!env.CRP_PRODUCTION_INGEST_WORKER_OPERATOR || !SAFE_OPERATOR_ID_PATTERN.test(env.CRP_PRODUCTION_INGEST_WORKER_OPERATOR)) {
    errors.push("CRP_PRODUCTION_INGEST_WORKER_OPERATOR safe token");
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function buildProductionWorkerRuntimeProofTemplate({ generatedAt = new Date().toISOString() } = {}) {
  return {
    schemaVersion: 1,
    templateOnly: true,
    generatedAt,
    evidenceType: "PRODUCTION_WORKER_RUNTIME_PROOF",
    evidenceId: "PROD-WORKER-RUNTIME-YYYYMMDD-001",
    environment: "production",
    mode: "apply",
    dryRunOnly: false,
    machineActorId: "MACHINE_PROOF_RUNNER_1",
    timestamp: "2026-05-22T00:00:00Z",
    workerId: "production-bounded-ingest-worker",
    source: PRODUCTION_WORKER_RUNTIME_SOURCE,
    maxJobs: 1,
    queueDepth: {
      before: {
        total: 1,
        queued: 1,
        running: 0,
        failed: 0,
        deadLettered: 0,
        staleRunning: 0,
      },
      after: {
        total: 0,
        queued: 0,
        running: 0,
        failed: 0,
        deadLettered: 0,
        staleRunning: 0,
      },
    },
    processedCount: 1,
    failedCount: 0,
    deadLetterCount: 0,
    staleCount: 0,
    workerExitCode: 0,
    productionGuard: {
      crpEnvProduction: true,
      applyGuardAcknowledged: true,
      oneShot: true,
      maxJobsMatched: true,
      operatorTokenPresent: true,
      sourceMatched: true,
      concurrencyOne: true,
      workerIdPresent: true,
    },
    workerLivenessCheck: {
      observed: true,
      status: "passed - bounded one-shot worker exited or is idle after run",
    },
    rollbackStopVerification: {
      verified: true,
      evidenceSummary: "sanitized stop/rollback verification summary",
    },
    humanObserved: false,
    manualApprovalRequired: false,
    machineAttestation: {
      nonInteractive: true,
      machineAttested: true,
      humanObserved: false,
      manualApprovalRequired: false,
      evidenceSummary: "machine attested this is sanitized production worker runtime evidence",
    },
    attestations: {
      noRawReportBytesPrinted: true,
      noPiiPrinted: true,
      noSecretsPrinted: true,
      noSignedUrlsPrinted: true,
      sanitizedForAudit: true,
    },
    evidenceAttachments: [
      "docs/production-scale/evidence/REPLACE_WITH_SANITIZED_WORKER_RUNTIME_ATTACHMENT.md",
    ],
  };
}

export function renderProductionWorkerRuntimeProofTemplateMarkdown(template = buildProductionWorkerRuntimeProofTemplate()) {
  const lines = [
    "# Production Worker Runtime Proof Template",
    "",
    "Status: Template only. This is not accepted production worker runtime proof.",
    "",
    "A non-interactive machine proof runner must submit a sanitized filled JSON artifact after an explicitly guarded bounded production worker apply run. Dry-run, default-off, or deferred activation evidence is not accepted as production runtime proof.",
    "",
    "## Guarded Commands",
    "",
    `- Dry-run command: \`${PRODUCTION_WORKER_RUNTIME_DRY_RUN_COMMAND}\``,
    `- Apply command: \`${PRODUCTION_WORKER_RUNTIME_APPLY_COMMAND}\``,
    "",
    "## Required Production Apply Guards",
    "",
    ...PRODUCTION_WORKER_RUNTIME_REQUIRED_GUARDS.map((guard) => `- ${guard}`),
    "",
    "## JSON Shape",
    "",
    "```json",
    JSON.stringify(template, null, 2),
    "```",
  ];
  return `${lines.join("\n")}\n`;
}

export function buildProductionWorkerRuntimeProofReport({
  rootDir = process.cwd(),
  evidencePath = DEFAULT_PRODUCTION_WORKER_RUNTIME_PROOF_SUBMISSION_JSON_PATH,
  generatedAt = new Date().toISOString(),
  maxAgeDays = PRODUCTION_WORKER_RUNTIME_PROOF_MAX_AGE_DAYS,
  mode = "dry-run",
  maxJobs = 1,
  env = process.env,
} = {}) {
  const cliSafety = validateProductionWorkerRuntimeCliSafety({ mode, maxJobs, env });
  if (!cliSafety.ok) {
    return {
      reportName: "production-worker-runtime-proof",
      generatedAt,
      status: "failed",
      accepted: false,
      productionProof: false,
      stagingProof: false,
      currentOperationalProof: false,
      mode,
      evidencePath: normalizeRelativePath(evidencePath),
      validation: {
        ok: false,
        errors: [`Production worker runtime proof apply mode refused. Missing guards: ${cliSafety.errors.join(", ")}.`],
        sensitiveFindings: [],
      },
      blockerCoverage: {
        productionIngestRuntime: false,
        productionWorkflowParityAndRollback: false,
      },
      safety: runtimeProofSafety(),
      dockerComposeInspection: inspectDockerCompose(rootDir),
    };
  }

  const normalizedEvidencePath = normalizeRelativePath(evidencePath);
  const evidenceExists = existsSync(repoPath(rootDir, normalizedEvidencePath));
  if (!evidenceExists) {
    return {
      reportName: "production-worker-runtime-proof",
      generatedAt,
      status: "dry-run-only",
      accepted: false,
      productionProof: false,
      stagingProof: false,
      currentOperationalProof: false,
      mode: "dry-run",
      dryRunOnly: true,
      maxJobs: Number(maxJobs),
      dryRunCommand: PRODUCTION_WORKER_RUNTIME_DRY_RUN_COMMAND,
      applyCommand: PRODUCTION_WORKER_RUNTIME_APPLY_COMMAND,
      evidencePath: normalizedEvidencePath,
      templatePaths: {
        json: PRODUCTION_WORKER_RUNTIME_PROOF_TEMPLATE_JSON_PATH,
        markdown: PRODUCTION_WORKER_RUNTIME_PROOF_TEMPLATE_MD_PATH,
      },
      queueDepth: {
        before: null,
        after: null,
      },
      processedCount: 0,
      failedCount: 0,
      deadLetterCount: 0,
      staleCount: 0,
      validation: {
        ok: false,
        errors: [
          `No submitted production worker runtime proof found at ${normalizedEvidencePath}.`,
          "Default dry-run evidence is not accepted as production runtime proof.",
        ],
        sensitiveFindings: [],
        evidenceKind: "dry-run-only",
      },
      blockerCoverage: {
        productionIngestRuntime: false,
        productionWorkflowParityAndRollback: false,
      },
      safety: runtimeProofSafety(),
      dockerComposeInspection: inspectDockerCompose(rootDir),
    };
  }

  let evidence;
  try {
    evidence = readRootJson(rootDir, normalizedEvidencePath);
  } catch (error) {
    return {
      reportName: "production-worker-runtime-proof",
      generatedAt,
      status: "failed",
      accepted: false,
      productionProof: false,
      stagingProof: false,
      currentOperationalProof: false,
      mode,
      evidencePath: normalizedEvidencePath,
      validation: {
        ok: false,
        errors: [`Production worker runtime proof JSON could not be parsed: ${error instanceof Error ? error.message : String(error)}.`],
        sensitiveFindings: [],
      },
      blockerCoverage: {
        productionIngestRuntime: false,
        productionWorkflowParityAndRollback: false,
      },
      safety: runtimeProofSafety(),
      dockerComposeInspection: inspectDockerCompose(rootDir),
    };
  }

  const validation = validateProductionWorkerRuntimeProofEvidence(evidence, { rootDir, generatedAt, maxAgeDays });
  return {
    reportName: "production-worker-runtime-proof",
    generatedAt,
    status: validation.status,
    accepted: validation.accepted,
    productionProof: validation.productionProof,
    stagingProof: validation.stagingProof,
    currentOperationalProof: validation.currentOperationalProof,
    evidencePath: normalizedEvidencePath,
    evidenceType: validation.evidenceType,
    environment: validation.environment,
    mode: validation.mode,
    dryRunOnly: validation.dryRunOnly,
    evidenceId: validation.evidenceId,
    machineActorId: validation.machineActorId,
    workerId: validation.workerId,
    source: validation.source,
    observedAt: validation.observedAt,
    ageDays: validation.ageDays,
    maxAgeDays: validation.maxAgeDays,
    maxJobs: validation.maxJobs,
    queueDepth: validation.queueDepth,
    processedCount: validation.processedCount,
    failedCount: validation.failedCount,
    deadLetterCount: validation.deadLetterCount,
    staleCount: validation.staleCount,
    workerExitCode: validation.workerExitCode,
    workerLivenessCheck: validation.workerLivenessCheck,
    rollbackStopVerification: validation.rollbackStopVerification,
    machineAttestation: validation.machineAttestation,
    evidenceAttachments: validation.evidenceAttachments,
    validation: {
      ok: validation.ok,
      errors: validation.errors,
      sensitiveFindings: validation.sensitiveFindings,
      stale: validation.stale,
      futureDated: validation.futureDated,
    },
    blockerCoverage: validation.blockerCoverage,
    safety: runtimeProofSafety(),
    dockerComposeInspection: inspectDockerCompose(rootDir),
  };
}

function runtimeProofSafety() {
  return {
    productionJobsProcessedByCodex: false,
    productionDataMutatedByCodex: false,
    defaultDryRunMutatesQueue: false,
    runsProductionApplyByDefault: false,
    parserBehaviorChanged: false,
    ingestionSemanticsChanged: false,
    authBehaviorChanged: false,
    queueSemanticsChanged: false,
    printsSecrets: false,
    printsPii: false,
    printsRawReportBytes: false,
    printsSignedUrls: false,
    acceptsDryRunAsProductionProof: false,
    acceptsDefaultOffActivationAsProductionProof: false,
  };
}

export function renderProductionWorkerRuntimeProofMarkdown(report) {
  const lines = [
    "# Production Worker Runtime Proof",
    "",
    `Generated at: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Accepted: ${report.accepted ? "yes" : "no"}`,
    `Production proof: ${report.productionProof ? "yes" : "no"}`,
    `Staging proof: ${report.stagingProof ? "yes" : "no"}`,
    `Mode: ${report.mode ?? "unknown"}`,
    `Evidence path: \`${report.evidencePath ?? "not submitted"}\``,
    `Evidence ID: ${report.evidenceId ?? "not submitted"}`,
    `Environment: ${report.environment ?? "not submitted"}`,
    `Machine actor ID: ${report.machineActorId ?? "not submitted"}`,
    `Worker ID: ${report.workerId ?? "not submitted"}`,
    `Source: ${report.source ?? "not submitted"}`,
    `Observed at: ${report.observedAt ?? "not submitted"}`,
    `Evidence age days: ${report.ageDays ?? "not available"}`,
    "",
    "## Queue Depth",
    "",
    `- Before queued/running/failed/dead-lettered/stale: ${queueDepthSummary(report.queueDepth?.before)}`,
    `- After queued/running/failed/dead-lettered/stale: ${queueDepthSummary(report.queueDepth?.after)}`,
    "",
    "## Runtime Counts",
    "",
    `- Max jobs: ${report.maxJobs ?? "not submitted"}`,
    `- Processed count: ${report.processedCount ?? "not submitted"}`,
    `- Failed count: ${report.failedCount ?? "not submitted"}`,
    `- Dead-letter count: ${report.deadLetterCount ?? "not submitted"}`,
    `- Stale count: ${report.staleCount ?? "not submitted"}`,
    `- Worker exit code: ${report.workerExitCode ?? "not submitted"}`,
    "",
    "## Stop/Rollback",
    "",
    `- Worker liveness observed: ${report.workerLivenessCheck?.observed ? "yes" : "no"}`,
    `- Worker liveness status: ${report.workerLivenessCheck?.status ?? "not submitted"}`,
    `- Rollback/stop verified: ${report.rollbackStopVerification?.verified ? "yes" : "no"}`,
    "",
    "## Blocker Coverage",
    "",
    `- Blocker 2 production ingest runtime: ${report.blockerCoverage?.productionIngestRuntime ? "accepted" : "not accepted"}`,
    `- Blocker 11 workflow parity and rollback: ${report.blockerCoverage?.productionWorkflowParityAndRollback ? "accepted" : "not accepted"}`,
    "",
    "## Compose Inspection",
    "",
    `- Production worker service present: ${report.dockerComposeInspection?.productionWorkerServicePresent ? "yes" : "no"}`,
    `- Production worker restart unless-stopped: ${report.dockerComposeInspection?.productionWorkerRestartUnlessStopped ? "yes" : "no"}`,
    `- Compose accepted as runtime proof: ${report.dockerComposeInspection?.composeRuntimeProofAccepted ? "yes" : "no"}`,
    "",
    "## Validation",
    "",
  ];

  if (report.validation?.errors?.length) {
    lines.push(...report.validation.errors.map((error) => `- ${safeSummary(error)}`));
  } else {
    lines.push("- Production worker runtime proof passed strict acceptance validation.");
  }

  lines.push(
    "",
    "## Safety",
    "",
    "- This command does not run production apply by default.",
    "- Dry-run, default-off activation, and deferred activation evidence are not production runtime proof.",
    "- Evidence output contains sanitized counts and summaries only.",
    "- Parser truth, ingestion behavior, auth behavior, and queue semantics are unchanged.",
  );

  return `${lines.join("\n")}\n`;
}

function queueDepthSummary(value) {
  if (!value) return "not submitted";
  return `${value.queued ?? "n/a"}/${value.running ?? "n/a"}/${value.failed ?? "n/a"}/${value.deadLettered ?? "n/a"}/${value.staleRunning ?? "n/a"}`;
}

export function writeProductionWorkerRuntimeProof(report, { rootDir = process.cwd() } = {}) {
  writeRootText(rootDir, PRODUCTION_WORKER_RUNTIME_PROOF_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  writeRootText(rootDir, PRODUCTION_WORKER_RUNTIME_PROOF_MD_PATH, renderProductionWorkerRuntimeProofMarkdown(report));
  return {
    markdownPath: PRODUCTION_WORKER_RUNTIME_PROOF_MD_PATH,
    jsonPath: PRODUCTION_WORKER_RUNTIME_PROOF_JSON_PATH,
  };
}

export function writeProductionWorkerRuntimeProofTemplate({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
} = {}) {
  const template = buildProductionWorkerRuntimeProofTemplate({ generatedAt });
  writeRootText(rootDir, PRODUCTION_WORKER_RUNTIME_PROOF_TEMPLATE_JSON_PATH, `${JSON.stringify(template, null, 2)}\n`);
  writeRootText(rootDir, PRODUCTION_WORKER_RUNTIME_PROOF_TEMPLATE_MD_PATH, renderProductionWorkerRuntimeProofTemplateMarkdown(template));
  return {
    markdownPath: PRODUCTION_WORKER_RUNTIME_PROOF_TEMPLATE_MD_PATH,
    jsonPath: PRODUCTION_WORKER_RUNTIME_PROOF_TEMPLATE_JSON_PATH,
  };
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) return null;
  return value;
}

function printHelp() {
  console.log([
    "Usage: pnpm run production-worker:runtime-proof -- [options]",
    "",
    "Writes sanitized production worker runtime proof evidence. Defaults to dry-run-only reporting and does not run production jobs.",
    "",
    "Options:",
    "  --evidence <path>       Submitted sanitized runtime proof JSON.",
    "  --write-template        Write production-worker-runtime-proof-template.{json,md}.",
    "  --dry-run               Default mode. Does not accept production runtime proof.",
    "  --apply                 Refuses unless explicit production worker guard env is present.",
    "  --max-jobs <1-5>        Bounded max jobs value for guard validation.",
    "  --max-age-days <days>   Maximum accepted proof age.",
    "  --root <path>           Project root.",
    "  --json                  Print JSON report.",
    "  --no-write              Do not write latest output files.",
  ].join("\n"));
}

function parseArgs(args) {
  const maxJobsValue = valueAfter(args, "--max-jobs");
  const maxAgeValue = valueAfter(args, "--max-age-days");
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }
  return {
    rootDir: path.resolve(valueAfter(args, "--root") ?? process.cwd()),
    evidencePath: valueAfter(args, "--evidence") ?? DEFAULT_PRODUCTION_WORKER_RUNTIME_PROOF_SUBMISSION_JSON_PATH,
    mode: args.includes("--apply") ? "apply" : "dry-run",
    maxJobs: maxJobsValue ? Number(maxJobsValue) : 1,
    maxAgeDays: maxAgeValue ? Number(maxAgeValue) : PRODUCTION_WORKER_RUNTIME_PROOF_MAX_AGE_DAYS,
    json: args.includes("--json"),
    noWrite: args.includes("--no-write"),
    writeTemplate: args.includes("--write-template"),
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.writeTemplate) {
    const outputs = writeProductionWorkerRuntimeProofTemplate({ rootDir: options.rootDir });
    console.log("Production worker runtime proof templates written.");
    console.log(`Markdown: ${outputs.markdownPath}`);
    console.log(`JSON: ${outputs.jsonPath}`);
    return;
  }
  if (!Number.isFinite(options.maxAgeDays) || options.maxAgeDays < 1) {
    throw new Error("--max-age-days must be a positive number.");
  }
  const report = buildProductionWorkerRuntimeProofReport(options);
  const outputs = options.noWrite ? null : writeProductionWorkerRuntimeProof(report, { rootDir: options.rootDir });
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("Production worker runtime proof generated.");
    console.log(`Status: ${report.status}`);
    console.log(`Accepted: ${report.accepted ? "yes" : "no"}`);
    console.log(`Production proof: ${report.productionProof ? "yes" : "no"}`);
    for (const error of report.validation?.errors ?? []) console.log(`[UNRESOLVED] ${safeSummary(error)}`);
    if (outputs) {
      console.log(`Markdown: ${outputs.markdownPath}`);
      console.log(`JSON: ${outputs.jsonPath}`);
    }
  }
  if (report.status === "failed") process.exitCode = 1;
}

if (process.argv[1] && existsSync(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`[ERROR] ${error instanceof Error ? safeSummary(error.message) : safeSummary(String(error))}`);
    process.exitCode = 1;
  }
}
