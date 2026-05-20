import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  classifyProductionScaleTarget,
  MAX_PRODUCTION_SCALE_CONCURRENCY,
  parseProductionScaleHarnessArgs,
  REFUSED_PRODUCTION_SCALE_HOSTS,
  REQUIRED_PRODUCTION_SCALE_SECTION_KEYS,
  runBoundedConcurrency,
  runProductionScaleHarness,
} from "../../scripts/production-scale-harness.mjs";

describe("production-scale load harness", () => {
  it("refuses production and unknown hosts", () => {
    for (const host of REFUSED_PRODUCTION_SCALE_HOSTS) {
      expect(classifyProductionScaleTarget(`https://${host}`)).toEqual({
        ok: false,
        reason: `Refusing production-scale harness against production host ${host}.`,
      });
      expect(() => parseProductionScaleHarnessArgs(["--target-url", `https://${host}`], {})).toThrow(/production host/i);
    }

    expect(classifyProductionScaleTarget("https://example.com").ok).toBe(false);
    expect(() => parseProductionScaleHarnessArgs(["--target-url", "https://example.com"], {})).toThrow(/unapproved host/i);
  });

  it("defaults to dry-run local mode with bounded settings", () => {
    expect(parseProductionScaleHarnessArgs([], {})).toEqual({
      dryRun: true,
      json: false,
      targetUrl: "http://localhost:3333",
      targetHost: "localhost",
      targetEnvironment: "local",
      maxConcurrency: 2,
      iterations: 1,
    });
    expect(classifyProductionScaleTarget("https://staging.creditregulatorpro.com")).toEqual({
      ok: true,
      host: "staging.creditregulatorpro.com",
      environment: "staging",
    });
    expect(() => parseProductionScaleHarnessArgs(["--apply"], {})).toThrow(/unsupported/i);
    expect(() => parseProductionScaleHarnessArgs(["--execute"], {})).toThrow(/unsupported/i);
  });

  it("rejects unbounded concurrency and iteration settings", () => {
    expect(() => parseProductionScaleHarnessArgs(["--max-concurrency", "0"], {})).toThrow(/between 1 and 4/i);
    expect(() => parseProductionScaleHarnessArgs(["--max-concurrency", String(MAX_PRODUCTION_SCALE_CONCURRENCY + 1)], {}))
      .toThrow(/between 1 and 4/i);
    expect(() => parseProductionScaleHarnessArgs(["--iterations", "0"], {})).toThrow(/between 1 and 5/i);
    expect(() => parseProductionScaleHarnessArgs(["--iterations", "6"], {})).toThrow(/between 1 and 5/i);
  });

  it("respects bounded concurrency in the harness scheduler", async () => {
    let active = 0;
    let observed = 0;
    const tasks = Array.from({ length: 8 }, (_, index) => async () => {
      active += 1;
      observed = Math.max(observed, active);
      await Promise.resolve();
      active -= 1;
      return index;
    });

    const result = await runBoundedConcurrency(tasks, 2);

    expect(result.results).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(result.observedMaxConcurrency).toBeLessThanOrEqual(2);
    expect(observed).toBeLessThanOrEqual(2);
  });

  it("reports every required production-scale evidence section", async () => {
    const report = await runProductionScaleHarness(parseProductionScaleHarnessArgs([
      "--dry-run",
      "--max-concurrency",
      "2",
      "--iterations",
      "2",
    ], {}), { env: {} });

    expect(report.mode).toBe("dry-run");
    expect(report.safety).toMatchObject({
      dryRunDefault: true,
      mutationExecutionSupported: false,
      productionMutationRefused: true,
      failClosedForUnknownHosts: true,
      runtimeMutationRequestsSent: 0,
      externalProviderCallsAllowed: false,
      externalProviderCallsMade: 0,
    });
    expect(report.sections.map((section) => section.key)).toEqual(REQUIRED_PRODUCTION_SCALE_SECTION_KEYS);
    expect(report.testedDomains).toEqual([
      "Concurrent authenticated upload/process enqueue behavior",
      "Ingest worker bounded concurrency",
      "OCR fallback path",
      "Packet creation/build under bounded load",
      "Packet PDF cache repeated download behavior",
      "Response queue operations",
      "Operator dashboard read latency",
      "DB pool config visibility",
      "Failure/dead-letter behavior",
    ]);
  });

  it("does not call external providers or network dependencies in dry-run mode", async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error("fetch should not be called");
    });

    const report = await runProductionScaleHarness(parseProductionScaleHarnessArgs([], {}), {
      fetch: fetchSpy,
      env: {},
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(report.safety.externalProviderCallsAllowed).toBe(false);
    expect(report.safety.externalProviderCallsMade).toBe(0);
    expect(report.safety.externalProviderDenylist).toEqual(
      expect.arrayContaining(["postgrid", "stripe", "email", "webhook"]),
    );
  });

  it("exposes the package script for local production-scale baseline dry-runs", () => {
    const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
    expect(packageJson.scripts["baseline:production-scale-local"]).toBe(
      "node scripts/production-scale-harness.mjs",
    );
  });
});
