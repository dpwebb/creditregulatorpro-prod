import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildSimulatedRetentionArchiveRestoreReport,
  renderSimulatedRetentionArchiveRestoreMarkdown,
  RETENTION_ARCHIVE_RESTORE_MARKERS,
  scanRetentionEvidenceSensitiveContent,
  validateRetentionArchiveRestoreEvidenceText,
  validateSimulatedRetentionArchiveRestoreReport,
  writeSimulatedRetentionArchiveRestoreEvidence,
} from "../../scripts/retention-archive-restore-simulated.mjs";

const tempRoots: string[] = [];

function writeFixtureFile(rootDir: string, relativePath: string, source: string) {
  const absolutePath = path.join(rootDir, ...relativePath.split("/"));
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source, "utf8");
}

function makeTempRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "crp-retention-archive-restore-"));
  tempRoots.push(root);
  writeFixtureFile(root, "endpoints/admin/retention_POST.schema.ts", "export const confirmation = 'APPLY_RETENTION_PURGE';\n");
  writeFixtureFile(root, "endpoints/retention/auto-purge_POST.schema.ts", "export const confirmation = 'APPLY_RETENTION_PURGE';\n");
  writeFixtureFile(root, "endpoints/admin/retention_POST.ts", "const result = applyRequested ? enforceRetention(true) : previewRetention();\n");
  writeFixtureFile(root, "endpoints/retention/auto-purge_POST.ts", "const result = applyRequested ? enforceRetention(true) : previewRetention();\n");
  writeFixtureFile(root, "helpers/retentionApplyGuard.ts", "export const RETENTION_APPLY_CONFIRMATION = 'APPLY_RETENTION_PURGE';\n");
  writeFixtureFile(root, "helpers/dataRetention.tsx", "const getOneYearAgo = () => new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);\nmessage: 'Retention enforcement skipped: confirmDelete flag is false.';\n");
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("simulated retention archive/restore evidence", () => {
  it("creates markdown and json evidence with SIMULATED labels and synthetic IDs", () => {
    const rootDir = makeTempRoot();
    const report = buildSimulatedRetentionArchiveRestoreReport({
      rootDir,
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
      simulationId: "sim-retention-test-001",
    });
    const outputs = writeSimulatedRetentionArchiveRestoreEvidence(report, { rootDir });

    expect(outputs).toEqual({
      markdownPath: "docs/production-scale/evidence/latest-retention-archive-restore-simulated.md",
      jsonPath: "docs/production-scale/evidence/latest-retention-archive-restore-simulated.json",
    });
    expect(existsSync(path.join(rootDir, outputs.markdownPath))).toBe(true);
    expect(existsSync(path.join(rootDir, outputs.jsonPath))).toBe(true);

    const markdown = readFileSync(path.join(rootDir, outputs.markdownPath), "utf8");
    const json = JSON.parse(readFileSync(path.join(rootDir, outputs.jsonPath), "utf8"));

    expect(markdown).toContain("# SIMULATED Retention Archive/Restore Evidence");
    expect(markdown).toContain("SIMULATED evidence only");
    expect(markdown).toContain("SIMULATED-RETENTION-ARCHIVE-sim-retention-test-001");
    expect(markdown).toContain("SIMULATED-RETENTION-RESTORE-sim-retention-test-001");
    expect(json.evidenceType).toBe("SIMULATED");
    expect(json.humanObservedPhysicalArchiveRestoreStillRequired).toBe(true);
  });

  it("simulates non-destructive preview, archive write, restore verification, audit events, and apply guard", () => {
    const report = buildSimulatedRetentionArchiveRestoreReport({
      rootDir: makeTempRoot(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
      simulationId: "sim-retention-test-002",
    });

    expect(validateSimulatedRetentionArchiveRestoreReport(report)).toEqual({ ok: true, errors: [] });
    expect(report.preview).toMatchObject({
      marker: RETENTION_ARCHIVE_RESTORE_MARKERS.preview,
      destructiveMutationPerformed: false,
      eligibleRecordCount: 3,
    });
    expect(report.archive).toMatchObject({
      marker: RETENTION_ARCHIVE_RESTORE_MARKERS.archiveWrite,
      physicalArchiveWritten: false,
      archivedRecordCount: 3,
    });
    expect(report.restoreVerification).toMatchObject({
      marker: RETENTION_ARCHIVE_RESTORE_MARKERS.restoreVerify,
      status: "passed",
      verifiedRecordCount: 3,
    });
    expect(report.auditEvidence.events.map((event: { action: string }) => event.action)).toEqual([
      "RETENTION_PREVIEW_SIMULATED",
      "RETENTION_ARCHIVE_WRITE_SIMULATED",
      "RETENTION_RESTORE_VERIFY_SIMULATED",
      "RETENTION_APPLY_GUARD_SIMULATED",
    ]);
    expect(report.applyGuard).toMatchObject({
      status: "passed",
      destructivePathRequiresConfirmation: true,
      previewDefaultPresent: true,
      confirmDeleteGuardPresent: true,
      retentionWindowDays: 365,
    });
  });

  it("renders no production proof claim and no raw PII or secrets", () => {
    const report = buildSimulatedRetentionArchiveRestoreReport({
      rootDir: makeTempRoot(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
      simulationId: "sim-retention-test-003",
    });
    const markdown = renderSimulatedRetentionArchiveRestoreMarkdown(report);

    expect(markdown).toContain("not physical retention archive/restore completion");
    expect(markdown).toContain("Production data mutated: no");
    expect(markdown).toContain("Retention windows changed: no");
    expect(markdown).toContain("Disaster recovery restore-drill proof remains a separate human-observed requirement");
    expect(scanRetentionEvidenceSensitiveContent(`${markdown}\n${JSON.stringify(report)}`)).toEqual([]);
  });

  it("fails closed in production-like environments", () => {
    expect(() =>
      buildSimulatedRetentionArchiveRestoreReport({
        rootDir: makeTempRoot(),
        env: { CRP_ENV: "production" },
      }),
    ).toThrow(/production-like environment/i);
  });

  it("rejects retention evidence that omits proof type or synthetic IDs", () => {
    expect(validateRetentionArchiveRestoreEvidenceText("Archive ID: local-archive-1")).toMatchObject({
      ok: false,
      evidenceType: "unknown",
    });

    const missingIds = validateRetentionArchiveRestoreEvidenceText("Evidence type: SIMULATED\nArchive ID: local-archive-1");
    expect(missingIds.ok).toBe(false);
    expect(missingIds.errors.join("\n")).toContain("synthetic archive ID");
    expect(missingIds.errors.join("\n")).toContain("synthetic restore verification ID");
  });

  it("rejects secrets, obvious PII, and production restore claims without human proof", () => {
    const unsafe = validateRetentionArchiveRestoreEvidenceText([
      "Evidence type: SIMULATED",
      "Archive ID: SIMULATED-RETENTION-ARCHIVE-001",
      "Restore verification ID: SIMULATED-RETENTION-RESTORE-001",
      "Production retention restore completed successfully.",
      "password=super-secret-value",
      "consumer@example.org",
    ].join("\n"));

    expect(unsafe.ok).toBe(false);
    expect(unsafe.productionRestoreClaimed).toBe(true);
    expect(unsafe.sensitiveFindings).toEqual(expect.arrayContaining(["password-assignment", "obvious-email-pii"]));
    expect(unsafe.missingHumanProofFields).toEqual(
      expect.arrayContaining(["Operator identity", "Officer acknowledgement", "Signoff"]),
    );
  });
});
