import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BACKUP_RESTORE_CHECK_ENV = "CRP_STAGING_BACKUP_RESTORE_CHECK";
export const SKIPPED_EXIT_CODE = 2;

export const REFRESH_SCRIPT_PATH = "scripts/refresh-local-from-staging.mjs";
export const GITIGNORE_PATH = ".gitignore";
export const RESTORE_DRILL_EVIDENCE_TEMPLATE_PATH = "docs/restore-drill-evidence-template.md";
export const HUMAN_RESTORE_DRILL_EVIDENCE_MD_PATH = "docs/production-scale/evidence/human-restore-drill-evidence.md";
export const HUMAN_RESTORE_DRILL_EVIDENCE_JSON_PATH = "docs/production-scale/evidence/human-restore-drill-evidence.json";
export const HUMAN_RESTORE_DRILL_ACCEPTANCE_MD_PATH =
  "docs/production-scale/evidence/latest-human-restore-drill-evidence-acceptance.md";
export const HUMAN_RESTORE_DRILL_ACCEPTANCE_JSON_PATH =
  "docs/production-scale/evidence/latest-human-restore-drill-evidence-acceptance.json";
export const RESTORE_READINESS_CHECK_MD_PATH = "docs/production-scale/evidence/latest-restore-readiness-check.md";
export const RESTORE_READINESS_CHECK_JSON_PATH = "docs/production-scale/evidence/latest-restore-readiness-check.json";
export const RESTORE_DRILL_SIMULATED_JSON_PATH = "docs/production-scale/evidence/latest-restore-drill-simulated.json";
export const DEFAULT_RESTORE_EVIDENCE_MAX_AGE_DAYS = 90;

export const REQUIRED_REFRESH_SAFETY_ANCHORS = [
  "Refusing to refresh local DB unless CRP_LOCAL_DEV=true",
  "Refusing to restore into non-local database host",
  "Refusing to restore",
  "pg_dump --format=custom --no-owner --no-acl",
  "Keep the dump file after restore. It can contain sensitive data.",
  "Dry run complete. No dump or restore was performed.",
  "skip-volatile-cleanup",
  "sessions",
  "password_reset_tokens",
  "email_verification_tokens",
  "login_attempts",
];

export const BACKUP_RESTORE_DRILL_STEPS = [
  {
    name: "Verify staging source and health",
    command: "pnpm run readiness:production -- --skip-local-checks --json",
    purpose: "Confirm GitHub/staging alignment and public/protected endpoint health before any restore drill.",
  },
  {
    name: "Dry-run staging source resolution",
    command: "pnpm run refresh:local-from-staging -- --dry-run --source ssh",
    purpose: "Verify staging source resolution without dumping or restoring data.",
  },
  {
    name: "Restore only into local development database",
    command: "pnpm run refresh:local-from-staging -- --confirm --source ssh",
    purpose: "Exercise the restore path only against the local CRP_LOCAL_DEV database guard.",
  },
  {
    name: "Validate restored local app behavior",
    command: "pnpm run test:golden-path",
    purpose: "Confirm deterministic parser, canonical, violation, evidence, packet, and PDF checks after restore.",
  },
  {
    name: "Run local smoke checks as needed",
    command: "pnpm run check:staging-gate",
    purpose: "Reconfirm non-mutating app/API health checks after the restore drill.",
  },
  {
    name: "Confirm dump handling",
    command: "Verify .local/staging-db-refresh remains ignored and remove retained dumps unless explicitly needed.",
    purpose: "Avoid committing or retaining sensitive staging dump artifacts.",
  },
];

export const REQUIRED_RESTORE_DRILL_EVIDENCE_FIELDS = [
  "Evidence type",
  "Drill date",
  "Drill timestamp",
  "Operator identity",
  "Officer acknowledgement",
  "Source environment",
  "Source commit/SHA",
  "Backup source",
  "Source backup/dump identifier without secrets",
  "Restore target",
  "Target environment",
  "Target DB guard confirmation",
  "RPO target",
  "RPO actual",
  "RTO target",
  "RTO actual",
  "Actual restore duration",
  "Post-restore checks run",
  "Golden path result",
  "Post-restore auth/session result",
  "Post-restore packet PDF result",
  "Post-restore response queue result",
  "Cleanup/lifecycle result",
  "Retention archive/restore result or explicit retention exclusion",
  "Rollback/cleanup result",
  "Signed operator acknowledgement",
  "Sanitized evidence statement",
  "Signoff",
];

export const RESTORE_DRILL_OPERATOR_PROOF_FIELDS = [
  "Operator identity",
  "Officer acknowledgement",
  "Signoff",
];

export const RESTORE_DRILL_REQUIRED_VALUE_PLACEHOLDERS = [
  "TBD",
  "TODO",
  "N/A",
  "NA",
  "NONE",
  "NULL",
  "-",
];

