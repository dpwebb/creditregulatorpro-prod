import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildProductionPromotionPackReport,
  REQUIRED_PROMOTION_COMMANDS,
  validatePromotionPackReport,
} from "../../scripts/production-promotion-pack.mjs";
import { buildProductionWorkerReadinessEvidenceReport } from "../../scripts/production-worker-readiness-evidence.mjs";
import { buildHumanRestoreDrillEvidenceAcceptanceReport } from "../../scripts/staging-backup-restore-checklist.mjs";
import { buildRawReportRemediationAcceptanceReport } from "../../scripts/storage-raw-report-remediation-plan.mjs";

function dashboardWithSkips(skip = 2) {
  return {
    summary: {
      pass: 10,
      fail: 0,
      skip,
      simulated: 3,
      humanRequired: 2,
    },
    releaseEvidenceSemantics: {
      exactCommandsRequired: true,
      dashboardPassAloneSufficient: false,
      skipTreatedAsPass: false,
    },
  };
}

function buildPack() {
  return buildProductionPromotionPackReport({
    rootDir: process.cwd(),
    dashboardReport: dashboardWithSkips(),
    generatedAt: "2026-05-20T12:00:00.000Z",
    env: {},
  });
}

function acceptedRawReportRemediationEvidence() {
  return {
    evidenceType: "HUMAN_OBSERVED_RAW_REPORT_REMEDIATION",
    operatorNameOrRole: "Compliance operations lead",
    approvedAt: "2026-05-20T14:00:00.000Z",
    performedAt: "2026-05-20T15:00:00.000Z",
    inventoryEvidencePath: "docs/production-scale/evidence/latest-storage-raw-report-inventory.json",
    remediationPlanEvidencePath: "docs/production-scale/evidence/latest-storage-raw-report-remediation-plan.json",
    inventoryRun: true,
    remediationPlanApproved: true,
    remediationPerformedByOperatorOrApprovedProcess: true,
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
  };
}

