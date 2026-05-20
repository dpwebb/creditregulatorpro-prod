import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const BACKUP_RESTORE_CHECK_ENV = "CRP_STAGING_BACKUP_RESTORE_CHECK";
export const SKIPPED_EXIT_CODE = 2;

export const REFRESH_SCRIPT_PATH = "scripts/refresh-local-from-staging.mjs";
export const GITIGNORE_PATH = ".gitignore";
export const RESTORE_DRILL_EVIDENCE_TEMPLATE_PATH = "docs/restore-drill-evidence-template.md";

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
  "Drill date",
  "Operator",
  "Source environment",
  "Source commit/SHA",
  "Source backup/dump identifier without secrets",
  "Target environment",
  "Target DB guard confirmation",
  "RPO target",
  "RTO target",
  "Actual restore duration",
  "Post-restore checks run",
  "Golden path result",
  "Auth/session check result",
  "Packet PDF check result",
  "Response queue/dashboard check result",
  "Cleanup of local sensitive dump",
  "Signoff",
];

export const RESTORE_DRILL_SENSITIVE_PATTERNS = [
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
    pattern: /\b(?:sk|ghp|github_pat|xox[baprs])_[A-Za-z0-9_-]{12,}\b/i,
  },
  {
    name: "bearer-token-value",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/i,
  },
  {
    name: "session-cookie",
    pattern: /\bfloot_built_app_session=[A-Za-z0-9._~+/=-]{12,}\b/i,
  },
  {
    name: "raw-pdf-bytes",
    pattern: /(?:%PDF-|JVBERi0)/i,
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

export function validateRestoreDrillEvidenceText(text, options = {}) {
  const requiredFields = options.requiredFields ?? REQUIRED_RESTORE_DRILL_EVIDENCE_FIELDS;
  const missingFields = requiredFields.filter((field) => {
    const fieldPattern = new RegExp(`(^|[|#\\-:*\\s])${escapeRegExp(field)}([|#\\-:*\\s]|$)`, "im");
    return !fieldPattern.test(text);
  });
  const sensitiveFindings = scanRestoreDrillEvidenceSensitiveContent(text);

  return {
    ok: missingFields.length === 0 && sensitiveFindings.length === 0,
    missingFields,
    sensitiveFindings,
    requiredFieldCount: requiredFields.length,
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
      claimsRestoreCompleted: false,
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
    if (report.validation.sensitiveFindings.length > 0) {
      console.error(`[FAIL] Sensitive patterns found: ${report.validation.sensitiveFindings.join(", ")}`);
    }
    return;
  }

  console.log("Restore drill evidence validation passed.");
  console.log(`Evidence path: ${report.evidencePath}`);
  console.log("This validation does not dump or restore data and does not claim a completed restore drill.");
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
