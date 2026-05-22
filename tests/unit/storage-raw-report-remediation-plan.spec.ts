import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { resolveEvidenceAttachmentBase64 } from "../../helpers/evidenceAttachmentStorage";
import { resolveReportArtifactPdfBase64 } from "../../helpers/reportArtifactStorage";
import {
  buildRawReportRemediationAcceptanceReport,
  buildStorageRawReportRemediationPlanReport,
  parseStorageRawReportRemediationArgs,
  RAW_REPORT_INVENTORY_JSON_PATH,
  renderStorageRawReportRemediationPlanMarkdown,
  validateRawReportRemediationAcceptanceEvidence,
  writeRawReportRemediationAcceptanceReport,
  writeStorageRawReportRemediationPlan,
} from "../../scripts/storage-raw-report-remediation-plan.mjs";

const tempRoots: string[] = [];
const pdfBase64 = Buffer.from("%PDF-1.4\nsynthetic legacy inline report\n%%EOF", "utf8").toString("base64");

function makeTempRoot() {
  const root = mkdtempSync(join(tmpdir(), "crp-raw-report-remediation-test-"));
  tempRoots.push(root);
  return root;
}

function writeInventory(rootDir: string, overrides: Record<string, unknown> = {}) {
  const target = join(rootDir, RAW_REPORT_INVENTORY_JSON_PATH);
  mkdirSync(dirname(target), { recursive: true });
  const inventory = {
    reportName: "storage-raw-report-inventory",
    generatedAt: "2026-05-20T12:00:00.000Z",
    timestamp: "2026-05-20T12:00:00.000Z",
    environment: "staging",
    evidenceType: "SANITIZED_READ_ONLY_INVENTORY",
    status: "completed",
    databaseReachable: true,
    countsReliable: true,
    CERTIFYING: true,
    dataSource: {
      kind: "database",
      environment: "staging",
      reliable: true,
      access: "connected-read-only-aggregate-counts",
      rawConnectionDetailsStored: false,
    },
    inventoryMethod: "read-only-aggregate-sql-counts",
    rawValuesPrinted: false,
    rawBytesPrinted: false,
    signedUrlsPrinted: false,
    productionDataMutated: false,
    historicalRowsMigrated: false,
    tables: {
      reportArtifact: {
        totalRows: 10,
        storageUrlRows: 9,
        localReferenceRows: 6,
        possibleInlineBase64Rows: 2,
        dataUrlBase64Rows: 1,
        nonLocalReferenceRows: 0,
        nullStorageRows: 1,
      },
      evidenceAttachment: {
        totalRows: 8,
        storageUrlRows: 8,
        localReferenceRows: 5,
        possibleInlineBase64Rows: 1,
        dataUrlBase64Rows: 0,
        nonLocalReferenceRows: 1,
        nullStorageRows: 1,
      },
    },
    recordCounts: {
      reportArtifact: {
        totalRows: 10,
        storageUrlRows: 9,
        localReferenceRows: 6,
        possibleInlineBase64Rows: 2,
        dataUrlBase64Rows: 1,
        nonLocalReferenceRows: 0,
        nullStorageRows: 1,
      },
      evidenceAttachment: {
        totalRows: 8,
        storageUrlRows: 8,
        localReferenceRows: 5,
        possibleInlineBase64Rows: 1,
        dataUrlBase64Rows: 0,
        nonLocalReferenceRows: 1,
        nullStorageRows: 1,
      },
    },
    unresolvedCounts: {
      reportArtifact: {
        possibleInlineBase64Rows: 2,
        dataUrlBase64Rows: 1,
      },
      evidenceAttachment: {
        possibleInlineBase64Rows: 1,
        dataUrlBase64Rows: 0,
      },
      totalRows: 4,
    },
    remediationCandidateCounts: {
      reportArtifact: 3,
      evidenceAttachment: 1,
      totalRows: 4,
    },
    confidence: {
      level: "high",
      countsReliable: true,
      reason: "Read-only aggregate SQL counts completed against the configured staging-safe database.",
    },
    ...overrides,
  };
  writeFileSync(target, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
}

function writeAcceptedInventoryAndPlan(rootDir: string) {
  writeInventory(rootDir);
  const plan = buildStorageRawReportRemediationPlanReport({
    rootDir,
    generatedAt: "2026-05-20T13:00:00.000Z",
    env: {},
  });
  writeStorageRawReportRemediationPlan(plan, { rootDir });
  return plan;
}

function validAcceptanceEvidence(overrides: Record<string, unknown> = {}) {
  return {
    evidenceId: "RRR-UNIT-001",
    evidenceType: "HUMAN_OBSERVED_RAW_REPORT_REMEDIATION",
    environment: "production",
    remediationMode: "operator-applied",
    dryRunOnly: false,
    operatorNameOrRole: "Compliance operations lead",
    approvedAt: "2026-05-20T14:00:00.000Z",
    performedAt: "2026-05-20T15:00:00.000Z",
    inventoryEvidencePath: "docs/production-scale/evidence/latest-storage-raw-report-inventory.json",
    remediationPlanEvidencePath: "docs/production-scale/evidence/latest-storage-raw-report-remediation-plan.json",
    inventoryRun: true,
    reliableInventoryAccepted: true,
    remediationPlanApproved: true,
    remediationPerformedByOperatorOrApprovedProcess: true,
    remediationApplied: true,
    oldInlineCompatibilityTested: true,
    sanitizedEvidence: true,
    postRemediationCountsRecorded: true,
    backupRestorePrerequisiteAcknowledged: true,
    operatorAcknowledgementSigned: true,
    historicalInlineRowsResolved: true,
    noRawSensitiveValuesAppearInEvidence: true,
    productionDataMutatedByCodex: false,
    codexPerformedRemediation: false,
    postRemediationCounts: {
      reportArtifact: {
        possibleInlineBase64Rows: 0,
      },
      evidenceAttachment: {
        possibleInlineBase64Rows: 0,
      },
    },
    ...overrides,
  };
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("storage raw report remediation plan", () => {
  it("writes a dry-run-only plan without raw base64 or PII", () => {
    const rootDir = makeTempRoot();
    writeInventory(rootDir, {
      ignoredUnsafeField: `not rendered ${pdfBase64} person@example.net 123-45-6789`,
    });

    const report = buildStorageRawReportRemediationPlanReport({
      rootDir,
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const outputs = writeStorageRawReportRemediationPlan(report, { rootDir });
    const markdown = renderStorageRawReportRemediationPlanMarkdown(report);
    const serialized = `${markdown}\n${readFileSync(join(rootDir, outputs.jsonPath), "utf8")}`;

    expect(existsSync(join(rootDir, outputs.markdownPath))).toBe(true);
    expect(report.dryRunOnly).toBe(true);
    expect(report.historicalRowsDeleted).toBe(false);
    expect(report.historicalRowsMigratedByCodex).toBe(false);
    expect(report.remediationCategories.map((item) => item.table)).toEqual(
      expect.arrayContaining(["report_artifact", "evidence_attachment"]),
    );
    expect(serialized).not.toContain(pdfBase64);
    expect(serialized).not.toMatch(/JVBERi0|data:application\/pdf;base64|person@example\.net|123-45-6789|postgres:\/\//i);
  });

  it("refuses production mutation flags and production-like execution", () => {
    expect(() => parseStorageRawReportRemediationArgs(["--apply"])).toThrow(/dry-run only/i);
    expect(() =>
      buildStorageRawReportRemediationPlanReport({
        rootDir: makeTempRoot(),
        env: { CRP_STORAGE_RAW_REPORT_REMEDIATION_APPLY: "true" },
      }),
    ).toThrow(/Refusing raw report remediation mutation/i);
    expect(() =>
      buildStorageRawReportRemediationPlanReport({
        rootDir: makeTempRoot(),
        env: { CRP_ENV: "production" },
      }),
    ).toThrow(/production-like environment/i);
  });

  it("acceptance fails without operator approval", () => {
    const validation = validateRawReportRemediationAcceptanceEvidence(
      validAcceptanceEvidence({
        remediationPlanApproved: false,
        operatorAcknowledgementSigned: false,
      }),
    );

    expect(validation.accepted).toBe(false);
    expect(validation.errors.join("\n")).toMatch(/remediationPlanApproved must be true/);
    expect(validation.errors.join("\n")).toMatch(/operatorAcknowledgementSigned must be true/);
  });

  it("acceptance fails with secrets, PII, or raw values", () => {
    const validation = validateRawReportRemediationAcceptanceEvidence(
      validAcceptanceEvidence({
        operatorNotes: `postgres://user:pass@db.example.com/prod ${pdfBase64} consumer@example.net`,
      }),
    );

    expect(validation.accepted).toBe(false);
    expect(validation.sensitiveFindings).toEqual(expect.arrayContaining(["database-url", "raw-pdf-bytes", "obvious-email-pii"]));
  });

  it("acceptance remains not-submitted until a sanitized operator artifact exists", () => {
    const rootDir = makeTempRoot();
    const report = buildRawReportRemediationAcceptanceReport({
      rootDir,
      generatedAt: "2026-05-20T12:00:00.000Z",
    });
    const outputs = writeRawReportRemediationAcceptanceReport(report, { rootDir });

    expect(report.status).toBe("not-submitted");
    expect(report.accepted).toBe(false);
    expect(report.blockerCoverage.historicalRawReportBytes).toBe(false);
    expect(existsSync(join(rootDir, outputs.jsonPath))).toBe(true);
  });

  it("rejects inventory-unreliable remediation as complete acceptance", () => {
    const rootDir = makeTempRoot();
    writeInventory(rootDir, {
      status: "database-unavailable",
      databaseReachable: false,
      countsReliable: false,
      CERTIFYING: false,
      dataSource: {
        kind: "database",
        environment: "staging",
        reliable: false,
        access: "unavailable",
        rawConnectionDetailsStored: false,
      },
      confidence: {
        level: "unreliable",
        countsReliable: false,
        reason: "Database unavailable.",
      },
    });
    const plan = buildStorageRawReportRemediationPlanReport({
      rootDir,
      generatedAt: "2026-05-20T13:00:00.000Z",
      env: {},
    });
    writeStorageRawReportRemediationPlan(plan, { rootDir });

    const report = buildRawReportRemediationAcceptanceReport({
      rootDir,
      generatedAt: "2026-05-20T14:00:00.000Z",
      rawReportRemediationEvidence: validAcceptanceEvidence(),
    });

    expect(plan.status).toBe("inventory-unreliable");
    expect(report.accepted).toBe(false);
    expect(report.blockerCoverage.historicalRawReportBytes).toBe(false);
    expect(report.validation.errors.join("\n")).toMatch(/Reliable database connectivity is required/i);
  });

  it("rejects dry-run-only remediation as complete production remediation", () => {
    const rootDir = makeTempRoot();
    writeAcceptedInventoryAndPlan(rootDir);
    const report = buildRawReportRemediationAcceptanceReport({
      rootDir,
      generatedAt: "2026-05-20T14:00:00.000Z",
      rawReportRemediationEvidence: validAcceptanceEvidence({
        remediationMode: "dry-run",
        dryRunOnly: true,
        remediationApplied: false,
      }),
    });

    expect(report.accepted).toBe(false);
    expect(report.validation.errors.join("\n")).toMatch(/Dry-run-only remediation evidence cannot close/i);
    expect(report.validation.errors.join("\n")).toMatch(/remediationApplied must be true/i);
  });

  it("accepts sanitized operator evidence for blocker 6 coverage", () => {
    const rootDir = makeTempRoot();
    writeAcceptedInventoryAndPlan(rootDir);
    const report = buildRawReportRemediationAcceptanceReport({
      rootDir,
      generatedAt: "2026-05-20T12:00:00.000Z",
      rawReportRemediationEvidence: validAcceptanceEvidence(),
    });

    expect(report.status).toBe("accepted");
    expect(report.accepted).toBe(true);
    expect(report.productionProof).toBe(true);
    expect(report.linkedEvidence.reliableInventoryAccepted).toBe(true);
    expect(report.blockerCoverage.historicalRawReportBytes).toBe(true);
    expect(report.validation.remainingPossibleInlineBase64Rows).toBe(0);
  });

  it("does not accept staging remediation evidence as production blocker coverage", () => {
    const rootDir = makeTempRoot();
    writeAcceptedInventoryAndPlan(rootDir);
    const report = buildRawReportRemediationAcceptanceReport({
      rootDir,
      generatedAt: "2026-05-20T14:00:00.000Z",
      rawReportRemediationEvidence: validAcceptanceEvidence({
        environment: "staging",
      }),
    });

    expect(report.accepted).toBe(false);
    expect(report.productionProof).toBe(false);
    expect(report.blockerCoverage.historicalRawReportBytes).toBe(false);
  });

  it("keeps old inline report and attachment records readable", async () => {
    await expect(resolveReportArtifactPdfBase64(pdfBase64)).resolves.toBe(pdfBase64);
    await expect(resolveEvidenceAttachmentBase64(`data:application/pdf;base64,${pdfBase64}`)).resolves.toBe(pdfBase64);
  });

  it("exposes package commands", () => {
    const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));

    expect(packageJson.scripts["storage:raw-report-remediation-plan"]).toBe(
      "node scripts/storage-raw-report-remediation-plan.mjs",
    );
    expect(packageJson.scripts["storage:raw-report-remediation-acceptance"]).toBe(
      "node scripts/storage-raw-report-remediation-plan.mjs --acceptance",
    );
  });
});
