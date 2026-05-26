import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildProductionWorkerReadinessEvidenceReport,
  PRODUCTION_WORKER_READINESS_JSON_PATH,
  PRODUCTION_WORKER_READINESS_MD_PATH,
  writeProductionWorkerReadinessEvidence,
} from "../../scripts/production-worker-readiness-evidence.mjs";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

function acceptedRuntimeProofEvidence() {
  return {
    reportName: "production-worker-runtime-proof",
    status: "accepted-production",
    accepted: true,
    productionProof: true,
    stagingProof: false,
    currentOperationalProof: true,
    evidencePath: "docs/production-scale/evidence/latest-production-worker-runtime-proof.json",
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
    },
    blockerCoverage: {
      productionIngestRuntime: true,
      productionWorkflowParityAndRollback: true,
    },
    safety: {
      productionJobsProcessedByCodex: false,
      productionDataMutatedByCodex: false,
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
    path.join(root, "docker-compose.production.yml"),
    readFileSync(path.join(process.cwd(), "docker-compose.production.yml"), "utf8"),
  );
  writeFileSync(
    path.join(root, "scripts", "ingest-processing-worker.ts"),
    readFileSync(path.join(process.cwd(), "scripts", "ingest-processing-worker.ts"), "utf8"),
  );
  return root;
}

describe("production worker readiness evidence", () => {
  it("writes readiness evidence while leaving production runtime unresolved without machine queue-depth proof", () => {
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
    expect(report.status).toBe("prepared-awaiting-machine-production-evidence");
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
      status: "dry-run-only",
      accepted: false,
      runtimeProofAccepted: false,
      productionProof: false,
    });
    expect(report.runtimeProof).toMatchObject({
      status: "dry-run-only",
      accepted: false,
      productionProof: false,
    });
    expect(report.blockerCoverage).toMatchObject({
      productionIngestRuntime: false,
      productionWorkflowParityAndRollback: false,
      releaseEvidenceExactCommands: true,
    });
    expect(report.staticValidation.checks.find((check) => check.name === "exact release evidence commands recorded")?.commands).toEqual(
      expect.arrayContaining(["pnpm run production-worker:activation-evidence"]),
    );
    expect(report.safety).toMatchObject({
      productionJobsProcessedByCodex: false,
      productionDataMutatedByCodex: false,
      productionWorkerActivatedByDefault: false,
      dryRunIsNonMutating: true,
      dashboardPassAloneIsReleaseEvidence: false,
    });
  });

  it("can classify future accepted runtime proof without reading production data", () => {
    const report = buildProductionWorkerReadinessEvidenceReport({
      rootDir: makeReadinessTempRoot(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      productionWorkerRuntimeProofEvidence: acceptedRuntimeProofEvidence(),
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
    writeFileSync(path.join(root, "docker-compose.production.yml"), "services:\n  creditregulatorpro-ingest-worker:\n    restart: unless-stopped\n");
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
    expect(packageJson.scripts["production-worker:activation-evidence"]).toBe(
      "node scripts/production-worker-activation-evidence.mjs",
    );
    expect(packageJson.scripts["production-worker:readiness-evidence"]).toBe(
      "node scripts/production-worker-readiness-evidence.mjs",
    );
    expect(packageJson.scripts["production-worker:runtime-proof"]).toBe(
      "node scripts/production-worker-runtime-proof.mjs",
    );
  });
});
