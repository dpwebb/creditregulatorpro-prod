import { describe, expect, it } from "vitest";

import { parseWorkerOrchestrationArgs } from "../../scripts/response-processing-worker-orchestrator";
import { sanitizeWorkerOrchestrationError } from "../../helpers/responseWorkerOrchestrationService";

describe("response worker orchestration script", () => {
  it("defaults to dry-run bounded preview", () => {
    expect(parseWorkerOrchestrationArgs([])).toEqual({
      dryRun: true,
      maxJobs: 1,
      workerId: null,
      source: null,
      lockScope: null,
      lockTtlSeconds: null,
      scheduled: false,
    });
  });

  it("parses bounded run options", () => {
    expect(parseWorkerOrchestrationArgs([
      "--run",
      "--max-jobs",
      "10",
      "--worker-id",
      "response-worker-test",
      "--source",
      "manual_admin",
      "--lock-scope",
      "response_processing_worker",
      "--lock-ttl-seconds",
      "300",
      "--scheduled",
    ])).toEqual({
      dryRun: false,
      maxJobs: 10,
      workerId: "response-worker-test",
      source: "manual_admin",
      lockScope: "response_processing_worker",
      lockTtlSeconds: 300,
      scheduled: true,
    });
  });

  it("fails closed for unsafe or unbounded options", () => {
    expect(() => parseWorkerOrchestrationArgs(["--max-jobs", "0"])).toThrow(/positive integer/i);
    expect(() => parseWorkerOrchestrationArgs(["--max-jobs", "101"])).toThrow(/100 or less/i);
    expect(() => parseWorkerOrchestrationArgs(["--lock-ttl-seconds", "3601"])).toThrow(/3600 or less/i);
    expect(() => parseWorkerOrchestrationArgs(["--scheduled"])).toThrow(/requires --run/i);
    expect(() => parseWorkerOrchestrationArgs(["--unknown"])).toThrow(/Unknown option/i);
  });

  it("sanitizes orchestration errors before CLI logging", () => {
    expect(sanitizeWorkerOrchestrationError(new Error("postgres://synthetic-host database_url leaked")).reason).toBe(
      "Response worker orchestration failed with a sanitized operational error.",
    );
    expect(sanitizeWorkerOrchestrationError(new Error("ordinary validation failed")).reason).toBe("ordinary validation failed");
  });
});