export const RESTORE_DRILL_SENSITIVE_PATTERNS = [
  {
    name: "database-url",
    pattern: /\b(?:postgres|postgresql|mysql|mongodb):\/\/[^\s)]+/i,
  },
  {
    name: "database-url-with-credentials",
    pattern: /\b(?:postgres|postgresql|mysql|mongodb):\/\/[^\s:@/]+:[^\s@/]+@[^\s]+/i,
  },
  {
    name: "private-key-block",
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i,
  },
  {
    name: "api-token",
    pattern: /\b(?:sk|ghp|github_pat|xox[baprs])[_-][A-Za-z0-9_-]{12,}\b/i,
  },
  {
    name: "aws-access-key",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  },
  {
    name: "access-key-assignment",
    pattern: /\b(?:access[_-]?key(?:[_-]?id)?|secret[_-]?access[_-]?key)\s*[:=]\s*[A-Za-z0-9/+=_-]{12,}\b/i,
  },
  {
    name: "google-api-key",
    pattern: /\bAIza[A-Za-z0-9_-]{35}\b/,
  },
  {
    name: "access-token",
    pattern: /\baccess[_-]?token\s*[:=]\s*[A-Za-z0-9._~+/=-]{12,}\b/i,
  },
  {
    name: "bearer-token-value",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/i,
  },
  {
    name: "password-assignment",
    pattern: /\b(?:password|passwd|pwd)\s*[:=]\s*\S{6,}\b/i,
  },
  {
    name: "session-cookie",
    pattern: /\bfloot_built_app_session=[A-Za-z0-9._~+/=-]{12,}\b/i,
  },
  {
    name: "raw-pdf-bytes",
    pattern: /(?:%PDF-|JVBERi0)/i,
  },
  {
    name: "raw-base64-block",
    pattern: /\b(?:base64|fileDataBase64|rawBase64)\s*[:=]\s*[A-Za-z0-9+/]{40,}={0,2}\b/i,
  },
  {
    name: "long-raw-base64-like-block",
    pattern: /\b[A-Za-z0-9+/]{160,}={0,2}\b/,
  },
  {
    name: "obvious-ssn-or-sin",
    pattern: /\b(?:\d{3}-\d{2}-\d{4}|\d{3}[- ]?\d{3}[- ]?\d{3})\b/,
  },
  {
    name: "obvious-phone-pii",
    pattern: /\b(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b/,
  },
  {
    name: "obvious-email-pii",
    pattern: /\b[A-Z0-9._%+-]+@(?!example\.test\b|example\.invalid\b|example\.com\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  },
  {
    name: "raw-report-text-field",
    pattern: /\b(?:rawExtractedText|raw\s+report\s+text|full\s+credit\s+report\s+text)\s*[:=]/i,
  },
  {
    name: "raw-report-account-number",
    pattern: /\b(?:account\s+number|acct\s*#)\s*[:=]?\s*\d{4,}\b/i,
  },
  {
    name: "signed-url",
    pattern: /https?:\/\/[^\s]+(?:X-Amz-Signature|X-Goog-Signature|GoogleAccessId|Signature=|[?&]sig=|[?&]sv=)[^\s]*/i,
  },
];

export const HUMAN_RESTORE_DRILL_REQUIRED_FIELD_GROUPS = [
  {
    key: "evidenceType",
    label: "human-observed evidence type",
    aliases: ["Evidence type", "Proof type"],
    expectedPattern: /\bHUMAN[- ]OBSERVED\b/i,
  },
  {
    key: "operator",
    label: "operator name or role",
    aliases: ["Operator identity", "Operator name", "Operator role", "Operator"],
  },
  {
    key: "dateTime",
    label: "date/time",
    aliases: ["Drill timestamp", "Date/time", "Date time", "Observed at", "Started at"],
    expectedPattern: /\b20\d{2}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/,
  },
  {
    key: "environment",
    label: "environment",
    aliases: ["Environment", "Source environment", "Target environment"],
  },
  {
    key: "backupSource",
    label: "backup source",
    aliases: ["Backup source", "Source backup", "Backup family"],
  },
  {
    key: "restoreTarget",
    label: "restore target",
    aliases: ["Restore target", "Target environment", "Restore target environment"],
  },
  {
    key: "rpo",
    label: "RPO result",
    aliases: ["RPO result", "RPO actual", "RPO observed result"],
    expectedPattern: /\b(pass|passed|met|within|observed|actual|minutes?|hours?|<=|under|succeeded|verified)\b/i,
  },
  {
    key: "rto",
    label: "RTO result",
    aliases: ["RTO result", "RTO actual", "RTO observed result"],
    expectedPattern: /\b(pass|passed|met|within|observed|actual|minutes?|hours?|<=|under|succeeded|verified)\b/i,
  },
  {
    key: "authSession",
    label: "auth/session post-restore result",
    aliases: ["Post-restore auth/session result", "Auth/session post-restore result"],
    expectedPattern: /\b(pass|passed|success|successful|succeeded|verified|complete|completed)\b/i,
  },
  {
    key: "packetPdf",
    label: "packet PDF post-restore result",
    aliases: ["Post-restore packet PDF result", "Packet PDF post-restore result"],
    expectedPattern: /\b(pass|passed|success|successful|succeeded|verified|complete|completed)\b/i,
  },
  {
    key: "responseQueue",
    label: "response queue post-restore result",
    aliases: ["Post-restore response queue result", "Response queue post-restore result"],
    expectedPattern: /\b(pass|passed|success|successful|succeeded|verified|complete|completed)\b/i,
  },
  {
    key: "cleanupLifecycle",
    label: "cleanup/lifecycle post-restore result",
    aliases: ["Cleanup/lifecycle result", "Cleanup lifecycle post-restore result", "Lifecycle cleanup result"],
    expectedPattern: /\b(pass|passed|success|successful|succeeded|verified|complete|completed|cleaned|removed)\b/i,
  },
  {
    key: "retentionArchiveRestore",
    label: "retention archive/restore result or explicit retention exclusion",
    aliases: [
      "Retention archive/restore result or explicit retention exclusion",
      "Retention archive/restore result",
      "Retention recoverability result",
      "Explicit retention exclusion",
      "Retention exclusion",
    ],
    expectedPattern: /\b(pass|passed|success|successful|succeeded|verified|complete|completed|accepted exclusion|approved exclusion|explicit exclusion)\b/i,
  },
  {
    key: "rollbackCleanup",
    label: "rollback/cleanup result",
    aliases: ["Rollback/cleanup result", "Rollback cleanup result", "Rollback result"],
    expectedPattern: /\b(pass|passed|success|successful|succeeded|verified|complete|completed|cleaned|removed|rolled back)\b/i,
  },
  {
    key: "signedOperatorAcknowledgement",
    label: "signed operator acknowledgement",
    aliases: ["Signed operator acknowledgement", "Operator signed acknowledgement", "Operator acknowledgement", "Signoff"],
    expectedPattern: /\b(sign|signed|acknowledge|acknowledged|approved|attest|attested)\b/i,
  },
  {
    key: "sanitizedEvidenceStatement",
    label: "explicit sanitized evidence statement",
    aliases: ["Sanitized evidence statement", "Sanitization statement", "Sanitized statement"],
    expectedPattern: /\bsanitiz(?:ed|ation)\b/i,
  },
];

function normalizeBoolean(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

export function shouldRunBackupRestoreCheck(env = process.env) {
  if (!normalizeBoolean(env[BACKUP_RESTORE_CHECK_ENV])) {
    return {
      ok: false,
      reason: `SKIPPED: ${BACKUP_RESTORE_CHECK_ENV}=true is required.`,
    };
  }
  return { ok: true };
}

function readText(path) {
  if (!existsSync(path)) {
    throw new Error(`Required file is missing: ${path}`);
  }
  return readFileSync(path, "utf8");
}

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (path.isAbsolute(normalized)) return normalized;
  return path.join(rootDir, ...normalized.split("/").filter(Boolean));
}

function readRootText(rootDir, relativePath) {
  return readText(repoPath(rootDir, relativePath));
}

function readRootJsonIfPresent(rootDir, relativePath) {
  const absolutePath = repoPath(rootDir, relativePath);
  if (!existsSync(absolutePath)) return null;
  try {
    return JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch {
    return null;
  }
}

function writeRootText(rootDir, relativePath, text) {
  const absolutePath = repoPath(rootDir, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, text, "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function validateRefreshScriptSafety(scriptText) {
  const missingAnchors = REQUIRED_REFRESH_SAFETY_ANCHORS.filter((anchor) => !scriptText.includes(anchor));
  return {
    ok: missingAnchors.length === 0,
    missingAnchors,
  };
}

export function validateGitignoreForDumpArtifacts(gitignoreText) {
  const ignored = gitignoreText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line === ".local/" || line === ".local");
  return {
    ok: ignored,
    reason: ignored ? "" : ".local/ is not ignored; staging dump artifacts could be accidentally committed.",
  };
}

export function assertChecklistDoesNotTargetProduction(steps = BACKUP_RESTORE_DRILL_STEPS) {
  const forbidden = /\b(creditregulatorpro\.com|www\.creditregulatorpro\.com|creditregulatorpro-prod|\/opt\/creditregulatorpro\/app)\b/i;
  const offenders = steps.filter((step) => forbidden.test(`${step.command} ${step.purpose}`));
  if (offenders.length > 0) {
    throw new Error(`Backup/restore checklist references production in: ${offenders.map((step) => step.name).join(", ")}.`);
  }
}

export function scanRestoreDrillEvidenceSensitiveContent(text) {
  return RESTORE_DRILL_SENSITIVE_PATTERNS
    .filter((item) => item.pattern.test(text))
    .map((item) => item.name);
}

function parseMarkdownTableFields(text) {
  const fields = new Map();
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) continue;
    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 2) continue;
    const [field, value] = cells;
    if (!field || /^-+$/.test(field) || /^field$/i.test(field)) continue;
    fields.set(field.toLowerCase(), { field, value });
  }
  return fields;
}

