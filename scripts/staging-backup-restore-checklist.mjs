import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const BACKUP_RESTORE_CHECK_ENV = "CRP_STAGING_BACKUP_RESTORE_CHECK";
export const SKIPPED_EXIT_CODE = 2;

export const REFRESH_SCRIPT_PATH = "scripts/refresh-local-from-staging.mjs";
export const GITIGNORE_PATH = ".gitignore";

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

function main() {
  const json = process.argv.includes("--json") || normalizeBoolean(process.env.STAGING_BACKUP_RESTORE_CHECK_JSON);
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
