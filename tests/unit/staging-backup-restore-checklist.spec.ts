import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertChecklistDoesNotTargetProduction,
  BACKUP_RESTORE_CHECK_ENV,
  BACKUP_RESTORE_DRILL_STEPS,
  buildBackupRestoreChecklistReport,
  buildRestoreDrillEvidenceValidationReport,
  REQUIRED_REFRESH_SAFETY_ANCHORS,
  REQUIRED_RESTORE_DRILL_EVIDENCE_FIELDS,
  scanRestoreDrillEvidenceSensitiveContent,
  shouldRunBackupRestoreCheck,
  validateGitignoreForDumpArtifacts,
  validateRefreshScriptSafety,
  validateRestoreDrillEvidenceText,
} from "../../scripts/staging-backup-restore-checklist.mjs";

describe("staging backup/restore checklist", () => {
  it("requires an explicit gate env var", () => {
    expect(shouldRunBackupRestoreCheck({})).toEqual({
      ok: false,
      reason: `SKIPPED: ${BACKUP_RESTORE_CHECK_ENV}=true is required.`,
    });
    expect(shouldRunBackupRestoreCheck({ [BACKUP_RESTORE_CHECK_ENV]: "true" })).toEqual({ ok: true });
  });

  it("requires local-only restore and dry-run safety anchors", () => {
    const validScript = REQUIRED_REFRESH_SAFETY_ANCHORS.join("\n");
    expect(validateRefreshScriptSafety(validScript)).toEqual({
      ok: true,
      missingAnchors: [],
    });

    expect(validateRefreshScriptSafety("pg_dump --format=custom --no-owner --no-acl")).toEqual({
      ok: false,
      missingAnchors: REQUIRED_REFRESH_SAFETY_ANCHORS.filter(
        (anchor) => anchor !== "pg_dump --format=custom --no-owner --no-acl",
      ),
    });
  });

  it("requires dump artifacts to remain ignored", () => {
    expect(validateGitignoreForDumpArtifacts("node_modules/\n.local/\n")).toEqual({
      ok: true,
      reason: "",
    });
    expect(validateGitignoreForDumpArtifacts("node_modules/\n")).toEqual({
      ok: false,
      reason: ".local/ is not ignored; staging dump artifacts could be accidentally committed.",
    });
  });

  it("does not include production targets in the operator drill", () => {
    expect(() => assertChecklistDoesNotTargetProduction(BACKUP_RESTORE_DRILL_STEPS)).not.toThrow();
    expect(() =>
      assertChecklistDoesNotTargetProduction([
        {
          name: "bad",
          command: "ssh root@creditregulatorpro.com",
          purpose: "do not use",
        },
      ]),
    ).toThrow(/references production/);
  });

  it("keeps the drill non-destructive until the operator explicitly runs the existing confirm path", () => {
    const report = buildBackupRestoreChecklistReport({ [BACKUP_RESTORE_CHECK_ENV]: "true" });
    expect(report.status).toBe("passed");
    expect(report.safety).toMatchObject({
      readsSecrets: false,
      printsSecrets: false,
      runsDump: false,
      runsRestore: false,
      modifiesStaging: false,
      modifiesProduction: false,
      restoreTarget: "local_only_when_operator_runs_existing_refresh_script_with_confirm",
    });
    expect(report.checks).toMatchObject({
      refreshScriptPresent: true,
      localOnlyRestoreGuardPresent: true,
      localDevGuardPresent: true,
      dryRunAvailable: true,
      customFormatDumpPresent: true,
      volatileCleanupPresent: true,
      dumpArtifactsIgnored: true,
      productionTargetsReferenced: false,
    });
  });

  it("requires every restore drill evidence field and rejects missing fields", () => {
    const validEvidence = REQUIRED_RESTORE_DRILL_EVIDENCE_FIELDS
      .map((field) => `| ${field} | TBD | |`)
      .join("\n");

    expect(validateRestoreDrillEvidenceText(validEvidence)).toEqual({
      ok: true,
      missingFields: [],
      sensitiveFindings: [],
      requiredFieldCount: REQUIRED_RESTORE_DRILL_EVIDENCE_FIELDS.length,
    });

    const missing = validateRestoreDrillEvidenceText("| Drill date | TBD | |");
    expect(missing.ok).toBe(false);
    expect(missing.missingFields).toEqual(
      REQUIRED_RESTORE_DRILL_EVIDENCE_FIELDS.filter((field) => field !== "Drill date"),
    );
  });

  it("validates the restore drill evidence template without claiming completion", () => {
    const report = buildRestoreDrillEvidenceValidationReport("docs/restore-drill-evidence-template.md");

    expect(report.status).toBe("passed");
    expect(report.validation.missingFields).toEqual([]);
    expect(report.validation.sensitiveFindings).toEqual([]);
    expect(report.safety).toMatchObject({
      readsSecrets: false,
      printsSecrets: false,
      runsDump: false,
      runsRestore: false,
      modifiesStaging: false,
      modifiesProduction: false,
      claimsRestoreCompleted: false,
    });
  });

  it("detects sensitive values in restore drill evidence text", () => {
    expect(
      scanRestoreDrillEvidenceSensitiveContent("postgres://user:password@example.invalid:5432/app"),
    ).toContain("database-url-with-credentials");
    expect(scanRestoreDrillEvidenceSensitiveContent("-----BEGIN PRIVATE KEY-----")).toContain("private-key-block");
    expect(scanRestoreDrillEvidenceSensitiveContent("JVBERi0xLjQK")).toContain("raw-pdf-bytes");
  });

  it("keeps restore drill docs free of secret-like values", () => {
    const docs = [
      "docs/disaster-recovery-restore-drill-runbook.md",
      "docs/restore-drill-evidence-template.md",
    ]
      .map((path) => readFileSync(resolve(path), "utf8"))
      .join("\n");

    expect(scanRestoreDrillEvidenceSensitiveContent(docs)).toEqual([]);
  });

  it("exposes a package script for non-mutating restore evidence validation", () => {
    const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
    expect(packageJson.scripts["check:restore-drill-evidence"]).toBe(
      "node scripts/staging-backup-restore-checklist.mjs --validate-evidence docs/restore-drill-evidence-template.md",
    );
  });
});