function normalizeFieldKey(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function addEvidenceField(fields, field, value) {
  const normalizedField = String(field ?? "").trim();
  if (!normalizedField) return;
  const normalizedKey = normalizeFieldKey(normalizedField);
  if (!normalizedKey || fields.has(normalizedKey)) return;
  fields.set(normalizedKey, {
    field: normalizedField,
    value: typeof value === "string" ? value : JSON.stringify(value),
  });
}

function flattenJsonEvidenceFields(value, fields, prefix = "") {
  if (value == null) return;
  if (Array.isArray(value)) {
    addEvidenceField(fields, prefix, value.join(", "));
    return;
  }
  if (typeof value !== "object") {
    addEvidenceField(fields, prefix, value);
    return;
  }
  for (const [key, nestedValue] of Object.entries(value)) {
    const nextPrefix = prefix ? `${prefix} ${key}` : key;
    if (nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue)) {
      flattenJsonEvidenceFields(nestedValue, fields, nextPrefix);
    } else {
      addEvidenceField(fields, nextPrefix, nestedValue);
    }
  }
}

function parseEvidenceFields(text) {
  const fields = new Map();
  for (const entry of parseMarkdownTableFields(text).values()) {
    addEvidenceField(fields, entry.field, entry.value);
  }
  const trimmed = String(text ?? "").trim();
  if (trimmed.startsWith("{")) {
    try {
      flattenJsonEvidenceFields(JSON.parse(trimmed), fields);
    } catch {
      // JSON parsing is best-effort; markdown validation still applies.
    }
  }
  return fields;
}

