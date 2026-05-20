import { describe, expect, it } from "vitest";

import {
  parseIngestWorkerArgs,
  safeIngestWorkerErrorMessage,
} from "../../scripts/ingest-processing-worker";

describe("ingest processing worker script", () => {
  it("defaults to a bounded dry-run preview", () => {
    expect(parseIngestWorkerArgs([])).toEqual({
      dryRun: true,
      apply: false,
      maxJobs: 1,
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
});
