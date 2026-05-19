import { describe, expect, it } from "vitest";

import { parseResponseProcessingLifecycleArgs } from "../../scripts/response-processing-lifecycle";

describe("response-processing lifecycle CLI parser", () => {
  it("defaults to dry-run retention and drift reporting", () => {
    expect(parseResponseProcessingLifecycleArgs([])).toMatchObject({
      dryRun: true,
      apply: false,
      confirmCleanup: false,
      actorUserId: null,
      olderThanDays: null,
      limit: null,
      source: null,
      retentionOnly: false,
      driftOnly: false,
      recordDrift: false,
    });
  });

  it("parses explicit bounded apply options", () => {
    expect(parseResponseProcessingLifecycleArgs([
      "--apply",
      "--confirm-cleanup",
      "--actor-user-id",
      "42",
      "--older-than-days",
      "120",
      "--limit",
      "25",
      "--source",
      "synthetic_source",
      "--retention-only",
    ])).toMatchObject({
      dryRun: false,
      apply: true,
      confirmCleanup: true,
      actorUserId: 42,
      olderThanDays: 120,
      limit: 25,
      source: "synthetic_source",
      retentionOnly: true,
    });
  });

  it("fails closed for invalid combinations and unbounded limits", () => {
    expect(() => parseResponseProcessingLifecycleArgs(["--retention-only", "--drift-only"])).toThrow(/cannot be combined/i);
    expect(() => parseResponseProcessingLifecycleArgs(["--apply", "--drift-only"])).toThrow(/cannot be used/i);
    expect(() => parseResponseProcessingLifecycleArgs(["--limit", "501"])).toThrow(/500 or less/i);
    expect(() => parseResponseProcessingLifecycleArgs(["--unknown"])).toThrow(/Unknown option/i);
  });
});
