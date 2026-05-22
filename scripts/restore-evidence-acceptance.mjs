import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_RESTORE_EVIDENCE_MAX_AGE_DAYS,
  scanRestoreDrillEvidenceSensitiveContent,
} from "./staging-backup-restore-checklist.mjs";

export const RESTORE_EVIDENCE_TEMPLATE_JSON_PATH =
  "docs/production-scale/evidence/restore-evidence-template.json";
export const RESTORE_EVIDENCE_TEMPLATE_MD_PATH =
  "docs/production-scale/evidence/restore-evidence-template.md";
export const DEFAULT_RESTORE_EVIDENCE_SUBMISSION_JSON_PATH =
  "docs/production-scale/evidence/restore-evidence-submission.json";
export const RESTORE_EVIDENCE_ACCEPTANCE_JSON_PATH =
  "docs/production-scale/evidence/latest-restore-acceptance.json";
export const RESTORE_EVIDENCE_ACCEPTANCE_MD_PATH =
  "docs/production-scale/evidence/latest-restore-acceptance.md";

export const RESTORE_EVIDENCE_REQUIRED_POST_RESTORE_CHECKS = [
  "authSession",
  "packetPdfRetrieval",
  "responseQueue",
  "cleanupLifecycle",
  "rollbackStopVerification",
];

export const RESTORE_EVIDENCE_ALLOWED_RESTORE_TYPES = new Set([
  "dump/restore",
  "backup restore",
  "archive restore",
  "approved equivalent",
]);

const SAFE_OPERATOR_ID_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,31}$/i;
const SUCCESS_PATTERN = /\b(pass|passed|success|successful|succeeded|verified|complete|completed|met|within)\b/i;
const PLACEHOLDER_PATTERN = /^(?:tbd|todo|n\/a|na|none|null|-|replace[_ -]?me|example)$/i;
const SAFE_ATTACHMENT_PREFIX = "docs/production-scale/evidence/";

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (path.isAbsolute(normalized)) return normalized;
  return path.join(rootDir, ...normalized.split("/").filter(Boolean));
}

function writeRootText(rootDir, relativePath, text) {
  const absolutePath = repoPath(rootDir, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, text, "utf8");
}

function readRootText(rootDir, relativePath) {
  return readFileSync(repoPath(rootDir, relativePath), "utf8");
}

function readJsonFile(rootDir, relativePath) {
  return JSON.parse(readRootText(rootDir, relativePath));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPlaceholder(value) {
  const normalized = String(value ?? "").trim();
  return !normalized || PLACEHOLDER_PATTERN.test(normalized);
}

function redactSensitiveText(value) {
  return String(value ?? "")
    .replace(/\b(?:postgres|postgresql|mysql|mongodb):\/\/[^\s)]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gi, "[REDACTED_PRIVATE_KEY]")
    .replace(/\b(?:sk|ghp|github_pat|xox[baprs])[_-][A-Za-z0-9_-]{12,}\b/gi, "[REDACTED_TOKEN]")
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "[REDACTED_ACCESS_KEY]")
    .replace(/\b(?:access[_-]?key(?:[_-]?id)?|secret[_-]?access[_-]?key)\s*[:=]\s*[A-Za-z0-9/+=_-]{12,}\b/gi, "[REDACTED_ACCESS_KEY]")
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

function safeSummary(value) {
  const redacted = redactSensitiveText(value).replace(/\s+/g, " ").trim();
  if (redacted.length <= 180) return redacted;
  return `${redacted.slice(0, 177)}...`;
}

function addRequiredStringError(errors, evidence, field, label = field) {
  if (isPlaceholder(evidence?.[field])) {
    errors.push(`${label} is required and must not be a placeholder.`);
    return null;
  }
  return String(evidence[field]).trim();
}

function addRequiredBooleanError(errors, value, label) {
  if (value !== true) errors.push(`${label} must be true.`);
}