describe("production promotion evidence pack", () => {
  it("fails if a required blocker is missing", () => {
    const registry = JSON.parse(readFileSync(resolve("docs/production-scale/blocker-registry.json"), "utf8"));
    registry.blockers = registry.blockers.filter((blocker: { number: number }) => blocker.number !== 25);

    expect(() =>
      buildProductionPromotionPackReport({
        rootDir: process.cwd(),
        registry,
        dashboardReport: dashboardWithSkips(),
        env: {},
      }),
    ).toThrow(/Missing blocker number\(s\): 25|Expected 25 blockers/);
  });

  it("fails if simulated proof is mislabeled as production proof", () => {
    const report = buildPack();
    const simulated = report.generatedEvidenceFileReferences.find((file: { evidenceType: string | null }) =>
      /simulated/i.test(String(file.evidenceType ?? "")),
    );
    expect(simulated).toBeTruthy();
    simulated.productionProof = true;

    expect(validatePromotionPackReport(report)).toMatchObject({
      valid: false,
    });
    expect(validatePromotionPackReport(report).errors.join("\n")).toMatch(/SIMULATED evidence is mislabeled/i);
  });

  it("fails if dashboard SKIP is treated as PASS", () => {
    const report = buildPack();
    report.skippedChecks.treatsSkipAsPass = true;

    expect(validatePromotionPackReport(report)).toMatchObject({
      valid: false,
    });
    expect(validatePromotionPackReport(report).errors.join("\n")).toMatch(/Dashboard SKIP is treated as PASS/i);
  });

  it("detects stale audit commit references where practical", () => {
    const report = buildPack();

    expect(report.auditCurrentCommitHash).toMatch(/^[a-f0-9]{40}$/);
    expect(report.currentCommitHash).toMatch(/^[a-f0-9]{40}$/);
    expect(report.staleReferences.auditCommitReferenceStale).toBe(report.auditCurrentCommitHash !== report.currentCommitHash);
  });

  it("includes all 25 blockers and exact command references", () => {
    const report = buildPack();

    expect(report.blockerClassifications).toHaveLength(25);
    expect(report.registry.actualBlockerCount).toBe(25);
    expect(report.currentBranch).toBeTruthy();
    expect(report.currentCommitHash).toMatch(/^[a-f0-9]{40}$/);
    for (const command of REQUIRED_PROMOTION_COMMANDS) {
      expect(report.commandList).toContain(command);
    }
    expect(report.commandList).toContain("pnpm run production-scale:evidence");
    expect(report.commandList).toContain("pnpm run restore:accept-human-evidence");
    expect(report.commandList).toContain("pnpm run packet-pdf:cache-miss-proof");
    expect(report.commandList).toContain("pnpm run production-worker:activation-plan");
    expect(report.commandList).toContain("pnpm run production-worker:readiness-evidence");
    expect(report.commandList).toContain("pnpm run storage:raw-report-remediation-plan");
    expect(report.commandList).toContain("pnpm run storage:raw-report-remediation-acceptance");
  });

  it("does not claim production-at-scale readiness while unresolved or human-required blockers remain", () => {
    const report = buildPack();

    expect(report.humanRequiredProof.length).toBeGreaterThan(0);
    expect(report.unresolvedProductionBlockers.length).toBeGreaterThan(0);
    expect(report.readinessClassification.value).toBe("limited beta");
    expect(report.readinessClassification.canPromoteProductionAtScale).toBe(false);
    expect(report.safety.productionAtScaleClaimed).toBe(false);
  });

  it("keeps blocker 1 and 22 unresolved unless accepted human evidence exists", () => {
    const report = buildPack();
    const blocker1 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 1);
    const blocker22 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 22);

    expect(report.humanRestoreDrillEvidenceAcceptance).toMatchObject({
      status: "not-submitted",
      accepted: false,
      blockerCoverage: {
        disasterRecoveryRestoreDrill: false,
        retentionArchiveRestore: false,
      },
    });
    expect(blocker1?.classification).toBe("human proof required");
    expect(blocker22?.classification).toBe("human proof required");
    expect(report.humanRequiredProof.map((blocker: { number: number }) => blocker.number)).toEqual(
      expect.arrayContaining([1, 22]),
    );
  });

  it("classifies blocker 1 and 22 as fixed only with accepted human-observed evidence", () => {
    const humanRestoreEvidenceAcceptance = buildHumanRestoreDrillEvidenceAcceptanceReport({
      evidencePath: "tests/fixtures/human-restore-drill-evidence.valid.md",
      generatedAt: "2026-05-20T12:00:00.000Z",
    });
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      humanRestoreEvidenceAcceptance,
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const blocker1 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 1);
    const blocker22 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 22);

    expect(humanRestoreEvidenceAcceptance.accepted).toBe(true);
    expect(blocker1?.classification).toBe("fixed with human-observed evidence");
    expect(blocker22?.classification).toBe("fixed with human-observed evidence");
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });

  it("keeps blocker 2 production runtime unresolved without accepted production queue-depth evidence", () => {
    const report = buildPack();
    const blocker2 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 2);

    expect(report.productionWorkerReadinessEvidence).toMatchObject({
      productionProof: false,
      acceptedProductionRunEvidence: {
        accepted: false,
      },
      blockerCoverage: {
        productionIngestRuntime: false,
      },
    });
    expect(blocker2?.classification).toBe("partial");
  });

  it("keeps blocker 6 remediation-required unless accepted operator evidence exists", () => {
    const report = buildPack();
    const blocker6 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 6);

    expect(report.rawReportRemediationAcceptance).toMatchObject({
      status: "not-submitted",
      accepted: false,
      blockerCoverage: {
        historicalRawReportBytes: false,
      },
    });
    expect(blocker6?.classification).toBe("human proof required");
    expect(report.humanRequiredProof.map((blocker: { number: number }) => blocker.number)).toContain(6);
  });

  it("classifies blocker 6 as fixed only with accepted sanitized operator remediation evidence", () => {
    const rawReportRemediationAcceptance = buildRawReportRemediationAcceptanceReport({
      rootDir: process.cwd(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      rawReportRemediationEvidence: acceptedRawReportRemediationEvidence(),
    });
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      rawReportRemediationAcceptance,
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const blocker6 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 6);

    expect(rawReportRemediationAcceptance.accepted).toBe(true);
    expect(blocker6?.classification).toBe("fixed with human-observed evidence");
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });

  it("allows blocker 2 production-ready only with accepted production queue-depth evidence", () => {
    const productionWorkerReadinessEvidence = buildProductionWorkerReadinessEvidenceReport({
      rootDir: process.cwd(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      productionWorkerQueueDepthEvidence: {
        status: "accepted",
        accepted: true,
        evidencePath: "docs/production-scale/evidence/production-worker-queue-depth-evidence.json",
        blockerCoverage: {
          productionIngestRuntime: true,
          productionWorkflowParityAndRollback: false,
        },
      },
    });
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      productionWorkerReadinessEvidence,
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const blocker2 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 2);
    const blocker11 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 11);

    expect(blocker2?.classification).toBe("fixed with human-observed evidence");
    expect(blocker11?.classification).toBe("partial");
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });

  it("keeps blocker 11 partial until production workflow parity and rollback evidence are present", () => {
    const report = buildPack();
    const blocker11 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 11);

    expect(blocker11?.classification).toBe("partial");
    expect(report.humanRequiredProof.map((blocker: { number: number }) => blocker.number)).not.toContain(11);
  });

  it("classifies blocker 21 with exact release evidence commands, not dashboard PASS alone", () => {
    const report = buildPack();
    const blocker21 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 21);

    expect(blocker21?.classification).toBe("fixed with automated evidence");
    expect(report.commandList).toEqual(
      expect.arrayContaining([
        "pnpm run production-scale:evidence",
        "pnpm run production-worker:readiness-evidence",
        "pnpm run production-scale:promotion-pack",
        "pnpm run operator:dashboard",
      ]),
    );
    expect(report.skippedChecks.dashboardPassAloneIsReleaseEvidence).toBe(false);
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });
});
