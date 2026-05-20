import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildProductionWorkerReadinessEvidenceReport,
  PRODUCTION_WORKER_READINESS_JSON_PATH,
  PRODUCTION_WORKER_READINESS_MD_PATH,
  validateProductionWorkerQueueDepthEvidence,
  writeProductionWorkerReadinessEvidence,
} from "../../scripts/production-worker-readiness-evidence.mjs";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

function acceptedProductionRunEvidence() {
  return {
    status: "accepted",
    accepted: true,
    evidencePath: "docs/production-scale/evidence/production-worker-queue-depth-evidence.json",
    blockerCoverage: {
      productionIngestRuntime: true,
      productionWorkflowParityAndRollback: true,
    },
  };
}

function makeReadinessTempRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "crp-production-worker-evidence-"));
  tempRoots.push(root);
  mkdirSync(path.join(root, ".github", "workflows"), { recursive: true });
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  writeFileSync(
    path.join(root, ".github", "workflows", "deploy-production.yml"),
    readFileSync(path.join(process.cwd(), ".github", "workflows", "deploy-production.yml"), "utf8"),
  );
  writeFileSync(
    path.join(root, "scripts", "ingest-processing-worker.ts"),
    readFileSync(path.join(process.cwd(), "scripts", "ingest-processing-worker.ts"), "utf8"),
  );
  return root;
}

describe("production worker readiness evidence", () => {
  it("writes readiness evidence while leaving production runtime unresolved without operator queue-depth proof", () => {
    const rootDir = makeReadinessTempRoot();
    const report = buildProductionWorkerReadinessEvidenceReport({
      rootDir,
      generatedAt: "2026-05-20T12:00:00.000Z",
    });
    const outputs = writeProductionWorkerReadinessEvidence(report, { rootDir });

    expect(outputs).toEqual({
      markdownPath: PRODUCTION_WORKER_READINESS_MD_PATH,
      jsonPath: PRODUCTION_WORKER_READINESS_JSON_PATH,
    });
    expect(existsSync(path.join(rootDir, outputs.markdownPath))).toBe(true);
    expect(existsSync(path.join(rootDir, outputs.jsonPath))).toBe(true);
    expect(report.status).toBe("prepared-awaiting-human-production-evidence");
    expect(report.productionProof).toBe(false);
    expect(report.workerDefaultOff.defaultProductionDeployStartsWorker).toBe(false);
    expect(report.dryRun).toMatchObject({
      mutatesQueue: false,
      claimsJobs: false,
      processesJobs: false,
    });
    expect(report.applyMode.maxJobs).toMatchObject({
      required: true,
      min: 1,
      max: 5,
    });
    expect(report.acceptedProductionRunEvidence).toMatchObject({
      status: "not-submitted",
      accepted: false,
    });
    expect(report.blockerCoverage).toMatchObject({
      productionIngestRuntime: false,
      productionWorkflowParityAndRollback: false,
      releaseEvidenceExactCommands: true,
    });
    expect(report.safety).toMatchObject({
      productionJobsProcessedByCodex: false,
      productionDataMutatedByCodex: false,
      productionWorkerActivatedByDefault: false,
      dryRunIsNonMutating: true,
      dashboardPassAloneIsReleaseEvidence: false,
    });
  });

  it("accepts only sanitized production apply queue-depth evidence", () => {
    const valid = {
      evidenceType: "HUMAN_OBSERVED_PRODUCTION_WORKER_RUN",
      environment: "production",
      mode: "apply",
      operatorProductionRunCompleted: true,
      maxJobs: 1,
      queueDepthBefore: 0,
      queueDepthAfter: 0,
      processedJobs: 0,
      failureCount: 0,
      workerExitCode: 0,
      productionJobsProcessedByCodex: false,
      sanitizedEvidence: true,
      operatorAcknowledgementSigned: true,
      rollbackStopVerified: true,
      workflowParityEvidencePresent: true,
    };

    expect(validateProductionWorkerQueueDepthEvidence(valid)).toMatchObject({
      accepted: true,
      blockerCoverage: {
        productionIngestRuntime: true,
        productionWorkflowParityAndRollback: true,
      },
    });

    const unsafe = {
      ...valid,
      maxJobs: 10,
      workerExitCode: 2,
      productionJobsProcessedByCodex: true,
      notes: "postgres://user:password@example.invalid/db",
    };
    const validation = validateProductionWorkerQueueDepthEvidence(unsafe);
    expect(validation.accepted).toBe(false);
    expect(validation.errors.join("\n")).toMatch(/maxJobs must be an integer between 1 and 5/);
    expect(validation.errors.join("\n")).toMatch(/workerExitCode must be 0/);
    expect(validation.errors.join("\n")).toMatch(/productionJobsProcessedByCodex must be false/);
    expect(validation.sensitiveFindings).toContain("database-url");
  });

  it("can classify future accepted queue-depth evidence without reading production data", () => {
    const report = buildProductionWorkerReadinessEvidenceReport({
      rootDir: makeReadinessTempRoot(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      productionWorkerQueueDepthEvidence: acceptedProductionRunEvidence(),
    });

    expect(report.productionProof).toBe(true);
    expect(report.blockerCoverage).toMatchObject({
      productionIngestRuntime: true,
      productionWorkflowParityAndRollback: true,
    });
    expect(report.safety.productionJobsProcessedByCodex).toBe(false);
  });

  it("fails static readiness if production workflow default-off guard is missing", () => {
    const root = mkdtempSync(path.join(tmpdir(), "crp-production-worker-evidence-"));
    tempRoots.push(root);
    mkdirSync(path.join(root, ".github", "workflows"), { recursive: true });
    mkdirSync(path.join(root, "scripts"), { recursive: true });
    writeFileSync(path.join(root, ".github", "workflows", "deploy-production.yml"), "run_ingest_worker_apply: true\n");
    writeFileSync(path.join(root, "scripts", "ingest-processing-worker.ts"), "export const unsafe = true;\n");

    const report = buildProductionWorkerReadinessEvidenceReport({
      rootDir: root,
      generatedAt: "2026-05-20T12:00:00.000Z",
    });

    expect(report.status).toBe("failed");
    expect(report.staticValidation.failedChecks.length).toBeGreaterThan(0);
  });

  it("exposes the package script", () => {
    const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    expect(packageJson.scripts["production-worker:readiness-evidence"]).toBe(
      "node scripts/production-worker-readiness-evidence.mjs",
    );
  });
});
