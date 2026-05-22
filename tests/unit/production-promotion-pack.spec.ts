import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildPromotionCertificationGate,
  buildProductionPromotionPackReport,
  REQUIRED_PROMOTION_COMMANDS,
  validatePromotionPackReport,
} from "../../scripts/production-promotion-pack.mjs";
import { buildMachineEvidence } from "../../scripts/lib/productionEvidenceSchema.mjs";
import { RESTORE_MACHINE_PROOF_EVIDENCE_TYPE } from "../../scripts/restore-machine-proof.mjs";
import { PRODUCTION_WORKER_MACHINE_PROOF_EVIDENCE_TYPE } from "../../scripts/production-worker-machine-proof.mjs";
import { RAW_REPORT_MACHINE_PROOF_EVIDENCE_TYPE } from "../../scripts/storage-raw-report-machine-remediation-proof.mjs";
import { ALERTING_MACHINE_PROOF_EVIDENCE_TYPE } from "../../scripts/alerting-machine-proof.mjs";
import { MIGRATION_MACHINE_PROOF_EVIDENCE_TYPE } from "../../scripts/migration-machine-proof.mjs";
import { RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_EVIDENCE_TYPE } from "../../scripts/retention-archive-restore-machine-proof.mjs";
import { RESTORE_EVIDENCE_ACCEPTANCE_JSON_PATH } from "../../scripts/restore-evidence-acceptance.mjs";
import { buildProductionDeploymentParityEvidenceReport } from "../../scripts/production-deployment-parity-evidence.mjs";
import { buildProductionWorkerReadinessEvidenceReport } from "../../scripts/production-worker-readiness-evidence.mjs";
import {
  buildAlertingExclusionValidationReport,
  buildResponseOpsReadinessEvidenceReport,
} from "../../scripts/response-ops-readiness-evidence.mjs";
import { buildHumanRestoreDrillEvidenceAcceptanceReport } from "../../scripts/staging-backup-restore-checklist.mjs";
import {
  buildRawReportRemediationAcceptanceReport,
  buildStorageRawReportRemediationPlanReport,
  RAW_REPORT_INVENTORY_JSON_PATH,
  writeStorageRawReportRemediationPlan,
} from "../../scripts/storage-raw-report-remediation-plan.mjs";

