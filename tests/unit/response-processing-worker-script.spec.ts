import { describe, expect, it } from "vitest";

import { parseWorkerArgs, safeErrorMessage } from "../../scripts/response-processing-worker";

describe("response processing worker script", () => {
  it("defaults to one bounded non-daemon job", () => {
    expect(parseWorkerArgs([])).toEqual({
      dryRun: false,
      maxJobs: 1,
      workerId: null,
      retryDeadLetterJobId: null,
      actorUserId: null,
    });
  });

  it("parses dry-run, max-jobs, worker id, and dead-letter retry flags", () => {
    expect(parseWorkerArgs(["--dry-run", "--max-jobs", "10", "--worker-id", "response-worker-test"])).toEqual({
      dryRun: true,
      maxJobs: 10,
      workerId: "response-worker-test",
      retryDeadLetterJobId: null,
      actorUserId: null,
    });
    expect(parseWorkerArgs(["--retry-dead-letter", "42", "--actor-user-id", "7"])).toMatchObject({
      retryDeadLetterJobId: 42,
      actorUserId: 7,
    });
  });

  it("fails closed for invalid worker options", () => {
    expect(() => parseWorkerArgs(["--max-jobs", "0"])).toThrow(/positive integer/i);
    expect(() => parseWorkerArgs(["--max-jobs", "101"])).toThrow(/100 or less/i);
    expect(() => parseWorkerArgs(["--retry-dead-letter", "42"])).toThrow(/actor-user-id/i);
    expect(() => parseWorkerArgs(["--retry-dead-letter", "42", "--actor-user-id", "7", "--dry-run"])).toThrow(/dry-run/i);
    expect(() => parseWorkerArgs(["--unknown"])).toThrow(/Unknown option/i);
  });

  it("sanitizes worker top-level errors before logging", () => {
    expect(safeErrorMessage(new Error("database_url value failed"))).toBe(
      "Response processing worker failed with a sanitized operational error.",
    );
    expect(safeErrorMessage(new Error("raw response text from operator@example.test should not print"))).toBe(
      "Response processing worker failed with a sanitized operational error.",
    );
    expect(safeErrorMessage(new Error("ordinary validation failed"))).toBe("ordinary validation failed");
  });
});
