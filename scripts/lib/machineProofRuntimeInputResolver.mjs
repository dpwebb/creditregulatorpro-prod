export const SIMULATED_MACHINE_PROOF_SOURCE = "simulated_machine_proof_fixture";
export const MACHINE_PROOF_SIMULATION_ENVIRONMENT = "machine-proof-simulation";

const PRODUCTION_LIKE_VALUES = new Set(["production", "prod", "production-scale", "production-scale-local-certification"]);

function envValue(env, name) {
  const value = env?.[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function isProductionLikeRuntime(env = process.env) {
  for (const name of ["CRP_ENV", "NODE_ENV", "APP_ENV", "TARGET_ENVIRONMENT", "CRP_PROMOTION_TARGET_ENV"]) {
    const value = envValue(env, name);
    if (value && PRODUCTION_LIKE_VALUES.has(value.toLowerCase())) return true;
  }
  return false;
}

function runtimeInputResolution({ family, resolvedInputs }) {
  return {
    source: SIMULATED_MACHINE_PROOF_SOURCE,
    family,
    resolvedInputs,
    sideEffects: "none",
    productionMutation: false,
    productionMutationOccurred: false,
    productionTargetSelected: false,
    humanInteractionRequired: false,
    persistedSensitiveValues: false,
    rawValuesPrinted: false,
  };
}

function passChecks(checks) {
  return checks.map((name) => ({
    name,
    status: "pass",
    summary: "Deterministic machine-proof simulation fixture check passed.",
  }));
}

function baseFixture({ family, checks, inputs }) {
  return {
    nonInteractive: true,
    machineAttested: true,
    generatedManually: false,
    humanObserved: false,
    humanInteractionRequired: false,
    manualApprovalRequired: false,
    simulatedOnly: true,
    dryRunOnly: false,
    environment: MACHINE_PROOF_SIMULATION_ENVIRONMENT,
    status: "pass",
    certifying: true,
    CERTIFYING: true,
    productionMutation: "none",
    checks: passChecks(checks),
    metadata: {
      runtimeInputResolution: runtimeInputResolution({ family, resolvedInputs: inputs }),
    },
  };
}

function restoreFixture({ checks, inputs }) {
  return {
    ...baseFixture({ family: "restore", checks, inputs }),
    restoreProofKind: "safe-runtime-input-resolution",
    latestBackup: {
      selectedLatest: true,
      opaqueBackupId: "simulated-restore-backup-0001",
      fixtureDetected: true,
      sourceKind: "local-simulated-backup-fixture",
    },
    isolatedRestoreTarget: {
      created: true,
      destroyed: true,
      productionTarget: false,
      targetId: "simulated-isolated-restore-target-0001",
      isolated: true,
      productionDatabaseReachable: false,
    },
    safeFixture: {
      fixtureId: "simulated-restore-safe-fixture-0001",
      syntheticCredentials: true,
      packetPdfFixture: true,
      realConsumerPiiUsed: false,
    },
    rpo: { targetMinutes: 15, actualMinutes: 1, status: "pass" },
    rto: { targetMinutes: 30, actualMinutes: 2, status: "pass" },
    postRestoreChecks: {
      authSession: true,
      packetPdfRetrieval: true,
      responseQueueState: true,
      cleanupLifecycle: true,
      rollbackStop: true,
      simulatedRestoreCompleted: true,
      productionMutation: false,
      humanInteractionRequired: false,
    },
  };
}

function productionWorkerFixture({ checks, inputs }) {
  return {
    ...baseFixture({ family: "productionWorker", checks, inputs }),
    workerProofKind: "safe-runtime-input-resolution",
    queueDepthBefore: { queued: 1, running: 0, failed: 0, deadLettered: 0, stale: 0 },
    workerLiveness: {
      verified: true,
      status: "healthy",
      source: "in-memory-worker-liveness-fixture",
    },
    boundedRun: {
      maxJobs: 1,
      onlyCanaryJobProcessed: true,
      processedCount: 1,
      failedCount: 0,
      deadLetterCount: 0,
      staleCount: 0,
      queueFixtureAvailable: true,
    },
    canaryJob: {
      created: true,
      enqueued: true,
      observed: true,
      processed: true,
      completed: true,
      onlyCanaryJobProcessed: true,
      cleanupVerified: true,
      canaryId: "simulated-worker-canary-0001",
    },
    queueDepthAfter: { queued: 0, running: 0, failed: 0, deadLettered: 0, stale: 0 },
    stopRollback: {
      verified: true,
      status: "pass",
      controlPath: "simulated-stop-rollback-sink",
      productionWorkerTouched: false,
    },
  };
}

function alertingFixture({ checks, inputs, generatedAt }) {
  return {
    ...baseFixture({ family: "alerting", checks, inputs }),
    acceptedCheckSet: "live-alert-delivery",
    alertingProofPath: "live-alert",
    alertType: "synthetic-response-ops-alert",
    channelSanitizedId: "simulated-alert-sink-0001",
    correlationId: "simulated-alert-correlation-0001",
    deliveryTimestamp: generatedAt,
    deliveryVerified: true,
    responseOpsReady: true,
    schedulerStatus: "sink-verified",
    alertSinkAvailable: true,
    syntheticAlertAccepted: true,
    externalDeliveryUsed: false,
    noExternalDelivery: true,
  };
}

function retentionArchiveRestoreFixture({ checks, inputs }) {
  return {
    ...baseFixture({ family: "retentionArchiveRestore", checks, inputs }),
    retentionProofKind: "safe-runtime-input-resolution",
    safeArchiveCandidate: {
      selected: true,
      safe: true,
      opaqueCandidateId: "simulated-retention-candidate-0001",
      syntheticCanary: true,
      realConsumerPiiUsed: false,
    },
    archive: {
      selected: true,
      created: true,
      createdOrSelected: true,
      archiveId: "simulated-retention-archive-0001",
      metadataVerified: true,
      manifestHash: "simulated-retention-manifest-0001",
      containsPii: false,
    },
    isolatedRestoreTarget: {
      created: true,
      destroyed: true,
      productionTarget: false,
      targetId: "simulated-retention-restore-target-0001",
      isolated: true,
    },
    restoreVerification: {
      integrityVerified: true,
      restoredHashMatchesArchive: true,
      expectedRecordCount: 1,
      verifiedRecordCount: 1,
    },
    lifecycleCleanup: {
      verified: true,
      temporaryArchiveCleaned: true,
      canaryCleanedUp: true,
    },
    rollbackRecovery: {
      verified: true,
      notesRecorded: true,
      rollbackPlanHash: "simulated-retention-rollback-notes-0001",
    },
    noPiiExposed: true,
  };
}

const FIXTURE_BUILDERS = {
  restore: restoreFixture,
  productionWorker: productionWorkerFixture,
  alerting: alertingFixture,
  retentionArchiveRestore: retentionArchiveRestoreFixture,
};

export function resolveMachineProofRuntimeInputFixture({
  family,
  requiredChecks = [],
  requiredInputs = [],
  env = process.env,
  generatedAt = new Date().toISOString(),
  allowSimulation = false,
} = {}) {
  const inputs = [...new Set(requiredInputs.filter(Boolean))];
  if (!allowSimulation) {
    return {
      resolved: false,
      reason: "machine proof simulation context is not enabled",
      missingRuntimeInputs: inputs,
    };
  }
  if (isProductionLikeRuntime(env)) {
    return {
      resolved: false,
      reason: "production-like runtime refuses simulated machine proof inputs",
      missingRuntimeInputs: inputs,
    };
  }
  const builder = FIXTURE_BUILDERS[family];
  if (!builder) {
    return {
      resolved: false,
      reason: `unsupported machine proof fixture family: ${family}`,
      missingRuntimeInputs: inputs,
    };
  }
  return {
    resolved: true,
    reason: "resolved from deterministic machine proof simulation fixture",
    missingRuntimeInputs: [],
    attestation: builder({ checks: requiredChecks, inputs, generatedAt }),
    resolution: runtimeInputResolution({ family, resolvedInputs: inputs }),
  };
}

export function isSimulatedMachineProofFixture(evidence) {
  const resolution = evidence?.metadata?.runtimeInputResolution;
  return evidence?.simulatedOnly === true &&
    evidence?.environment === MACHINE_PROOF_SIMULATION_ENVIRONMENT &&
    resolution?.source === SIMULATED_MACHINE_PROOF_SOURCE &&
    resolution?.sideEffects === "none" &&
    resolution?.productionMutation === false &&
    resolution?.humanInteractionRequired === false;
}
