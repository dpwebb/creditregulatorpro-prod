import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildProductionPromotionPackReport,
  REQUIRED_PROMOTION_COMMANDS,
  validatePromotionPackReport,
} from "../../scripts/production-promotion-pack.mjs";
import { buildProductionDeploymentParityEvidenceReport } from "../../scripts/production-deployment-parity-evidence.mjs";
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
    stagingIngestWorkerEvidence: notSubmittedStagingIngestWorkerEvidence(),
    measuredLoadEvidenceAcceptance: notSubmittedMeasuredLoadEvidenceAcceptance(),
    runtimeSizePolicyAcceptance: notSubmittedRuntimeSizePolicyAcceptance(),
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
    acceptedRiskStatement: "The release governance owner accepts the residual risk of no external alert provider for this limited beta window.",
    reviewOrExpiryDate: "2026-08-20",
    dryRunNotLiveProofAcknowledgement: true,
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
    CERTIFYING: false,
    releaseGateAccepted: false,
    productionPromotionGateAccepted: false,
    temporaryAllowlistActive: false,
    runtimeEnsureResidualImpact: "warning-only",
    releaseBlockingFindings: [],
    warningOnlyFindings: [{ category: "approved-runtime-ensure-residual" }],
    waivedFindings: [],
    temporaryAllowlistFindings: [],
    reviewedAdditiveFindings: [],
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
    CERTIFYING: true,
    releaseGateAccepted: true,
    productionPromotionGateAccepted: true,
    runtimeEnsureResidualImpact: "release-blocking",
    warningOnlyFindings: [],
    blockerCoverage: {
      migrationGovernance: true,
      acceptedReleaseBlocking: true,
      acceptedFormalWaiver: false,
    },
  };
}

function notSubmittedMeasuredLoadEvidenceAcceptance() {
  return {
    reportName: "production-scale-load-measured-acceptance",
    generatedAt: "2026-05-20T12:00:00.000Z",
    status: "not-submitted",
    accepted: false,
    evidencePath: "docs/production-scale/evidence/latest-load-measured.json",
    blockerCoverage: {
      loadConcurrency: false,
      dbPoolPressure: false,
      rateLimiterWritePressure: false,
    },
    validation: {
      ok: false,
      errors: ["No measured load evidence has been submitted."],
    },
    safety: {
      productionDataMutated: false,
      productionDatabaseTargeted: false,
      externalProviderCallsMade: 0,
      liveExternalProvidersConnected: false,
      realConsumerPiiUsed: false,
      rawReportBytesSent: false,
    },
  };
}

function acceptedMeasuredLoadEvidenceAcceptance() {
  return {
    reportName: "production-scale-load-measured-acceptance",
    generatedAt: "2026-05-20T12:00:00.000Z",
    status: "accepted",
    accepted: true,
    evidencePath: "docs/production-scale/evidence/latest-load-measured.json",
    evidenceType: "MEASURED_LOCAL",
    mode: "measured-local",
    thresholdMode: "release-blocking",
    thresholdStatus: "passed",
    summary: {
      totalRequestsOrJobs: 62,
      requestCount: 32,
      queueJobCount: 16,
      concurrency: 2,
      observedMaxConcurrency: 2,
      iterations: 2,
      latency: {
        p50Ms: 12,
        p95Ms: 34,
        maxMs: 35,
      },
    },
    dbPool: {
      configuredMax: 5,
      observedSignalAvailable: true,
      observedActiveConnections: 2,
      observedBorrowedConnections: 2,
      unavailableReason: null,
    },
    rateLimiter: {
      attempts: 24,
      acceptedCount: 2,
      rejectedCount: 22,
      bounded: true,
    },
    packetPdfCache: {
      cacheHitCount: 4,
      cacheMissCount: 2,
    },
    blockerCoverage: {
      loadConcurrency: true,
      dbPoolPressure: true,
      rateLimiterWritePressure: true,
    },
    validation: {
      ok: true,
      errors: [],
    },
    safety: {
      productionDataMutated: false,
      productionDatabaseTargeted: false,
      externalProviderCallsMade: 0,
      liveExternalProvidersConnected: false,
      realConsumerPiiUsed: false,
      rawReportBytesSent: false,
    },
  };
}

