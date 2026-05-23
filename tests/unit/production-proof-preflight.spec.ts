import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildProductionProofPreflightReport,
  renderProductionProofPreflightMarkdown,
} from "../../scripts/production-proof-preflight.mjs";
import {
  ALERTING_MACHINE_PROOF_LIVE_CHECKS,
} from "../../scripts/alerting-machine-proof.mjs";
import {
  PRODUCTION_WORKER_MACHINE_PROOF_REQUIRED_CHECKS,
} from "../../scripts/production-worker-machine-proof.mjs";
import {
  RESTORE_MACHINE_PROOF_REQUIRED_CHECKS,
} from "../../scripts/restore-machine-proof.mjs";
import {
  RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_REQUIRED_CHECKS,
} from "../../scripts/retention-archive-restore-machine-proof.mjs";

const GENERATED_AT = "2026-05-22T12:00:00.000Z";
const HEAD = "d".repeat(40);

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), "crp-proof-preflight-"));
}

function passChecks(names: string[]) {
  return names.map((name) => ({ name, status: "pass" }));
}

function writeJson(rootDir: string, relativePath: string, value: unknown) {
  const absolutePath = path.join(rootDir, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function restoreAttestation(overrides: Record<string, unknown> = {}) {
  return {
    nonInteractive: true,
    machineAttested: true,
    generatedManually: false,
    humanObserved: false,
    manualApprovalRequired: false,
    environment: "production",
    status: "pass",
    certifying: true,
    CERTIFYING: true,
    restoreProofKind: "machine-attested-restore",
    checks: passChecks(RESTORE_MACHINE_PROOF_REQUIRED_CHECKS),
    latestBackup: {
      selectedLatest: true,
      opaqueBackupId: "backup-0001",
    },
    isolatedRestoreTarget: {
      created: true,
      destroyed: true,
      productionTarget: false,
      productionDatabaseReachable: false,
      isolated: true,
      targetId: "isolated-restore-target-0001",
    },
    safeFixture: {
      fixtureId: "safe-restore-fixture-0001",
      syntheticCredentials: true,
      packetPdfFixture: true,
    },
    rpo: { targetMinutes: 15, actualMinutes: 2, status: "pass" },
    rto: { targetMinutes: 30, actualMinutes: 4, status: "pass" },
    postRestoreChecks: {
      authSession: true,
      packetPdfRetrieval: true,
      responseQueueState: true,
      cleanupLifecycle: true,
      rollbackStop: true,
    },
    ...overrides,
  };
}

function workerAttestation(overrides: Record<string, unknown> = {}) {
  return {
    nonInteractive: true,
    machineAttested: true,
    generatedManually: false,
    environment: "production",
    status: "pass",
    certifying: true,
    CERTIFYING: true,
    workerProofKind: "bounded-production-canary",
    productionMutation: "synthetic-canary-cleaned-up",
    checks: passChecks(PRODUCTION_WORKER_MACHINE_PROOF_REQUIRED_CHECKS),
    queueDepthBefore: { queued: 1, running: 0, failed: 0, deadLettered: 0, stale: 0 },
    workerLiveness: { verified: true, status: "healthy" },
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
    },
    queueDepthAfter: { queued: 0, running: 0, failed: 0, deadLettered: 0, stale: 0 },
    stopRollback: { verified: true, status: "pass" },
    ...overrides,
  };
}

function alertingAttestation(overrides: Record<string, unknown> = {}) {
  return {
    nonInteractive: true,
    machineAttested: true,
    generatedManually: false,
    environment: "production",
    status: "pass",
    certifying: true,
    CERTIFYING: true,
    alertingProofPath: "live-alert",
    checks: passChecks(ALERTING_MACHINE_PROOF_LIVE_CHECKS),
    alertType: "synthetic-response-ops-alert",
    channelSanitizedId: "approved-sink-route",
    correlationId: "alert-correlation-0001",
    deliveryTimestamp: GENERATED_AT,
    deliveryVerified: true,
    responseOpsReady: true,
    schedulerStatus: "healthy",
    alertSinkAvailable: true,
    syntheticAlertAccepted: true,
    noExternalDelivery: true,
    externalDeliveryUsed: false,
    ...overrides,
  };
}

function retentionAttestation(overrides: Record<string, unknown> = {}) {
  return {
    nonInteractive: true,
    machineAttested: true,
    generatedManually: false,
    humanObserved: false,
    humanInteractionRequired: false,
    manualApprovalRequired: false,
    environment: "production",
    status: "pass",
    certifying: true,
    CERTIFYING: true,
    retentionProofKind: "machine-attested-retention-archive-restore",
    productionMutation: "synthetic-canary-cleaned-up",
    checks: passChecks(RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_REQUIRED_CHECKS),
    safeArchiveCandidate: {
      selected: true,
      safe: true,
      opaqueCandidateId: "retention-candidate-0001",
      realConsumerPiiUsed: false,
    },
    archive: {
      selected: true,
      archiveId: "retention-archive-0001",
      metadataVerified: true,
      manifestHash: "retention-manifest-0001",
      containsPii: false,
    },
    isolatedRestoreTarget: {
      created: true,
      destroyed: true,
      productionTarget: false,
      isolated: true,
      targetId: "retention-isolated-target-0001",
    },
    restoreVerification: {
      integrityVerified: true,
      restoredHashMatchesArchive: true,
      sourceHash: "archive-hash-0001",
      restoredHash: "archive-hash-0001",
    },
    noPiiExposed: true,
    lifecycleCleanup: {
      verified: true,
      temporaryArchiveCleaned: true,
      canaryCleanedUp: true,
    },
    rollbackRecovery: {
      verified: true,
      notesRecorded: true,
    },
    ...overrides,
  };
}

function readyEnv(rootDir: string, overrides: Record<string, string> = {}) {
  writeJson(rootDir, "proofs/restore.json", restoreAttestation());
  writeJson(rootDir, "proofs/worker.json", workerAttestation());
  writeJson(rootDir, "proofs/alerting.json", alertingAttestation());
  writeJson(rootDir, "proofs/retention.json", retentionAttestation());

  return {
    CRP_MACHINE_EVIDENCE_COMMIT_HASH: HEAD,
    DATABASE_URL: "postgresql://proof_user:proof_password@example.invalid:5432/proof_db",
    CRP_RESTORE_MACHINE_ATTESTATION_JSON: "proofs/restore.json",
    CRP_RESTORE_MACHINE_BACKUP_SOURCE: JSON.stringify({ sourceId: "backup-source-0001" }),
    CRP_RESTORE_MACHINE_ISOLATED_TARGET: JSON.stringify({
      targetId: "isolated-restore-target-0001",
      isolated: true,
      productionTarget: false,
      productionDatabaseReachable: false,
    }),
    CRP_RESTORE_MACHINE_SAFE_FIXTURE: JSON.stringify({ fixtureId: "safe-fixture-0001" }),
    CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON: "proofs/worker.json",
    CRP_PRODUCTION_WORKER_QUEUE_ACCESS: JSON.stringify({ scope: "bounded-canary" }),
    CRP_PRODUCTION_WORKER_LIVENESS_ACCESS: JSON.stringify({ scope: "read-only-liveness" }),
    CRP_PRODUCTION_WORKER_CANARY_JOB_ACCESS: JSON.stringify({ maxJobs: 1, destructive: false }),
    CRP_PRODUCTION_WORKER_STOP_ROLLBACK_ACCESS: JSON.stringify({ stopRollback: true }),
    CRP_ALERTING_MACHINE_ATTESTATION_JSON: "proofs/alerting.json",
    CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON: "proofs/retention.json",
    CRP_RETENTION_ARCHIVE_RESTORE_ARCHIVE_ACCESS: JSON.stringify({ archiveId: "archive-0001" }),
    CRP_RETENTION_ARCHIVE_RESTORE_ISOLATED_TARGET: JSON.stringify({
      targetId: "retention-isolated-target-0001",
      isolated: true,
      productionTarget: false,
    }),
    CRP_RETENTION_ARCHIVE_RESTORE_SAFE_CANDIDATE: JSON.stringify({ candidateId: "candidate-0001" }),
    ...overrides,
  };
}

function family(report: Record<string, any>, key: string) {
  return report.proofFamilies.find((proofFamily: Record<string, any>) => proofFamily.key === key);
}

describe("production proof preflight", () => {
  it("does not print or persist secret values in the plain-English report", () => {
    const rootDir = tempRoot();
    const secret = "proof_password";
    const report = buildProductionProofPreflightReport({
      rootDir,
      env: readyEnv(rootDir),
      generatedAt: GENERATED_AT,
    });
    const rendered = renderProductionProofPreflightMarkdown(report);

    expect(rendered).not.toContain(secret);
    expect(JSON.stringify(report)).not.toContain(secret);
    expect(rendered).not.toMatch(/postgresql:\/\/proof_user/i);
    expect(report.secretsPrinted).toBe(false);
    expect(report.rawValuesPrinted).toBe(false);
  });

  it("detects missing real production proof inputs", () => {
    const rootDir = tempRoot();
    const report = buildProductionProofPreflightReport({
      rootDir,
      env: {},
      generatedAt: GENERATED_AT,
    });

    expect(report.readyToRunRealEvidence).toBe(false);
    expect(report.missingRealInputs).toContain("CRP_RESTORE_MACHINE_ATTESTATION_JSON");
    expect(report.missingRealInputs).toContain("CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON");
    expect(report.missingRealInputs).toContain("CRP_ALERTING_MACHINE_ATTESTATION_JSON");
    expect(report.missingRealInputs).toContain("CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON");
  });

  it("distinguishes simulation-only inputs from real production proof inputs", () => {
    const rootDir = tempRoot();
    const report = buildProductionProofPreflightReport({
      rootDir,
      env: readyEnv(rootDir, {
        CRP_RESTORE_MACHINE_ISOLATED_TARGET: "machine-proof-simulation:restore-target",
      }),
      generatedAt: GENERATED_AT,
    });

    expect(report.readyToRunRealEvidence).toBe(false);
    expect(report.simulationOnlyInputs).toContain("CRP_RESTORE_MACHINE_ISOLATED_TARGET");
    expect(family(report, "restore").simulationOnlyInputs).toContain("CRP_RESTORE_MACHINE_ISOLATED_TARGET");
  });

  it("blocks unsafe production restore targets", () => {
    const rootDir = tempRoot();
    const report = buildProductionProofPreflightReport({
      rootDir,
      env: readyEnv(rootDir, {
        CRP_RESTORE_MACHINE_ISOLATED_TARGET: JSON.stringify({
          targetId: "creditregulatorpro-prod",
          productionTarget: true,
        }),
      }),
      generatedAt: GENERATED_AT,
    });

    const restore = family(report, "restore");
    expect(restore.readyForRealEvidence).toBe(false);
    expect(restore.safetyChecks[0]).toMatchObject({
      key: "isolated-restore-target-not-production",
      ok: false,
      status: "unsafe",
    });
  });

  it("blocks destructive production worker canary configuration", () => {
    const rootDir = tempRoot();
    const report = buildProductionProofPreflightReport({
      rootDir,
      env: readyEnv(rootDir, {
        CRP_PRODUCTION_WORKER_CANARY_JOB_ACCESS: "destructive-all-production-jobs",
      }),
      generatedAt: GENERATED_AT,
    });

    const worker = family(report, "productionWorker");
    expect(worker.readyForRealEvidence).toBe(false);
    expect(worker.safetyChecks[0]).toMatchObject({
      key: "worker-canary-non-destructive",
      ok: false,
      status: "unsafe",
    });
  });

  it("blocks unbounded production worker canary configuration", () => {
    const rootDir = tempRoot();
    const report = buildProductionProofPreflightReport({
      rootDir,
      env: readyEnv(rootDir, {
        CRP_PRODUCTION_WORKER_CANARY_JOB_ACCESS: JSON.stringify({ maxJobs: 99, destructive: false }),
      }),
      generatedAt: GENERATED_AT,
    });

    const worker = family(report, "productionWorker");
    expect(worker.readyForRealEvidence).toBe(false);
    expect(worker.safetyChecks[0]).toMatchObject({
      key: "worker-canary-non-destructive",
      ok: false,
      status: "unsafe",
    });
  });

  it("blocks production worker proof when canary cleanup is missing", () => {
    const rootDir = tempRoot();
    const env = readyEnv(rootDir);
    writeJson(rootDir, "proofs/worker.json", workerAttestation({
      canaryJob: {
        created: true,
        processed: true,
        onlyCanaryJobProcessed: true,
        cleanupVerified: false,
      },
    }));

    const report = buildProductionProofPreflightReport({
      rootDir,
      env,
      generatedAt: GENERATED_AT,
    });

    const worker = family(report, "productionWorker");
    expect(worker.readyForRealEvidence).toBe(false);
    expect(worker.safetyChecks[0]).toMatchObject({
      key: "worker-canary-non-destructive",
      ok: false,
      status: "unclear",
    });
  });

  it("blocks production worker proof when rollback verification is missing", () => {
    const rootDir = tempRoot();
    const env = readyEnv(rootDir);
    writeJson(rootDir, "proofs/worker.json", workerAttestation({
      stopRollback: { verified: false, status: "fail" },
    }));

    const report = buildProductionProofPreflightReport({
      rootDir,
      env,
      generatedAt: GENERATED_AT,
    });

    const worker = family(report, "productionWorker");
    expect(worker.readyForRealEvidence).toBe(false);
    expect(worker.safetyChecks[0]).toMatchObject({
      key: "worker-canary-non-destructive",
      ok: false,
      status: "unclear",
    });
  });

  it("accepts bounded non-destructive production worker canary proof semantics", () => {
    const rootDir = tempRoot();
    const report = buildProductionProofPreflightReport({
      rootDir,
      env: readyEnv(rootDir, {
        CRP_PRODUCTION_WORKER_CANARY_JOB_ACCESS: "bounded-non-destructive-canary",
      }),
      generatedAt: GENERATED_AT,
    });

    const worker = family(report, "productionWorker");
    expect(worker.readyForRealEvidence).toBe(true);
    expect(worker.safetyChecks[0]).toMatchObject({
      key: "worker-canary-non-destructive",
      ok: true,
      status: "safe",
    });
  });

  it("blocks external alerting unless it is explicitly approved", () => {
    const rootDir = tempRoot();
    const env = readyEnv(rootDir, {
      CRP_ALERTING_MACHINE_ATTESTATION_JSON: "proofs/alerting.json",
    });
    writeJson(rootDir, "proofs/alerting.json", alertingAttestation({
      alertSinkAvailable: false,
      noExternalDelivery: false,
      externalDeliveryUsed: true,
    }));
    const blocked = buildProductionProofPreflightReport({
      rootDir,
      env,
      generatedAt: GENERATED_AT,
    });

    expect(family(blocked, "alerting").readyForRealEvidence).toBe(false);
    expect(family(blocked, "alerting").safetyChecks[0]).toMatchObject({
      key: "approved-alert-route-or-sink",
      ok: false,
      status: "unsafe-external",
    });

    writeJson(rootDir, "proofs/alerting.json", alertingAttestation({
      alertSinkAvailable: false,
      noExternalDelivery: false,
      externalDeliveryUsed: true,
      approvedTestRoute: true,
    }));
    const approved = buildProductionProofPreflightReport({
      rootDir,
      env,
      generatedAt: GENERATED_AT,
    });

    expect(family(approved, "alerting").safetyChecks[0]).toMatchObject({
      ok: true,
      status: "approved-test-route",
    });
  });

  it("blocks retention archive restore without a safe isolated target", () => {
    const rootDir = tempRoot();
    const report = buildProductionProofPreflightReport({
      rootDir,
      env: readyEnv(rootDir, {
        CRP_RETENTION_ARCHIVE_RESTORE_ISOLATED_TARGET: JSON.stringify({
          targetId: "production-retention-target",
          productionTarget: true,
        }),
      }),
      generatedAt: GENERATED_AT,
    });

    const retention = family(report, "retentionArchiveRestore");
    expect(retention.readyForRealEvidence).toBe(false);
    expect(retention.safetyChecks[0]).toMatchObject({
      key: "retention-isolated-target-not-production",
      ok: false,
      status: "unsafe",
    });
  });

  it("keeps production promotion blocked unless certification is true", () => {
    const rootDir = tempRoot();
    writeJson(rootDir, "docs/production-scale/evidence/latest-production-scale-certification.json", {
      CERTIFYING: false,
    });
    writeJson(rootDir, "docs/production-scale/evidence/latest-production-promotion-pack.json", {
      CERTIFYING: true,
      canPromoteProductionAtScale: true,
    });

    const blocked = buildProductionProofPreflightReport({
      rootDir,
      env: readyEnv(rootDir),
      generatedAt: GENERATED_AT,
    });
    expect(blocked.productionPromotionSafe).toBe(false);
    expect(blocked.productionPromotionBlocked).toBe(true);

    writeJson(rootDir, "docs/production-scale/evidence/latest-production-scale-certification.json", {
      CERTIFYING: true,
    });
    const safe = buildProductionProofPreflightReport({
      rootDir,
      env: readyEnv(rootDir),
      generatedAt: GENERATED_AT,
    });
    expect(safe.productionPromotionSafe).toBe(true);
    expect(safe.productionPromotionBlocked).toBe(false);
  });
});
