import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  PRODUCTION_WORKER_MACHINE_PROOF_CONFIG,
  PRODUCTION_WORKER_MACHINE_PROOF_RUNTIME_INPUTS,
  buildProductionWorkerMachineProofReport,
  productionWorkerMachineProofDomainValidation,
  validateProductionWorkerMachineProofEvidence,
} from "../../scripts/production-worker-machine-proof.mjs";

const GENERATED_AT = "2026-05-22T12:00:00.000Z";
const NOW = "2026-05-22T13:00:00.000Z";
const HEAD = "b".repeat(40);
const tempRoots: string[] = [];

function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), "crp-worker-proof-"));
  tempRoots.push(root);
  return root;
}

function passingChecks() {
  return PRODUCTION_WORKER_MACHINE_PROOF_CONFIG.requiredChecks.map((name) => ({ name, status: "pass" }));
}

function validWorkerAttestation(overrides: Record<string, unknown> = {}) {
  return {
    nonInteractive: true,
    machineAttested: true,
    generatedManually: false,
    humanObserved: false,
    manualApprovalRequired: false,
    simulatedOnly: false,
    dryRunOnly: false,
    environment: "production",
    status: "pass",
    certifying: true,
    productionMutation: "synthetic-canary-cleaned-up",
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
    checks: passingChecks(),
    ...overrides,
  };
}

function writeAttestation(root: string, attestation: Record<string, unknown>) {
  const evidenceDir = join(root, "docs", "production-scale", "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const relativePath = "docs/production-scale/evidence/worker-attestation.json";
  writeFileSync(join(root, relativePath), `${JSON.stringify(attestation, null, 2)}\n`, "utf8");
  return relativePath;
}

function buildReport(attestation: Record<string, unknown>) {
  const root = tempRoot();
  const attestationPath = writeAttestation(root, attestation);
  return buildProductionWorkerMachineProofReport({
    rootDir: root,
    generatedAt: GENERATED_AT,
    env: { CRP_MACHINE_EVIDENCE_COMMIT_HASH: HEAD },
    argv: ["--attestation", attestationPath],
  });
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("production worker machine proof", () => {
  it("rejects dry-run-only evidence", () => {
    const report = buildReport(validWorkerAttestation({
      dryRunOnly: true,
      workerProofKind: "dry-run-only",
      productionMutation: "none",
    }));

    expect(report.CERTIFYING).toBe(false);
    expect(validateProductionWorkerMachineProofEvidence(report, { now: NOW }).ok).toBe(false);
    expect(report.failures.map((failure: { message: string }) => failure.message).join("\n")).toMatch(/dry-run-only/i);
  });

  it("rejects default-off or deferred activation evidence", () => {
    const report = buildReport(validWorkerAttestation({
      productionActivationDeferred: true,
      workerProofKind: "default-off-deferred",
    }));

    expect(report.CERTIFYING).toBe(false);
    expect(report.failures.map((failure: { message: string }) => failure.message).join("\n")).toMatch(/deferred activation/i);
  });

  it("fails when queue-depth before or after is missing", () => {
    const report = buildReport(validWorkerAttestation({
      queueDepthBefore: undefined,
      queueDepthAfter: undefined,
    }));

    expect(report.CERTIFYING).toBe(false);
    expect(report.missingRuntimeInputs).toEqual(expect.arrayContaining(["CRP_PRODUCTION_WORKER_QUEUE_ACCESS"]));
    expect(report.failures.map((failure: { message: string }) => failure.message).join("\n")).toMatch(/queue depth/i);
  });

  it("fails when canary cleanup is missing", () => {
    const checks = passingChecks().map((check) =>
      check.name === "canary-cleanup-verified" ? { ...check, status: "fail" } : check);
    const report = buildReport(validWorkerAttestation({
      checks,
      canaryJob: {
        created: true,
        processed: true,
        onlyCanaryJobProcessed: true,
        cleanupVerified: false,
        canaryId: "canary-job-hash",
      },
    }));

    expect(report.CERTIFYING).toBe(false);
    expect(report.missingRuntimeInputs).toEqual(expect.arrayContaining(["CRP_PRODUCTION_WORKER_CANARY_JOB_ACCESS"]));
    expect(report.failures.map((failure: { message: string }) => failure.message).join("\n")).toMatch(/cleanup/i);
  });

  it("fails when stop rollback proof is missing", () => {
    const checks = passingChecks().map((check) =>
      check.name === "worker-stop-rollback-verified" ? { ...check, status: "fail" } : check);
    const report = buildReport(validWorkerAttestation({
      checks,
      stopRollback: {
        verified: false,
        status: "fail",
      },
    }));

    expect(report.CERTIFYING).toBe(false);
    expect(report.missingRuntimeInputs).toEqual(expect.arrayContaining(["CRP_PRODUCTION_WORKER_STOP_ROLLBACK_ACCESS"]));
    expect(report.failures.map((failure: { message: string }) => failure.message).join("\n")).toMatch(/stop\/rollback/i);
  });

  it("accepts a valid sanitized fixture", () => {
    const report = buildReport(validWorkerAttestation());
    const validation = validateProductionWorkerMachineProofEvidence(report, { now: NOW });

    expect(report.CERTIFYING).toBe(true);
    expect(report.humanInteractionRequired).toBe(false);
    expect(report.productionMutation).toBe("synthetic-canary-cleaned-up");
    expect(validation).toMatchObject({
      ok: true,
      certifying: true,
      errors: [],
    });
  });

  it("reports exact missing runtime access inputs when worker runtime config is unavailable", () => {
    const report = buildProductionWorkerMachineProofReport({
      rootDir: tempRoot(),
      generatedAt: GENERATED_AT,
      env: {},
      argv: [],
    });

    expect(report.CERTIFYING).toBe(false);
    expect(report.productionMutation).toBe("none");
    expect(report.humanInteractionRequired).toBe(false);
    expect(report.missingRuntimeInputs).toEqual(PRODUCTION_WORKER_MACHINE_PROOF_RUNTIME_INPUTS);
    expect(productionWorkerMachineProofDomainValidation(report).missingRuntimeInputs).toEqual(
      expect.arrayContaining([
        "CRP_PRODUCTION_WORKER_QUEUE_ACCESS",
        "CRP_PRODUCTION_WORKER_LIVENESS_ACCESS",
        "CRP_PRODUCTION_WORKER_CANARY_JOB_ACCESS",
        "CRP_PRODUCTION_WORKER_STOP_ROLLBACK_ACCESS",
      ]),
    );
  });
});
