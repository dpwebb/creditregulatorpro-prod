import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildSimulatedProductionScaleLoadEvidence,
  classifyProductionScaleTarget,
  detectLiveProviderFlags,
  detectProductionScaleEnvironment,
  MAX_PRODUCTION_SCALE_CONCURRENCY,
  parseProductionScaleHarnessArgs,
  REFUSED_PRODUCTION_SCALE_HOSTS,
  REQUIRED_PRODUCTION_SCALE_SECTION_KEYS,
  runBoundedConcurrency,
  runProductionScaleHarness,
  simulateRateLimitPressure,
  validateSimulatedLoadEvidenceReport,
  writeSimulatedLoadEvidence,
} from "../../scripts/production-scale-harness.mjs";

const tempRoots: string[] = [];

function makeTempRoot() {
  const root = mkdtempSync(join(tmpdir(), "crp-load-harness-test-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("production-scale load harness", () => {
  it("refuses production and unknown hosts", () => {
    for (const host of REFUSED_PRODUCTION_SCALE_HOSTS) {
      expect(classifyProductionScaleTarget(`https://${host}`)).toEqual({
        ok: false,
        reason: `Refusing production-scale harness against production host ${host}.`,
      });
      expect(() => parseProductionScaleHarnessArgs(["--simulated", "--target-url", `https://${host}`], {})).toThrow(/production host/i);
    }

    expect(classifyProductionScaleTarget("https://example.com").ok).toBe(false);
    expect(() => parseProductionScaleHarnessArgs(["--simulated", "--target-url", "https://example.com"], {})).toThrow(/unapproved host/i);
    expect(detectProductionScaleEnvironment({ CRP_ENV: "production" })).toMatchObject({ productionLike: true });
    expect(() => parseProductionScaleHarnessArgs(["--simulated"], { DATABASE_URL: "postgres://host/creditregulatorpro-prod" }))
      .toThrow(/production-like environment/i);
  });

  it("refuses mutation or execution without an explicit simulated/local/dry-run safety flag", () => {
    expect(() => parseProductionScaleHarnessArgs([], {})).toThrow(/explicit safety flag/i);
    expect(parseProductionScaleHarnessArgs(["--dry-run"], {})).toMatchObject({
      dryRun: true,
      simulated: false,
      mode: "dry-run",
      targetUrl: "http://localhost:3333",
      targetHost: "localhost",
      targetEnvironment: "local",
      maxConcurrency: 2,
      iterations: 1,
    });
    expect(parseProductionScaleHarnessArgs(["--simulated"], {})).toMatchObject({
      dryRun: false,
      simulated: true,
      mode: "simulated",
    });
    expect(parseProductionScaleHarnessArgs(["--local"], {})).toMatchObject({
      simulated: true,
      localSafetyFlag: true,
      mode: "simulated",
    });
    expect(classifyProductionScaleTarget("https://staging.creditregulatorpro.com")).toEqual({
      ok: true,
      host: "staging.creditregulatorpro.com",
      environment: "staging",
    });
    expect(() => parseProductionScaleHarnessArgs(["--apply"], {})).toThrow(/unsupported/i);
    expect(() => parseProductionScaleHarnessArgs(["--execute"], {})).toThrow(/unsupported/i);
    expect(() => parseProductionScaleHarnessArgs(["--simulated", "--dry-run"], {})).toThrow(/either --dry-run or --simulated/i);
  });

  it("refuses live provider enablement flags", () => {
    expect(detectLiveProviderFlags({ POSTGRID_LIVE_DELIVERY_ENABLED: "true" })).toEqual({
      enabled: true,
      enabledFlags: ["POSTGRID_LIVE_DELIVERY_ENABLED"],
    });
    expect(() => parseProductionScaleHarnessArgs(["--simulated"], { STRIPE_LIVE_PAYMENTS_ENABLED: "1" }))
      .toThrow(/live provider flag/i);
  });

  it("rejects unbounded concurrency and iteration settings", () => {
    expect(() => parseProductionScaleHarnessArgs(["--simulated", "--max-concurrency", "0"], {})).toThrow(/between 1 and 4/i);
    expect(() => parseProductionScaleHarnessArgs(["--simulated", "--max-concurrency", String(MAX_PRODUCTION_SCALE_CONCURRENCY + 1)], {}))
      .toThrow(/between 1 and 4/i);
    expect(() => parseProductionScaleHarnessArgs(["--simulated", "--iterations", "0"], {})).toThrow(/between 1 and 5/i);
    expect(() => parseProductionScaleHarnessArgs(["--simulated", "--iterations", "6"], {})).toThrow(/between 1 and 5/i);
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

  it("reports every required production-scale evidence section in dry-run mode", async () => {
    const report = await runProductionScaleHarness(parseProductionScaleHarnessArgs([
      "--dry-run",
      "--max-concurrency",
      "2",
      "--iterations",
      "2",
    ], {}), { env: {} });

    expect(report.mode).toBe("dry-run");
    expect(report.safety).toMatchObject({
      explicitSafetyFlagRequired: true,
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

  it("produces required SIMULATED load, queue, DB pool, rate-limit, and packet PDF metrics", async () => {
    const report = await buildSimulatedProductionScaleLoadEvidence(
      parseProductionScaleHarnessArgs(["--simulated", "--max-concurrency", "2", "--iterations", "2"], {}),
      { env: { CRP_DB_POOL_MAX: "7" }, generatedAt: "2026-05-20T12:00:00.000Z" },
    );

    expect(validateSimulatedLoadEvidenceReport(report)).toEqual({ ok: true, errors: [] });
    expect(report.evidenceType).toBe("SIMULATED");
    expect(report.summary.totalSyntheticRequestsOrJobs).toBeGreaterThan(0);
    expect(report.summary.concurrencyLevel).toBe(2);
    expect(report.summary.latency.p50Ms).toBeGreaterThanOrEqual(0);
    expect(report.ingestQueueDepth.before.queued).toBeGreaterThan(0);
    expect(report.ingestQueueDepth.after.queued).toBe(0);
    expect(report.packetPdfCache.cacheMissCount).toBeGreaterThan(0);
    expect(report.packetPdfCache.cacheHitCount).toBeGreaterThan(0);
    expect(report.packetPdfCache.cacheMissRenderTiming.maxMs).toBeGreaterThanOrEqual(report.packetPdfCache.cacheMissRenderTiming.p50Ms);
    expect(report.dbPool.configuredMax).toBe(7);
    expect(report.dbPool.observedBorrowedConnections).toBeLessThanOrEqual(2);
    expect(report.rateLimiter.acceptedCount).toBeGreaterThan(0);
    expect(report.rateLimiter.rejectedCount).toBeGreaterThan(0);
    expect(report.dashboardWarnings.before.available).toBe(false);
    expect(report.safety.externalProviderCallsMade).toBe(0);
  });

  it("writes required SIMULATED evidence files", async () => {
    const rootDir = makeTempRoot();
    const report = await buildSimulatedProductionScaleLoadEvidence(
      parseProductionScaleHarnessArgs(["--simulated", "--max-concurrency", "1", "--iterations", "1", "--root", rootDir], {}),
      { env: {}, generatedAt: "2026-05-20T12:00:00.000Z" },
    );
    const outputs = writeSimulatedLoadEvidence(report, { rootDir });
    const markdownPath = join(rootDir, outputs.markdownPath);
    const jsonPath = join(rootDir, outputs.jsonPath);

    expect(existsSync(markdownPath)).toBe(true);
    expect(existsSync(jsonPath)).toBe(true);
    expect(readFileSync(markdownPath, "utf8")).toContain("# SIMULATED Production-Scale Load Evidence");
    expect(JSON.parse(readFileSync(jsonPath, "utf8")).evidenceType).toBe("SIMULATED");
  });

  it("simulates rate-limit pressure without real abusive traffic", () => {
    const result = simulateRateLimitPressure({ attempts: 8, maxAttempts: 3 });

    expect(result.evidenceType).toBe("SIMULATED");
    expect(result.acceptedCount).toBe(3);
    expect(result.rejectedCount).toBe(5);
    expect(result.realTrafficSent).toBe(false);
    expect(result.databaseMutated).toBe(false);
    expect(result.decisions).toHaveLength(8);
  });

  it("labels packet PDF cache-miss proof as capacity evidence, not a fix", async () => {
    const report = await buildSimulatedProductionScaleLoadEvidence(
      parseProductionScaleHarnessArgs(["--simulated"], {}),
      { env: {}, generatedAt: "2026-05-20T12:00:00.000Z" },
    );

    expect(report.packetPdfCache.label).toMatch(/capacity evidence only/i);
    expect(report.packetPdfCache.queueOrEnvelopeImplemented).toBe(false);
    expect(report.safety.packetPdfQueueingImplemented).toBe(false);
  });

  it("does not call external providers or network dependencies in dry-run or simulated mode", async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error("fetch should not be called");
    });

    const dryRun = await runProductionScaleHarness(parseProductionScaleHarnessArgs(["--dry-run"], {}), {
      fetch: fetchSpy,
      env: {},
    });
    const simulated = await runProductionScaleHarness(parseProductionScaleHarnessArgs(["--simulated"], {}), {
      fetch: fetchSpy,
      env: {},
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(dryRun.safety.externalProviderCallsMade).toBe(0);
    expect(simulated.safety.externalProviderCallsMade).toBe(0);
    expect(dryRun.safety.externalProviderDenylist).toEqual(
      expect.arrayContaining(["postgrid", "stripe", "email", "webhook"]),
    );
  });

  it("exposes the package script for local production-scale baselines", () => {
    const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
    expect(packageJson.scripts["baseline:production-scale-local"]).toBe(
      "node scripts/production-scale-harness.mjs",
    );
  });
});
