import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  assertChecklistDoesNotTargetProduction,
  BACKUP_RESTORE_CHECK_ENV,
  BACKUP_RESTORE_DRILL_STEPS,
  buildBackupRestoreChecklistReport,
  buildHumanRestoreDrillEvidenceAcceptanceReport,
  buildRestoreEvidenceCurrentCheckReport,
  buildRestoreDrillEvidenceValidationReport,
  HUMAN_RESTORE_DRILL_ACCEPTANCE_JSON_PATH,
  HUMAN_RESTORE_DRILL_ACCEPTANCE_MD_PATH,
  RESTORE_READINESS_CHECK_JSON_PATH,
  RESTORE_READINESS_CHECK_MD_PATH,
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

function writeTempEvidenceFile(contents: string, relativePath = "docs/production-scale/evidence/human-restore-drill-evidence.md") {
  const root = mkdtempSync(join(tmpdir(), "crp-restore-evidence-"));
  const absolutePath = join(root, ...relativePath.split("/"));
  mkdirSync(join(root, "docs/production-scale/evidence"), { recursive: true });
  writeFileSync(absolutePath, contents, "utf8");
  return { root, relativePath };
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

  it("marks valid human restore evidence as current operational proof", () => {
    const report = buildRestoreEvidenceCurrentCheckReport({
      evidencePath: "tests/fixtures/human-restore-drill-evidence.valid.md",
      generatedAt: "2026-05-20T12:00:00.000Z",
    });

    expect(report).toMatchObject({
      status: "current-human-observed",
      currentOperationalProof: true,
      stale: false,
      evidenceType: "HUMAN-OBSERVED",
      humanObserved: true,
      simulatedOnly: false,
      blockerCoverage: {
        disasterRecoveryRestoreDrill: true,
        retentionArchiveRestore: true,
      },
    });
    expect(report.requiredFields).toMatchObject({
      missing: [],
      placeholders: [],
      invalidValues: [],
      sensitiveFindings: [],
    });
  });

  it("keeps simulated restore evidence simulated-only in the current check", () => {
    const root = mkdtempSync(join(tmpdir(), "crp-restore-simulated-only-"));
    mkdirSync(join(root, "docs/production-scale/evidence"), { recursive: true });
    writeFileSync(
      join(root, "docs/production-scale/evidence/latest-restore-drill-simulated.json"),
      JSON.stringify({
        reportName: "restore-drill-simulated",
        evidenceType: "SIMULATED",
        generatedAt: "2026-05-20T12:00:00.000Z",
        status: "passed",
        validation: { ok: true },
        productionProof: false,
      }, null, 2),
      "utf8",
    );

    const report = buildRestoreEvidenceCurrentCheckReport({
      rootDir: root,
      generatedAt: "2026-05-20T12:00:00.000Z",
    });

    expect(report.status).toBe("simulated-only");
    expect(report.currentOperationalProof).toBe(false);
    expect(report.evidenceType).toBe("SIMULATED");
    expect(report.simulatedOnly).toBe(true);
    expect(report.blockerCoverage.disasterRecoveryRestoreDrill).toBe(false);
    expect(report.validation.unresolvedReasons.join("\n")).toMatch(/SIMULATED-only/i);
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

    const { root, relativePath } = writeTempEvidenceFile(invalid);
    const current = buildRestoreEvidenceCurrentCheckReport({
      rootDir: root,
      evidencePath: relativePath,
      generatedAt: "2026-05-20T12:00:00.000Z",
    });
    expect(current.currentOperationalProof).toBe(false);
    expect(current.requiredFields.missing).toEqual(expect.arrayContaining(["RPO result", "RTO result"]));
  });

  it("rejects human evidence with a missing auth/session post-restore check", () => {
    const valid = readFileSync(resolve("tests/fixtures/human-restore-drill-evidence.valid.md"), "utf8");
    const invalid = valid.replace(
      "| Post-restore auth/session result | passed - auth/session lifecycle check verified | No cookies or tokens. |",
      "",
    );

    const report = validateHumanRestoreDrillEvidenceText(invalid);
    expect(report.ok).toBe(false);
    expect(report.missingRequirements).toContain("auth/session post-restore result");

    const { root, relativePath } = writeTempEvidenceFile(invalid);
    const current = buildRestoreEvidenceCurrentCheckReport({
      rootDir: root,
      evidencePath: relativePath,
      generatedAt: "2026-05-20T12:00:00.000Z",
    });
    expect(current.currentOperationalProof).toBe(false);
    expect(current.requiredFields.missing).toContain("auth/session post-restore result");
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

    const { root, relativePath } = writeTempEvidenceFile(invalid);
    const current = buildRestoreEvidenceCurrentCheckReport({
      rootDir: root,
      evidencePath: relativePath,
      generatedAt: "2026-05-20T12:00:00.000Z",
    });
    expect(current.currentOperationalProof).toBe(false);
    expect(current.requiredFields.missing).toContain("packet PDF post-restore result");
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

    const { root, relativePath } = writeTempEvidenceFile(unsafe);
    const current = buildRestoreEvidenceCurrentCheckReport({
      rootDir: root,
      evidencePath: relativePath,
      generatedAt: "2026-05-20T12:00:00.000Z",
    });
    expect(current.status).toBe("failed");
    expect(current.currentOperationalProof).toBe(false);
    expect(current.requiredFields.sensitiveFindings).toEqual(
      expect.arrayContaining(["database-url", "obvious-email-pii", "obvious-ssn-or-sin"]),
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

  it("marks otherwise accepted human restore evidence as stale when outside the max age window", () => {
    const stale = readFileSync(resolve("tests/fixtures/human-restore-drill-evidence.valid.md"), "utf8")
      .replace("| Drill date | 2026-05-20 | Synthetic date. |", "| Drill date | 2025-01-01 | Synthetic date. |")
      .replace(
        "| Drill timestamp | 2026-05-20T12:00:00-03:00 | Synthetic observed start time. |",
        "| Drill timestamp | 2025-01-01T12:00:00-03:00 | Synthetic observed start time. |",
      );

    const { root, relativePath } = writeTempEvidenceFile(stale);
    const report = buildRestoreEvidenceCurrentCheckReport({
      rootDir: root,
      evidencePath: relativePath,
      generatedAt: "2026-05-20T12:00:00.000Z",
      maxAgeDays: 90,
    });

    expect(report.status).toBe("stale-human-observed");
    expect(report.currentOperationalProof).toBe(false);
    expect(report.stale).toBe(true);
    expect(report.validation.unresolvedReasons.join("\n")).toMatch(/stale/i);
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
    expect(packageJson.scripts["restore:evidence:template"]).toBe(
      "node scripts/restore-evidence-acceptance.mjs --write-template",
    );
    expect(packageJson.scripts["restore:evidence:acceptance"]).toBe(
      "node scripts/restore-evidence-acceptance.mjs",
    );
    expect(packageJson.scripts["retention:archive-restore:simulated"]).toBe(
      "node scripts/retention-archive-restore-simulated.mjs",
    );
    expect(packageJson.scripts["restore:accept-human-evidence"]).toBe(
      "node scripts/staging-backup-restore-checklist.mjs --accept-human-evidence",
    );
    expect(packageJson.scripts["restore:evidence:current-check"]).toBe(
      "node scripts/staging-backup-restore-checklist.mjs --current-check",
    );
    expect(HUMAN_RESTORE_DRILL_ACCEPTANCE_MD_PATH).toBe(
      "docs/production-scale/evidence/latest-human-restore-drill-evidence-acceptance.md",
    );
    expect(HUMAN_RESTORE_DRILL_ACCEPTANCE_JSON_PATH).toBe(
      "docs/production-scale/evidence/latest-human-restore-drill-evidence-acceptance.json",
    );
    expect(RESTORE_READINESS_CHECK_MD_PATH).toBe(
      "docs/production-scale/evidence/latest-restore-readiness-check.md",
    );
    expect(RESTORE_READINESS_CHECK_JSON_PATH).toBe(
      "docs/production-scale/evidence/latest-restore-readiness-check.json",
    );
  });
});
