import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildProductionPromotionPackReport,
  REQUIRED_PROMOTION_COMMANDS,
  validatePromotionPackReport,
} from "../../scripts/production-promotion-pack.mjs";
import { buildMigrationGateReport } from "../../scripts/migration-gate.mjs";
import { buildProductionWorkerReadinessEvidenceReport } from "../../scripts/production-worker-readiness-evidence.mjs";
import {
  buildAlertingExclusionValidationReport,
  buildResponseOpsReadinessEvidenceReport,
} from "../../scripts/response-ops-readiness-evidence.mjs";
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

function dryRunAlertEvidence() {
  return {
    path: "docs/production-scale/evidence/latest-alerts-dry-run.json",
    exists: true,
    status: "present",
    evidenceType: "SIMULATED",
    deliveryMode: "DRY RUN",
    liveProof: false,
    liveExternalAlertsSent: 0,
    liveExternalProviderCallsMade: 0,
  };
}

function acceptedAlertingExclusionEvidence() {
  return {
    evidenceType: "FORMAL_ALERTING_EXCLUSION",
    operatorNameOrRole: "Compliance operations lead",
    acknowledgedAt: "2026-05-20T12:00:00.000Z",
    environment: "limited beta production operations",
    exclusionScope: "External alert provider delivery for response operations",
    noExternalAlertProviderUsed: true,
    exclusionReason: "Human monitoring is the approved operating path for this limited beta release.",
    humanMonitoringCadence: "Daily dashboard review and immediate review after supervised response operations.",
    manualEscalationPath: "Escalate through the internal incident channel using sanitized counts only.",
    dashboardCommand: "pnpm run operator:dashboard",
    soakCommand: "pnpm run response:soak-check",
    alertsDryRunCommand: "pnpm run alerts:dry-run",
    alertsDryRunEvidencePath: "docs/production-scale/evidence/latest-alerts-dry-run.json",
    operatorAcknowledgementSigned: true,
    liveAlertsSent: false,
    productionDataMutatedByCodex: false,
    sanitizedEvidenceStatement: "This evidence is sanitized and contains no PII, secrets, raw data, signed URLs, or credential URLs.",
  };
}

function warningOnlyMigrationGateEvidence() {
  return {
    reportName: "migration-governance-release-gate",
    generatedAt: "2026-05-20T12:00:00.000Z",
    status: "warning-only",
    policyPath: "docs/production-scale/migration-governance-policy.json",
    policyMode: "warning-only",
    releaseGateAccepted: false,
    runtimeEnsureResidualImpact: "warning-only",
    releaseBlockingFindings: [],
    warningOnlyFindings: [{ category: "approved-runtime-ensure-residual" }],
    waivedFindings: [],
    blockerCoverage: {
      migrationGovernance: false,
      acceptedReleaseBlocking: false,
      acceptedFormalWaiver: false,
    },
    formalWaiver: {
      accepted: false,
      reason: null,
    },
    safety: {
      nonMutating: true,
      requiresDatabase: false,
      mutatesDatabase: false,
      executesDdl: false,
      productionMutationAttempted: false,
      schemaChangedByCodex: false,
      runtimeEnsurePathsRemoved: false,
      adHocDdlAdded: false,
    },
  };
}

