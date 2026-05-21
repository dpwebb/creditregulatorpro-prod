import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildMeasuredLoadEvidenceAcceptance,
  buildMeasuredLoadEvidenceReport,
  evaluateMeasuredLoadThresholds,
  parseMeasuredLoadArgs,
  validateMeasuredLoadEvidenceReport,
  writeMeasuredLoadEvidence,
} from "../../scripts/production-scale-measured.mjs";

const tempRoots: string[] = [];

function makeTempRoot() {
  const root = mkdtempSync(join(tmpdir(), "crp-measured-load-test-"));
  tempRoots.push(root);
  return root;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

async function buildReport(overrides: string[] = [], env: Record<string, string> = {}) {
  const rootDir = makeTempRoot();
  const config = parseMeasuredLoadArgs(["--local", "--root", rootDir, ...overrides], env);
  const report = await buildMeasuredLoadEvidenceReport(config, {
    env: { CRP_DB_POOL_MAX: "5", ...env },
    generatedAt: "2026-05-20T12:00:00.000Z",
  });
  return { rootDir, config, report };
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("measured production-scale load evidence", () => {
  it("refuses production targets", () => {
    expect(() => parseMeasuredLoadArgs(["--local", "--target-url", "https://creditregulatorpro.com"], {}))
      .toThrow(/production host/i);
    expect(() => parseMeasuredLoadArgs(["--staging-safe", "--target-url", "https://app.creditregulatorpro.com"], {}))
      .toThrow(/production host/i);
    expect(() => parseMeasuredLoadArgs(["--local"], { CRP_ENV: "production" }))
      .toThrow(/production-like environment/i);
    expect(() => parseMeasuredLoadArgs(["--local"], { FLOOT_DATABASE_URL: "postgres://user:pass@db.creditregulatorpro-prod.internal/app" }))
      .toThrow(/production database target/i);
  });

  it("refuses live provider enablement flags", () => {
    expect(() => parseMeasuredLoadArgs(["--local"], { CRP_ENABLE_LIVE_PROVIDERS: "true" }))
      .toThrow(/live provider flag/i);
    expect(() => parseMeasuredLoadArgs(["--local"], { POSTGRID_LIVE_DELIVERY_ENABLED: "1" }))
      .toThrow(/live provider flag/i);
  });

  it("refuses runs without exactly one local or staging-safe flag", () => {
    expect(() => parseMeasuredLoadArgs([], {})).toThrow(/exactly one explicit target flag/i);
    expect(() => parseMeasuredLoadArgs(["--local", "--staging-safe"], {})).toThrow(/exactly one explicit target flag/i);
    expect(() => parseMeasuredLoadArgs(["--local", "--apply"], {})).toThrow(/not supported/i);
  });

  it("requires measured metrics fields", async () => {
    const { report } = await buildReport();
    expect(validateMeasuredLoadEvidenceReport(report)).toEqual({ ok: true, errors: [] });

    const missingLatency = clone(report);
    delete missingLatency.summary.latency;
    expect(validateMeasuredLoadEvidenceReport(missingLatency).errors.join("\n")).toMatch(/latency p50\/p95\/max/i);

    const missingCounts = clone(report);
    delete missingCounts.summary.requestCount;
    delete missingCounts.queueDepth.after;
    expect(validateMeasuredLoadEvidenceReport(missingCounts).errors.join("\n")).toMatch(/request count|queue depth/i);
  });

  it("asserts zero external provider calls", async () => {
    const { report } = await buildReport();
    const unsafe = clone(report);
    unsafe.safety.externalProviderCallsMade = 1;
    unsafe.thresholdEvaluation = evaluateMeasuredLoadThresholds(unsafe);

    const validation = validateMeasuredLoadEvidenceReport(unsafe);
    expect(validation.ok).toBe(false);
    expect(validation.errors.join("\n")).toMatch(/external provider calls must be zero|threshold policy failed/i);
  });

  it("keeps rate limiter pressure bounded", async () => {
    const { report } = await buildReport(["--concurrency", "2", "--iterations", "2"]);

    expect(report.rateLimiter.acceptedCount).toBeGreaterThan(0);
    expect(report.rateLimiter.rejectedCount).toBeGreaterThan(0);
    expect(report.rateLimiter.bounded).toBe(true);

    const unbounded = clone(report);
    unbounded.rateLimiter.bounded = false;
    unbounded.rateLimiter.writePressureEvents = 101;
    unbounded.thresholdEvaluation = evaluateMeasuredLoadThresholds(unbounded);
    expect(validateMeasuredLoadEvidenceReport(unbounded).errors.join("\n")).toMatch(/rate limiter pressure must be bounded/i);
  });

  it("records DB pool metrics or an explicit unavailable reason", async () => {
    const { report } = await buildReport();
    expect(report.dbPool.configuredMax).toBe(5);
    expect(report.dbPool.observedSignalAvailable).toBe(true);
    expect(report.dbPool.saturationRatio).toBeGreaterThan(0);
    expect(validateMeasuredLoadEvidenceReport(report)).toEqual({ ok: true, errors: [] });

    const explicitUnavailable = clone(report);
    explicitUnavailable.dbPool.observedSignalAvailable = false;
    explicitUnavailable.dbPool.observedActiveConnections = null;
    explicitUnavailable.dbPool.observedBorrowedConnections = null;
    explicitUnavailable.dbPool.unavailableReason = "Target runtime does not expose live pool counters to the measured harness.";
    explicitUnavailable.thresholdEvaluation = evaluateMeasuredLoadThresholds(explicitUnavailable);
    expect(validateMeasuredLoadEvidenceReport(explicitUnavailable)).toEqual({ ok: true, errors: [] });

    const missingSignal = clone(explicitUnavailable);
    missingSignal.dbPool.unavailableReason = "";
    missingSignal.thresholdEvaluation = evaluateMeasuredLoadThresholds(missingSignal);
    expect(validateMeasuredLoadEvidenceReport(missingSignal).errors.join("\n")).toMatch(/DB pool observed signal/i);
  });

  it("writes accepted release-blocking measured evidence", async () => {
    const { rootDir, report } = await buildReport();
    const outputs = writeMeasuredLoadEvidence(report, { rootDir });
    const markdownPath = join(rootDir, outputs.markdownPath);
    const jsonPath = join(rootDir, outputs.jsonPath);
    const acceptance = buildMeasuredLoadEvidenceAcceptance({
      rootDir,
      generatedAt: "2026-05-20T12:00:00.000Z",
    });

    expect(existsSync(markdownPath)).toBe(true);
    expect(existsSync(jsonPath)).toBe(true);
    expect(JSON.parse(readFileSync(jsonPath, "utf8")).evidenceType).toBe("MEASURED_LOCAL");
    expect(report.thresholdPolicy).toMatchObject({
      mode: "release-blocking",
      currentMode: "release-blocking",
      owner: "Release governance owner",
      reviewDate: "2026-08-20",
    });
    expect(report.thresholdEvaluation.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "maxFailureRate", status: "pass" }),
        expect.objectContaining({ key: "maxStaleQueueCount", status: "pass" }),
        expect.objectContaining({ key: "dbPoolSaturationWarningThreshold", status: "pass" }),
        expect.objectContaining({ key: "minRateLimiterRejectionRatio", status: "pass" }),
      ]),
    );
    expect(acceptance).toMatchObject({
      status: "accepted",
      accepted: true,
      blockerCoverage: {
        loadConcurrency: true,
        dbPoolPressure: true,
        rateLimiterWritePressure: true,
      },
    });
  });

  it("exposes the package script for measured baselines", () => {
    const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
    expect(packageJson.scripts["baseline:production-scale-measured"]).toBe(
      "node scripts/production-scale-measured.mjs",
    );
  });
});