function acceptedStagingIngestWorkerEvidence() {
  return {
    reportName: "staging-ingest-worker-queue-drain-evidence",
    generatedAt: "2026-05-20T12:00:00.000Z",
    status: "accepted-staging-queue-drain",
    accepted: true,
    evidencePath: "docs/production-scale/evidence/latest-staging-ingest-worker-evidence.json",
    productionProof: false,
    stagingProof: true,
    queueDepthBeforeRun: 2,
    queueDepthAfterRun: 0,
    processedCount: 2,
    failedCount: 0,
    deadLetterCount: 0,
    blockerCoverage: {
      blocker2StagingQueueDrain: true,
      blocker2ProductionRuntime: false,
      blocker11ProductionParityAndRollback: false,
    },
    validation: {
      ok: true,
      errors: [],
    },
    safety: {
      productionDataMutated: false,
      productionTargetsUsed: false,
      productionWorkerActivationDeferred: true,
      workerAlwaysOn: false,
    },
  };
}

function acceptedProductionSafeProbeEvidence() {
  return {
    status: "passed",
    startedAt: "2026-05-20T12:00:00.000Z",
    completedAt: "2026-05-20T12:00:00.000Z",
    targetHost: "staging.creditregulatorpro.com",
    planOnly: true,
    runtimeProbePlan: [
      {
        name: "app shell",
        path: "/",
        method: "HEAD",
        acceptedStatuses: [200],
        readOnly: true,
        mutationExpected: false,
      },
      {
        name: "login route",
        path: "/login",
        method: "GET",
        acceptedStatuses: [200],
        readOnly: true,
        mutationExpected: false,
      },
      {
        name: "auth session endpoint invalid session",
        path: "/_api/auth/session",
        method: "GET",
        acceptedStatuses: [401, 403],
        readOnly: true,
        mutationExpected: false,
      },
    ],
    publicChecks: [],
    protectedUnauthenticatedChecks: [],
    protectedInvalidSessionChecks: [],
    staticRejectionContracts: [{ name: "retired public route remains reset", status: "passed" }],
    safety: {
      staticContractsPassed: true,
      productionDataMutated: false,
      productionFixturesCreated: false,
      productionWorkerActivated: false,
      liveExternalProvidersConnected: false,
    },
  };
}

function acceptedStagingOwnerDenialEvidence() {
  return {
    reportName: "staging-owner-denial-smoke",
    generatedAt: "2026-05-20T12:00:00.000Z",
    status: "passed",
    productionProof: false,
    stagingOrLocalProofOnly: true,
    syntheticFixturesOnly: true,
    productionDataMutated: false,
    productionFixturesCreated: false,
    liveExternalProvidersConnected: false,
    summary: {
      totalChecks: 30,
      passedChecks: 30,
      failedChecks: 0,
      ownerBDeniedOwnerARecords: true,
      adminOnlyRoutesDeniedForNonAdmins: true,
    },
  };
}

function acceptedDeploymentParityEvidence({ includeOwnerDenial = true } = {}) {
  return buildProductionDeploymentParityEvidenceReport({
    rootDir: process.cwd(),
    generatedAt: "2026-05-20T12:00:00.000Z",
    productionSafeProbeEvidence: acceptedProductionSafeProbeEvidence(),
    stagingOwnerDenialEvidence: includeOwnerDenial
      ? acceptedStagingOwnerDenialEvidence()
      : {
          reportName: "staging-owner-denial-smoke",
          generatedAt: "2026-05-20T12:00:00.000Z",
          status: "not-submitted",
          productionProof: false,
          stagingOrLocalProofOnly: false,
          syntheticFixturesOnly: false,
          productionDataMutated: false,
          productionFixturesCreated: false,
          liveExternalProvidersConnected: false,
          summary: {
            totalChecks: 0,
            failedChecks: 0,
            ownerBDeniedOwnerARecords: false,
            adminOnlyRoutesDeniedForNonAdmins: false,
          },
        },
  });
}

