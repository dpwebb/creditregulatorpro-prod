import { describe, expect, it } from "vitest";

import {
  ALERTING_MACHINE_PROOF_ATTESTATION_INPUT,
  buildAlertingMachineProofReport,
} from "../../scripts/alerting-machine-proof.mjs";
import {
  buildProductionWorkerMachineProofReport,
  PRODUCTION_WORKER_MACHINE_PROOF_RUNTIME_INPUTS,
} from "../../scripts/production-worker-machine-proof.mjs";
import {
  buildRestoreMachineProofReport,
  RESTORE_MACHINE_PROOF_RUNTIME_INPUTS,
} from "../../scripts/restore-machine-proof.mjs";
import {
  buildRetentionArchiveRestoreMachineProofReport,
  RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_RUNTIME_INPUTS,
} from "../../scripts/retention-archive-restore-machine-proof.mjs";

const GENERATED_AT = "2026-05-22T12:00:00.000Z";
const HEAD = "c".repeat(40);
const SIMULATION_ENV = { CRP_MACHINE_EVIDENCE_COMMIT_HASH: HEAD };
const SIMULATED_SOURCE = "simulated_machine_proof_fixture";

function expectSimulatedResolution(report: Record<string, any>, family: string, expectedInputs: string[]) {
  const resolution = report.metadata?.runtimeInputResolution;

  expect(report.CERTIFYING).toBe(true);
  expect(report.status).toBe("pass");
  expect(report.environment).toBe("machine-proof-simulation");
  expect(report.simulatedOnly).toBe(true);
  expect(report.productionMutation).toBe("none");
  expect(report.humanInteractionRequired).toBe(false);
  expect(report.missingRuntimeInputs).toEqual([]);
  expect(resolution).toMatchObject({
    source: SIMULATED_SOURCE,
    family,
    resolvedInputs: expectedInputs,
    sideEffects: "none",
    productionMutation: false,
    productionMutationOccurred: false,
    productionTargetSelected: false,
    humanInteractionRequired: false,
    persistedSensitiveValues: false,
    rawValuesPrinted: false,
  });
  expect(JSON.stringify(report)).not.toMatch(/password=|supersecret|postgres:\/\/|hooks\.slack|webhookUrl/i);
}