function parseTimestamp(value, errors, label) {
  if (isPlaceholder(value)) {
    errors.push(`${label} is required.`);
    return null;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    errors.push(`${label} must be parseable ISO-like timestamp.`);
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

function validateDuration(value, errors, fieldName) {
  if (!isPlainObject(value)) {
    errors.push(`${fieldName} must include targetMinutes, actualMinutes, and status.`);
    return null;
  }
  const targetMinutes = Number(value.targetMinutes);
  const actualMinutes = Number(value.actualMinutes);
  const status = String(value.status ?? "").trim();
  if (!Number.isFinite(targetMinutes) || targetMinutes <= 0) {
    errors.push(`${fieldName}.targetMinutes must be a positive number.`);
  }
  if (!Number.isFinite(actualMinutes) || actualMinutes < 0) {
    errors.push(`${fieldName}.actualMinutes must be a non-negative number.`);
  }
  if (!SUCCESS_PATTERN.test(status)) {
    errors.push(`${fieldName}.status must record a passed/verified result.`);
  }
  if (Number.isFinite(targetMinutes) && Number.isFinite(actualMinutes) && actualMinutes > targetMinutes) {
    errors.push(`${fieldName}.actualMinutes must be within targetMinutes for blocker-closing evidence.`);
  }
  return {
    targetMinutes: Number.isFinite(targetMinutes) ? targetMinutes : null,
    actualMinutes: Number.isFinite(actualMinutes) ? actualMinutes : null,
    status: safeSummary(status),
  };
}

function validatePostRestoreChecks(evidence, errors) {
  const checks = isPlainObject(evidence.postRestoreChecks) ? evidence.postRestoreChecks : {};
  if (!isPlainObject(evidence.postRestoreChecks)) {
    errors.push("postRestoreChecks must be an object.");
  }

  const summary = {};
  for (const key of RESTORE_EVIDENCE_REQUIRED_POST_RESTORE_CHECKS) {
    const check = checks[key];
    if (!isPlainObject(check)) {
      errors.push(`postRestoreChecks.${key} is required.`);
      summary[key] = { status: "missing", evidenceSummary: null };
      continue;
    }
    const status = String(check.status ?? "").trim();
    const evidenceSummary = String(check.evidenceSummary ?? check.summary ?? "").trim();
    if (!SUCCESS_PATTERN.test(status)) {
      errors.push(`postRestoreChecks.${key}.status must record a passed/verified result.`);
    }
    if (isPlaceholder(evidenceSummary)) {
      errors.push(`postRestoreChecks.${key}.evidenceSummary is required and must be sanitized.`);
    }
    summary[key] = {
      status: safeSummary(status || "missing"),
      evidenceSummary: isPlaceholder(evidenceSummary) ? null : safeSummary(evidenceSummary),
    };
  }
  return summary;
}

function validateAttachments(rootDir, evidence, errors) {
  if (!Array.isArray(evidence.evidenceAttachments) || evidence.evidenceAttachments.length === 0) {
    errors.push("evidenceAttachments must include at least one sanitized artifact path.");
    return [];
  }

  return evidence.evidenceAttachments.map((attachment, index) => {
    const normalized = normalizeRelativePath(attachment);
    if (isPlaceholder(normalized)) {
      errors.push(`evidenceAttachments[${index}] must not be a placeholder.`);
    }
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

function detectEvidenceKind(value) {
  const text = JSON.stringify(value ?? {}).toLowerCase();
  if (/\bsimulated\b/.test(text) || value?.simulatedOnly === true) return "simulated";
  if (/\bchecklist[-_ ]?only\b/.test(text) || value?.checklistOnly === true) return "checklist-only";
  if (/\btemplate[-_ ]?only\b/.test(text) || value?.templateOnly === true) return "template-only";
  return "sanitized-legacy";
}

export function validateRestoreEvidenceSubmission(evidence, {
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  maxAgeDays = DEFAULT_RESTORE_EVIDENCE_MAX_AGE_DAYS,
} = {}) {
  const errors = [];
  if (!isPlainObject(evidence)) {
    return {
      ok: false,
      accepted: false,
      productionProof: false,
      stagingProof: false,
      status: "failed",
      errors: ["Restore evidence must be a JSON object."],
      sensitiveFindings: [],
      blockerCoverage: {
        disasterRecoveryRestoreDrill: false,
        retentionArchiveRestore: false,
      },
    };
  }

  const rawText = JSON.stringify(evidence);
  const sensitiveFindings = Array.from(new Set(scanRestoreDrillEvidenceSensitiveContent(rawText)));
  if (sensitiveFindings.length > 0) {
    errors.push(`Sensitive content detected: ${sensitiveFindings.join(", ")}.`);
  }

  const evidenceKind = detectEvidenceKind(evidence);
  if (evidenceKind === "simulated") errors.push("Simulated-only restore evidence cannot be accepted as production proof.");
  if (evidenceKind === "checklist-only") errors.push("Checklist-only restore evidence cannot be accepted as production proof.");
  if (evidenceKind === "template-only") errors.push("Template-only restore evidence cannot be accepted as production proof.");

  const evidenceId = addRequiredStringError(errors, evidence, "evidenceId");
  const environment = String(evidence.environment ?? "").trim().toLowerCase();
  if (!["staging", "production"].includes(environment)) {
    errors.push("environment must be staging or production.");
  }

  const restoreType = String(evidence.restoreType ?? "").trim().toLowerCase();
  if (!RESTORE_EVIDENCE_ALLOWED_RESTORE_TYPES.has(restoreType)) {
    errors.push("restoreType must be dump/restore, backup restore, archive restore, or approved equivalent.");
  }
  if (restoreType === "approved equivalent" && isPlaceholder(evidence.approvedEquivalentReason)) {
    errors.push("approvedEquivalentReason is required for approved equivalent restore type.");
  }

  const operatorId = addRequiredStringError(errors, evidence, "operatorId", "operatorId/operator initials");
  if (operatorId && !SAFE_OPERATOR_ID_PATTERN.test(operatorId)) {
    errors.push("operatorId must be initials or an opaque operator ID without personal contact details.");
  }

  const observedAt = parseTimestamp(evidence.timestamp, errors, "timestamp");
  const sourceBackupIdentifier = addRequiredStringError(errors, evidence, "sourceBackupIdentifier");
  const targetRestoreEnvironment = addRequiredStringError(errors, evidence, "targetRestoreEnvironment");
  const measuredRpo = validateDuration(evidence.measuredRpo, errors, "measuredRpo");
  const measuredRto = validateDuration(evidence.measuredRto, errors, "measuredRto");
  const postRestoreChecks = validatePostRestoreChecks(evidence, errors);
  const evidenceAttachments = validateAttachments(rootDir, evidence, errors);

  if (evidence.humanObserved === true) {
    errors.push("humanObserved evidence is legacy and cannot be accepted as production certification proof; use restore:machine-proof.");
  }
  if (evidence.manualApprovalRequired === true) {
    errors.push("manualApprovalRequired must be false for production certification proof.");
  }
  if (evidence.restoreCompleted !== true) errors.push("restoreCompleted must be true.");
  addRequiredBooleanError(errors, evidence.attestations?.noRawReportBytesPrinted, "attestations.noRawReportBytesPrinted");
  addRequiredBooleanError(errors, evidence.attestations?.noPiiPrinted, "attestations.noPiiPrinted");
  addRequiredBooleanError(errors, evidence.attestations?.noSecretsPrinted, "attestations.noSecretsPrinted");
  addRequiredBooleanError(errors, evidence.attestations?.sanitizedForAudit, "attestations.sanitizedForAudit");

  const ageDays = observedAt ? evidenceAgeDays(observedAt, generatedAt) : null;
  const futureDated = ageDays != null && ageDays < -1;
  const stale = ageDays != null && ageDays > maxAgeDays;
  if (futureDated) errors.push("Restore evidence timestamp is future-dated.");
  if (stale) errors.push(`Restore evidence is stale: ${ageDays} days old; maximum allowed is ${maxAgeDays} days.`);

  const accepted = errors.length === 0;
  const stagingProof = accepted && environment === "staging";
  const productionProof = accepted && environment === "production";
  const currentOperationalProof = accepted && !stale && !futureDated;

  return {
    ok: accepted,
    accepted,
    status: accepted ? (productionProof ? "accepted-production" : "accepted-staging") : "failed",
    evidenceKind,
    environment: environment || "unknown",
    productionProof,
    stagingProof,
    currentOperationalProof,
    stale,
    futureDated,
    maxAgeDays,
    observedAt,
    ageDays,
    evidenceId: safeSummary(evidenceId),
    restoreType: safeSummary(restoreType),
    operatorId: safeSummary(operatorId),
    sourceBackupIdentifier: safeSummary(sourceBackupIdentifier),
    targetRestoreEnvironment: safeSummary(targetRestoreEnvironment),
    measuredRpo,
    measuredRto,
    postRestoreChecks,
    evidenceAttachments,
    sensitiveFindings,
    errors,
    blockerCoverage: {
      disasterRecoveryRestoreDrill: productionProof && currentOperationalProof,
      retentionArchiveRestore: productionProof && currentOperationalProof && restoreType === "archive restore",
    },
  };
}

export function buildRestoreEvidenceTemplate({ generatedAt = new Date().toISOString() } = {}) {
  return {
    schemaVersion: 1,
    templateOnly: true,
    generatedAt,
    evidenceId: "REPLACE_WITH_SAFE_EVIDENCE_ID",
    environment: "production",
    restoreType: "dump/restore",
    approvedEquivalentReason: null,
    humanObserved: false,
    manualApprovalRequired: false,
    restoreCompleted: true,
    operatorId: "OPS1",
    timestamp: "2026-05-22T00:00:00Z",
    sourceBackupIdentifier: "sanitized-backup-id",
    targetRestoreEnvironment: "sanitized-restore-target",
    measuredRpo: {
      targetMinutes: 15,
      actualMinutes: 5,
      status: "passed",
    },
    measuredRto: {
      targetMinutes: 30,
      actualMinutes: 12,
      status: "passed",
    },
    postRestoreChecks: {
      authSession: {
        status: "passed",
        evidenceSummary: "sanitized auth/session lifecycle check summary; no cookies or tokens",
      },
      packetPdfRetrieval: {
        status: "passed",
        evidenceSummary: "sanitized packet PDF retrieval summary; no raw PDF bytes",
      },
      responseQueue: {
        status: "passed",
        evidenceSummary: "sanitized response queue/dead-letter check summary",
      },
      cleanupLifecycle: {
        status: "passed",
        evidenceSummary: "sanitized cleanup and lifecycle verification summary",
      },
      rollbackStopVerification: {
        status: "passed",
        evidenceSummary: "sanitized rollback or stop verification summary",
      },
    },
    attestations: {
      noRawReportBytesPrinted: true,
      noPiiPrinted: true,
      noSecretsPrinted: true,
      sanitizedForAudit: true,
    },
    evidenceAttachments: [
      "docs/production-scale/evidence/REPLACE_WITH_SANITIZED_RESTORE_ATTACHMENT.md",
    ],
  };
}

export function renderRestoreEvidenceTemplateMarkdown(template = buildRestoreEvidenceTemplate()) {
  const lines = [
    "# Restore Evidence Acceptance Template",
    "",
    "Status: Template only. This is not accepted restore proof.",
    "",
    "Legacy manual submissions are non-certifying. Production certification must use restore:machine-proof with non-interactive machine attestation.",
    "",
    "## Required Fields",
    "",
    "- evidenceId",
    "- environment: staging or production",
    "- restoreType: dump/restore, backup restore, archive restore, or approved equivalent",
    "- operatorId: legacy opaque ID only; not accepted as production certification proof",
    "- timestamp",
    "- sourceBackupIdentifier",
    "- targetRestoreEnvironment",
    "- measuredRpo.targetMinutes, measuredRpo.actualMinutes, measuredRpo.status",
    "- measuredRto.targetMinutes, measuredRto.actualMinutes, measuredRto.status",
    "- postRestoreChecks.authSession",
    "- postRestoreChecks.packetPdfRetrieval",
    "- postRestoreChecks.responseQueue",
    "- postRestoreChecks.cleanupLifecycle",
    "- postRestoreChecks.rollbackStopVerification",
    "- attestations.noRawReportBytesPrinted",
    "- attestations.noPiiPrinted",
    "- attestations.noSecretsPrinted",
    "- evidenceAttachments under docs/production-scale/evidence/",
    "",
    "## JSON Shape",
    "",
    "```json",
    JSON.stringify(template, null, 2),
    "```",
  ];
  return `${lines.join("\n")}\n`;
}

export function buildRestoreEvidenceAcceptanceReport({
  rootDir = process.cwd(),
  evidencePath = DEFAULT_RESTORE_EVIDENCE_SUBMISSION_JSON_PATH,
  generatedAt = new Date().toISOString(),
  maxAgeDays = DEFAULT_RESTORE_EVIDENCE_MAX_AGE_DAYS,
} = {}) {
  const normalizedEvidencePath = normalizeRelativePath(evidencePath);
  if (!existsSync(repoPath(rootDir, normalizedEvidencePath))) {
    return {
      reportName: "restore-evidence-acceptance",
      generatedAt,
      status: "not-submitted",
      accepted: false,
      productionProof: false,
      stagingProof: false,
      currentOperationalProof: false,
      evidencePath: normalizedEvidencePath,
      templatePaths: {
        json: RESTORE_EVIDENCE_TEMPLATE_JSON_PATH,
        markdown: RESTORE_EVIDENCE_TEMPLATE_MD_PATH,
      },
      validation: {
        ok: false,
        errors: [`No restore evidence submission found at ${normalizedEvidencePath}.`],
        sensitiveFindings: [],
      },
      blockerCoverage: {
        disasterRecoveryRestoreDrill: false,
        retentionArchiveRestore: false,
      },
      safety: {
        readsSecrets: false,
        printsSecrets: false,
        runsDump: false,
        runsRestore: false,
        modifiesProduction: false,
        acceptsSimulatedEvidenceAsProductionProof: false,
      },
    };
  }

  let evidence;
  try {
    evidence = readJsonFile(rootDir, normalizedEvidencePath);
  } catch (error) {
    return {
      reportName: "restore-evidence-acceptance",
      generatedAt,
      status: "failed",
      accepted: false,
      productionProof: false,
      stagingProof: false,
      currentOperationalProof: false,
      evidencePath: normalizedEvidencePath,
      validation: {
        ok: false,
        errors: [`Restore evidence JSON could not be parsed: ${error instanceof Error ? error.message : String(error)}.`],
        sensitiveFindings: [],
      },
      blockerCoverage: {
        disasterRecoveryRestoreDrill: false,
        retentionArchiveRestore: false,
      },
      safety: {
        readsSecrets: false,
        printsSecrets: false,
        runsDump: false,
        runsRestore: false,
        modifiesProduction: false,
        acceptsSimulatedEvidenceAsProductionProof: false,
      },
    };
  }

  const validation = validateRestoreEvidenceSubmission(evidence, { rootDir, generatedAt, maxAgeDays });
  return {
    reportName: "restore-evidence-acceptance",
    generatedAt,
    status: validation.status,
    accepted: validation.accepted,
    productionProof: validation.productionProof,
    stagingProof: validation.stagingProof,
    currentOperationalProof: validation.currentOperationalProof,
    evidencePath: normalizedEvidencePath,
    evidenceId: validation.evidenceId,
    environment: validation.environment,
    restoreType: validation.restoreType,
    operatorId: validation.operatorId,
    observedAt: validation.observedAt,
    ageDays: validation.ageDays,
    maxAgeDays: validation.maxAgeDays,
    sourceBackupIdentifier: validation.sourceBackupIdentifier,
    targetRestoreEnvironment: validation.targetRestoreEnvironment,
    measuredRpo: validation.measuredRpo,
    measuredRto: validation.measuredRto,
    postRestoreChecks: validation.postRestoreChecks,
    evidenceAttachments: validation.evidenceAttachments,
    validation: {
      ok: validation.ok,
      errors: validation.errors,
      sensitiveFindings: validation.sensitiveFindings,
      evidenceKind: validation.evidenceKind,
      stale: validation.stale,
      futureDated: validation.futureDated,
    },
    blockerCoverage: validation.blockerCoverage,
    safety: {
      readsSecrets: false,
      printsSecrets: false,
      runsDump: false,
      runsRestore: false,
      modifiesProduction: false,
      acceptsSimulatedEvidenceAsProductionProof: false,
    },
  };
}

export function renderRestoreEvidenceAcceptanceMarkdown(report) {
  const lines = [
    "# Restore Evidence Acceptance",
    "",
    `Generated at: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Accepted: ${report.accepted ? "yes" : "no"}`,
    `Production proof: ${report.productionProof ? "yes" : "no"}`,
    `Staging proof: ${report.stagingProof ? "yes" : "no"}`,
    `Evidence path: ${report.evidencePath ?? "not submitted"}`,
    `Environment: ${report.environment ?? "not submitted"}`,
    `Restore type: ${report.restoreType ?? "not submitted"}`,
    `Evidence ID: ${report.evidenceId ?? "not submitted"}`,
    `Operator ID: ${report.operatorId ?? "not submitted"}`,
    `Observed at: ${report.observedAt ?? "not submitted"}`,
    `Evidence age days: ${report.ageDays ?? "not available"}`,
    "",
    "## Blocker Coverage",
    "",
    `- Blocker 1 disaster recovery restore drill: ${
      report.blockerCoverage?.disasterRecoveryRestoreDrill ? "accepted production proof" : "not accepted"
    }`,
    `- Blocker 22 retention archive/restore recoverability: ${
      report.blockerCoverage?.retentionArchiveRestore ? "accepted production proof" : "not accepted"
    }`,
    "",
    "## RPO/RTO",
    "",
    `- RPO target/actual/status: ${report.measuredRpo ? `${report.measuredRpo.targetMinutes}/${report.measuredRpo.actualMinutes}/${report.measuredRpo.status}` : "not accepted"}`,
    `- RTO target/actual/status: ${report.measuredRto ? `${report.measuredRto.targetMinutes}/${report.measuredRto.actualMinutes}/${report.measuredRto.status}` : "not accepted"}`,
    "",
    "## Post-Restore Checks",
    "",
    ...RESTORE_EVIDENCE_REQUIRED_POST_RESTORE_CHECKS.map((key) => {
      const check = report.postRestoreChecks?.[key];
      return `- ${key}: ${check?.status ?? "missing"}`;
    }),
    "",
    "## Attachments",
    "",
    ...(report.evidenceAttachments?.length
      ? report.evidenceAttachments.map((attachment) => `- \`${attachment}\``)
      : ["- none"]),
    "",
    "## Validation",
    "",
  ];

  if (report.validation?.errors?.length) {
    lines.push(...report.validation.errors.map((error) => `- ${safeSummary(error)}`));
  } else {
    lines.push("- Restore evidence passed strict acceptance validation.");
  }

  lines.push(
    "",
    "## Safety",
    "",
    "- This command does not dump or restore data.",
    "- This command does not access backups.",
    "- This command does not mutate production.",
    "- Staging evidence can be recorded but is not production promotion proof.",
    "- Simulated, checklist-only, stale, or sensitive evidence is rejected.",
  );

  return `${lines.join("\n")}\n`;
}

export function writeRestoreEvidenceAcceptanceReport(report, { rootDir = process.cwd() } = {}) {
  writeRootText(rootDir, RESTORE_EVIDENCE_ACCEPTANCE_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  writeRootText(rootDir, RESTORE_EVIDENCE_ACCEPTANCE_MD_PATH, renderRestoreEvidenceAcceptanceMarkdown(report));
  return {
    jsonPath: RESTORE_EVIDENCE_ACCEPTANCE_JSON_PATH,
    markdownPath: RESTORE_EVIDENCE_ACCEPTANCE_MD_PATH,
  };
}

export function writeRestoreEvidenceTemplates({ rootDir = process.cwd(), generatedAt = new Date().toISOString() } = {}) {
  const template = buildRestoreEvidenceTemplate({ generatedAt });
  writeRootText(rootDir, RESTORE_EVIDENCE_TEMPLATE_JSON_PATH, `${JSON.stringify(template, null, 2)}\n`);
  writeRootText(rootDir, RESTORE_EVIDENCE_TEMPLATE_MD_PATH, renderRestoreEvidenceTemplateMarkdown(template));
  return {
    jsonPath: RESTORE_EVIDENCE_TEMPLATE_JSON_PATH,
    markdownPath: RESTORE_EVIDENCE_TEMPLATE_MD_PATH,
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
    "Usage: node scripts/restore-evidence-acceptance.mjs [options]",
    "",
    "Validates legacy sanitized restore evidence as non-certifying and writes latest-restore-acceptance.{json,md}.",
    "This command does not dump, restore, access backups, or mutate production.",
    "",
    "Options:",
    "  --evidence <path>       Evidence JSON path. Defaults to docs/production-scale/evidence/restore-evidence-submission.json.",
    "  --root <path>           Project root. Defaults to current working directory.",
    "  --max-age-days <days>   Maximum accepted evidence age. Defaults to current repo policy.",
    "  --write-template        Write restore-evidence-template.{json,md}.",
    "  --no-write              Validate without writing latest acceptance outputs.",
    "  --json                  Print JSON report.",
  ].join("\n"));
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const rootDir = path.resolve(valueAfter(args, "--root") ?? process.cwd());
  const generatedAt = valueAfter(args, "--generated-at") ?? new Date().toISOString();
  if (args.includes("--write-template")) {
    const outputs = writeRestoreEvidenceTemplates({ rootDir, generatedAt });
    console.log("Restore evidence templates written.");
    console.log(`Markdown: ${outputs.markdownPath}`);
    console.log(`JSON: ${outputs.jsonPath}`);
    return;
  }

  const maxAgeValue = valueAfter(args, "--max-age-days");
  const maxAgeDays = maxAgeValue ? Number(maxAgeValue) : DEFAULT_RESTORE_EVIDENCE_MAX_AGE_DAYS;
  if (!Number.isFinite(maxAgeDays) || maxAgeDays < 1) {
    console.error("Restore evidence acceptance failed.");
    console.error("[FAIL] --max-age-days must be a positive number.");
    process.exit(1);
  }

  const report = buildRestoreEvidenceAcceptanceReport({
    rootDir,
    evidencePath: valueAfter(args, "--evidence") ?? DEFAULT_RESTORE_EVIDENCE_SUBMISSION_JSON_PATH,
    generatedAt,
    maxAgeDays,
  });
  const outputs = args.includes("--no-write") ? null : writeRestoreEvidenceAcceptanceReport(report, { rootDir });

  if (args.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("Restore evidence acceptance generated.");
    console.log(`Status: ${report.status}`);
    console.log(`Accepted: ${report.accepted ? "yes" : "no"}`);
    console.log(`Production proof: ${report.productionProof ? "yes" : "no"}`);
    for (const error of report.validation?.errors ?? []) console.log(`[UNRESOLVED] ${safeSummary(error)}`);
    if (outputs) {
      console.log(`Markdown: ${outputs.markdownPath}`);
      console.log(`JSON: ${outputs.jsonPath}`);
    }
  }

  if (report.status === "failed") process.exit(1);
}

if (process.argv[1] && existsSync(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