function notSubmittedProductionDeploymentParityEvidence() {
  return {
    reportName: "production-deployment-parity-evidence",
    evidenceType: "PRODUCTION_DEPLOYMENT_PARITY_EVIDENCE",
    generatedAt: null,
    status: "not-submitted",
    current: false,
    productionProof: false,
    productionSafeProbeEvidence: {
      accepted: false,
      current: false,
      path: "docs/production-scale/evidence/latest-production-safe-probes.json",
    },
    stagingOwnerDenialEvidenceReference: {
      accepted: false,
      current: false,
      path: "docs/production-scale/evidence/latest-staging-owner-denial-smoke.json",
      productionProof: false,
    },
    rollbackEvidence: {
      status: "not-submitted",
      rollbackShaInputRequired: false,
      healthCheckAfterRollbackRequired: false,
    },
    blockerCoverage: {
      productionDeploymentParity: false,
      productionSafePrivacyProbeDepth: false,
      releaseEvidenceExactCommands: true,
    },
    safety: {
      runtimeProductionProbesReadOnly: false,
      staticProofTreatedAsRuntimeProductionProof: false,
      productionDataMutatedByCodex: false,
      productionFixturesCreatedByCodex: false,
      productionWorkerActivatedByCodex: false,
      productionJobsProcessedByCodex: false,
      liveExternalProvidersCalledByCodex: false,
      dashboardPassAloneIsReleaseEvidence: false,
    },
    validation: {
      ok: false,
      errors: ["No production deployment parity evidence has been generated."],
      sensitiveFindings: [],
    },
  };
}

function notSubmittedStagingIngestWorkerEvidence() {
  return {
    reportName: "staging-ingest-worker-queue-drain-evidence",
    generatedAt: null,
    status: "not-submitted",
    accepted: false,
    evidencePath: null,
    productionProof: false,
    stagingProof: false,
    queueDepthBeforeRun: null,
    queueDepthAfterRun: null,
    processedCount: null,
    failedCount: null,
    deadLetterCount: null,
    blockerCoverage: {
      blocker2StagingQueueDrain: false,
      blocker2ProductionRuntime: false,
      blocker11ProductionParityAndRollback: false,
    },
    validation: {
      ok: false,
      errors: ["No accepted staging ingest worker queue-drain evidence has been generated."],
    },
    safety: {
      productionDataMutated: false,
      productionTargetsUsed: false,
      productionWorkerActivationDeferred: true,
      workerAlwaysOn: false,
    },
  };
}

function notSubmittedRuntimeSizePolicyAcceptance() {
  return {
    reportName: "runtime-size-policy-acceptance",
    generatedAt: "2026-05-20T12:00:00.000Z",
    status: "not-submitted",
    accepted: false,
    acceptanceKind: "not-accepted",
    policyPath: "docs/production-scale/runtime-size-threshold-policy.json",
    evidencePath: "docs/production-scale/evidence/latest-runtime-size.json",
    policyMode: "unknown",
    formalWaiver: {
      accepted: false,
      reason: null,
    },
    runtimeEvidence: null,
    warningRows: [],
    waivedRows: [],
    blockerCoverage: {
      runtimeSizeGovernance: false,
      acceptedHardGate: false,
      acceptedWarningOnlyWaiver: false,
    },
    validation: {
      ok: false,
      errors: ["Runtime-size policy acceptance has not been submitted."],
    },
    safety: {
      nonMutating: true,
      productionDataMutated: false,
      dependencyVersionsChanged: false,
      buildChunkingChanged: false,
      buildBehaviorChanged: false,
      pdfOcrBehaviorChanged: false,
      hardGateClaimedWhenWarningOnly: false,
    },
  };
}

