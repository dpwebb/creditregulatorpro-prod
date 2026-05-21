import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  buildStagingIngestWorkerDockerArgs,
  buildStagingIngestWorkerShellCommand,
  DEFAULT_STAGING_CONTAINER_NAME,
  DEFAULT_STAGING_INGEST_WORKER_CONCURRENCY,
  DEFAULT_STAGING_INGEST_WORKER_MAX_JOBS,
  parseStagingIngestWorkerArgs,
  runStagingIngestWorkerOrchestrator,
} from "../../scripts/staging-ingest-worker-orchestrator.mjs";

describe("staging ingest worker orchestrator", () => {
  it("defaults to a staging-only bounded dry-run", () => {
    expect(parseStagingIngestWorkerArgs([], {})).toMatchObject({
      dryRun: true,
      apply: false,
      maxJobs: DEFAULT_STAGING_INGEST_WORKER_MAX_JOBS,
      concurrency: DEFAULT_STAGING_INGEST_WORKER_CONCURRENCY,
      containerName: DEFAULT_STAGING_CONTAINER_NAME,
      workerId: "staging-ingest-orchestrator",
    });

    const dockerArgs = buildStagingIngestWorkerDockerArgs(parseStagingIngestWorkerArgs([], {}));
    expect(dockerArgs).toContain("CRP_ENV=staging");
    expect(dockerArgs).toContain(DEFAULT_STAGING_CONTAINER_NAME);
    expect(dockerArgs.join(" ")).toContain(
      "pnpm run ingest:worker --dry-run --max-jobs 5 --concurrency 1 --worker-id staging-ingest-orchestrator --source authenticated_ingest_process",
    );
  });

  it("builds the bounded staging apply command with env and database guards", () => {
    const options = parseStagingIngestWorkerArgs([
      "--apply",
      "--max-jobs",
      "5",
      "--concurrency",
      "1",
      "--worker-id",
      "staging-manual-ingest",
      "--source",
      "staging_ingest_evidence_manual",
    ], { CRP_ENV: "staging" });
    const shellCommand = buildStagingIngestWorkerShellCommand(options);

    expect(shellCommand).toContain('if [ "${CRP_ENV:-}" != "staging" ]; then');
    expect(shellCommand).toContain("database environment is missing");
    expect(shellCommand).toContain(
      "pnpm run ingest:worker --apply --max-jobs 5 --concurrency 1 --worker-id staging-manual-ingest --source staging_ingest_evidence_manual",
    );
    expect(shellCommand).not.toMatch(/%PDF|JVBERi0|raw report text|raw pdf text|extracted text/i);
  });

  it("fails closed for production-looking or unbounded options", () => {
    expect(() => parseStagingIngestWorkerArgs([], { CRP_ENV: "production" })).toThrow(/CRP_ENV is not staging/i);
    expect(() => parseStagingIngestWorkerArgs(["--container-name", "creditregulatorpro-app"], {}))
      .toThrow(/staging/i);
    expect(() => parseStagingIngestWorkerArgs(["--container-name", "creditregulatorpro-production"], {}))
      .toThrow(/production/i);
    expect(() => parseStagingIngestWorkerArgs(["--max-jobs", "11"], {})).toThrow(/between 1 and 10/i);
    expect(() => parseStagingIngestWorkerArgs(["--concurrency", "2"], {})).toThrow(/between 1 and 1/i);
    expect(() => parseStagingIngestWorkerArgs(["--worker-id", "postgres://secret"], {}))
      .toThrow(/safe internal token/i);
    expect(parseStagingIngestWorkerArgs(["--source", "authenticated_ingest_process"], {}))
      .toMatchObject({ source: "authenticated_ingest_process" });
    expect(() => parseStagingIngestWorkerArgs(["--source", "authenticated_uploads"], {}))
      .toThrow(/authenticated_ingest_process or explicitly reference staging, synthetic, or evidence/i);
  });

  it("invokes docker exec without exposing ports or compose changes", () => {
    const runner = vi.fn(() => ({ status: 0 }));
    const exitCode = runStagingIngestWorkerOrchestrator(parseStagingIngestWorkerArgs(["--dry-run"], {}), runner);

    expect(exitCode).toBe(0);
    expect(runner).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["exec", "-e", "CRP_ENV=staging", DEFAULT_STAGING_CONTAINER_NAME, "bash", "-lc"]),
      { stdio: "inherit" },
    );
    const args = runner.mock.calls[0]?.[1] as string[];
    expect(args).not.toContain("-p");
    expect(args.join(" ")).not.toMatch(/traefik|ports?:/i);
  });

  it("exposes the package script for staging-only operator runs", () => {
    const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
    expect(packageJson.scripts["staging:ingest-worker"]).toBe(
      "node scripts/staging-ingest-worker-orchestrator.mjs",
    );
    expect(packageJson.scripts["ingest:worker:staging-evidence"]).toBe(
      "tsx scripts/staging-ingest-worker-evidence.ts --apply --max-jobs 2 --confirm-staging-safe",
    );
  });
});
