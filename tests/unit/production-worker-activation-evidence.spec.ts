import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildProductionWorkerActivationEvidenceReport,
  PRODUCTION_WORKER_ACTIVATION_EVIDENCE_JSON_PATH,
  PRODUCTION_WORKER_ACTIVATION_EVIDENCE_MD_PATH,
  writeProductionWorkerActivationEvidence,
} from "../../scripts/production-worker-activation-evidence.mjs";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

function makeActivationTempRoot({ includeStagingEvidence = true } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "crp-production-worker-activation-"));
  tempRoots.push(root);
  mkdirSync(path.join(root, ".github", "workflows"), { recursive: true });
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  mkdirSync(path.join(root, "docs", "production-scale", "evidence"), { recursive: true });
  writeFileSync(
    path.join(root, ".github", "workflows", "deploy-production.yml"),
    readFileSync(path.join(process.cwd(), ".github", "workflows", "deploy-production.yml"), "utf8"),
  );
  writeFileSync(
    path.join(root, "scripts", "ingest-processing-worker.ts"),
    readFileSync(path.join(process.cwd(), "scripts", "ingest-processing-worker.ts"), "utf8"),
  );
  if (includeStagingEvidence) {
    writeFileSync(
      path.join(root, "docs", "production-scale", "evidence", "latest-staging-ingest-worker-evidence.json"),
      readFileSync(
        path.join(process.cwd(), "docs", "production-scale", "evidence", "latest-staging-ingest-worker-evidence.json"),
        "utf8",
      ),
    );
  }
  return root;
}

describe("production worker activation evidence", () => {
  it("writes default-off activation evidence without closing production runtime", () => {
    const rootDir = makeActivationTempRoot();
    const report = buildProductionWorkerActivationEvidenceReport({
      rootDir,
      generatedAt: "2026-05-20T12:00:00.000Z",
    });
    const outputs = writeProductionWorkerActivationEvidence(report, { rootDir });

    expect(outputs).toEqual({
      markdownPath: PRODUCTION_WORKER_ACTIVATION_EVIDENCE_MD_PATH,
      jsonPath: PRODUCTION_WORKER_ACTIVATION_EVIDENCE_JSON_PATH,
    });
    expect(existsSync(path.join(rootDir, outputs.markdownPath))).toBe(true);
    expect(existsSync(path.join(rootDir, outputs.jsonPath))).toBe(true);
    expect(report.status).toBe("prepared-default-off");
    expect(report.productionWorkerDefaultOff).toBe(true);
    expect(report.productionActivationDeferred).toBe(true);
    expect(report.explicitActivationInputs).toEqual(
      expect.arrayContaining(["workflow_dispatch input run_ingest_worker=true"]),
    );
    expect(report.dryRun).toMatchObject({
      mutatesQueue: false,
      claimsJobs: false,
      processesJobs: false,
    });
    expect(report.applyMode).toMatchObject({
      defaultEnabled: false,
      confirmationString: "explicit-bounded-production-ingest-worker-apply",
      maxJobs: {
        required: true,
        min: 1,
        max: 5,
      },
    });
    expect(report.futureOperatorRunFields).toMatchObject({
      queueDepthBefore: null,
      queueDepthAfter: null,
    });
    expect(report.stagingWorkerEvidence).toMatchObject({
      exists: true,
      accepted: true,
      productionProof: false,
      queueDepthBeforeRun: 2,
      queueDepthAfterRun: 0,
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
    });
  });

  it("fails closed when the production workflow master gate is missing", () => {
    const root = makeActivationTempRoot();
    const workflowPath = path.join(root, ".github", "workflows", "deploy-production.yml");
    writeFileSync(
      workflowPath,
      readFileSync(workflowPath, "utf8")
        .replace("run_ingest_worker:", "worker_gate_removed:")
        .replace("run_ingest_worker=true is required before dry-run or apply", "missing gate"),
      "utf8",
    );

    const report = buildProductionWorkerActivationEvidenceReport({
      rootDir: root,
      generatedAt: "2026-05-20T12:00:00.000Z",
    });

    expect(report.status).toBe("failed");
    expect(report.staticValidation.failedChecks.map((check) => check.name)).toEqual(
      expect.arrayContaining(["production worker default-off", "explicit run_ingest_worker gate required"]),
    );
  });

  it("records missing staging worker evidence without treating activation as production proof", () => {
    const report = buildProductionWorkerActivationEvidenceReport({
      rootDir: makeActivationTempRoot({ includeStagingEvidence: false }),
      generatedAt: "2026-05-20T12:00:00.000Z",
    });

    expect(report.status).toBe("prepared-default-off");
    expect(report.stagingWorkerEvidence).toMatchObject({
      exists: false,
      accepted: false,
    });
    expect(report.productionProof).toBe(false);
    expect(report.blockerCoverage.productionIngestRuntime).toBe(false);
  });

  it("exposes the package script", () => {
    const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    expect(packageJson.scripts["production-worker:activation-evidence"]).toBe(
      "node scripts/production-worker-activation-evidence.mjs",
    );
  });
});
