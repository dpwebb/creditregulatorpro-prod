import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  buildSimulatedIngestWorkerProofReport,
  detectSimulatedIngestWorkerProductionEnvironment,
  renderSimulatedIngestWorkerProofMarkdown,
  SIMULATED_INGEST_WORKER_SOURCE,
  validateSimulatedIngestWorkerProofReport,
  writeSimulatedIngestWorkerProofEvidence,
} from "../../scripts/ingest-worker-simulated-proof";

const tempRoots: string[] = [];
let sharedRootDir = "";
let sharedReport: Awaited<ReturnType<typeof buildSimulatedIngestWorkerProofReport>>;

function makeTempRoot() {
  const root = mkdtempSync(join(tmpdir(), "crp-simulated-ingest-worker-test-"));
  tempRoots.push(root);
  return root;
}

beforeAll(async () => {
  sharedRootDir = makeTempRoot();
  sharedReport = await buildSimulatedIngestWorkerProofReport({
    rootDir: sharedRootDir,
    generatedAt: "2026-05-20T12:00:00.000Z",
    env: {},
  });
}, 60_000);

afterAll(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("simulated ingest worker queue-drain proof", () => {
  it("creates markdown and json evidence with queue depth before and after", async () => {
    const outputs = writeSimulatedIngestWorkerProofEvidence(sharedReport, { rootDir: sharedRootDir });
    const markdownPath = join(sharedRootDir, outputs.markdownPath);
    const jsonPath = join(sharedRootDir, outputs.jsonPath);

    expect(existsSync(markdownPath)).toBe(true);
    expect(existsSync(jsonPath)).toBe(true);

    const markdown = readFileSync(markdownPath, "utf8");
    const json = JSON.parse(readFileSync(jsonPath, "utf8"));

    expect(markdown).toContain("# SIMULATED Ingest Worker Queue-Drain Evidence");
    expect(markdown).toContain("Before bounded apply: total=3, queued=3");
    expect(markdown).toContain("After bounded apply: total=3, queued=0, running=0, succeeded=2, failed=0, dead_lettered=1");
    expect(json.evidenceType).toBe("SIMULATED");
    expect(json.queueDepth.before.queued).toBe(3);
    expect(json.queueDepth.after.queued).toBe(0);
  });

  it("refuses production-like environments", async () => {
    expect(detectSimulatedIngestWorkerProductionEnvironment({ CRP_ENV: "production" })).toMatchObject({
      productionLike: true,
    });
    await expect(
      buildSimulatedIngestWorkerProofReport({
        rootDir: makeTempRoot(),
        env: { DATABASE_URL: "postgres://host/creditregulatorpro-prod" },
      }),
    ).rejects.toThrow(/production-like environment/i);
  });

  it("proves dry-run does not mutate synthetic queue state", async () => {
    expect(sharedReport.dryRun.exitCode).toBe(0);
    expect(sharedReport.dryRun.mutatedQueueState).toBe(false);
    expect(sharedReport.workerHeartbeats.some((heartbeat) => heartbeat.status === "dry_run_preview")).toBe(true);
    expect(sharedReport.dryRun.workerLogs.join("\n")).toContain("dry_run_preview");
  });

  it("proves bounded apply touches only the synthetic staging-safe source scope", async () => {
    expect(sharedReport.queueScope.source).toBe(SIMULATED_INGEST_WORKER_SOURCE);
    expect(sharedReport.boundedApply.touchedOutOfScopeJobs).toBe(false);
    expect(sharedReport.queueDepth.after.succeeded).toBe(2);
    expect(sharedReport.queueDepth.after.deadLettered).toBe(1);
    expect(sharedReport.queueDepth.after.staleQueuedOrRunning).toBe(0);
  });

  it("proves empty queue exits cleanly after the synthetic scope is drained", async () => {
    expect(sharedReport.emptyQueue.exitCode).toBe(0);
    expect(sharedReport.emptyQueue.cleanExit).toBe(true);
    expect(sharedReport.workerHeartbeats.some((heartbeat) => heartbeat.status === "idle" && heartbeat.dryRun === false)).toBe(true);
    expect(sharedReport.emptyQueue.workerLogs.join("\n")).toContain("idle");
  });

  it("proves malformed synthetic jobs create visible lifecycle and dead-letter evidence", async () => {
    expect(sharedReport.deadLetter.visible).toBe(true);
    expect(sharedReport.deadLetter.status).toBe("dead_lettered");
    expect(sharedReport.deadLetter.errorCode).toBe("SIMULATED_MALFORMED_SYNTHETIC_JOB");
    expect(sharedReport.deadLetter.eventTypes).toEqual(expect.arrayContaining(["claimed", "dead_lettered"]));
  });

  it("does not render simulated proof as production proof or call live providers", async () => {
    const markdown = renderSimulatedIngestWorkerProofMarkdown(sharedReport);

    expect(validateSimulatedIngestWorkerProofReport(sharedReport)).toEqual({ ok: true, errors: [] });
    expect(sharedReport.safety.liveExternalProvidersConnected).toBe(false);
    expect(sharedReport.safety.externalProviderCallsMade).toBe(0);
    expect(sharedReport.safety.simulatedEvidenceIsProductionProof).toBe(false);
    expect(markdown).toContain("SIMULATED evidence is not production proof.");
    expect(markdown).toContain("Production deployment or worker activation changed: no");
  });

  it("keeps production deployment workflow free of default worker activation", () => {
    const productionWorkflow = readFileSync(resolve(".github/workflows/deploy-production.yml"), "utf8");

    expect(productionWorkflow).toContain("run_ingest_worker_dry_run:");
    expect(productionWorkflow).toContain("run_ingest_worker_apply:");
    expect(productionWorkflow).toContain("Skipping production ingest worker. Manual workflow_dispatch input is required.");
    expect(productionWorkflow).toContain("explicit-bounded-production-ingest-worker-apply");
    expect(productionWorkflow).not.toContain("staging:ingest-worker");
    expect(productionWorkflow).not.toContain("creditregulatorpro-staging");
    expect(productionWorkflow).not.toContain("staging-deploy-ingest-worker");
  });

  it("exposes the package simulated proof command", () => {
    const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
    expect(packageJson.scripts["ingest:worker:simulated-proof"]).toBe("tsx scripts/ingest-worker-simulated-proof.ts");
  });
});