function acceptedReleaseBlockingMigrationGateEvidence() {
  return {
    ...warningOnlyMigrationGateEvidence(),
    status: "accepted-release-blocking",
    policyMode: "release-blocking",
    releaseGateAccepted: true,
    runtimeEnsureResidualImpact: "release-blocking",
    warningOnlyFindings: [],
    blockerCoverage: {
      migrationGovernance: true,
      acceptedReleaseBlocking: true,
      acceptedFormalWaiver: false,
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
    expect(report.commandList).toContain("pnpm run alerts:dry-run");
    expect(report.commandList).toContain("pnpm run alerts:exclusion:validate");
    expect(report.commandList).toContain("pnpm run response:ops-readiness-evidence");
    expect(report.commandList).toContain("pnpm run migrations:gate");
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

  it("keeps blocker 10 partial when migration gate remains warning-only", () => {
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      migrationGateEvidence: warningOnlyMigrationGateEvidence(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const blocker10 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 10);

    expect(report.migrationGateEvidence).toMatchObject({
      policyMode: "warning-only",
      releaseGateAccepted: false,
      blockerCoverage: {
        migrationGovernance: false,
      },
    });
    expect(blocker10?.classification).toBe("partial");
  });

  it("classifies blocker 10 fixed with accepted release-blocking migration gate evidence", () => {
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      migrationGateEvidence: acceptedReleaseBlockingMigrationGateEvidence(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const blocker10 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 10);

    expect(blocker10?.classification).toBe("fixed with automated evidence");
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });

  it("classifies blocker 10 policy-closed with accepted formal migration gate waiver", () => {
    const migrationGateEvidence = buildMigrationGateReport({
      rootDir: process.cwd(),
      generatedAt: "2026-05-20T12:00:00.000Z",
    });
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      migrationGateEvidence,
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const blocker10 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 10);

    expect(migrationGateEvidence.status).toBe("accepted-formal-waiver");
    expect(report.migrationGateEvidence).toMatchObject({
      policyMode: "waived",
      releaseGateAccepted: true,
      formalWaiver: {
        accepted: true,
      },
      blockerCoverage: {
        migrationGovernance: true,
      },
    });
    expect(blocker10?.classification).toBe("waived with explicit reason");
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

  it("closes blocker 8 only through non-mutating response ops readiness controls", () => {
    const responseOpsReadinessEvidence = buildResponseOpsReadinessEvidenceReport({
      rootDir: process.cwd(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
      alertsDryRunEvidence: dryRunAlertEvidence(),
    });
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      responseOpsReadinessEvidence,
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const blocker8 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 8);

    expect(blocker8?.classification).toBe("fixed with automated evidence");
    expect(report.responseOpsReadinessEvidence).toMatchObject({
      liveSchedulerStatus: "disabled",
      backfillReadinessStatus: "operator-controlled-deferred",
      purgeArchiveReadinessStatus: "operator-controlled-deferred",
      safety: {
        productionDataMutated: false,
        productionRecordsPurgedOrArchived: false,
        responseQueueSemanticsChanged: false,
      },
    });
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });

  it("does not close blocker 9 with dry-run-only alert evidence", () => {
    const responseOpsReadinessEvidence = buildResponseOpsReadinessEvidenceReport({
      rootDir: process.cwd(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
      alertsDryRunEvidence: dryRunAlertEvidence(),
    });
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      responseOpsReadinessEvidence,
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const blocker9 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 9);

    expect(report.responseOpsReadinessEvidence.alertingStatus).toBe("dry-run-only");
    expect(report.responseOpsReadinessEvidence.blockerCoverage.observabilityAlerting).toBe(false);
    expect(blocker9?.classification).toBe("simulated proof only");
  });

  it("classifies blocker 9 as fixed only with accepted formal alert exclusion", () => {
    const alertingExclusionValidation = buildAlertingExclusionValidationReport({
      rootDir: process.cwd(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      alertingExclusionEvidence: acceptedAlertingExclusionEvidence(),
    });
    const responseOpsReadinessEvidence = buildResponseOpsReadinessEvidenceReport({
      rootDir: process.cwd(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
      alertingExclusionValidation,
      alertsDryRunEvidence: dryRunAlertEvidence(),
    });
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      responseOpsReadinessEvidence,
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const blocker9 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 9);

    expect(alertingExclusionValidation.accepted).toBe(true);
    expect(report.responseOpsReadinessEvidence.alertingStatus).toBe("formally-excluded");
    expect(blocker9?.classification).toBe("fixed with human-observed evidence");
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });

  it("classifies blocker 21 with exact release evidence commands, not dashboard PASS alone", () => {
    const report = buildPack();
    const blocker21 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 21);

    expect(blocker21?.classification).toBe("fixed with automated evidence");
    expect(report.commandList).toEqual(
      expect.arrayContaining([
        "pnpm run production-scale:evidence",
        "pnpm run production-worker:readiness-evidence",
        "pnpm run response:ops-readiness-evidence",
        "pnpm run alerts:exclusion:validate",
        "pnpm run alerts:dry-run",
        "pnpm run production-scale:promotion-pack",
        "pnpm run operator:dashboard",
      ]),
    );
    expect(report.skippedChecks.dashboardPassAloneIsReleaseEvidence).toBe(false);
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });
});
