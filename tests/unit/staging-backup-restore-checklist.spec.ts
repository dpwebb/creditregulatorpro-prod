import { describe, expect, it } from "vitest";

import {
  assertChecklistDoesNotTargetProduction,
  BACKUP_RESTORE_CHECK_ENV,
  BACKUP_RESTORE_DRILL_STEPS,
  buildBackupRestoreChecklistReport,
  REQUIRED_REFRESH_SAFETY_ANCHORS,
  shouldRunBackupRestoreCheck,
  validateGitignoreForDumpArtifacts,
  validateRefreshScriptSafety,
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
});