describe("machine proof runtime input resolver", () => {
  it("auto-resolves restore runtime inputs with an isolated fixture target", () => {
    const report = buildRestoreMachineProofReport({
      generatedAt: GENERATED_AT,
      env: SIMULATION_ENV,
      argv: [],
      allowSimulation: true,
    });

    expectSimulatedResolution(report, "restore", RESTORE_MACHINE_PROOF_RUNTIME_INPUTS);
    expect(report.metadata.latestBackup).toMatchObject({ fixtureDetected: true });
    expect(report.metadata.isolatedRestoreTarget).toMatchObject({
      productionTarget: false,
      isolated: true,
      productionDatabaseReachable: false,
    });
    expect(report.metadata.postRestoreChecks).toMatchObject({
      simulatedRestoreCompleted: true,
      productionMutation: false,
      humanInteractionRequired: false,
    });
  });

  it("auto-resolves production worker runtime inputs with an in-memory queue fixture", () => {
    const report = buildProductionWorkerMachineProofReport({
      generatedAt: GENERATED_AT,
      env: SIMULATION_ENV,
      argv: [],
      allowSimulation: true,
    });

    expectSimulatedResolution(report, "productionWorker", PRODUCTION_WORKER_MACHINE_PROOF_RUNTIME_INPUTS);
    expect(report.metadata.boundedRun).toMatchObject({
      queueFixtureAvailable: true,
      processedCount: 1,
      failedCount: 0,
    });
    expect(report.metadata.canaryJob).toMatchObject({
      enqueued: true,
      observed: true,
      completed: true,
      cleanupVerified: true,
    });
    expect(report.metadata.stopRollback).toMatchObject({
      verified: true,
      productionWorkerTouched: false,
    });
  });

  it("auto-resolves alerting runtime inputs with a sink transport only", () => {
    const report = buildAlertingMachineProofReport({
      generatedAt: GENERATED_AT,
      env: SIMULATION_ENV,
      argv: [],
      allowSimulation: true,
    });

    expectSimulatedResolution(report, "alerting", [ALERTING_MACHINE_PROOF_ATTESTATION_INPUT]);
    expect(report).toMatchObject({
      alertSinkAvailable: true,
      syntheticAlertAccepted: true,
      deliveryVerified: true,
      responseOpsReady: true,
      noExternalDelivery: true,
    });
    expect(report.metadata).toMatchObject({
      alertSinkAvailable: true,
      syntheticAlertAccepted: true,
      noExternalDelivery: true,
    });
  });

  it("auto-resolves retention archive restore inputs with an isolated fixture only", () => {
    const report = buildRetentionArchiveRestoreMachineProofReport({
      generatedAt: GENERATED_AT,
      env: SIMULATION_ENV,
      argv: [],
      allowSimulation: true,
    });

    expectSimulatedResolution(report, "retentionArchiveRestore", RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_RUNTIME_INPUTS);
    expect(report.metadata.safeArchiveCandidate).toMatchObject({
      selected: true,
      safe: true,
      realConsumerPiiUsed: false,
    });
    expect(report.metadata.archive).toMatchObject({
      metadataVerified: true,
      containsPii: false,
    });
    expect(report.metadata.isolatedRestoreTarget).toMatchObject({
      productionTarget: false,
      isolated: true,
      destroyed: true,
    });
    expect(report.metadata.restoreVerification).toMatchObject({
      integrityVerified: true,
      restoredHashMatchesArchive: true,
    });
  });

  it("fails closed unless simulation context is explicitly enabled", () => {
    const restore = buildRestoreMachineProofReport({
      generatedAt: GENERATED_AT,
      env: SIMULATION_ENV,
      argv: [],
    });
    const worker = buildProductionWorkerMachineProofReport({
      generatedAt: GENERATED_AT,
      env: SIMULATION_ENV,
      argv: [],
    });
    const alerting = buildAlertingMachineProofReport({
      generatedAt: GENERATED_AT,
      env: SIMULATION_ENV,
      argv: [],
    });
    const retention = buildRetentionArchiveRestoreMachineProofReport({
      generatedAt: GENERATED_AT,
      env: SIMULATION_ENV,
      argv: [],
    });

    expect(restore.CERTIFYING).toBe(false);
    expect(restore.missingRuntimeInputs).toEqual(RESTORE_MACHINE_PROOF_RUNTIME_INPUTS);
    expect(worker.CERTIFYING).toBe(false);
    expect(worker.missingRuntimeInputs).toEqual(PRODUCTION_WORKER_MACHINE_PROOF_RUNTIME_INPUTS);
    expect(alerting.CERTIFYING).toBe(false);
    expect(alerting.missingRuntimeInputs).toEqual([ALERTING_MACHINE_PROOF_ATTESTATION_INPUT]);
    expect(retention.CERTIFYING).toBe(false);
    expect(retention.missingRuntimeInputs).toEqual(RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_RUNTIME_INPUTS);
  });

  it("refuses simulated inputs in production-like runtimes", () => {
    const env = { ...SIMULATION_ENV, CRP_ENV: "production" };
    const restore = buildRestoreMachineProofReport({ generatedAt: GENERATED_AT, env, argv: [], allowSimulation: true });
    const worker = buildProductionWorkerMachineProofReport({ generatedAt: GENERATED_AT, env, argv: [], allowSimulation: true });
    const alerting = buildAlertingMachineProofReport({ generatedAt: GENERATED_AT, env, argv: [], allowSimulation: true });
    const retention = buildRetentionArchiveRestoreMachineProofReport({ generatedAt: GENERATED_AT, env, argv: [], allowSimulation: true });

    expect(restore.CERTIFYING).toBe(false);
    expect(restore.missingRuntimeInputs).toEqual(RESTORE_MACHINE_PROOF_RUNTIME_INPUTS);
    expect(worker.CERTIFYING).toBe(false);
    expect(worker.missingRuntimeInputs).toEqual(PRODUCTION_WORKER_MACHINE_PROOF_RUNTIME_INPUTS);
    expect(alerting.CERTIFYING).toBe(false);
    expect(alerting.missingRuntimeInputs).toEqual([ALERTING_MACHINE_PROOF_ATTESTATION_INPUT]);
    expect(retention.CERTIFYING).toBe(false);
    expect(retention.missingRuntimeInputs).toEqual(RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_RUNTIME_INPUTS);
  });
});