function dashboardWithSkips(skip = 2) {
  return {
    summary: {
      pass: 10,
      fail: 0,
      skip,
      simulated: 3,
      machineRequired: 2,
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

function acceptedProductionRestoreEvidenceAcceptance() {
  return {
    reportName: "restore-evidence-acceptance",
    generatedAt: "2026-05-20T12:00:00.000Z",
    status: "accepted-production",
    accepted: true,
    productionProof: true,
    stagingProof: false,
    currentOperationalProof: true,
    evidencePath: "docs/production-scale/evidence/restore-evidence-submission.json",
    evidenceId: "DR-UNIT-001",
    environment: "production",
    restoreType: "archive restore",
    observedAt: "2026-05-20T11:30:00.000Z",
    ageDays: 0.02,
    maxAgeDays: 90,
    measuredRpo: {
      targetMinutes: 15,
      actualMinutes: 5,
      status: "passed",
    },
    measuredRto: {
      targetMinutes: 30,
      actualMinutes: 12,
      status: "passed",
    },
    evidenceAttachments: [RESTORE_EVIDENCE_ACCEPTANCE_JSON_PATH],
    validation: {
      ok: true,
      errors: [],
      sensitiveFindings: [],
      evidenceKind: "human-observed",
      stale: false,
      futureDated: false,
    },
    blockerCoverage: {
      disasterRecoveryRestoreDrill: true,
      retentionArchiveRestore: true,
    },
    safety: {
      runsDump: false,
      runsRestore: false,
      modifiesProduction: false,
      acceptsSimulatedEvidenceAsProductionProof: false,
    },
  };
}

function acceptedProductionWorkerRuntimeProof() {
  return {
    reportName: "production-worker-runtime-proof",
    generatedAt: "2026-05-20T12:00:00.000Z",
    status: "accepted-production",
    accepted: true,
    productionProof: true,
    stagingProof: false,
    currentOperationalProof: true,
    evidencePath: "docs/production-scale/evidence/latest-production-worker-runtime-proof.json",
    environment: "production",
    mode: "apply",
    dryRunOnly: false,
    queueDepth: {
      before: { total: 1, queued: 1, running: 0, failed: 0, deadLettered: 0, staleRunning: 0 },
      after: { total: 0, queued: 0, running: 0, failed: 0, deadLettered: 0, staleRunning: 0 },
    },
    processedCount: 1,
    failedCount: 0,
    deadLetterCount: 0,
    staleCount: 0,
    validation: {
      ok: true,
      errors: [],
      sensitiveFindings: [],
      stale: false,
    },
    blockerCoverage: {
      productionIngestRuntime: true,
      productionWorkflowParityAndRollback: true,
    },
    safety: {
      productionJobsProcessedByCodex: false,
      productionDataMutatedByCodex: false,
      runsProductionApplyByDefault: false,
      acceptsDryRunAsProductionProof: false,
      acceptsDefaultOffActivationAsProductionProof: false,
    },
  };
}

function acceptedRawReportRemediationEvidence() {
  return {
    evidenceId: "RRR-PROMO-001",
    evidenceType: "MACHINE_ATTESTED_RAW_REPORT_REMEDIATION",
    environment: "production",
    remediationMode: "machine-applied",
    dryRunOnly: false,
    machineActorId: "RAW_REPORT_MACHINE_RUNNER_1",
    machineProofGeneratedAt: "2026-05-20T14:00:00.000Z",
    performedAt: "2026-05-20T15:00:00.000Z",
    inventoryEvidencePath: "docs/production-scale/evidence/latest-storage-raw-report-inventory.json",
    remediationPlanEvidencePath: "docs/production-scale/evidence/latest-storage-raw-report-remediation-plan.json",
    inventoryRun: true,
    reliableInventoryAccepted: true,
    remediationPlanPolicySatisfied: true,
    remediationPerformedByMachineProcess: true,
    remediationApplied: true,
    oldInlineCompatibilityTested: true,
    sanitizedEvidence: true,
    postRemediationCountsRecorded: true,
    backupRestorePrerequisiteVerified: true,
    nonInteractive: true,
    machineAttested: true,
    humanObserved: false,
    manualApprovalRequired: false,
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

function writeReliableRawReportInventory(rootDir: string) {
  const evidenceDir = join(rootDir, "docs", "production-scale", "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const counts = {
    totalRows: 10,
    storageUrlRows: 9,
    localReferenceRows: 7,
    possibleInlineBase64Rows: 1,
    dataUrlBase64Rows: 0,
    nonLocalReferenceRows: 1,
    nullStorageRows: 1,
  };
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
      reportArtifact: counts,
      evidenceAttachment: counts,
    },
    recordCounts: {
      reportArtifact: counts,
      evidenceAttachment: counts,
    },
    unresolvedCounts: {
      reportArtifact: {
        possibleInlineBase64Rows: 1,
        dataUrlBase64Rows: 0,
      },
      evidenceAttachment: {
        possibleInlineBase64Rows: 1,
        dataUrlBase64Rows: 0,
      },
      totalRows: 2,
    },
    remediationCandidateCounts: {
      reportArtifact: 1,
      evidenceAttachment: 1,
      totalRows: 2,
    },
    confidence: {
      level: "high",
      countsReliable: true,
      reason: "Read-only aggregate SQL counts completed against the configured staging-safe database.",
    },
  };
  writeFileSync(join(rootDir, RAW_REPORT_INVENTORY_JSON_PATH), `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
}

function acceptedRawReportRemediationAcceptance() {
  const rootDir = mkdtempSync(join(tmpdir(), "crp-promotion-raw-report-"));
  writeReliableRawReportInventory(rootDir);
  const plan = buildStorageRawReportRemediationPlanReport({
    rootDir,
    generatedAt: "2026-05-20T13:00:00.000Z",
    env: {},
  });
  writeStorageRawReportRemediationPlan(plan, { rootDir });
  return buildRawReportRemediationAcceptanceReport({
    rootDir,
    generatedAt: "2026-05-20T14:00:00.000Z",
    rawReportRemediationEvidence: acceptedRawReportRemediationEvidence(),
  });
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
    machinePolicyAuthorityId: "ALERTING_POLICY_CONFIG_1",
    machineValidatedAt: "2026-05-20T12:00:00.000Z",
    environment: "limited beta production operations",
    exclusionScope: "External alert provider delivery for response operations",
    namedBlockerScope: "L10-P1-005 observability and alerting proof",
    noExternalAlertProviderUsed: true,
    exclusionReason: "Automated dashboard and soak controls are the configured operating path for this limited beta release.",
    compensatingControls: [
      "Daily dashboard machine check",
      "Response soak check before promotion decisions",
      "Configured escalation for dead-letter, stale-running, and dashboard SKIP regressions",
    ],
    automatedMonitoringCadence: "Daily dashboard check and immediate check after bounded response operations.",
    automatedEscalationPath: "Escalate through the internal incident channel using sanitized counts only.",
    acceptedRiskStatement: "The release governance owner accepts the residual risk of no external alert provider for this limited beta window.",
    reviewOrExpiryDate: "2026-08-20",
    expiresOn: "2026-08-20",
    nextReviewDate: "2026-06-20",
    policyConfigId: "alerting-exclusion-policy-2026-05",
    policyEffectiveAt: "2026-05-20T12:00:00.000Z",
    nonInteractive: true,
    machineAttested: true,
    humanObserved: false,
    manualApprovalRequired: false,
    policyAllowsFormalExclusion: true,
    noPiiNoSecretsNoWebhookUrls: true,
    dryRunNotLiveProofStatement: true,
    exclusionDoesNotMeanProductionAtScalePassUnlessPolicyAllows:
      "This exclusion does not mean production-at-scale PASS unless policy allows that limited alerting-exclusion scope.",
    dashboardCommand: "pnpm run operator:dashboard",
    soakCommand: "pnpm run response:soak-check",
    alertsDryRunCommand: "pnpm run alerts:dry-run",
    alertsDryRunEvidencePath: "docs/production-scale/evidence/latest-alerts-dry-run.json",
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
    runtimeEnsureResidualImpact: "reviewed-additive",
    warningOnlyFindings: [],
    blockerCoverage: {
      migrationGovernance: true,
      acceptedReleaseBlocking: true,
      acceptedFormalWaiver: false,
    },
  };
}

function temporaryAllowlistMigrationGateEvidence() {
  return {
    ...warningOnlyMigrationGateEvidence(),
    status: "failed",
    policyMode: "release-blocking",
    CERTIFYING: false,
    releaseGateAccepted: false,
    productionPromotionGateAccepted: false,
    temporaryAllowlistActive: true,
    runtimeEnsureResidualImpact: "release-blocking",
    releaseBlockingFindings: [
      {
        category: "unresolved-temporary-runtime-allowlist",
        title: "Temporary runtime ensure allowlist entry remains active",
        impact: "release-blocking",
        status: "unresolved",
        sourcePath: "helpers/runtimeEnsure.ts",
      },
    ],
    warningOnlyFindings: [],
    temporaryAllowlistFindings: [
      {
        category: "unresolved-temporary-runtime-allowlist",
        title: "Temporary runtime ensure allowlist entry remains active",
        impact: "release-blocking",
        status: "unresolved",
        sourcePath: "helpers/runtimeEnsure.ts",
      },
    ],
    temporaryAllowlistResiduals: [
      {
        path: "helpers/runtimeEnsure.ts",
        impact: "release-blocking",
        classification: "still-requires-temporary-acceptance-with-explicit-expiry",
        CERTIFYING: false,
      },
    ],
    blockerCoverage: {
      migrationGovernance: false,
      productionPromotionGate: false,
      temporaryAllowlistActive: true,
      acceptedReleaseBlocking: false,
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

function allFixedRegistry() {
  const registry = JSON.parse(readFileSync(resolve("docs/production-scale/blocker-registry.json"), "utf8"));
  registry.blockers = registry.blockers.map((blocker: Record<string, unknown>) => ({
    ...blocker,
    currentStatus: "fixed",
    humanProofRequired: false,
  }));
  return registry;
}

const PROMOTION_GATE_TIMESTAMP = "2026-05-21T12:00:00.000Z";
const PROMOTION_GATE_TARGET_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function currentGitHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8" }).trim();
}

function certifyingEvidence({
  targetSha = PROMOTION_GATE_TARGET_SHA,
  generatedAt = PROMOTION_GATE_TIMESTAMP,
  overrides = {},
}: {
  targetSha?: string;
  generatedAt?: string;
  overrides?: Record<string, unknown>;
} = {}) {
  return {
    generatedAt,
    currentHead: targetSha,
    targetSha,
    status: "passed",
    certifying: true,
    CERTIFYING: true,
    queueLiveness: {
      status: "passed",
    },
    acceptedProductionRunEvidence: {
      accepted: true,
    },
    blockerCoverage: {
      productionIngestRuntime: true,
    },
    contracts: {
      production: {
        status: "passed",
      },
    },
    sentinelSimulation: {
      status: "passed",
    },
    deployPreflight: {
      production: {
        status: "passed",
      },
    },
    automatedEvidenceCoverage: {
      serverComputedHashesVerifyWithHashChainHelper: true,
    },
    summary: {
      appendOnlyHelperAdded: true,
    },
    productionPromotionGateAccepted: true,
    releaseGateAccepted: true,
    safety: {
      nonMutating: true,
    },
    ...overrides,
  };
}

function machineProofEvidence({
  evidenceType,
  targetSha = PROMOTION_GATE_TARGET_SHA,
  generatedAt = PROMOTION_GATE_TIMESTAMP,
  checks = ["fixture-machine-check"],
  metadata = {},
  overrides = {},
}: {
  evidenceType: string;
  targetSha?: string;
  generatedAt?: string;
  checks?: string[];
  metadata?: Record<string, unknown>;
  overrides?: Record<string, unknown>;
}) {
  const effectiveMetadata = evidenceType === RESTORE_MACHINE_PROOF_EVIDENCE_TYPE
    ? { ...restoreMachineProofMetadata(), ...metadata }
    : evidenceType === PRODUCTION_WORKER_MACHINE_PROOF_EVIDENCE_TYPE
      ? { ...productionWorkerMachineProofMetadata(), ...metadata }
      : evidenceType === ALERTING_MACHINE_PROOF_EVIDENCE_TYPE
        ? { ...alertingMachineProofMetadata(), ...metadata }
        : evidenceType === MIGRATION_MACHINE_PROOF_EVIDENCE_TYPE
          ? { ...migrationMachineProofMetadata(), ...metadata }
          : metadata;
  const effectiveProductionMutation = evidenceType === PRODUCTION_WORKER_MACHINE_PROOF_EVIDENCE_TYPE
    ? "synthetic-canary-cleaned-up"
    : "none";

  return buildMachineEvidence({
    evidenceType,
    environment: "production",
    generatedAt,
    commitHash: targetSha,
    generatorScript: "scripts/fixture-machine-proof.mjs",
    command: "pnpm run fixture:machine-proof",
    productionMutation: effectiveProductionMutation,
    status: "pass",
    certifying: true,
    checks: checks.map((name) => ({ name, status: "pass" })),
    sanitizedArtifacts: [{ path: "docs/production-scale/evidence/fixture-machine-proof.json" }],
    metadata: effectiveMetadata,
    ...overrides,
  });
}

const RESTORE_MACHINE_CHECKS = [
  "latest-backup-selected",
  "isolated-restore-target-created",
  "rpo-measured",
  "rto-measured",
  "post-restore-auth-session-check",
  "post-restore-packet-pdf-retrieval-check",
  "post-restore-response-queue-check",
  "cleanup-lifecycle-check",
  "rollback-stop-verification",
  "isolated-restore-target-destroyed",
];

function restoreMachineProofMetadata() {
  return {
    restoreProofKind: "non-interactive-machine-restore",
    latestBackup: {
      selectedLatest: true,
      opaqueBackupId: "backup-hash-20260522",
      createdAt: "2026-05-22T11:45:00.000Z",
    },
    isolatedRestoreTarget: {
      created: true,
      destroyed: true,
      productionTarget: false,
      targetId: "restore-target-hash",
    },
    safeFixture: {
      fixtureId: "restore-fixture-hash",
      syntheticCredentials: true,
      packetPdfFixture: true,
    },
    rpo: {
      targetMinutes: 15,
      actualMinutes: 4,
      status: "pass",
    },
    rto: {
      targetMinutes: 30,
      actualMinutes: 11,
      status: "pass",
    },
    postRestoreChecks: {
      authSession: true,
      packetPdfRetrieval: true,
      responseQueueState: true,
      cleanupLifecycle: true,
      rollbackStop: true,
    },
  };
}

function productionWorkerMachineProofMetadata() {
  return {
    workerProofKind: "synthetic-canary-runtime",
    queueDepthBefore: {
      queued: 1,
      running: 0,
      failed: 0,
      deadLettered: 0,
      stale: 0,
    },
    workerLiveness: {
      verified: true,
      status: "healthy",
      workerId: "production-worker-proof",
    },
    boundedRun: {
      maxJobs: 1,
      onlyCanaryJobProcessed: true,
      processedCount: 1,
      failedCount: 0,
      deadLetterCount: 0,
      staleCount: 0,
    },
    canaryJob: {
      created: true,
      processed: true,
      onlyCanaryJobProcessed: true,
      cleanupVerified: true,
      canaryId: "canary-job-hash",
    },
    queueDepthAfter: {
      queued: 0,
      running: 0,
      failed: 0,
      deadLettered: 0,
      stale: 0,
    },
    stopRollback: {
      verified: true,
      status: "pass",
    },
    syntheticCanaryCleanupSucceeded: true,
  };
}

function alertingMachineProofMetadata() {
  return {
    acceptedCheckSet: "live-alert-delivery",
    alertingProofPath: "live-alert",
    alertType: "synthetic-response-ops-alert",
    channelSanitizedId: "alert-channel-hash",
    correlationId: "alert-correlation-hash",
    deliveryTimestamp: PROMOTION_GATE_TIMESTAMP,
    deliveryVerified: true,
    responseOpsReady: true,
    schedulerStatus: "disabled-verified",
    exclusionExpiresAt: "2026-08-20",
    nextReviewDate: "2026-06-20",
    exclusionDoesNotMeanProductionAtScalePassUnlessPolicyAllows:
      "This exclusion does not mean production-at-scale PASS unless policy allows the limited alerting scope.",
  };
}

function migrationMachineProofMetadata() {
  return {
    migrationGateStatus: "accepted-release-blocking",
    migrationGateCertifying: true,
    releaseGateAccepted: true,
    temporaryAllowlistActive: false,
    temporaryAllowlistResidualCount: 0,
    acceptedTemporaryAllowlistBasis: false,
    releaseBlockingFindingCount: 0,
    expiredAllowlistFindingCount: 0,
    expiredResidualCount: 0,
    unresolvedResidualCount: 0,
    missingMigrationLedgerStatusCount: 0,
    convertedRuntimeResidualCount: 1,
    governedRuntimeResidualCount: 1,
    residualStatuses: [
      {
        path: "helpers/ingestProcessingQueueSchema.ts",
        status: "certifying",
        classification: "ledgered additive migration",
        ledgerEntry: "migrations/0001-ingest-processing-queue-reviewed-additive.md",
        ledgerStatus: "ledgered additive migration",
        certifying: true,
      },
      {
        path: "helpers/responseDocumentSchema.ts",
        status: "certifying",
        classification: "reviewed and governed",
        ledgerEntry: "migrations/0002-machine-governed-runtime-residuals.md",
        ledgerStatus: "reviewed and governed",
        certifying: true,
      },
    ],
  };
}

const WORKER_MACHINE_CHECKS = [
  "queue-depth-before-captured",
  "worker-liveness-verified",
  "bounded-max-jobs-enforced",
  "synthetic-or-canary-job-processed",
  "queue-depth-after-captured",
  "processed-count-captured",
  "failed-dead-letter-stale-counts-captured",
  "worker-stop-rollback-verified",
  "canary-cleanup-verified",
];

const RAW_REPORT_MACHINE_CHECKS = [
  "db-connectivity-reliable",
  "sanitized-inventory-accepted",
  "remediation-policy-verified",
  "unresolved-count-zero-or-policy-accepted",
  "remediated-count-recorded",
  "opaque-hashes-only",
  "no-raw-bytes-or-pii-printed",
  "rollback-recovery-notes-recorded",
];

const ALERTING_MACHINE_CHECKS = [
  "synthetic-alert-triggered",
  "alert-delivery-verified",
  "sanitized-channel-id-recorded",
  "correlation-id-recorded",
  "machine-acknowledgment-verified",
  "retry-or-failure-behavior-recorded",
  "response-ops-readiness-verified",
  "scheduler-status-verified",
  "no-webhook-or-token-printed",
];

const MIGRATION_MACHINE_CHECKS = [
  "migration-gate-certifying",
  "no-temporary-unresolved-allowlist",
  "no-expired-allowlist",
  "no-temporary-allowlist-certification-basis",
  "residual-statuses-classified",
  "migration-ledger-status-present",
  "no-release-blocking-findings",
  "non-mutating-gate",
];

const RETENTION_MACHINE_CHECKS = [
  "safe-archive-candidate-selected",
  "archive-created-or-selected",
  "isolated-restore-target-created",
  "archive-restore-integrity-verified",
  "no-pii-exposed",
  "lifecycle-cleanup-verified",
  "rollback-recovery-notes-recorded",
  "isolated-restore-target-destroyed",
];

function allMachineProofEvidence({
  targetSha = PROMOTION_GATE_TARGET_SHA,
  generatedAt = PROMOTION_GATE_TIMESTAMP,
} = {}) {
  return {
    restoreMachineProofEvidence: machineProofEvidence({
      evidenceType: RESTORE_MACHINE_PROOF_EVIDENCE_TYPE,
      targetSha,
      generatedAt,
      checks: RESTORE_MACHINE_CHECKS,
    }),
    productionWorkerMachineProofEvidence: machineProofEvidence({
      evidenceType: PRODUCTION_WORKER_MACHINE_PROOF_EVIDENCE_TYPE,
      targetSha,
      generatedAt,
      checks: WORKER_MACHINE_CHECKS,
    }),
    rawReportMachineProofEvidence: machineProofEvidence({
      evidenceType: RAW_REPORT_MACHINE_PROOF_EVIDENCE_TYPE,
      targetSha,
      generatedAt,
      checks: RAW_REPORT_MACHINE_CHECKS,
      metadata: {
        databaseReliable: true,
        sanitizedInventoryAccepted: true,
      },
    }),
    alertingMachineProofEvidence: machineProofEvidence({
      evidenceType: ALERTING_MACHINE_PROOF_EVIDENCE_TYPE,
      targetSha,
      generatedAt,
      checks: ALERTING_MACHINE_CHECKS,
      metadata: {
        acceptedCheckSet: "live-alert-delivery",
        alertingProofPath: "live-alert",
      },
    }),
    migrationMachineProofEvidence: machineProofEvidence({
      evidenceType: MIGRATION_MACHINE_PROOF_EVIDENCE_TYPE,
      targetSha,
      generatedAt,
      checks: MIGRATION_MACHINE_CHECKS,
    }),
    retentionArchiveRestoreMachineProofEvidence: machineProofEvidence({
      evidenceType: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_EVIDENCE_TYPE,
      targetSha,
      generatedAt,
      checks: RETENTION_MACHINE_CHECKS,
    }),
  };
}

function allPassingCertificationEvidence({
  targetSha = PROMOTION_GATE_TARGET_SHA,
  generatedAt = PROMOTION_GATE_TIMESTAMP,
  overrides = {},
}: {
  targetSha?: string;
  generatedAt?: string;
  overrides?: Record<string, unknown>;
} = {}) {
  return {
    queueLiveness: certifyingEvidence({ targetSha, generatedAt }),
    storageDurability: certifyingEvidence({ targetSha, generatedAt }),
    evidenceLedger: certifyingEvidence({ targetSha, generatedAt }),
    migrationGovernance: certifyingEvidence({ targetSha, generatedAt }),
    rollbackSimulation: certifyingEvidence({ targetSha, generatedAt }),
    restoreMachineProof: machineProofEvidence({
      evidenceType: RESTORE_MACHINE_PROOF_EVIDENCE_TYPE,
      targetSha,
      generatedAt,
      checks: RESTORE_MACHINE_CHECKS,
    }),
    productionWorkerMachineProof: machineProofEvidence({
      evidenceType: PRODUCTION_WORKER_MACHINE_PROOF_EVIDENCE_TYPE,
      targetSha,
      generatedAt,
      checks: WORKER_MACHINE_CHECKS,
    }),
    rawReportMachineProof: machineProofEvidence({
      evidenceType: RAW_REPORT_MACHINE_PROOF_EVIDENCE_TYPE,
      targetSha,
      generatedAt,
      checks: RAW_REPORT_MACHINE_CHECKS,
      metadata: {
        databaseReliable: true,
        sanitizedInventoryAccepted: true,
      },
    }),
    alertingMachineProof: machineProofEvidence({
      evidenceType: ALERTING_MACHINE_PROOF_EVIDENCE_TYPE,
      targetSha,
      generatedAt,
      checks: ALERTING_MACHINE_CHECKS,
      metadata: {
        acceptedCheckSet: "live-alert-delivery",
        alertingProofPath: "live-alert",
      },
    }),
    migrationMachineProof: machineProofEvidence({
      evidenceType: MIGRATION_MACHINE_PROOF_EVIDENCE_TYPE,
      targetSha,
      generatedAt,
      checks: MIGRATION_MACHINE_CHECKS,
    }),
    retentionArchiveRestoreMachineProof: machineProofEvidence({
      evidenceType: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_EVIDENCE_TYPE,
      targetSha,
      generatedAt,
      checks: RETENTION_MACHINE_CHECKS,
    }),
    ...overrides,
  };
}

describe("production promotion evidence pack", () => {
  it("marks stale evidence HEAD as non-certifying", () => {
    const gate = buildPromotionCertificationGate({
      rootDir: process.cwd(),
      generatedAt: PROMOTION_GATE_TIMESTAMP,
      targetSha: PROMOTION_GATE_TARGET_SHA,
      currentHead: PROMOTION_GATE_TARGET_SHA,
      certificationEvidence: allPassingCertificationEvidence({
        overrides: {
          storageDurability: certifyingEvidence({
            overrides: {
              currentHead: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              targetSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            },
          }),
        },
      }),
    });

    expect(gate.CERTIFYING).toBe(false);
    expect(gate.staleChecks).toContain("storageDurability");
    expect(gate.checks.storageDurability.headMatchesTarget).toBe(false);
  });

  it("marks missing required evidence as non-certifying", () => {
    const gate = buildPromotionCertificationGate({
      rootDir: process.cwd(),
      generatedAt: PROMOTION_GATE_TIMESTAMP,
      targetSha: PROMOTION_GATE_TARGET_SHA,
      currentHead: PROMOTION_GATE_TARGET_SHA,
      certificationEvidence: allPassingCertificationEvidence({
        overrides: {
          evidenceLedger: null,
        },
      }),
    });

    expect(gate.CERTIFYING).toBe(false);
    expect(gate.missingRequiredChecks).toContain("evidenceLedger");
    expect(gate.checks.evidenceLedger.present).toBe(false);
  });

  it("marks manual-only evidence as non-certifying", () => {
    const gate = buildPromotionCertificationGate({
      rootDir: process.cwd(),
      generatedAt: PROMOTION_GATE_TIMESTAMP,
      targetSha: PROMOTION_GATE_TARGET_SHA,
      currentHead: PROMOTION_GATE_TARGET_SHA,
      certificationEvidence: allPassingCertificationEvidence({
        overrides: {
          rollbackSimulation: certifyingEvidence({
            overrides: {
              evidenceType: "MANUAL_ONLY",
              requiresHumanSignoff: true,
            },
          }),
        },
      }),
    });

    expect(gate.CERTIFYING).toBe(false);
    expect(gate.nonAutomatedChecks).toContain("rollbackSimulation");
    expect(gate.checks.rollbackSimulation.manualOnly).toBe(true);
  });

  it("certifies when all required automated mocked checks pass for the target SHA", () => {
    const gate = buildPromotionCertificationGate({
      rootDir: process.cwd(),
      generatedAt: PROMOTION_GATE_TIMESTAMP,
      targetSha: PROMOTION_GATE_TARGET_SHA,
      currentHead: PROMOTION_GATE_TARGET_SHA,
      certificationEvidence: allPassingCertificationEvidence(),
    });

    expect(gate.CERTIFYING).toBe(true);
    expect(gate.missingRequiredChecks).toEqual([]);
    expect(gate.failedChecks).toEqual([]);
    expect(Object.values(gate.checks).every((check: { CERTIFYING: boolean }) => check.CERTIFYING === true)).toBe(true);
  });

  it("keeps the machine-readable evidence schema stable for production promotion certification", () => {
    const head = currentGitHead();
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      stagingIngestWorkerEvidence: notSubmittedStagingIngestWorkerEvidence(),
      measuredLoadEvidenceAcceptance: notSubmittedMeasuredLoadEvidenceAcceptance(),
      runtimeSizePolicyAcceptance: notSubmittedRuntimeSizePolicyAcceptance(),
      generatedAt: PROMOTION_GATE_TIMESTAMP,
      env: {},
      targetSha: head,
      certificationEvidence: allPassingCertificationEvidence({
        targetSha: head,
      }),
    });

    expect(report).toEqual(
      expect.objectContaining({
        currentHead: head,
        currentCommitHash: head,
        targetEnvironment: "production",
        targetSha: head,
        CERTIFYING: false,
        certifying: false,
        queueLivenessStatus: expect.any(Object),
        storageDurabilityResult: expect.any(Object),
        evidenceLedgerResult: expect.any(Object),
        migrationGovernanceResult: expect.any(Object),
        rollbackSimulationResult: expect.any(Object),
        promotionCertification: expect.objectContaining({
          CERTIFYING: true,
          requiredChecks: expect.arrayContaining([
            expect.objectContaining({
              key: "queueLiveness",
              command: "pnpm run production-worker:readiness-evidence",
            }),
            expect.objectContaining({
              key: "storageDurability",
              command: "pnpm run storage:durability-contract",
            }),
            expect.objectContaining({
              key: "evidenceLedger",
              command: "pnpm run production-scale:evidence",
            }),
            expect.objectContaining({
              key: "migrationGovernance",
              command: "pnpm run migrations:gate",
            }),
            expect.objectContaining({
              key: "rollbackSimulation",
              command: "pnpm run deploy:rollback-simulation",
            }),
            expect.objectContaining({
              key: "restoreMachineProof",
              command: "pnpm run restore:machine-proof",
            }),
            expect.objectContaining({
              key: "productionWorkerMachineProof",
              command: "pnpm run production-worker:machine-proof",
            }),
            expect.objectContaining({
              key: "rawReportMachineProof",
              command: "pnpm run storage:raw-report-machine-remediation-proof",
            }),
            expect.objectContaining({
              key: "alertingMachineProof",
              command: "pnpm run alerting:machine-proof",
            }),
            expect.objectContaining({
              key: "migrationMachineProof",
              command: "pnpm run migrations:machine-proof",
            }),
            expect.objectContaining({
              key: "retentionArchiveRestoreMachineProof",
              command: "pnpm run retention:archive-restore-machine-proof",
            }),
          ]),
        }),
      }),
    );
    expect(report.exactCommandsRun).toEqual([
      expect.objectContaining({
        command: "pnpm run production-scale:promotion-pack",
        status: "passed",
        automated: true,
      }),
    ]);
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });

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
    expect(report.commandList).not.toContain("pnpm run restore:evidence:acceptance");
    expect(report.commandList).not.toContain("pnpm run restore:accept-human-evidence");
    expect(report.commandList).not.toContain("pnpm run restore:evidence:current-check");
    expect(report.commandList).toContain("pnpm run packet-pdf:cache-miss-proof");
    expect(report.commandList).toContain("pnpm run production-worker:activation-plan");
    expect(report.commandList).toContain("pnpm run production-deployment-parity:evidence");
    expect(report.commandList).toContain("pnpm run production-worker:activation-evidence");
    expect(report.commandList).toContain("pnpm run production-worker:runtime-proof");
    expect(report.commandList).toContain("pnpm run production-worker:machine-proof");
    expect(report.commandList).toContain("pnpm run production-worker:readiness-evidence");
    expect(report.commandList).toContain("pnpm run ingest:worker:staging-evidence");
    expect(report.commandList).toContain("pnpm run storage:raw-report-remediation-plan");
    expect(report.commandList).toContain("pnpm run storage:raw-report-remediation-acceptance");
    expect(report.commandList).toContain("pnpm run storage:raw-report-machine-inventory");
    expect(report.commandList).toContain("pnpm run storage:raw-report-machine-remediation-proof");
    expect(report.commandList).toContain("pnpm run alerts:dry-run");
    expect(report.commandList).toContain("pnpm run alerts:exclusion:validate");
    expect(report.commandList).toContain("pnpm run alerts:machine-proof");
    expect(report.commandList).toContain("pnpm run alerting:machine-proof");
    expect(report.commandList).toContain("pnpm run response-ops:readiness-evidence");
    expect(report.commandList).toContain("pnpm run response:ops-readiness-evidence");
    expect(report.commandList).toContain("pnpm run migrations:gate");
    expect(report.commandList).toContain("pnpm run migrations:machine-proof");
    expect(report.commandList).toContain("pnpm run restore:machine-proof");
    expect(report.commandList).toContain("pnpm run retention:archive-restore-machine-proof");
    expect(report.commandList).toContain("pnpm run baseline:production-scale-measured -- --local");
    expect(report.commandList).toContain("pnpm run runtime-size:policy-acceptance");
  });

  it("does not claim production-at-scale readiness while unresolved or machine-required blockers remain", () => {
    const report = buildPack();

    expect(report.machineRequiredProof.length).toBeGreaterThan(0);
    expect(report.unresolvedProductionBlockers.length).toBeGreaterThan(0);
    expect(report.readinessClassification.value).toBe("limited beta");
    expect(report.readinessClassification.canPromoteProductionAtScale).toBe(false);
    expect(report.safety.productionAtScaleClaimed).toBe(false);
  });

  it("keeps blocker 1 and 22 machine-required unless accepted machine proof exists", () => {
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
    expect(blocker1?.classification).toBe("machine proof required");
    expect(blocker22?.classification).toBe("machine proof required");
    expect(report.machineRequiredProof.map((blocker: { number: number }) => blocker.number)).toEqual(
      expect.arrayContaining([1, 22]),
    );
  });

  it("closes blocker 1 through certifying restore machine proof", () => {
    const head = currentGitHead();
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      restoreMachineProofEvidence: machineProofEvidence({
        evidenceType: RESTORE_MACHINE_PROOF_EVIDENCE_TYPE,
        targetSha: head,
        generatedAt: PROMOTION_GATE_TIMESTAMP,
        checks: RESTORE_MACHINE_CHECKS,
      }),
      generatedAt: PROMOTION_GATE_TIMESTAMP,
      env: {},
      targetSha: head,
    });
    const blocker1 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 1);

    expect(blocker1?.classification).toBe("fixed with automated evidence");
    expect(report.machineProofs.restore.accepted).toBe(true);
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });

  it("keeps blocker 1 blocked when restore proof is checklist-only", () => {
    const head = currentGitHead();
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      restoreMachineProofEvidence: machineProofEvidence({
        evidenceType: RESTORE_MACHINE_PROOF_EVIDENCE_TYPE,
        targetSha: head,
        generatedAt: PROMOTION_GATE_TIMESTAMP,
        checks: RESTORE_MACHINE_CHECKS,
        metadata: {
          restoreProofKind: "checklist-only",
        },
        overrides: {
          checklistOnly: true,
        },
      }),
      generatedAt: PROMOTION_GATE_TIMESTAMP,
      env: {},
      targetSha: head,
    });
    const blocker1 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 1);

    expect(report.CERTIFYING).toBe(false);
    expect(report.machineProofs.restore.accepted).toBe(false);
    expect(report.machineProofs.restore.validation.errors.join("\n")).toMatch(/checklist-only/i);
    expect(blocker1?.classification).toBe("machine proof required");
  });

  it("closes blocker 2 through certifying production worker machine proof", () => {
    const head = currentGitHead();
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      productionWorkerMachineProofEvidence: machineProofEvidence({
        evidenceType: PRODUCTION_WORKER_MACHINE_PROOF_EVIDENCE_TYPE,
        targetSha: head,
        generatedAt: PROMOTION_GATE_TIMESTAMP,
        checks: WORKER_MACHINE_CHECKS,
      }),
      generatedAt: PROMOTION_GATE_TIMESTAMP,
      env: {},
      targetSha: head,
    });
    const blocker2 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 2);

    expect(blocker2?.classification).toBe("fixed with automated evidence");
    expect(report.machineProofs.productionWorker.accepted).toBe(true);
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });

  it("keeps blocker 2 blocked when worker machine proof is dry-run-only", () => {
    const head = currentGitHead();
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      productionWorkerMachineProofEvidence: machineProofEvidence({
        evidenceType: PRODUCTION_WORKER_MACHINE_PROOF_EVIDENCE_TYPE,
        targetSha: head,
        generatedAt: PROMOTION_GATE_TIMESTAMP,
        checks: WORKER_MACHINE_CHECKS,
        metadata: {
          workerProofKind: "dry-run-only",
        },
        overrides: {
          dryRunOnly: true,
          productionMutation: "none",
        },
      }),
      generatedAt: PROMOTION_GATE_TIMESTAMP,
      env: {},
      targetSha: head,
    });
    const blocker2 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 2);

    expect(report.CERTIFYING).toBe(false);
    expect(report.machineProofs.productionWorker.accepted).toBe(false);
    expect(report.machineProofs.productionWorker.validation.errors.join("\n")).toMatch(/dry-run-only/i);
    expect(blocker2?.classification).toBe("machine proof required");
  });

  it("closes blocker 6 only with database-reliable sanitized raw report machine proof", () => {
    const head = currentGitHead();
    const invalidProof = machineProofEvidence({
      evidenceType: RAW_REPORT_MACHINE_PROOF_EVIDENCE_TYPE,
      targetSha: head,
      generatedAt: PROMOTION_GATE_TIMESTAMP,
      checks: RAW_REPORT_MACHINE_CHECKS.filter((check) => check !== "db-connectivity-reliable"),
      metadata: {
        databaseReliable: false,
        sanitizedInventoryAccepted: true,
      },
    });
    const validProof = machineProofEvidence({
      evidenceType: RAW_REPORT_MACHINE_PROOF_EVIDENCE_TYPE,
      targetSha: head,
      generatedAt: PROMOTION_GATE_TIMESTAMP,
      checks: RAW_REPORT_MACHINE_CHECKS,
      metadata: {
        databaseReliable: true,
        sanitizedInventoryAccepted: true,
      },
    });

    const invalidReport = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      rawReportMachineProofEvidence: invalidProof,
      generatedAt: PROMOTION_GATE_TIMESTAMP,
      env: {},
      targetSha: head,
    });
    const validReport = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      rawReportMachineProofEvidence: validProof,
      generatedAt: PROMOTION_GATE_TIMESTAMP,
      env: {},
      targetSha: head,
    });

    expect(invalidReport.blockerClassifications.find((blocker: { number: number }) => blocker.number === 6)?.classification)
      .toBe("machine proof required");
    expect(validReport.blockerClassifications.find((blocker: { number: number }) => blocker.number === 6)?.classification)
      .toBe("fixed with automated evidence");
  });

  it("closes blocker 9 only with live alert delivery or certifying formal exclusion machine proof", () => {
    const head = currentGitHead();
    const liveProof = machineProofEvidence({
      evidenceType: ALERTING_MACHINE_PROOF_EVIDENCE_TYPE,
      targetSha: head,
      generatedAt: PROMOTION_GATE_TIMESTAMP,
      checks: ALERTING_MACHINE_CHECKS,
      metadata: {
        acceptedCheckSet: "live-alert-delivery",
        alertingProofPath: "live-alert",
      },
    });
    const formalProof = machineProofEvidence({
      evidenceType: ALERTING_MACHINE_PROOF_EVIDENCE_TYPE,
      targetSha: head,
      generatedAt: PROMOTION_GATE_TIMESTAMP,
      checks: [
        "formal-exclusion-file-validated",
        "policy-allows-certifying-exclusion",
        "compensating-controls-validated",
        "response-ops-readiness-verified",
        "scheduler-status-verified",
        "repo-policy-approval-machine-verified",
        "exclusion-not-stale",
        "next-review-recorded",
        "exclusion-does-not-overclaim-production-pass",
        "no-webhook-or-token-printed",
      ],
      metadata: {
        acceptedCheckSet: "certifying-formal-exclusion",
        alertingProofPath: "certifying-formal-exclusion",
        policyAllowsCertificationUnderExclusion: true,
      },
    });

    const liveReport = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      alertingMachineProofEvidence: liveProof,
      generatedAt: PROMOTION_GATE_TIMESTAMP,
      env: {},
      targetSha: head,
    });
    const formalReport = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      alertingMachineProofEvidence: formalProof,
      generatedAt: PROMOTION_GATE_TIMESTAMP,
      env: {},
      targetSha: head,
    });

    expect(liveReport.blockerClassifications.find((blocker: { number: number }) => blocker.number === 9)?.classification)
      .toBe("fixed with automated evidence");
    expect(formalReport.blockerClassifications.find((blocker: { number: number }) => blocker.number === 9)?.classification)
      .toBe("fixed with automated evidence");
  });

  it("keeps promotion pack non-certifying when any required P1 machine proof is missing", () => {
    const head = currentGitHead();
    const evidence = allPassingCertificationEvidence({
      targetSha: head,
      overrides: {
        restoreMachineProof: null,
      },
    });
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      certificationEvidence: evidence,
      generatedAt: PROMOTION_GATE_TIMESTAMP,
      env: {},
      targetSha: head,
    });

    expect(report.promotionCertification.CERTIFYING).toBe(false);
    expect(report.promotionCertification.missingRequiredChecks).toContain("restoreMachineProof");
    expect(report.CERTIFYING).toBe(false);
  });

  it("reports missing machine runtime inputs without converting them to human proof", () => {
    const head = currentGitHead();
    const missingRestoreProof = machineProofEvidence({
      evidenceType: RESTORE_MACHINE_PROOF_EVIDENCE_TYPE,
      targetSha: head,
      generatedAt: PROMOTION_GATE_TIMESTAMP,
      checks: RESTORE_MACHINE_CHECKS,
      overrides: {
        status: "fail",
        certifying: false,
        missingRuntimeInputs: ["CRP_RESTORE_MACHINE_ATTESTATION_JSON"],
      },
    });
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      restoreMachineProofEvidence: missingRestoreProof,
      generatedAt: PROMOTION_GATE_TIMESTAMP,
      env: {},
      targetSha: head,
    });
    const blocker1 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 1);

    expect(report.CERTIFYING).toBe(false);
    expect(report.missingMachineRuntimeInputs).toEqual(expect.arrayContaining(["CRP_RESTORE_MACHINE_ATTESTATION_JSON"]));
    expect(report.machineProofs.restore).toMatchObject({
      accepted: false,
      humanInteractionRequired: false,
      missingRuntimeInputs: ["CRP_RESTORE_MACHINE_ATTESTATION_JSON"],
    });
    expect(blocker1).toMatchObject({
      classification: "machine proof required",
      humanProofRequired: false,
      machineProofRequired: true,
      missingRuntimeInputs: ["CRP_RESTORE_MACHINE_ATTESTATION_JSON"],
    });
    expect(report.humanRequiredProof.map((blocker: { number: number }) => blocker.number)).not.toContain(1);
    expect(report.requiredStatements.join("\n")).not.toMatch(/operator approval|human-observed|operator acknowledgement/i);
  });

  it("can certify in a full valid machine-proof fixture", () => {
    const head = currentGitHead();
    const alertingExclusionValidation = buildAlertingExclusionValidationReport({
      rootDir: process.cwd(),
      generatedAt: PROMOTION_GATE_TIMESTAMP,
      alertingExclusionEvidence: acceptedAlertingExclusionEvidence(),
    });
    const responseOpsReadinessEvidence = buildResponseOpsReadinessEvidenceReport({
      rootDir: process.cwd(),
      generatedAt: PROMOTION_GATE_TIMESTAMP,
      env: {},
      alertingExclusionValidation,
      alertsDryRunEvidence: dryRunAlertEvidence(),
    });
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      registry: allFixedRegistry(),
      dashboardReport: dashboardWithSkips(),
      productionDeploymentParityEvidence: acceptedDeploymentParityEvidence(),
      measuredLoadEvidenceAcceptance: acceptedMeasuredLoadEvidenceAcceptance(),
      runtimeSizePolicyAcceptance: acceptedHardGateRuntimeSizePolicyAcceptance(),
      responseOpsReadinessEvidence,
      migrationGateEvidence: acceptedReleaseBlockingMigrationGateEvidence(),
      certificationEvidence: allPassingCertificationEvidence({ targetSha: head }),
      ...allMachineProofEvidence({ targetSha: head }),
      generatedAt: PROMOTION_GATE_TIMESTAMP,
      env: {},
      targetSha: head,
    });

    expect(report.promotionCertification.CERTIFYING).toBe(true);
    expect(report.missingMachineRuntimeInputs).toEqual([]);
    expect(report.humanInteractionRequired).toBe(false);
    expect(report.readinessClassification.canPromoteProductionAtScale).toBe(true);
    expect(report.CERTIFYING).toBe(true);
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });

  it("does not close blocker 1 and 22 with legacy human-observed evidence alone", () => {
    const humanRestoreEvidenceAcceptance = buildHumanRestoreDrillEvidenceAcceptanceReport({
      evidencePath: "tests/fixtures/human-restore-drill-evidence.valid.md",
      generatedAt: "2026-05-20T12:00:00.000Z",
    });
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      humanRestoreEvidenceAcceptance,
      restoreEvidenceAcceptance: acceptedProductionRestoreEvidenceAcceptance(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const blocker1 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 1);
    const blocker22 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 22);

    expect(humanRestoreEvidenceAcceptance.accepted).toBe(false);
    expect(report.restoreReadinessCheck).toMatchObject({
      currentOperationalProof: false,
      stale: false,
      evidenceType: "LEGACY-HUMAN-OBSERVED",
      humanObserved: false,
      simulatedOnly: false,
    });
    expect(report.restoreEvidenceAcceptance).toMatchObject({
      status: "accepted-production",
      accepted: true,
      productionProof: true,
      blockerCoverage: {
        disasterRecoveryRestoreDrill: true,
        retentionArchiveRestore: true,
      },
    });
    expect(blocker1?.classification).toBe("machine proof required");
    expect(blocker22?.classification).toBe("machine proof required");
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });

  it("keeps blocker 1 machine-required when accepted legacy human evidence is stale", () => {
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

    expect(report.humanRestoreDrillEvidenceAcceptance.accepted).toBe(false);
    expect(report.restoreReadinessCheck.stale).toBe(true);
    expect(blocker1?.classification).toBe("machine proof required");
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });

  it("keeps blocker 2 production runtime unresolved without accepted production queue-depth evidence", () => {
    const report = buildPack();
    const blocker2 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 2);

    expect(report.productionWorkerReadinessEvidence).toMatchObject({
      productionProof: false,
      acceptedProductionRunEvidence: {
        accepted: false,
        runtimeProofAccepted: false,
      },
      blockerCoverage: {
        productionIngestRuntime: false,
      },
    });
    expect(report.productionWorkerRuntimeProof).toMatchObject({
      accepted: false,
      productionProof: false,
      dryRunOnly: true,
    });
    expect(report.stagingIngestWorkerEvidence).toMatchObject({
      accepted: false,
      productionProof: false,
      blockerCoverage: {
        blocker2StagingQueueDrain: false,
      },
    });
    expect(blocker2?.classification).toBe("machine proof required");
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

    expect(blocker2?.classification).toBe("machine proof required");
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

  it("keeps blocker 6 machine-required unless accepted machine proof exists", () => {
    const report = buildPack();
    const blocker6 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 6);

    expect(report.rawReportRemediationAcceptance).toMatchObject({
      status: "not-submitted",
      accepted: false,
      blockerCoverage: {
        historicalRawReportBytes: false,
      },
    });
    expect(blocker6?.classification).toBe("machine proof required");
    expect(report.machineRequiredProof.map((blocker: { number: number }) => blocker.number)).toContain(6);
  });

  it("keeps blocker 6 machine-required when legacy operator evidence is not linked to reliable inventory", () => {
    const rawReportRemediationAcceptance = buildRawReportRemediationAcceptanceReport({
      rootDir: mkdtempSync(join(tmpdir(), "crp-promotion-raw-report-unreliable-")),
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

    expect(rawReportRemediationAcceptance.accepted).toBe(false);
    expect(rawReportRemediationAcceptance.linkedEvidence.reliableInventoryAccepted).toBe(false);
    expect(blocker6?.classification).toBe("machine proof required");
  });

  it("does not close blocker 6 with legacy sanitized operator remediation evidence alone", () => {
    const rawReportRemediationAcceptance = acceptedRawReportRemediationAcceptance();
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      rawReportRemediationAcceptance,
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const blocker6 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 6);

    expect(rawReportRemediationAcceptance.accepted).toBe(true);
    expect(rawReportRemediationAcceptance.productionProof).toBe(true);
    expect(rawReportRemediationAcceptance.linkedEvidence.reliableInventoryAccepted).toBe(true);
    expect(blocker6?.classification).toBe("machine proof required");
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });

  it("keeps blocker 10 machine-required when migration gate remains warning-only", () => {
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
    expect(blocker10?.classification).toBe("machine proof required");
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

  it("keeps blocker 10 machine-required when migration gate has unresolved temporary allowlist residuals", () => {
    const migrationGateEvidence = temporaryAllowlistMigrationGateEvidence();
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      migrationGateEvidence,
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const blocker10 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 10);

    expect(migrationGateEvidence.status).toBe("failed");
    expect(report.migrationGateEvidence).toMatchObject({
      policyMode: "release-blocking",
      CERTIFYING: false,
      releaseGateAccepted: false,
      productionPromotionGateAccepted: false,
      temporaryAllowlistActive: true,
      runtimeEnsureResidualImpact: "release-blocking",
      releaseBlockingFindings: expect.any(Number),
      blockerCoverage: {
        migrationGovernance: false,
        productionPromotionGate: false,
        temporaryAllowlistActive: true,
      },
    });
    expect(blocker10?.classification).toBe("machine proof required");
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });

  it("does not close blocker 2 with legacy production runtime proof without machine attestation", () => {
    const productionWorkerRuntimeProof = acceptedProductionWorkerRuntimeProof();
    const productionWorkerReadinessEvidence = buildProductionWorkerReadinessEvidenceReport({
      rootDir: process.cwd(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      productionWorkerRuntimeProofEvidence: productionWorkerRuntimeProof,
    });
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      productionWorkerRuntimeProof,
      productionWorkerReadinessEvidence,
      productionDeploymentParityEvidence: notSubmittedProductionDeploymentParityEvidence(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const blocker2 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 2);
    const blocker11 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 11);

    expect(blocker2?.classification).toBe("machine proof required");
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
    expect(blocker20?.classification).toBe("partial");
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
      backfillReadinessStatus: "machine-controlled-deferred",
      purgeArchiveReadinessStatus: "machine-controlled-deferred",
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
    expect(blocker9?.classification).toBe("machine proof required");
  });

  it("does not close blocker 9 with legacy formal alert exclusion without machine attestation", () => {
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
    expect(report.responseOpsReadinessEvidence.alertingAcceptanceAccepted).toBe(true);
    expect(report.responseOpsReadinessEvidence.alertingAcceptancePath).toBe("formal-exclusion");
    expect(blocker9?.classification).toBe("machine proof required");
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });

  it("keeps blocker 9 open when the formal exclusion is not policy-allowed", () => {
    const alertingExclusionValidation = buildAlertingExclusionValidationReport({
      rootDir: process.cwd(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      alertingExclusionEvidence: {
        ...acceptedAlertingExclusionEvidence(),
        policyAllowsFormalExclusion: false,
      },
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

    expect(alertingExclusionValidation.accepted).toBe(false);
    expect(report.responseOpsReadinessEvidence.alertingAcceptanceAccepted).toBe(false);
    expect(blocker9?.classification).toBe("machine proof required");
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
