import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertChecklistDoesNotTargetProduction,
  BACKUP_RESTORE_CHECK_ENV,
  BACKUP_RESTORE_DRILL_STEPS,
  buildBackupRestoreChecklistReport,
  buildHumanRestoreDrillEvidenceAcceptanceReport,
  buildRestoreDrillEvidenceValidationReport,
  HUMAN_RESTORE_DRILL_ACCEPTANCE_JSON_PATH,
  HUMAN_RESTORE_DRILL_ACCEPTANCE_MD_PATH,
  REQUIRED_REFRESH_SAFETY_ANCHORS,
  REQUIRED_RESTORE_DRILL_EVIDENCE_FIELDS,
  scanRestoreDrillEvidenceSensitiveContent,
  shouldRunBackupRestoreCheck,
  validateGitignoreForDumpArtifacts,
  validateHumanRestoreDrillEvidenceText,
  validateRefreshScriptSafety,
  validateRestoreDrillEvidenceText,
} from "../../scripts/staging-backup-restore-checklist.mjs";

function completeSyntheticFilledEvidence(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    "Evidence type": "HUMAN-OBSERVED",
    "Drill date": "2026-05-20",
    "Drill timestamp": "2026-05-20T12:00:00-03:00",
    "Operator identity": "Synthetic Operator",
    "Officer acknowledgement": "Synthetic Officer acknowledged sanitized evidence",
    "Source environment": "staging-safe synthetic source",
    "Source commit/SHA": "abc123synthetic",
    "Backup source": "sanitized synthetic backup family",
    "Source backup/dump identifier without secrets": "backup-simulated-20260520",
    "Restore target": "local synthetic restore target",
    "Target environment": "local non-production",
    "Target DB guard confirmation": "CRP_LOCAL_DEV=true confirmed",
    "RPO target": "15 minutes",
    "RPO actual": "5 minutes",
    "RTO target": "30 minutes",
    "RTO actual": "10 minutes",
    "Actual restore duration": "8 minutes",
    "Post-restore checks run": "golden path, auth/session, packet PDF, response queue, cleanup lifecycle",
    "Golden path result": "pass - pnpm run test:golden-path",
    "Post-restore auth/session result": "pass - auth session synthetic marker",
    "Post-restore packet PDF result": "pass - packet PDF synthetic marker",
    "Post-restore response queue result": "pass - response queue synthetic marker",
    "Cleanup/lifecycle result": "pass - local dump cleanup confirmed",
    "Retention archive/restore result or explicit retention exclusion": "pass - retention archive/restore recoverability marker",
    "Rollback/cleanup result": "pass - local target cleanup completed",
    "Signed operator acknowledgement": "signed - synthetic operator acknowledged sanitized evidence",
    "Sanitized evidence statement": "sanitized - no secrets, PII, raw report text, raw PDFs, raw base64, tokens, database URLs, access keys, or signed URLs",
    "Signoff": "Synthetic operator, observer, and reviewer signed off",
    ...overrides,
  };

  return [
    "# Filled Restore Drill Evidence",
    "",
    "| Field | Value | Notes |",
    "| --- | --- | --- |",
    ...REQUIRED_RESTORE_DRILL_EVIDENCE_FIELDS.map((field) => `| ${field} | ${values[field] ?? "missing"} | synthetic |`),
  ].join("\n");
}

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

  it("accepts a safe complete synthetic filled restore evidence fixture", () => {
    expect(validateRestoreDrillEvidenceText(completeSyntheticFilledEvidence())).toMatchObject({
      ok: true,
      templateOnly: false,
      missingFields: [],
      placeholderFields: [],
      sensitiveFindings: [],
      productionRestoreClaimed: false,
      missingOperatorProofFields: [],
      requiredFieldCount: REQUIRED_RESTORE_DRILL_EVIDENCE_FIELDS.length,
    });
  });

  it("requires every restore drill evidence field and rejects missing fields", () => {
    const validEvidence = completeSyntheticFilledEvidence();
    expect(validateRestoreDrillEvidenceText(validEvidence).ok).toBe(true);

    const missing = validateRestoreDrillEvidenceText("| Drill date | TBD | |");
    expect(missing.ok).toBe(false);
    expect(missing.missingFields).toEqual(
      REQUIRED_RESTORE_DRILL_EVIDENCE_FIELDS.filter((field) => field !== "Drill date"),
    );
  });

  it("rejects missing or placeholder RPO/RTO values in filled evidence", () => {
    const report = validateRestoreDrillEvidenceText(completeSyntheticFilledEvidence({
      "RPO target": "TBD",
      "RPO actual": "TODO",
      "RTO target": "N/A",
      "RTO actual": "-",
    }));

    expect(report.ok).toBe(false);
    expect(report.placeholderFields).toEqual(
      expect.arrayContaining(["RPO target", "RPO actual", "RTO target", "RTO actual"]),
    );
  });

  it("rejects missing post-restore check results", () => {
    const evidence = completeSyntheticFilledEvidence()
      .split(/\r?\n/)
      .filter((line) =>
        !line.includes("| Post-restore auth/session result |") &&
        !line.includes("| Post-restore packet PDF result |") &&
        !line.includes("| Post-restore response queue result |") &&
        !line.includes("| Cleanup/lifecycle result |"),
      )
      .join("\n");
    const report = validateRestoreDrillEvidenceText(evidence);

    expect(report.ok).toBe(false);
    expect(report.missingFields).toEqual(
      expect.arrayContaining([
        "Post-restore auth/session result",
        "Post-restore packet PDF result",
        "Post-restore response queue result",
        "Cleanup/lifecycle result",
      ]),
    );
  });

  it("validates the restore drill evidence template without claiming completion", () => {
    const report = buildRestoreDrillEvidenceValidationReport("docs/restore-drill-evidence-template.md");

    expect(report.status).toBe("passed");
    expect(report.validation.missingFields).toEqual([]);
    expect(report.validation.placeholderFields).toEqual([]);
    expect(report.validation.templateOnly).toBe(true);
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
    expect(scanRestoreDrillEvidenceSensitiveContent("password=super-secret-value")).toContain("password-assignment");
    expect(scanRestoreDrillEvidenceSensitiveContent("consumer@example.org")).toContain("obvious-email-pii");
    expect(scanRestoreDrillEvidenceSensitiveContent("123-45-6789")).toContain("obvious-ssn-or-sin");
    expect(scanRestoreDrillEvidenceSensitiveContent("fileDataBase64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toContain("raw-base64-block");
  });

  it("rejects secrets and obvious PII in filled evidence", () => {
    const report = validateRestoreDrillEvidenceText(
      `${completeSyntheticFilledEvidence()}\nOperator email: consumer@example.org\npassword=super-secret-value\n123-45-6789`,
    );

    expect(report.ok).toBe(false);
    expect(report.sensitiveFindings).toEqual(
      expect.arrayContaining(["obvious-email-pii", "password-assignment", "obvious-ssn-or-sin"]),
    );
  });

  it("rejects production restore completion claims without required operator fields", () => {
    const evidence = completeSyntheticFilledEvidence({
      "Operator identity": "TBD",
      "Officer acknowledgement": "TBD",
      "Signoff": "TBD",
    }) + "\nProduction restore completed successfully.";
    const report = validateRestoreDrillEvidenceText(evidence);

    expect(report.ok).toBe(false);
    expect(report.productionRestoreClaimed).toBe(true);
    expect(report.missingOperatorProofFields).toEqual(
      expect.arrayContaining(["Operator identity", "Officer acknowledgement", "Signoff"]),
    );
  });

  it("accepts a valid sanitized human-observed fixture for blocker 1 and 22 coverage", () => {
    const report = buildHumanRestoreDrillEvidenceAcceptanceReport({
      evidencePath: "tests/fixtures/human-restore-drill-evidence.valid.md",
      generatedAt: "2026-05-20T12:00:00.000Z",
    });

    expect(report.status).toBe("accepted");
    expect(report.accepted).toBe(true);
    expect(report.validation).toMatchObject({
      ok: true,
      evidenceType: "HUMAN-OBSERVED",
      sensitiveFindings: [],
      simulatedOnlySubmission: false,
    });
    expect(report.blockerCoverage).toEqual({
      disasterRecoveryRestoreDrill: true,
      retentionArchiveRestore: true,
    });
  });

  it("fails human acceptance when no default artifact has been submitted", () => {
    const report = buildHumanRestoreDrillEvidenceAcceptanceReport({
      rootDir: process.cwd(),
      generatedAt: "2026-05-20T12:00:00.000Z",
    });

    expect(report.status).toBe("not-submitted");
    expect(report.accepted).toBe(false);
    expect(report.blockerCoverage).toEqual({
      disasterRecoveryRestoreDrill: false,
      retentionArchiveRestore: false,
    });
  });

  it("rejects human evidence with missing RPO/RTO results", () => {
    const valid = readFileSync(resolve("tests/fixtures/human-restore-drill-evidence.valid.md"), "utf8");
    const invalid = valid
      .replace("| RPO actual | passed - observed 5 minutes, within target | Synthetic result. |", "")
      .replace("| RTO actual | passed - observed 12 minutes, within target | Synthetic result. |", "");

    const report = validateHumanRestoreDrillEvidenceText(invalid);

    expect(report.ok).toBe(false);
    expect(report.missingRequirements).toEqual(expect.arrayContaining(["RPO result", "RTO result"]));
  });

  it("rejects human evidence with a missing packet PDF post-restore check", () => {
    const valid = readFileSync(resolve("tests/fixtures/human-restore-drill-evidence.valid.md"), "utf8");
    const invalid = valid.replace(
      "| Post-restore packet PDF result | passed - packet PDF download check verified | No raw PDF bytes. |",
      "",
    );

    const report = validateHumanRestoreDrillEvidenceText(invalid);

    expect(report.ok).toBe(false);
    expect(report.missingRequirements).toContain("packet PDF post-restore result");
  });

  it("rejects human evidence with a missing response queue post-restore check", () => {
    const valid = readFileSync(resolve("tests/fixtures/human-restore-drill-evidence.valid.md"), "utf8");
    const invalid = valid.replace(
      "| Post-restore response queue result | passed - response queue drain and dead-letter visibility verified | No provider calls. |",
      "",
    );

    const report = validateHumanRestoreDrillEvidenceText(invalid);

    expect(report.ok).toBe(false);
    expect(report.missingRequirements).toContain("response queue post-restore result");
  });

  it("rejects secrets, access keys, signed URLs, raw report text, raw base64, and PII in human evidence", () => {
    const valid = readFileSync(resolve("tests/fixtures/human-restore-drill-evidence.valid.md"), "utf8");
    const unsafe = [
      valid,
      "postgres://user:password@example.invalid:5432/app",
      "AKIA1234567890ABCDEF",
      "https://example.invalid/object?X-Amz-Signature=abc123",
      "rawExtractedText: full report body",
      "fileDataBase64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      "consumer@example.org",
      "123-45-6789",
    ].join("\n");

    const report = validateHumanRestoreDrillEvidenceText(unsafe);

    expect(report.ok).toBe(false);
    expect(report.sensitiveFindings).toEqual(
      expect.arrayContaining([
        "database-url",
        "database-url-with-credentials",
        "aws-access-key",
        "signed-url",
        "raw-report-text-field",
        "raw-base64-block",
        "obvious-email-pii",
        "obvious-ssn-or-sin",
      ]),
    );
  });

  it("rejects simulated-only evidence submitted as human proof", () => {
    const invalid = readFileSync(resolve("tests/fixtures/human-restore-drill-evidence.invalid.md"), "utf8");
    const report = validateHumanRestoreDrillEvidenceText(invalid);

    expect(report.ok).toBe(false);
    expect(report.evidenceType).toBe("SIMULATED");
    expect(report.simulatedOnlySubmission).toBe(true);
    expect(report.errors.join("\n")).toMatch(/SIMULATED-only evidence cannot be accepted/i);
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
    expect(packageJson.scripts["restore:drill:simulated"]).toBe("node scripts/restore-drill-simulated.mjs");
    expect(packageJson.scripts["retention:archive-restore:simulated"]).toBe(
      "node scripts/retention-archive-restore-simulated.mjs",
    );
    expect(packageJson.scripts["restore:accept-human-evidence"]).toBe(
      "node scripts/staging-backup-restore-checklist.mjs --accept-human-evidence",
    );
    expect(HUMAN_RESTORE_DRILL_ACCEPTANCE_MD_PATH).toBe(
      "docs/production-scale/evidence/latest-human-restore-drill-evidence-acceptance.md",
    );
    expect(HUMAN_RESTORE_DRILL_ACCEPTANCE_JSON_PATH).toBe(
      "docs/production-scale/evidence/latest-human-restore-drill-evidence-acceptance.json",
    );
  });
});