function acceptedWarningOnlyRuntimeSizePolicyAcceptance() {
  return {
    reportName: "runtime-size-policy-acceptance",
    generatedAt: "2026-05-20T12:00:00.000Z",
    status: "accepted-warning-only-waiver",
    accepted: true,
    acceptanceKind: "warning-only-waiver",
    policyPath: "docs/production-scale/runtime-size-threshold-policy.json",
    evidencePath: "docs/production-scale/evidence/latest-runtime-size.json",
    policyMode: "warning-only",
    formalWaiver: {
      accepted: true,
      reason: "Runtime-size warning-only policy accepted for limited beta with governed WARN rows.",
      approvedByRole: "Release governance owner",
      ownerRole: "Release governance owner",
      acceptedAt: "2026-05-20T12:00:00.000Z",
      expiresOn: "2026-08-20",
      reviewDate: "2026-08-20",
      acceptedRiskStatement: "Warning-only runtime-size risk is accepted for limited beta and is not hard-gate proof.",
    },
    runtimeEvidence: {
      generatedAt: "2026-05-20T12:00:00.000Z",
      overallStatus: "WARN",
      hasBlockingFailures: false,
      statusCounts: {
        WARN: 7,
        WAIVED: 1,
      },
    },
    warningRows: [{ id: "main-js-raw", accepted: true }],
    waivedRows: [{
      id: "docker-ocr-runtime-inventory",
      accepted: true,
      reason: "Fixture waiver.",
      owner: "PDF/OCR platform owner",
      reviewDate: "2026-08-20",
      acceptedRiskStatement: "Fixture waived row risk is accepted with source-only inventory governance.",
    }],
    blockerCoverage: {
      runtimeSizeGovernance: true,
      acceptedHardGate: false,
      acceptedWarningOnlyWaiver: true,
    },
    validation: {
      ok: true,
      errors: [],
    },
    safety: {
      nonMutating: true,
      productionDataMutated: false,
      dependencyVersionsChanged: false,
      buildChunkingChanged: false,
      buildBehaviorChanged: false,
      pdfOcrBehaviorChanged: false,
      hardGateClaimedWhenWarningOnly: false,
    },
  };
}

