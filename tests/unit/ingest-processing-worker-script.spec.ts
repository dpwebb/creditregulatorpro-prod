import { describe, expect, it, vi } from "vitest";

import {
  detectIngestWorkerProductionEnvironment,
  parseIngestWorkerArgs,
  PRODUCTION_INGEST_WORKER_APPLY_GUARD,
  PRODUCTION_INGEST_WORKER_ONE_SHOT_GUARD,
  PRODUCTION_INGEST_WORKER_SOURCE,
  runIngestProcessingWorker,
  safeIngestWorkerErrorMessage,
  validateIngestWorkerRuntimeSafety,
  type WorkerCliOptions,
} from "../../scripts/ingest-processing-worker";

describe("ingest processing worker script", () => {
  it("defaults to a bounded dry-run preview", () => {
    expect(parseIngestWorkerArgs([])).toEqual({
      dryRun: true,
      apply: false,
      maxJobs: 1,
      maxJobsExplicit: false,
      concurrency: 1,
      leaseSeconds: null,
      workerId: null,
      source: null,
    });
  });

  it("parses explicit bounded apply options", () => {
    expect(parseIngestWorkerArgs([
      "--apply",
      "--max-jobs",
      "5",
      "--worker-id",
      "ingest-worker-test",
      "--source",
      "authenticated_ingest",
      "--lease-seconds",
      "120",
      "--concurrency",
      "1",
    ])).toEqual({
      dryRun: false,
      apply: true,
      maxJobs: 5,
      maxJobsExplicit: true,
      concurrency: 1,
      leaseSeconds: 120,
      workerId: "ingest-worker-test",
      source: "authenticated_ingest",
    });
  });

  it("fails closed for unsafe or unbounded options", () => {
    expect(() => parseIngestWorkerArgs(["--max-jobs", "0"])).toThrow(/positive integer/i);
    expect(() => parseIngestWorkerArgs(["--max-jobs", "101"])).toThrow(/100 or less/i);
    expect(() => parseIngestWorkerArgs(["--lease-seconds", "29"])).toThrow(/between 30 and 3600/i);
    expect(() => parseIngestWorkerArgs(["--concurrency", "2"])).toThrow(/not supported/i);
    expect(() => parseIngestWorkerArgs(["--worker-id", "123456789012"])).toThrow(/safe internal token/i);
    expect(() => parseIngestWorkerArgs(["--unknown"])).toThrow(/Unknown option/i);
  });

  it("sanitizes raw report bytes, extracted text, and secrets before worker logging", () => {
    expect(safeIngestWorkerErrorMessage(new Error("JVBERi0SHOULD_NOT_STORE_RAW_PDF_BYTES raw report text"))).toBe(
      "Ingest processing worker failed with a sanitized operational error.",
    );
    expect(safeIngestWorkerErrorMessage(new Error("postgres://synthetic database_url leaked"))).toBe(
      "Ingest processing worker failed with a sanitized operational error.",
    );
    expect(safeIngestWorkerErrorMessage(new Error("ordinary validation failed"))).toBe("ordinary validation failed");
  });

  it("detects production-like environments for worker safety decisions", () => {
    expect(detectIngestWorkerProductionEnvironment({ CRP_ENV: "production" })).toMatchObject({
      productionLike: true,
    });
    expect(detectIngestWorkerProductionEnvironment({ DATABASE_URL: "postgres://db/creditregulatorpro-prod" })).toMatchObject({
      productionLike: true,
    });
    expect(detectIngestWorkerProductionEnvironment({ CRP_ENV: "staging" })).toEqual({
      productionLike: false,
      reasons: [],
    });
  });

  it("allows production-like dry-run but refuses production apply without every explicit guard", () => {
    const dryRun = parseIngestWorkerArgs(["--dry-run", "--max-jobs", "1", "--source", PRODUCTION_INGEST_WORKER_SOURCE]);
    expect(() => validateIngestWorkerRuntimeSafety(dryRun, { CRP_ENV: "production" })).not.toThrow();

    const apply = parseIngestWorkerArgs([
      "--apply",
      "--max-jobs",
      "1",
      "--worker-id",
      "production-bounded-ingest-worker",
      "--source",
      PRODUCTION_INGEST_WORKER_SOURCE,
    ]);
    expect(() => validateIngestWorkerRuntimeSafety(apply, { CRP_ENV: "production" })).toThrow(
      /Production ingest worker apply refused/i,
    );
  });

  it("refuses production apply when the max job bound was not explicitly supplied", () => {
    const options = parseIngestWorkerArgs([
      "--apply",
      "--worker-id",
      "production-bounded-ingest-worker",
      "--source",
      PRODUCTION_INGEST_WORKER_SOURCE,
    ]);

    expect(() =>
      validateIngestWorkerRuntimeSafety(options, {
        CRP_ENV: "production",
        CRP_PRODUCTION_INGEST_WORKER_APPLY: PRODUCTION_INGEST_WORKER_APPLY_GUARD,
        CRP_PRODUCTION_INGEST_WORKER_ONE_SHOT: PRODUCTION_INGEST_WORKER_ONE_SHOT_GUARD,
        CRP_PRODUCTION_INGEST_WORKER_MAX_JOBS: "1",
        CRP_PRODUCTION_INGEST_WORKER_OPERATOR: "operator-token",
      }),
    ).toThrow(/--max-jobs/);
  });

  it("accepts production apply only with matching one-shot guards and bounded source scope", () => {
    const options = parseIngestWorkerArgs([
      "--apply",
      "--max-jobs",
      "5",
      "--worker-id",
      "production-bounded-ingest-worker",
      "--source",
      PRODUCTION_INGEST_WORKER_SOURCE,
      "--concurrency",
      "1",
    ]);

    expect(() =>
      validateIngestWorkerRuntimeSafety(options, {
        CRP_ENV: "production",
        CRP_PRODUCTION_INGEST_WORKER_APPLY: PRODUCTION_INGEST_WORKER_APPLY_GUARD,
        CRP_PRODUCTION_INGEST_WORKER_ONE_SHOT: PRODUCTION_INGEST_WORKER_ONE_SHOT_GUARD,
        CRP_PRODUCTION_INGEST_WORKER_MAX_JOBS: "5",
        CRP_PRODUCTION_INGEST_WORKER_OPERATOR: "operator-token",
      }),
    ).not.toThrow();

    const unscoped = { ...options, source: null } satisfies WorkerCliOptions;
    expect(() =>
      validateIngestWorkerRuntimeSafety(unscoped, {
        CRP_ENV: "production",
        CRP_PRODUCTION_INGEST_WORKER_APPLY: PRODUCTION_INGEST_WORKER_APPLY_GUARD,
        CRP_PRODUCTION_INGEST_WORKER_ONE_SHOT: PRODUCTION_INGEST_WORKER_ONE_SHOT_GUARD,
        CRP_PRODUCTION_INGEST_WORKER_MAX_JOBS: "5",
        CRP_PRODUCTION_INGEST_WORKER_OPERATOR: "operator-token",
      }),
    ).toThrow(/--source=authenticated_ingest_process/);
  });

  it("exits cleanly on an empty queue without mutating worker dependencies", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const claimNextJob = vi.fn(async () => null);
    const recordHeartbeat = vi.fn();
    const exitCode = await runIngestProcessingWorker({
      dryRun: false,
      apply: true,
      maxJobs: 1,
      concurrency: 1,
      leaseSeconds: 120,
      workerId: "local-empty-queue-worker",
      source: "local_empty_queue",
    }, {
      claimNextJob,
      executePipeline: vi.fn(),
      markSucceeded: vi.fn(),
      markFailed: vi.fn(),
      recordEvent: vi.fn(),
      recordHeartbeat,
      updateArtifactStatus: vi.fn().mockResolvedValue(undefined),
      loadPipelineInput: vi.fn(),
    });

    expect(exitCode).toBe(0);
    expect(claimNextJob).toHaveBeenCalledTimes(1);
    expect(recordHeartbeat).toHaveBeenCalledWith(expect.objectContaining({
      workerId: "local-empty-queue-worker",
      source: "local_empty_queue",
      status: "idle",
    }));
    expect(logSpy.mock.calls.map((call) => call.join(" ")).join("\n")).toContain('"status":"idle"');
    expect(logSpy.mock.calls.map((call) => call.join(" ")).join("\n")).toContain('"failureCount":0');
    logSpy.mockRestore();
  });

  it("reports worker failures through a non-zero exit code instead of continuing silently", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const job = {
      id: 901,
      jobType: "report_ingest_process",
      status: "queued",
      reportArtifactId: 501,
      userId: 10,
      source: "local_failure_scope",
      payload: {},
      attemptCount: 0,
      maxAttempts: 1,
      lockedBy: null,
      lockedAt: null,
      runAfter: new Date(),
      lastErrorCode: null,
      lastErrorReason: null,
      resultSummary: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    const exitCode = await runIngestProcessingWorker({
      dryRun: false,
      apply: true,
      maxJobs: 1,
      concurrency: 1,
      leaseSeconds: 120,
      workerId: "local-failing-worker",
      source: "local_failure_scope",
    }, {
      claimNextJob: vi.fn(async () => job),
      loadPipelineInput: vi.fn(async () => ({
        user: { id: 10 } as any,
        userAccount: { userId: 10 } as any,
        artifactId: 501,
        region: "CA",
        fileName: "synthetic.pdf",
        bytesBase64: "JVBERi0SHOULD_NOT_STORE_RAW_PDF_BYTES",
        mimeType: "application/pdf",
      })),
      executePipeline: vi.fn(async () => {
        throw new Error("ordinary synthetic failure");
      }),
      updateArtifactStatus: vi.fn().mockResolvedValue(undefined),
      recordEvent: vi.fn(),
      recordHeartbeat: vi.fn(),
      markFailed: vi.fn(async () => ({
        ...job,
        status: "dead_lettered",
        attemptCount: 1,
        lastErrorCode: "INGEST_PROCESSING_FAILED",
        lastErrorReason: "ordinary synthetic failure",
      })),
      markSucceeded: vi.fn(),
    });

    const logs = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(exitCode).toBe(2);
    expect(logs).toContain('"status":"dead_lettered"');
    expect(logs).toContain('"failureCount":1');
    logSpy.mockRestore();
  });
});