function normalizeEvidenceValue(value) {
  return String(value ?? "")
    .replace(/[`*_]/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .trim();
}

function isPlaceholderOnlyValue(value) {
  const normalized = normalizeEvidenceValue(value);
  if (!normalized) return true;
  return RESTORE_DRILL_REQUIRED_VALUE_PLACEHOLDERS.some(
    (placeholder) => normalized.toLowerCase() === placeholder.toLowerCase(),
  );
}

function evidenceHasField(text, field, parsedFields) {
  if (parsedFields.has(field.toLowerCase())) return true;
  const fieldPattern = new RegExp(`(^|[|#\\-:*\\s])${escapeRegExp(field)}([|#\\-:*\\s]|$)`, "im");
  return fieldPattern.test(text);
}

function fieldValue(field, parsedFields) {
  return parsedFields.get(field.toLowerCase())?.value ?? "";
}

function humanFieldValue(fieldGroup, parsedFields) {
  for (const alias of fieldGroup.aliases) {
    const entry = parsedFields.get(normalizeFieldKey(alias));
    if (entry) return entry;
  }
  return null;
}

function isSimulatedOnlyHumanEvidenceSubmission(text) {
  const source = String(text ?? "");
  return (
    /^\s*#\s*SIMULATED\b/im.test(source) ||
    /\bEvidence type\s*[:|]\s*SIMULATED\b/i.test(source) ||
    /"evidenceType"\s*:\s*"SIMULATED"/i.test(source) ||
    /"reportName"\s*:\s*"(?:restore-drill-simulated|retention-archive-restore-simulated)"/i.test(source) ||
    /\bSIMULATED evidence only\b/i.test(source)
  );
}

function detectsHumanObservedEvidenceType(text) {
  return /\bHUMAN[- ]OBSERVED\b/i.test(String(text ?? ""));
}

function detectsCompletedProductionRestoreClaim(text) {
  return /\bproduction\b.{0,80}\brestore\b.{0,80}\b(completed|complete|succeeded|successful|passed|done)\b/i.test(text) ||
    /\brestore\b.{0,80}\bproduction\b.{0,80}\b(completed|complete|succeeded|successful|passed|done)\b/i.test(text);
}

export function validateRestoreDrillEvidenceText(text, options = {}) {
  const requiredFields = options.requiredFields ?? REQUIRED_RESTORE_DRILL_EVIDENCE_FIELDS;
  const templateOnly = options.templateOnly ?? /^Status:\s*Template only\./im.test(text);
  const parsedFields = parseMarkdownTableFields(text);
  const missingFields = requiredFields.filter((field) => !evidenceHasField(text, field, parsedFields));
  const placeholderFields = templateOnly
    ? []
    : requiredFields.filter((field) => !missingFields.includes(field) && isPlaceholderOnlyValue(fieldValue(field, parsedFields)));
  const sensitiveFindings = scanRestoreDrillEvidenceSensitiveContent(text);
  const productionRestoreClaimed = detectsCompletedProductionRestoreClaim(text);
  const missingMachineProofFields = productionRestoreClaimed ? ["restore:machine-proof"] : [];

  return {
    ok:
      missingFields.length === 0 &&
      placeholderFields.length === 0 &&
      sensitiveFindings.length === 0 &&
      missingMachineProofFields.length === 0,
    templateOnly,
    missingFields,
    placeholderFields,
    sensitiveFindings,
    productionRestoreClaimed,
    missingOperatorProofFields: [],
    missingMachineProofFields,
    requiredFieldCount: requiredFields.length,
  };
}

export function validateHumanRestoreDrillEvidenceText(text, options = {}) {
  const source = String(text ?? "");
  const parsedFields = parseEvidenceFields(source);
  const requiredFieldGroups = options.requiredFieldGroups ?? HUMAN_RESTORE_DRILL_REQUIRED_FIELD_GROUPS;
  const missingRequirements = [];
  const placeholderFields = [];
  const invalidValueFields = [];
  const matchedFields = {};

  for (const fieldGroup of requiredFieldGroups) {
    const entry = humanFieldValue(fieldGroup, parsedFields);
    if (!entry) {
      missingRequirements.push(fieldGroup.label);
      continue;
    }
    const value = normalizeEvidenceValue(entry.value);
    matchedFields[fieldGroup.key] = {
      field: entry.field,
      value,
    };
    if (isPlaceholderOnlyValue(value)) {
      placeholderFields.push(entry.field);
      continue;
    }
    if (fieldGroup.expectedPattern && !fieldGroup.expectedPattern.test(value)) {
      invalidValueFields.push(entry.field);
    }
  }

  const sensitiveFindings = scanRestoreDrillEvidenceSensitiveContent(source);
  const productionRestoreClaimed = detectsCompletedProductionRestoreClaim(source);
  const simulatedOnlySubmission = isSimulatedOnlyHumanEvidenceSubmission(source);
  const humanObservedEvidenceTypePresent = detectsHumanObservedEvidenceType(source);
  const sanitizedEvidenceStatement = matchedFields.sanitizedEvidenceStatement?.value ?? "";
  const missingMachineProofFields = productionRestoreClaimed ? ["restore:machine-proof"] : [];
  const sanitizedStatementMissing =
    !sanitizedEvidenceStatement || !/\bsanitiz(?:ed|ation)\b/i.test(sanitizedEvidenceStatement);

  const errors = [];
  if (missingRequirements.length > 0) errors.push(`Missing required human evidence: ${missingRequirements.join(", ")}.`);
  if (placeholderFields.length > 0) errors.push(`Placeholder-only values: ${placeholderFields.join(", ")}.`);
  if (invalidValueFields.length > 0) errors.push(`Invalid or incomplete values: ${invalidValueFields.join(", ")}.`);
  if (sensitiveFindings.length > 0) errors.push(`Sensitive content detected: ${sensitiveFindings.join(", ")}.`);
  errors.push("Legacy human-observed restore evidence acceptance is retired; use restore:machine-proof.");
  if (simulatedOnlySubmission) errors.push("SIMULATED-only evidence cannot be accepted as production proof.");
  if (humanObservedEvidenceTypePresent) {
    errors.push("HUMAN-OBSERVED restore evidence is legacy manual proof and cannot certify production.");
  }
  if (missingMachineProofFields.length > 0) {
    errors.push(`Production restore claim lacks machine proof: ${missingMachineProofFields.join(", ")}.`);
  }
  if (sanitizedStatementMissing) errors.push("Evidence must explicitly state that the submitted evidence is sanitized.");

  return {
    ok: errors.length === 0,
    accepted: errors.length === 0,
    evidenceType: simulatedOnlySubmission ? "SIMULATED" : humanObservedEvidenceTypePresent ? "LEGACY-HUMAN-OBSERVED" : "unknown",
    missingRequirements,
    placeholderFields,
    invalidValueFields,
    sensitiveFindings,
    productionRestoreClaimed,
    missingOperatorProofFields: [],
    missingMachineProofFields,
    simulatedOnlySubmission,
    humanObservedEvidenceTypePresent,
    sanitizedStatementMissing,
    matchedFields,
    blockerCoverage: {
      disasterRecoveryRestoreDrill:
        false,
      retentionArchiveRestore: false,
    },
    errors,
  };
}

export function buildRestoreDrillEvidenceValidationReport(path = RESTORE_DRILL_EVIDENCE_TEMPLATE_PATH) {
  const evidenceText = readText(path);
  const validation = validateRestoreDrillEvidenceText(evidenceText);
  return {
    status: validation.ok ? "passed" : "failed",
    generatedAt: new Date().toISOString(),
    evidencePath: path,
    validation,
    safety: {
      readsSecrets: false,
      printsSecrets: false,
      runsDump: false,
      runsRestore: false,
      modifiesStaging: false,
      modifiesProduction: false,
      claimsRestoreCompleted: validation.productionRestoreClaimed,
    },
  };
}

function resolveHumanRestoreEvidencePath(rootDir, explicitPath = null) {
  if (explicitPath) {
    const normalized = normalizeRelativePath(explicitPath);
    return existsSync(repoPath(rootDir, normalized))
      ? { path: normalized, explicit: true, exists: true }
      : { path: normalized, explicit: true, exists: false };
  }
  for (const candidate of [HUMAN_RESTORE_DRILL_EVIDENCE_MD_PATH, HUMAN_RESTORE_DRILL_EVIDENCE_JSON_PATH]) {
    if (existsSync(repoPath(rootDir, candidate))) {
      return { path: candidate, explicit: false, exists: true };
    }
  }
  return { path: null, explicit: false, exists: false };
}

export function buildHumanRestoreDrillEvidenceAcceptanceReport({
  rootDir = process.cwd(),
  evidencePath = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const resolved = resolveHumanRestoreEvidencePath(rootDir, evidencePath);
  if (!resolved.exists) {
    const status = resolved.explicit ? "failed" : "not-submitted";
    return {
      reportName: "human-restore-drill-evidence-acceptance",
      generatedAt,
      status,
      accepted: false,
      evidencePath: resolved.path,
      defaultEvidencePaths: [HUMAN_RESTORE_DRILL_EVIDENCE_MD_PATH, HUMAN_RESTORE_DRILL_EVIDENCE_JSON_PATH],
      validation: {
        ok: false,
        accepted: false,
        errors: resolved.explicit
          ? [`Submitted human restore evidence file is missing: ${resolved.path}.`]
          : ["No human restore evidence artifact has been submitted."],
        blockerCoverage: {
          disasterRecoveryRestoreDrill: false,
          retentionArchiveRestore: false,
        },
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
        productionBackupsAccessedByCodex: false,
        simulatedEvidenceAcceptedAsHumanProof: false,
      },
    };
  }

  const evidenceText = readRootText(rootDir, resolved.path);
  const validation = validateHumanRestoreDrillEvidenceText(evidenceText);
  return {
    reportName: "human-restore-drill-evidence-acceptance",
    generatedAt,
    status: validation.ok ? "accepted" : "failed",
    accepted: validation.ok,
    evidencePath: resolved.path,
    defaultEvidencePaths: [HUMAN_RESTORE_DRILL_EVIDENCE_MD_PATH, HUMAN_RESTORE_DRILL_EVIDENCE_JSON_PATH],
    validation,
    blockerCoverage: validation.blockerCoverage,
    safety: {
      readsSecrets: false,
      printsSecrets: false,
      runsDump: false,
      runsRestore: false,
      modifiesProduction: false,
      productionBackupsAccessedByCodex: false,
      simulatedEvidenceAcceptedAsHumanProof: validation.simulatedOnlySubmission && validation.ok,
    },
  };
}

function parseRestoreEvidenceDateTime(value) {
  const normalized = normalizeEvidenceValue(value);
  if (!normalized) return null;
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function evidenceAgeDays(restoreDateTime, generatedAt) {
  const restoreTime = Date.parse(restoreDateTime);
  const generatedTime = Date.parse(generatedAt);
  if (!Number.isFinite(restoreTime) || !Number.isFinite(generatedTime)) return null;
  return Math.round(((generatedTime - restoreTime) / 86_400_000) * 100) / 100;
}

function allHumanRestoreRequirementLabels() {
  return HUMAN_RESTORE_DRILL_REQUIRED_FIELD_GROUPS.map((fieldGroup) => fieldGroup.label);
}

function summarizeSimulatedRestoreEvidence(rootDir) {
  const exists = existsSync(repoPath(rootDir, RESTORE_DRILL_SIMULATED_JSON_PATH));
  if (!exists) {
    return {
      exists: false,
      path: RESTORE_DRILL_SIMULATED_JSON_PATH,
      evidenceType: "none",
      status: "not-submitted",
      generatedAt: null,
      validationOk: false,
      sensitiveFindings: [],
      productionProof: false,
    };
  }

  const text = readRootText(rootDir, RESTORE_DRILL_SIMULATED_JSON_PATH);
  const parsed = readRootJsonIfPresent(rootDir, RESTORE_DRILL_SIMULATED_JSON_PATH);
  const sensitiveFindings = scanRestoreDrillEvidenceSensitiveContent(text);
  return {
    exists: true,
    path: RESTORE_DRILL_SIMULATED_JSON_PATH,
    evidenceType: parsed?.evidenceType ?? "unknown",
    status: parsed?.status ?? "unknown",
    generatedAt: parsed?.generatedAt ?? null,
    validationOk: parsed?.validation?.ok === true,
    sensitiveFindings,
    productionProof: parsed?.productionProof === true,
  };
}

export function buildRestoreEvidenceCurrentCheckReport({
  rootDir = process.cwd(),
  evidencePath = null,
  generatedAt = new Date().toISOString(),
  maxAgeDays = DEFAULT_RESTORE_EVIDENCE_MAX_AGE_DAYS,
} = {}) {
  const humanAcceptance = buildHumanRestoreDrillEvidenceAcceptanceReport({ rootDir, evidencePath, generatedAt });
  const simulatedEvidence = summarizeSimulatedRestoreEvidence(rootDir);
  const restoreDateTime = parseRestoreEvidenceDateTime(humanAcceptance.validation?.matchedFields?.dateTime?.value);
  const ageDays = restoreDateTime ? evidenceAgeDays(restoreDateTime, generatedAt) : null;
  const futureDated = ageDays != null && ageDays < -1;
  const stale = humanAcceptance.accepted === true && ageDays != null && ageDays > maxAgeDays;
  const missingFields =
    humanAcceptance.status === "not-submitted"
      ? allHumanRestoreRequirementLabels()
      : humanAcceptance.validation?.missingRequirements ?? [];
  const sensitiveFindings = [
    ...(humanAcceptance.validation?.sensitiveFindings ?? []),
    ...(simulatedEvidence.sensitiveFindings ?? []),
  ];
  const validationErrors = [
    ...(humanAcceptance.validation?.errors ?? []),
  ];
  if (humanAcceptance.accepted === true && !restoreDateTime) {
    validationErrors.push("Restore date/time could not be parsed from restore evidence.");
  }
  if (futureDated) {
    validationErrors.push("Restore evidence date/time is future-dated relative to this readiness check.");
  }
  if (sensitiveFindings.length > 0) {
    validationErrors.push(`Sensitive content detected in restore evidence: ${Array.from(new Set(sensitiveFindings)).join(", ")}.`);
  }

  const legacyHumanObserved = /HUMAN-OBSERVED/.test(String(humanAcceptance.validation?.evidenceType ?? ""));
  const humanObserved = false;
  const simulatedOnly =
    humanAcceptance.validation?.simulatedOnlySubmission === true ||
    (humanAcceptance.status === "not-submitted" && simulatedEvidence.exists === true);
  const currentOperationalProof =
    humanAcceptance.accepted === true &&
    false &&
    !simulatedOnly &&
    !stale &&
    !futureDated &&
    restoreDateTime != null &&
    sensitiveFindings.length === 0;

  let status = "not-submitted";
  if (currentOperationalProof) status = "current-machine-proof";
  else if (humanAcceptance.accepted === true && stale) status = "stale-machine-proof";
  else if (humanAcceptance.status === "failed" || sensitiveFindings.length > 0 || futureDated) status = "failed";
  else if (simulatedOnly) status = "simulated-only";

  const unresolvedReasons = [];
  if (!humanAcceptance.accepted) unresolvedReasons.push("No accepted sanitized machine restore proof is available.");
  if (simulatedOnly) unresolvedReasons.push("Available restore evidence is SIMULATED-only and cannot be production proof.");
  if (stale) unresolvedReasons.push(`Restore evidence is stale: ${ageDays} days old; maximum allowed is ${maxAgeDays} days.`);
  if (missingFields.length > 0) unresolvedReasons.push(`Missing required fields: ${missingFields.join(", ")}.`);
  if ((humanAcceptance.validation?.placeholderFields ?? []).length > 0) {
    unresolvedReasons.push(`Placeholder-only fields: ${humanAcceptance.validation.placeholderFields.join(", ")}.`);
  }
  if ((humanAcceptance.validation?.invalidValueFields ?? []).length > 0) {
    unresolvedReasons.push(`Incomplete result fields: ${humanAcceptance.validation.invalidValueFields.join(", ")}.`);
  }
  if (sensitiveFindings.length > 0) unresolvedReasons.push(`Sensitive findings: ${Array.from(new Set(sensitiveFindings)).join(", ")}.`);
  if (futureDated) unresolvedReasons.push("Restore evidence is future-dated.");

  return {
    reportName: "restore-evidence-current-readiness-check",
    generatedAt,
    status,
    currentOperationalProof,
    stale,
    maxAgeDays,
    evidencePath: humanAcceptance.evidencePath,
    evidenceType: humanAcceptance.validation?.evidenceType ?? (simulatedEvidence.exists ? "SIMULATED" : "none"),
    humanObserved,
    legacyHumanObserved,
    simulatedOnly,
    restoreDateTime,
    ageDays,
    humanAcceptance: {
      status: humanAcceptance.status,
      accepted: humanAcceptance.accepted === true,
      evidencePath: humanAcceptance.evidencePath,
      validationOk: humanAcceptance.validation?.ok === true,
    },
    simulatedEvidence,
    requiredFields: {
      complete: humanAcceptance.validation?.ok === true,
      missing: missingFields,
      placeholders: humanAcceptance.validation?.placeholderFields ?? [],
      invalidValues: humanAcceptance.validation?.invalidValueFields ?? [],
      sensitiveFindings: Array.from(new Set(sensitiveFindings)),
    },
    blockerCoverage: {
      disasterRecoveryRestoreDrill:
        currentOperationalProof && humanAcceptance.blockerCoverage?.disasterRecoveryRestoreDrill === true,
      retentionArchiveRestore:
        currentOperationalProof && humanAcceptance.blockerCoverage?.retentionArchiveRestore === true,
    },
    validation: {
      ok: currentOperationalProof,
      humanAcceptanceOk: humanAcceptance.validation?.ok === true,
      errors: validationErrors,
      unresolvedReasons,
    },
    safety: {
      readsSecrets: false,
      printsSecrets: false,
      runsDump: false,
      runsRestore: false,
      accessesProductionBackups: false,
      modifiesProduction: false,
      acceptsSimulatedEvidenceAsProductionProof: false,
      parserBehaviorChanged: false,
      ocrBehaviorChanged: false,
      packetBehaviorChanged: false,
      queueBehaviorChanged: false,
    },
  };
}

export function buildBackupRestoreChecklistReport(env = process.env) {
  const gate = shouldRunBackupRestoreCheck(env);
  if (!gate.ok) {
    return { status: "skipped", reason: gate.reason };
  }

  const refreshScriptText = readText(REFRESH_SCRIPT_PATH);
  const gitignoreText = readText(GITIGNORE_PATH);
  const refreshSafety = validateRefreshScriptSafety(refreshScriptText);
  const dumpIgnore = validateGitignoreForDumpArtifacts(gitignoreText);
  assertChecklistDoesNotTargetProduction();

  const failures = [];
  if (!refreshSafety.ok) {
    failures.push(`Missing refresh safety anchors: ${refreshSafety.missingAnchors.join(", ")}`);
  }
  if (!dumpIgnore.ok) {
    failures.push(dumpIgnore.reason);
  }

  return {
    status: failures.length === 0 ? "passed" : "failed",
    generatedAt: new Date().toISOString(),
    checks: {
      refreshScriptPresent: true,
      localOnlyRestoreGuardPresent: refreshScriptText.includes("Refusing to restore into non-local database host"),
      localDevGuardPresent: refreshScriptText.includes("CRP_LOCAL_DEV=true"),
      dryRunAvailable: refreshScriptText.includes("--dry-run"),
      customFormatDumpPresent: refreshScriptText.includes("pg_dump --format=custom --no-owner --no-acl"),
      volatileCleanupPresent: refreshScriptText.includes("password_reset_tokens") && refreshScriptText.includes("login_attempts"),
      dumpArtifactsIgnored: dumpIgnore.ok,
      productionTargetsReferenced: false,
    },
    drillSteps: BACKUP_RESTORE_DRILL_STEPS,
    failures,
    safety: {
      readsSecrets: false,
      printsSecrets: false,
      runsDump: false,
      runsRestore: false,
      modifiesStaging: false,
      modifiesProduction: false,
      restoreTarget: "local_only_when_operator_runs_existing_refresh_script_with_confirm",
    },
  };
}

function printHumanReport(report) {
  if (report.status === "skipped") {
    console.log(report.reason);
    return;
  }

  if (report.status === "failed") {
    console.error("Backup/restore checklist verification failed.");
    for (const failure of report.failures) console.error(`[FAIL] ${failure}`);
    return;
  }

  console.log("Backup/restore checklist verification passed.");
  console.log("This script does not dump or restore data.");
  for (const [index, step] of report.drillSteps.entries()) {
    console.log(`${index + 1}. ${step.name}: ${step.command}`);
  }
}

function printEvidenceValidationReport(report) {
  if (report.status === "failed") {
    console.error("Restore drill evidence validation failed.");
    if (report.validation.missingFields.length > 0) {
      console.error(`[FAIL] Missing fields: ${report.validation.missingFields.join(", ")}`);
    }
    if (report.validation.placeholderFields.length > 0) {
      console.error(`[FAIL] Placeholder-only values: ${report.validation.placeholderFields.join(", ")}`);
    }
    if (report.validation.sensitiveFindings.length > 0) {
      console.error(`[FAIL] Sensitive patterns found: ${report.validation.sensitiveFindings.join(", ")}`);
    }
    if (report.validation.missingMachineProofFields?.length > 0) {
      console.error(
        `[FAIL] Production restore claim lacks machine proof: ${report.validation.missingMachineProofFields.join(", ")}`,
      );
    }
    return;
  }

  console.log("Restore drill evidence validation passed.");
  console.log(`Evidence path: ${report.evidencePath}`);
  console.log("This validation does not dump or restore data and does not claim a completed restore drill.");
}

export function renderHumanRestoreDrillEvidenceAcceptanceMarkdown(report) {
  const lines = [
    "# Legacy Restore Drill Evidence Acceptance",
    "",
    `Generated at: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Accepted: ${report.accepted ? "yes" : "no"}`,
    `Evidence path: ${report.evidencePath ?? "not submitted"}`,
    "",
    "## Blocker Coverage",
    "",
    `- Blocker 1 disaster recovery restore drill: ${
      report.blockerCoverage?.disasterRecoveryRestoreDrill ? "accepted" : "not accepted"
    }`,
    `- Blocker 22 retention archive/restore recoverability: ${
      report.blockerCoverage?.retentionArchiveRestore ? "accepted" : "not accepted"
    }`,
    "",
    "## Validation",
    "",
  ];

  if (report.validation?.errors?.length) {
    lines.push(...report.validation.errors.map((error) => `- ${error}`));
  } else {
    lines.push("- Legacy restore evidence passed strict acceptance validation.");
  }

  lines.push(
    "",
    "## Safety",
    "",
    "- This command does not dump or restore data.",
    "- This command does not access production backups.",
    "- This command does not mutate production.",
    "- SIMULATED-only or human-observed evidence is never accepted as production proof.",
  );

  return `${lines.join("\n")}\n`;
}

export function writeHumanRestoreDrillEvidenceAcceptanceReport(report, { rootDir = process.cwd() } = {}) {
  writeRootText(rootDir, HUMAN_RESTORE_DRILL_ACCEPTANCE_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  writeRootText(rootDir, HUMAN_RESTORE_DRILL_ACCEPTANCE_MD_PATH, renderHumanRestoreDrillEvidenceAcceptanceMarkdown(report));
  return {
    markdownPath: HUMAN_RESTORE_DRILL_ACCEPTANCE_MD_PATH,
    jsonPath: HUMAN_RESTORE_DRILL_ACCEPTANCE_JSON_PATH,
  };
}

export function renderRestoreEvidenceCurrentCheckMarkdown(report) {
  const lines = [
    "# Restore Evidence Current Readiness Check",
    "",
    `Generated at: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Current operational proof: ${report.currentOperationalProof ? "yes" : "no"}`,
    `Evidence type: ${report.evidenceType}`,
    `Human-observed accepted: ${report.humanObserved ? "yes" : "no"}`,
    `Legacy human-observed present: ${report.legacyHumanObserved ? "yes" : "no"}`,
    `SIMULATED-only: ${report.simulatedOnly ? "yes" : "no"}`,
    `Stale: ${report.stale ? "yes" : "no"}`,
    `Restore date/time: ${report.restoreDateTime ?? "not available"}`,
    `Evidence age days: ${report.ageDays ?? "not available"}`,
    `Maximum accepted age days: ${report.maxAgeDays}`,
    `Legacy evidence path: ${report.evidencePath ?? "not submitted"}`,
    "",
    "## Required Field Status",
    "",
    `- Complete: ${report.requiredFields?.complete ? "yes" : "no"}`,
    `- Missing: ${report.requiredFields?.missing?.length ? report.requiredFields.missing.join(", ") : "none"}`,
    `- Placeholder-only: ${report.requiredFields?.placeholders?.length ? report.requiredFields.placeholders.join(", ") : "none"}`,
    `- Invalid/incomplete values: ${
      report.requiredFields?.invalidValues?.length ? report.requiredFields.invalidValues.join(", ") : "none"
    }`,
    `- Sensitive findings: ${
      report.requiredFields?.sensitiveFindings?.length ? report.requiredFields.sensitiveFindings.join(", ") : "none"
    }`,
    "",
    "## Blocker Coverage",
    "",
    `- Blocker 1 disaster recovery restore drill: ${
      report.blockerCoverage?.disasterRecoveryRestoreDrill ? "current accepted" : "not accepted"
    }`,
    `- Blocker 22 retention archive/restore recoverability: ${
      report.blockerCoverage?.retentionArchiveRestore ? "current accepted" : "not accepted"
    }`,
    "",
    "## Unresolved Reasons",
    "",
  ];

  if (report.validation?.unresolvedReasons?.length) {
    lines.push(...report.validation.unresolvedReasons.map((reason) => `- ${reason}`));
  } else {
    lines.push("- Current sanitized machine restore proof is accepted.");
  }

  lines.push(
    "",
    "## Simulated Evidence",
    "",
    `- Exists: ${report.simulatedEvidence?.exists ? "yes" : "no"}`,
    `- Path: ${report.simulatedEvidence?.path ?? RESTORE_DRILL_SIMULATED_JSON_PATH}`,
    `- Status: ${report.simulatedEvidence?.status ?? "unknown"}`,
    `- Production proof: ${report.simulatedEvidence?.productionProof ? "yes" : "no"}`,
    "",
    "## Safety",
    "",
    "- This command does not dump or restore data.",
    "- This command does not access production backups.",
    "- This command does not mutate production.",
    "- This command does not change parser, OCR, packet, or queue behavior.",
    "- SIMULATED restore evidence is never accepted as production proof.",
  );

  return `${lines.join("\n")}\n`;
}

export function writeRestoreEvidenceCurrentCheckReport(report, { rootDir = process.cwd() } = {}) {
  writeRootText(rootDir, RESTORE_READINESS_CHECK_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  writeRootText(rootDir, RESTORE_READINESS_CHECK_MD_PATH, renderRestoreEvidenceCurrentCheckMarkdown(report));
  return {
    markdownPath: RESTORE_READINESS_CHECK_MD_PATH,
    jsonPath: RESTORE_READINESS_CHECK_JSON_PATH,
  };
}

function printHumanEvidenceAcceptanceReport(report, outputs = null) {
  if (report.status === "not-submitted") {
    console.log("No legacy restore drill evidence artifact submitted.");
    console.log("No blockers were closed. Submit sanitized machine restore proof before expecting acceptance.");
  } else if (report.status === "failed") {
    console.error("Legacy restore drill evidence acceptance failed.");
    for (const error of report.validation?.errors ?? []) console.error(`[FAIL] ${error}`);
  } else {
    console.log("Legacy restore drill evidence accepted.");
    console.log(`Evidence path: ${report.evidencePath}`);
  }
  console.log(`Blocker 1 coverage: ${report.blockerCoverage?.disasterRecoveryRestoreDrill ? "accepted" : "not accepted"}`);
  console.log(`Blocker 22 coverage: ${report.blockerCoverage?.retentionArchiveRestore ? "accepted" : "not accepted"}`);
  if (outputs) {
    console.log(`Markdown: ${outputs.markdownPath}`);
    console.log(`JSON: ${outputs.jsonPath}`);
  }
}

function printRestoreEvidenceCurrentCheckReport(report, outputs = null) {
  console.log("Restore evidence current readiness check generated.");
  console.log(`Status: ${report.status}`);
  console.log(`Current operational proof: ${report.currentOperationalProof ? "yes" : "no"}`);
  console.log(`Evidence type: ${report.evidenceType}`);
  console.log(`Human-observed accepted: ${report.humanObserved ? "yes" : "no"}`);
  console.log(`Legacy human-observed present: ${report.legacyHumanObserved ? "yes" : "no"}`);
  console.log(`SIMULATED-only: ${report.simulatedOnly ? "yes" : "no"}`);
  console.log(`Stale: ${report.stale ? "yes" : "no"}`);
  if (report.validation?.unresolvedReasons?.length) {
    for (const reason of report.validation.unresolvedReasons) console.log(`[UNRESOLVED] ${reason}`);
  }
  if (outputs) {
    console.log(`Markdown: ${outputs.markdownPath}`);
    console.log(`JSON: ${outputs.jsonPath}`);
  }
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) return null;
  return value;
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json") || normalizeBoolean(process.env.STAGING_BACKUP_RESTORE_CHECK_JSON);
  if (args.includes("--current-check")) {
    const evidencePath = valueAfter(args, "--evidence");
    const rootDir = path.resolve(valueAfter(args, "--root") ?? process.cwd());
    const maxAgeValue = valueAfter(args, "--max-age-days");
    const maxAgeDays = maxAgeValue ? Number(maxAgeValue) : DEFAULT_RESTORE_EVIDENCE_MAX_AGE_DAYS;
    if (!Number.isFinite(maxAgeDays) || maxAgeDays < 1) {
      console.error("Restore evidence current check failed.");
      console.error("[FAIL] --max-age-days must be a positive number.");
      process.exit(1);
    }
    const report = buildRestoreEvidenceCurrentCheckReport({ rootDir, evidencePath, maxAgeDays });
    const outputs = args.includes("--no-write")
      ? null
      : writeRestoreEvidenceCurrentCheckReport(report, { rootDir });
    if (json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printRestoreEvidenceCurrentCheckReport(report, outputs);
    }
    if (report.status === "failed") process.exit(1);
    return;
  }
  if (args.includes("--accept-human-evidence")) {
    const evidencePath = valueAfter(args, "--accept-human-evidence");
    const rootDir = path.resolve(valueAfter(args, "--root") ?? process.cwd());
    const report = buildHumanRestoreDrillEvidenceAcceptanceReport({ rootDir, evidencePath });
    const outputs = args.includes("--no-write")
      ? null
      : writeHumanRestoreDrillEvidenceAcceptanceReport(report, { rootDir });
    if (json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHumanEvidenceAcceptanceReport(report, outputs);
    }
    if (report.status === "failed") process.exit(1);
    return;
  }
  if (args.includes("--validate-evidence")) {
    const evidencePath = valueAfter(args, "--validate-evidence") ?? RESTORE_DRILL_EVIDENCE_TEMPLATE_PATH;
    const report = buildRestoreDrillEvidenceValidationReport(evidencePath);
    if (json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printEvidenceValidationReport(report);
    }
    if (report.status === "failed") process.exit(1);
    return;
  }

  const report = buildBackupRestoreChecklistReport();
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }
  if (report.status === "skipped") process.exit(SKIPPED_EXIT_CODE);
  if (report.status === "failed") process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