function acceptedHardGateRuntimeSizePolicyAcceptance() {
  return {
    ...acceptedWarningOnlyRuntimeSizePolicyAcceptance(),
    status: "accepted-hard-gate",
    acceptanceKind: "hard-gate",
    policyMode: "hard-gate",
    formalWaiver: {
      accepted: false,
      reason: null,
    },
    runtimeEvidence: {
      generatedAt: "2026-05-20T12:00:00.000Z",
      overallStatus: "PASS",
      hasBlockingFailures: false,
      statusCounts: {
        PASS: 8,
      },
    },
    warningRows: [],
    waivedRows: [],
    blockerCoverage: {
      runtimeSizeGovernance: true,
      acceptedHardGate: true,
      acceptedWarningOnlyWaiver: false,
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
    expect(report.commandList).toContain("pnpm run restore:evidence:current-check");
    expect(report.commandList).toContain("pnpm run packet-pdf:cache-miss-proof");
    expect(report.commandList).toContain("pnpm run production-worker:activation-plan");
    expect(report.commandList).toContain("pnpm run production-deployment-parity:evidence");
    expect(report.commandList).toContain("pnpm run production-worker:activation-evidence");
    expect(report.commandList).toContain("pnpm run production-worker:readiness-evidence");
    expect(report.commandList).toContain("pnpm run ingest:worker:staging-evidence");
    expect(report.commandList).toContain("pnpm run storage:raw-report-remediation-plan");
    expect(report.commandList).toContain("pnpm run storage:raw-report-remediation-acceptance");
    expect(report.commandList).toContain("pnpm run alerts:dry-run");
    expect(report.commandList).toContain("pnpm run alerts:exclusion:validate");
    expect(report.commandList).toContain("pnpm run response-ops:readiness-evidence");
    expect(report.commandList).toContain("pnpm run response:ops-readiness-evidence");
    expect(report.commandList).toContain("pnpm run migrations:gate");
    expect(report.commandList).toContain("pnpm run baseline:production-scale-measured -- --local");
    expect(report.commandList).toContain("pnpm run runtime-size:policy-acceptance");
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
    expect(report.restoreReadinessCheck).toMatchObject({
      currentOperationalProof: false,
      simulatedOnly: true,
      blockerCoverage: {
        disasterRecoveryRestoreDrill: false,
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
    expect(report.restoreReadinessCheck).toMatchObject({
      status: "current-human-observed",
      currentOperationalProof: true,
      stale: false,
      evidenceType: "HUMAN-OBSERVED",
      simulatedOnly: false,
    });
    expect(blocker1?.classification).toBe("fixed with human-observed evidence");
    expect(blocker22?.classification).toBe("fixed with human-observed evidence");
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });

  it("keeps blocker 1 human-required when accepted human evidence is stale", () => {
    const root = mkdtempSync(join(tmpdir(), "crp-stale-restore-pack-"));
    const evidencePath = "docs/production-scale/evidence/human-restore-drill-evidence.md";
    mkdirSync(join(root, "docs/production-scale/evidence"), { recursive: true });
    writeFileSync(
      join(root, evidencePath),
      readFileSync(resolve("tests/fixtures/human-restore-drill-evidence.valid.md"), "utf8")
        .replace("2026-05-20", "2025-01-01")
        .replace("2026-05-20T12:00:00-03:00", "2025-01-01T12:00:00-03:00"),
      "utf8",
    );

    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      humanRestoreEvidenceAcceptance: buildHumanRestoreDrillEvidenceAcceptanceReport({
        rootDir: root,
        evidencePath,
        generatedAt: "2026-05-20T12:00:00.000Z",
      }),
      restoreReadinessCheck: {
        reportName: "restore-evidence-current-readiness-check",
        generatedAt: "2026-05-20T12:00:00.000Z",
        status: "stale-human-observed",
        currentOperationalProof: false,
        stale: true,
        maxAgeDays: 90,
        evidencePath,
        evidenceType: "HUMAN-OBSERVED",
        humanObserved: true,
        simulatedOnly: false,
        restoreDateTime: "2025-01-01T15:00:00.000Z",
        ageDays: 504.88,
        requiredFields: {
          complete: true,
          missing: [],
          placeholders: [],
          invalidValues: [],
          sensitiveFindings: [],
        },
        blockerCoverage: {
          disasterRecoveryRestoreDrill: false,
          retentionArchiveRestore: false,
        },
        validation: {
          ok: false,
          humanAcceptanceOk: true,
          errors: [],
          unresolvedReasons: ["Human-observed restore evidence is stale."],
        },
        safety: {
          runsDump: false,
          runsRestore: false,
          accessesProductionBackups: false,
          modifiesProduction: false,
          acceptsSimulatedEvidenceAsProductionProof: false,
        },
      },
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const blocker1 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 1);

    expect(report.humanRestoreDrillEvidenceAcceptance.accepted).toBe(true);
    expect(report.restoreReadinessCheck.stale).toBe(true);
    expect(blocker1?.classification).toBe("human proof required");
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
    expect(report.stagingIngestWorkerEvidence).toMatchObject({
      accepted: false,
      productionProof: false,
      blockerCoverage: {
        blocker2StagingQueueDrain: false,
      },
    });
    expect(blocker2?.classification).toBe("partial");
  });

  it("records accepted staging queue-drain evidence without closing production blocker 2", () => {
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      stagingIngestWorkerEvidence: acceptedStagingIngestWorkerEvidence(),
      productionDeploymentParityEvidence: notSubmittedProductionDeploymentParityEvidence(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const blocker2 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 2);
    const blocker11 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 11);

    expect(blocker2?.classification).toBe("partial");
    expect(blocker11?.classification).toBe("partial");
    expect(report.stagingIngestWorkerEvidence).toMatchObject({
      accepted: true,
      productionProof: false,
      queueDepthBeforeRun: 2,
      queueDepthAfterRun: 0,
      processedCount: 2,
    });
    expect(report.productionWorkerActivationEvidence).toMatchObject({
      productionWorkerDefaultOff: true,
      productionActivationDeferred: true,
      blockerCoverage: {
        productionIngestRuntime: false,
      },
    });
    expect(report.productionWorkerReadinessEvidence.productionProof).toBe(false);
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });

  it("keeps blockers 3, 16, and 17 simulated-proof-only without accepted measured evidence", () => {
    const report = buildPack();
    const byNumber = new Map(report.blockerClassifications.map((blocker: { number: number }) => [blocker.number, blocker]));

    expect(report.measuredLoadEvidenceAcceptance).toMatchObject({
      status: "not-submitted",
      accepted: false,
      blockerCoverage: {
        loadConcurrency: false,
        dbPoolPressure: false,
        rateLimiterWritePressure: false,
      },
    });
    expect(byNumber.get(3)?.classification).toBe("simulated proof only");
    expect(byNumber.get(16)?.classification).toBe("simulated proof only");
    expect(byNumber.get(17)?.classification).toBe("simulated proof only");
  });

  it("classifies blockers 3, 16, and 17 as fixed only with accepted measured release-blocking evidence", () => {
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      measuredLoadEvidenceAcceptance: acceptedMeasuredLoadEvidenceAcceptance(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const byNumber = new Map(report.blockerClassifications.map((blocker: { number: number }) => [blocker.number, blocker]));

    expect(byNumber.get(3)?.classification).toBe("fixed with automated evidence");
    expect(byNumber.get(16)?.classification).toBe("fixed with automated evidence");
    expect(byNumber.get(17)?.classification).toBe("fixed with automated evidence");
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });

  it("does not close blockers 3, 16, or 17 with warning-only or failed measured thresholds", () => {
    const measuredLoadEvidenceAcceptance = {
      ...acceptedMeasuredLoadEvidenceAcceptance(),
      status: "failed",
      accepted: false,
      thresholdMode: "warning-only",
      thresholdStatus: "warning-only",
      blockerCoverage: {
        loadConcurrency: false,
        dbPoolPressure: false,
        rateLimiterWritePressure: false,
      },
      validation: {
        ok: false,
        errors: ["Measured load threshold policy is warning-only and cannot close release evidence."],
      },
    };
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      measuredLoadEvidenceAcceptance,
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const classifications = new Map(report.blockerClassifications.map((blocker: { number: number }) => [blocker.number, blocker.classification]));

    expect(classifications.get(3)).toBe("simulated proof only");
    expect(classifications.get(16)).toBe("simulated proof only");
    expect(classifications.get(17)).toBe("simulated proof only");
  });

  it("keeps blocker 18 partial without accepted runtime-size policy acceptance", () => {
    const report = buildPack();
    const blocker18 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 18);

    expect(report.runtimeSizePolicyAcceptance).toMatchObject({
      accepted: false,
      blockerCoverage: {
        runtimeSizeGovernance: false,
      },
    });
    expect(blocker18?.classification).toBe("partial");
  });

  it("classifies blocker 18 as waived for accepted warning-only runtime-size policy", () => {
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      measuredLoadEvidenceAcceptance: notSubmittedMeasuredLoadEvidenceAcceptance(),
      runtimeSizePolicyAcceptance: acceptedWarningOnlyRuntimeSizePolicyAcceptance(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const blocker18 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 18);

    expect(blocker18?.classification).toBe("waived with explicit reason");
    expect(report.runtimeSizePolicyAcceptance.blockerCoverage.acceptedHardGate).toBe(false);
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });

  it("classifies blocker 18 fixed only for accepted hard-gate runtime-size policy", () => {
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      measuredLoadEvidenceAcceptance: notSubmittedMeasuredLoadEvidenceAcceptance(),
      runtimeSizePolicyAcceptance: acceptedHardGateRuntimeSizePolicyAcceptance(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const blocker18 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 18);

    expect(blocker18?.classification).toBe("fixed with automated evidence");
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
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

  it("keeps blocker 10 partial when migration gate has a temporary non-certifying allowlist", () => {
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

    expect(migrationGateEvidence.status).toBe("accepted-temporary-allowlist");
    expect(report.migrationGateEvidence).toMatchObject({
      policyMode: "release-blocking",
      CERTIFYING: false,
      releaseGateAccepted: true,
      productionPromotionGateAccepted: true,
      temporaryAllowlistActive: true,
      blockerCoverage: {
        migrationGovernance: false,
        productionPromotionGate: true,
        temporaryAllowlistActive: true,
      },
    });
    expect(blocker10?.classification).toBe("partial");
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
      productionDeploymentParityEvidence: notSubmittedProductionDeploymentParityEvidence(),
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
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      productionDeploymentParityEvidence: notSubmittedProductionDeploymentParityEvidence(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const blocker11 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 11);

    expect(blocker11?.classification).toBe("partial");
    expect(report.humanRequiredProof.map((blocker: { number: number }) => blocker.number)).not.toContain(11);
  });

  it("closes blocker 11 only with current production-safe probe and rollback evidence", () => {
    const productionDeploymentParityEvidence = acceptedDeploymentParityEvidence();
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      productionDeploymentParityEvidence,
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const blocker11 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 11);
    const blocker20 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 20);

    expect(productionDeploymentParityEvidence.blockerCoverage.productionDeploymentParity).toBe(true);
    expect(blocker11?.classification).toBe("fixed with automated evidence");
    expect(blocker20?.classification).toBe("fixed with staging evidence");
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });

  it("does not close blocker 11 without rollback evidence", () => {
    const productionDeploymentParityEvidence = {
      ...acceptedDeploymentParityEvidence(),
      current: true,
      status: "partial",
      rollbackEvidence: {
        status: "failed",
        rollbackShaInputRequired: false,
        healthCheckAfterRollbackRequired: false,
      },
      blockerCoverage: {
        productionDeploymentParity: false,
        productionSafePrivacyProbeDepth: true,
        releaseEvidenceExactCommands: true,
      },
      validation: {
        ok: false,
        errors: ["Rollback evidence must require rollback_sha."],
        sensitiveFindings: [],
      },
    };
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      productionDeploymentParityEvidence,
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const blocker11 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 11);

    expect(blocker11?.classification).toBe("partial");
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });

  it("does not close blocker 20 with unauthenticated production-safe probes alone", () => {
    const productionDeploymentParityEvidence = acceptedDeploymentParityEvidence({ includeOwnerDenial: false });
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      productionDeploymentParityEvidence,
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const blocker20 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 20);

    expect(productionDeploymentParityEvidence.productionSafeProbeEvidence.accepted).toBe(true);
    expect(productionDeploymentParityEvidence.stagingOwnerDenialEvidenceReference.accepted).toBe(false);
    expect(blocker20?.classification).toBe("human proof required");
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
      responseSoakStatus: "command-available",
      safety: {
        productionDataMutated: false,
        productionRecordsPurgedOrArchived: false,
        responseQueueSemanticsChanged: false,
      },
    });
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });

  it("does not close blocker 8 without accepted response ops readiness controls", () => {
    const responseOpsReadinessEvidence = {
      ...buildResponseOpsReadinessEvidenceReport({
        rootDir: process.cwd(),
        generatedAt: "2026-05-20T12:00:00.000Z",
        env: {},
        alertsDryRunEvidence: dryRunAlertEvidence(),
      }),
      status: "failed",
      blockerCoverage: {
        responseOperationsMaturity: false,
        observabilityAlerting: false,
        releaseEvidenceExactCommands: true,
      },
    };
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      responseOpsReadinessEvidence,
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const blocker8 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 8);

    expect(blocker8?.classification).toBe("partial");
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
        "pnpm run production-deployment-parity:evidence",
        "pnpm run production-worker:activation-evidence",
        "pnpm run production-worker:readiness-evidence",
        "pnpm run ingest:worker:staging-evidence",
        "pnpm run response-ops:readiness-evidence",
        "pnpm run response:ops-readiness-evidence",
        "pnpm run alerts:exclusion:validate",
        "pnpm run alerts:dry-run",
        "pnpm run baseline:production-scale-measured -- --local",
        "pnpm run runtime-size:policy-acceptance",
        "pnpm run production-scale:promotion-pack",
        "pnpm run operator:dashboard",
      ]),
    );
    expect(report.skippedChecks.dashboardPassAloneIsReleaseEvidence).toBe(false);
    expect(report.skippedChecks.skipCount).not.toBeNull();
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });
});
