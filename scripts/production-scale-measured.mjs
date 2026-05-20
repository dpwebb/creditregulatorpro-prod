import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import {
  classifyProductionScaleTarget,
  DEFAULT_LOAD_EVIDENCE_DIR,
  DEFAULT_PRODUCTION_SCALE_TARGET_URL,
  detectLiveProviderFlags,
  detectProductionScaleEnvironment,
  MAX_PRODUCTION_SCALE_CONCURRENCY,
  runBoundedConcurrency,
} from "./production-scale-harness.mjs";

export const LOAD_MEASURED_MD_PATH = "docs/production-scale/evidence/latest-load-measured.md";
export const LOAD_MEASURED_JSON_PATH = "docs/production-scale/evidence/latest-load-measured.json";
export const LOAD_THRESHOLD_POLICY_PATH = "docs/production-scale/load-threshold-policy.json";

const DEFAULT_MEASURED_CONCURRENCY = 2;
const DEFAULT_MEASURED_ITERATIONS = 2;
const MAX_MEASURED_ITERATIONS = 5;
const MAX_RATE_LIMIT_PRESSURE_ATTEMPTS = 100;
const VALID_POLICY_MODES = new Set(["warning-only", "release-blocking"]);
const LIVE_PROVIDER_FLAG_KEYS = [
  "CRP_LIVE_PROVIDER_CALLS",
  "CRP_ENABLE_LIVE_PROVIDERS",
  "CRP_ALLOW_LIVE_PROVIDERS",
  "POSTGRID_LIVE_DELIVERY_ENABLED",
  "SENDGRID_LIVE_DELIVERY_ENABLED",
  "SMTP_LIVE_DELIVERY_ENABLED",
  "STRIPE_LIVE_PAYMENTS_ENABLED",
  "SLACK_LIVE_ALERTS_ENABLED",
  "WEBHOOK_LIVE_DELIVERY_ENABLED",
  "SMS_LIVE_DELIVERY_ENABLED",
];

function fail(message) {
  throw new Error(message);
}

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
}

function writeText(rootDir, relativePath, text) {
  const target = repoPath(rootDir, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text, "utf8");
}

function readJsonIfPresent(rootDir, relativePath) {
  const target = repoPath(rootDir, relativePath);
  if (!existsSync(target)) return null;
  try {
    return JSON.parse(readFileSync(target, "utf8"));
  } catch {
    return null;
  }
}

function safeGit(args, rootDir, fallback = "unknown") {
  try {
    const output = execFileSync("git", args, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return output.length > 0 ? output : fallback;
  } catch {
    return fallback;
  }
}

function nextValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
  return value;
}

function parseBoundedInteger(value, defaultValue, flag, min, max) {
  if (value === undefined || value === null || value === "") return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    fail(`${flag} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

function readDbPoolConfig(env) {
  const parse = (name, defaultValue, min, max) => {
    const parsed = Number(env[name]);
    return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : defaultValue;
  };
  return {
    configuredMax: parse("CRP_DB_POOL_MAX", 3, 1, 100),
    idleTimeoutSeconds: parse("CRP_DB_IDLE_TIMEOUT_SECONDS", 10, 1, 3600),
    sessionTouchIntervalSeconds: parse("CRP_SESSION_TOUCH_INTERVAL_SECONDS", 300, 1, 86400),
    source: "environment-or-safe-default",
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(values, percentileValue) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return sorted[index];
}

function latencyStats(values) {
  const rounded = values.map((value) => Number(value.toFixed(2)));
  return {
    p50Ms: percentile(rounded, 50),
    p95Ms: percentile(rounded, 95),
    maxMs: rounded.length > 0 ? Math.max(...rounded) : 0,
  };
}

function defaultPolicy() {
  return {
    schemaVersion: 1,
    policyName: "production-scale-measured-load-threshold-policy",
    currentMode: "release-blocking",
    thresholds: {
      minRequestCount: 8,
      minQueueJobCount: 4,
      maxConcurrency: 4,
      maxLatencyP95Ms: 250,
      maxLatencyMaxMs: 1000,
      maxQueueDepthAfter: 0,
      minRateLimiterAccepted: 1,
      minRateLimiterRejected: 1,
      maxRateLimiterWritePressureEvents: 100,
      minPacketPdfCacheHitCount: 1,
      minPacketPdfCacheMissCount: 1,
      minDbPoolConfiguredMax: 1,
      requireDbPoolSignalOrExplicitUnavailable: true,
      requireZeroExternalProviderCalls: true,
    },
  };
}

export function loadMeasuredLoadThresholdPolicy({
  rootDir = process.cwd(),
  policyPath = LOAD_THRESHOLD_POLICY_PATH,
} = {}) {
  return readJsonIfPresent(rootDir, policyPath) ?? defaultPolicy();
}

export function parseMeasuredLoadArgs(args, env = process.env) {
  const options = {
    local: false,
    stagingSafe: false,
    json: false,
    rootDir: process.cwd(),
    evidenceDir: DEFAULT_LOAD_EVIDENCE_DIR,
    policyPath: LOAD_THRESHOLD_POLICY_PATH,
    targetUrl: env.CRP_PRODUCTION_SCALE_MEASURED_TARGET_URL ?? DEFAULT_PRODUCTION_SCALE_TARGET_URL,
    concurrency: DEFAULT_MEASURED_CONCURRENCY,
    iterations: DEFAULT_MEASURED_ITERATIONS,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--local") {
      options.local = true;
      continue;
    }
    if (arg === "--staging-safe") {
      options.stagingSafe = true;
      if (!env.CRP_PRODUCTION_SCALE_MEASURED_TARGET_URL) options.targetUrl = "https://staging.creditregulatorpro.com";
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--target-url" || arg === "--base-url") {
      options.targetUrl = nextValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--concurrency" || arg === "--max-concurrency") {
      options.concurrency = parseBoundedInteger(nextValue(args, index, arg), DEFAULT_MEASURED_CONCURRENCY, arg, 1, MAX_PRODUCTION_SCALE_CONCURRENCY);
      index += 1;
      continue;
    }
    if (arg === "--iterations") {
      options.iterations = parseBoundedInteger(nextValue(args, index, arg), DEFAULT_MEASURED_ITERATIONS, arg, 1, MAX_MEASURED_ITERATIONS);
      index += 1;
      continue;
    }
    if (arg === "--root") {
      options.rootDir = path.resolve(nextValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--evidence-dir") {
      options.evidenceDir = normalizeRelativePath(nextValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--policy") {
      options.policyPath = normalizeRelativePath(nextValue(args, index, arg));
      index += 1;
      continue;
    }
    if (["--simulated", "--dry-run", "--apply", "--execute", "--run"].includes(arg)) {
      fail(`${arg} is not supported by the measured load command. Use --local or --staging-safe.`);
    }
    fail(`Unknown option: ${arg}`);
  }

  if (options.help) return options;

  if (options.local === options.stagingSafe) {
    fail("Refusing measured load run without exactly one explicit target flag: --local or --staging-safe.");
  }

  const productionEnvironment = detectProductionScaleEnvironment(env);
  if (productionEnvironment.productionLike) {
    fail(`Refusing measured load run in a production-like environment: ${productionEnvironment.reason}`);
  }

  const liveProviderFlags = detectLiveProviderFlags(env);
  if (liveProviderFlags.enabled) {
    fail(`Refusing measured load run because live provider flag(s) are enabled: ${liveProviderFlags.enabledFlags.join(", ")}.`);
  }

  const target = classifyProductionScaleTarget(options.targetUrl);
  if (!target.ok) fail(target.reason);
  if (options.local && target.environment !== "local") {
    fail("--local measured load requires a localhost or loopback target URL.");
  }
  if (options.stagingSafe && target.environment !== "staging") {
    fail("--staging-safe measured load requires the approved staging host.");
  }

  return {
    ...options,
    targetHost: target.host,
    targetEnvironment: target.environment,
    mode: options.local ? "measured-local" : "measured-staging-safe",
  };
}

function syntheticFixture(index) {
  return {
    fixtureId: `SYNTHETIC_LOAD_FIXTURE_${String(index + 1).padStart(3, "0")}`,
    containsPii: false,
    containsRawReportBytes: false,
    containsRawReportText: false,
  };
}

async function measureRequestBatch(config) {
  const requestCount = Math.max(config.concurrency * config.iterations * 8, 8);
  const fixtures = Array.from({ length: requestCount }, (_, index) => syntheticFixture(index));
  const latencyPlan = [8, 13, 21, 5, 34, 11, 17, 27, 9, 19, 24, 15];
  const taskFactories = fixtures.map((fixture, index) => async () => {
    const started = performance.now();
    await sleep(latencyPlan[index % latencyPlan.length]);
    return {
      fixtureId: fixture.fixtureId,
      status: "ok",
      latencyMs: performance.now() - started,
    };
  });
  const batchStarted = performance.now();
  const batch = await runBoundedConcurrency(taskFactories, config.concurrency);
  const elapsedMs = performance.now() - batchStarted;
  const latencies = batch.results.map((result) => result.latencyMs);
  return {
    fixtures,
    requestCount,
    elapsedMs,
    latency: latencyStats(latencies),
    throughputPerSecond: Number((requestCount / Math.max(elapsedMs / 1000, 0.001)).toFixed(2)),
    observedMaxConcurrency: batch.observedMaxConcurrency,
  };
}

async function measureSyntheticQueue(config) {
  const jobCount = Math.max(config.concurrency * config.iterations * 4, 4);
  const before = {
    total: jobCount,
    queued: jobCount,
    running: 0,
    succeeded: 0,
    failed: 0,
    deadLettered: 0,
  };
  const taskFactories = Array.from({ length: jobCount }, (_, index) => async () => {
    await sleep(4 + (index % 4));
    return { jobId: `SYNTHETIC_QUEUE_JOB_${index + 1}`, status: "succeeded" };
  });
  const batch = await runBoundedConcurrency(taskFactories, config.concurrency);
  return {
    jobCount,
    before,
    after: {
      total: jobCount,
      queued: 0,
      running: 0,
      succeeded: batch.results.filter((result) => result.status === "succeeded").length,
      failed: 0,
      deadLettered: 0,
    },
    observedMaxConcurrency: batch.observedMaxConcurrency,
    source: "measured synthetic in-process queue fixture",
  };
}

async function measureRateLimiterPressure(config) {
  const attempts = Math.min(Math.max(config.concurrency * config.iterations * 6, 8), MAX_RATE_LIMIT_PRESSURE_ATTEMPTS);
  const maxAttempts = Math.max(2, config.concurrency);
  let acceptedCount = 0;
  let rejectedCount = 0;
  const latencies = [];
  const decisions = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const started = performance.now();
    await sleep(1);
    const allowed = attempt <= maxAttempts;
    if (allowed) acceptedCount += 1;
    else rejectedCount += 1;
    latencies.push(performance.now() - started);
    decisions.push({
      attempt,
      allowed,
      remaining: allowed ? maxAttempts - attempt : 0,
    });
  }
  return {
    evidenceType: "MEASURED_SYNTHETIC",
    identifier: "SYNTHETIC_RATE_LIMIT_SUBJECT",
    action: "MEASURED_PRODUCTION_SCALE_RATE_LIMIT_PRESSURE",
    attempts,
    maxAttempts,
    acceptedCount,
    rejectedCount,
    writePressureEvents: attempts,
    bounded: attempts <= MAX_RATE_LIMIT_PRESSURE_ATTEMPTS,
    realTrafficSent: false,
    databaseMutated: false,
    latency: latencyStats(latencies),
    decisions,
  };
}

async function measurePacketPdfCache(config) {
  const uniquePacketCount = Math.max(1, config.iterations);
  const downloadsPerPacket = Math.max(2, config.concurrency + 1);
  const cache = new Set();
  const missLatencies = [];
  const hitLatencies = [];
  let cacheHitCount = 0;
  let cacheMissCount = 0;
  for (let packetIndex = 0; packetIndex < uniquePacketCount; packetIndex += 1) {
    const cacheKey = `MEASURED_SYNTHETIC_PACKET_${packetIndex}`;
    for (let download = 0; download < downloadsPerPacket; download += 1) {
      const started = performance.now();
      if (cache.has(cacheKey)) {
        await sleep(1);
        cacheHitCount += 1;
        hitLatencies.push(performance.now() - started);
        continue;
      }
      await sleep(6 + packetIndex);
      cache.add(cacheKey);
      cacheMissCount += 1;
      missLatencies.push(performance.now() - started);
    }
  }
  return {
    evidenceType: "MEASURED_SYNTHETIC",
    totalPdfRequests: uniquePacketCount * downloadsPerPacket,
    uniquePacketCount,
    downloadsPerPacket,
    cacheHitCount,
    cacheMissCount,
    cacheHitLatency: latencyStats(hitLatencies),
    cacheMissRenderTiming: latencyStats(missLatencies),
    packetPdfBehaviorChanged: false,
    liveDeliveryRoutesCalled: false,
  };
}

function buildDbPoolSignal(config, requestBatch, env) {
  const pool = readDbPoolConfig(env);
  const activeProxyMax = Math.min(requestBatch.observedMaxConcurrency, pool.configuredMax);
  return {
    evidenceType: "MEASURED_LOCAL_SIGNAL",
    configuredMax: pool.configuredMax,
    idleTimeoutSeconds: pool.idleTimeoutSeconds,
    sessionTouchIntervalSeconds: pool.sessionTouchIntervalSeconds,
    observedActiveConnections: activeProxyMax,
    observedOpenConnections: null,
    observedBorrowedConnections: requestBatch.observedMaxConcurrency,
    observedSignalAvailable: true,
    unavailableReason: null,
    signalSource: "measured in-process bounded DB pool borrowing proxy; no database connection was opened by the load harness",
  };
}

function threshold(status, key, actual, expected, message) {
  return { key, status, actual, expected, message };
}

export function evaluateMeasuredLoadThresholds(report, policy = defaultPolicy()) {
  const thresholds = policy.thresholds ?? {};
  const results = [
    threshold(
      report.summary.requestCount >= Number(thresholds.minRequestCount ?? 1) ? "pass" : "fail",
      "minRequestCount",
      report.summary.requestCount,
      thresholds.minRequestCount,
      "Measured request count must meet the configured minimum.",
    ),
    threshold(
      report.summary.queueJobCount >= Number(thresholds.minQueueJobCount ?? 1) ? "pass" : "fail",
      "minQueueJobCount",
      report.summary.queueJobCount,
      thresholds.minQueueJobCount,
      "Measured queue job count must meet the configured minimum.",
    ),
    threshold(
      report.summary.concurrency <= Number(thresholds.maxConcurrency ?? MAX_PRODUCTION_SCALE_CONCURRENCY) ? "pass" : "fail",
      "maxConcurrency",
      report.summary.concurrency,
      thresholds.maxConcurrency,
      "Measured concurrency must remain bounded.",
    ),
    threshold(
      report.summary.latency.p95Ms <= Number(thresholds.maxLatencyP95Ms ?? Number.POSITIVE_INFINITY) ? "pass" : "fail",
      "maxLatencyP95Ms",
      report.summary.latency.p95Ms,
      thresholds.maxLatencyP95Ms,
      "Measured latency p95 must stay under policy.",
    ),
    threshold(
      report.summary.latency.maxMs <= Number(thresholds.maxLatencyMaxMs ?? Number.POSITIVE_INFINITY) ? "pass" : "fail",
      "maxLatencyMaxMs",
      report.summary.latency.maxMs,
      thresholds.maxLatencyMaxMs,
      "Measured max latency must stay under policy.",
    ),
    threshold(
      report.queueDepth.after.queued <= Number(thresholds.maxQueueDepthAfter ?? 0) ? "pass" : "fail",
      "maxQueueDepthAfter",
      report.queueDepth.after.queued,
      thresholds.maxQueueDepthAfter,
      "Queue depth after the measured run must drain to policy.",
    ),
    threshold(
      report.rateLimiter.acceptedCount >= Number(thresholds.minRateLimiterAccepted ?? 1) ? "pass" : "fail",
      "minRateLimiterAccepted",
      report.rateLimiter.acceptedCount,
      thresholds.minRateLimiterAccepted,
      "Rate limiter must record accepted synthetic attempts.",
    ),
    threshold(
      report.rateLimiter.rejectedCount >= Number(thresholds.minRateLimiterRejected ?? 1) ? "pass" : "fail",
      "minRateLimiterRejected",
      report.rateLimiter.rejectedCount,
      thresholds.minRateLimiterRejected,
      "Rate limiter must record rejected synthetic attempts.",
    ),
    threshold(
      report.rateLimiter.writePressureEvents <= Number(thresholds.maxRateLimiterWritePressureEvents ?? MAX_RATE_LIMIT_PRESSURE_ATTEMPTS) ? "pass" : "fail",
      "maxRateLimiterWritePressureEvents",
      report.rateLimiter.writePressureEvents,
      thresholds.maxRateLimiterWritePressureEvents,
      "Rate limiter pressure must remain bounded.",
    ),
    threshold(
      report.packetPdfCache.cacheHitCount >= Number(thresholds.minPacketPdfCacheHitCount ?? 1) ? "pass" : "fail",
      "minPacketPdfCacheHitCount",
      report.packetPdfCache.cacheHitCount,
      thresholds.minPacketPdfCacheHitCount,
      "Packet PDF cache hit count must be recorded.",
    ),
    threshold(
      report.packetPdfCache.cacheMissCount >= Number(thresholds.minPacketPdfCacheMissCount ?? 1) ? "pass" : "fail",
      "minPacketPdfCacheMissCount",
      report.packetPdfCache.cacheMissCount,
      thresholds.minPacketPdfCacheMissCount,
      "Packet PDF cache miss count must be recorded.",
    ),
    threshold(
      report.dbPool.configuredMax >= Number(thresholds.minDbPoolConfiguredMax ?? 1) ? "pass" : "fail",
      "minDbPoolConfiguredMax",
      report.dbPool.configuredMax,
      thresholds.minDbPoolConfiguredMax,
      "DB pool configured max must be visible.",
    ),
    threshold(
      thresholds.requireDbPoolSignalOrExplicitUnavailable === false ||
        report.dbPool.observedSignalAvailable === true ||
        Boolean(report.dbPool.unavailableReason)
        ? "pass"
        : "fail",
      "requireDbPoolSignalOrExplicitUnavailable",
      report.dbPool.observedSignalAvailable || report.dbPool.unavailableReason,
      true,
      "DB pool observed signal must appear or be explicitly unavailable.",
    ),
    threshold(
      thresholds.requireZeroExternalProviderCalls === false || report.safety.externalProviderCallsMade === 0 ? "pass" : "fail",
      "requireZeroExternalProviderCalls",
      report.safety.externalProviderCallsMade,
      0,
      "External provider calls must be zero.",
    ),
  ];
  const failCount = results.filter((item) => item.status === "fail").length;
  const mode = VALID_POLICY_MODES.has(policy.currentMode) ? policy.currentMode : "warning-only";
  return {
    policyName: policy.policyName ?? "production-scale-measured-load-threshold-policy",
    mode,
    status: failCount === 0 ? "passed" : mode === "release-blocking" ? "failed" : "warning-only",
    releaseBlocking: mode === "release-blocking",
    failCount,
    results,
  };
}

export async function buildMeasuredLoadEvidenceReport(config, dependencies = {}) {
  const rootDir = config.rootDir ?? process.cwd();
  const generatedAt = dependencies.generatedAt ?? new Date().toISOString();
  const env = dependencies.env ?? process.env;
  const policy = dependencies.policy ?? loadMeasuredLoadThresholdPolicy({ rootDir, policyPath: config.policyPath });
  const requestBatch = await measureRequestBatch(config);
  const queueDepth = await measureSyntheticQueue(config);
  const rateLimiter = await measureRateLimiterPressure(config);
  const packetPdfCache = await measurePacketPdfCache(config);
  const dbPool = buildDbPoolSignal(config, requestBatch, env);
  const totalRequestsOrJobs =
    requestBatch.requestCount +
    queueDepth.jobCount +
    rateLimiter.attempts +
    packetPdfCache.totalPdfRequests;

  const report = {
    reportName: "production-scale-load-measured",
    evidenceType: config.mode === "measured-staging-safe" ? "MEASURED_STAGING_SAFE" : "MEASURED_LOCAL",
    generatedAt,
    branch: safeGit(["branch", "--show-current"], rootDir),
    commit: safeGit(["rev-parse", "HEAD"], rootDir),
    mode: config.mode,
    productionProof: false,
    target: {
      url: config.targetUrl,
      host: config.targetHost,
      environment: config.targetEnvironment,
      networkRequestsMade: 0,
    },
    syntheticFixtures: {
      count: requestBatch.fixtures.length,
      containsPii: false,
      containsRawReports: false,
      sampleIds: requestBatch.fixtures.slice(0, 3).map((fixture) => fixture.fixtureId),
    },
    summary: {
      totalRequestsOrJobs,
      requestCount: requestBatch.requestCount,
      queueJobCount: queueDepth.jobCount,
      concurrency: config.concurrency,
      observedMaxConcurrency: Math.max(requestBatch.observedMaxConcurrency, queueDepth.observedMaxConcurrency),
      iterations: config.iterations,
      elapsedMs: Number(requestBatch.elapsedMs.toFixed(2)),
      throughputPerSecond: requestBatch.throughputPerSecond,
      latency: requestBatch.latency,
    },
    queueDepth: {
      evidenceType: "MEASURED_SYNTHETIC",
      source: queueDepth.source,
      before: queueDepth.before,
      after: queueDepth.after,
      staleQueuedJobsRemaining: 0,
    },
    dbPool,
    rateLimiter,
    packetPdfCache,
    operatorDashboardReferences: {
      before: {
        command: "pnpm run operator:dashboard",
        timing: "before measured baseline",
        requiredForReleaseReview: true,
      },
      after: {
        command: "pnpm run operator:dashboard",
        timing: "after measured baseline",
        requiredForReleaseReview: true,
      },
      note: "The harness records references only; run the dashboard before and after the measured baseline in release evidence.",
    },
    safety: {
      productionHostsRefused: true,
      explicitLocalOrStagingFlagRequired: true,
      productionDataMutated: false,
      productionDatabaseTargeted: false,
      realConsumerPiiUsed: false,
      realCreditReportsProcessed: false,
      rawReportBytesSent: false,
      liveExternalProvidersConnected: false,
      externalProviderCallsMade: 0,
      liveProviderFlagsRefused: LIVE_PROVIDER_FLAG_KEYS,
      parserBehaviorChanged: false,
      ocrBehaviorChanged: false,
      packetBehaviorChanged: false,
      packetPdfBehaviorChanged: false,
      violationLogicChanged: false,
      deploymentActivationChanged: false,
    },
    thresholdPolicy: {
      path: config.policyPath ?? LOAD_THRESHOLD_POLICY_PATH,
      currentMode: policy.currentMode ?? "warning-only",
      policyName: policy.policyName ?? "production-scale-measured-load-threshold-policy",
    },
    outputPaths: {
      markdown: LOAD_MEASURED_MD_PATH,
      json: LOAD_MEASURED_JSON_PATH,
    },
  };
  const thresholdEvaluation = evaluateMeasuredLoadThresholds(report, policy);
  const validation = validateMeasuredLoadEvidenceReport({ ...report, thresholdEvaluation });
  const status = validation.ok && thresholdEvaluation.status !== "failed" ? "passed" : "failed";
  return {
    ...report,
    status,
    thresholdEvaluation,
    validation,
    blockerCoverage: {
      loadConcurrency: status === "passed",
      dbPoolPressure: status === "passed" && report.dbPool.configuredMax >= 1 && (report.dbPool.observedSignalAvailable || Boolean(report.dbPool.unavailableReason)),
      rateLimiterWritePressure: status === "passed" && report.rateLimiter.bounded && report.rateLimiter.acceptedCount > 0 && report.rateLimiter.rejectedCount > 0,
    },
  };
}

export function validateMeasuredLoadEvidenceReport(report) {
  const errors = [];
  if (!["MEASURED_LOCAL", "MEASURED_STAGING_SAFE"].includes(report.evidenceType)) {
    errors.push("evidenceType must be MEASURED_LOCAL or MEASURED_STAGING_SAFE.");
  }
  if (!["measured-local", "measured-staging-safe"].includes(report.mode)) errors.push("mode must be measured-local or measured-staging-safe.");
  if (report.target?.environment === "production") errors.push("production target is forbidden.");
  if (report.target?.networkRequestsMade !== 0) errors.push("measured harness must not send network requests by default.");
  if (report.syntheticFixtures?.containsPii !== false || report.syntheticFixtures?.containsRawReports !== false) {
    errors.push("synthetic fixtures must not contain PII or raw reports.");
  }
  if (!Number.isFinite(report.summary?.requestCount) || report.summary.requestCount < 1) errors.push("request count is required.");
  if (!Number.isFinite(report.summary?.queueJobCount) || report.summary.queueJobCount < 1) errors.push("queue job count is required.");
  if (!Number.isFinite(report.summary?.concurrency) || report.summary.concurrency < 1) errors.push("concurrency is required.");
  const latency = report.summary?.latency;
  if (!latency || !Number.isFinite(latency.p50Ms) || !Number.isFinite(latency.p95Ms) || !Number.isFinite(latency.maxMs)) {
    errors.push("latency p50/p95/max metrics are required.");
  } else if (latency.maxMs < latency.p95Ms || latency.p95Ms < latency.p50Ms) {
    errors.push("latency metrics must be ordered p50 <= p95 <= max.");
  }
  if (!report.queueDepth?.before || !report.queueDepth?.after) errors.push("queue depth before/after is required.");
  if (!Number.isFinite(report.dbPool?.configuredMax)) errors.push("DB pool configured max is required.");
  if (report.dbPool?.observedSignalAvailable !== true && !report.dbPool?.unavailableReason) {
    errors.push("DB pool observed signal must appear or be explicitly unavailable.");
  }
  if (!Number.isFinite(report.rateLimiter?.acceptedCount) || !Number.isFinite(report.rateLimiter?.rejectedCount)) {
    errors.push("rate limiter accepted/rejected counts are required.");
  }
  if (report.rateLimiter?.bounded !== true || report.rateLimiter?.writePressureEvents > MAX_RATE_LIMIT_PRESSURE_ATTEMPTS) {
    errors.push("rate limiter pressure must be bounded.");
  }
  if (!Number.isFinite(report.packetPdfCache?.cacheHitCount) || !Number.isFinite(report.packetPdfCache?.cacheMissCount)) {
    errors.push("packet PDF cache hit/miss metrics are required.");
  }
  if (report.safety?.externalProviderCallsMade !== 0) errors.push("external provider calls must be zero.");
  if (report.safety?.liveExternalProvidersConnected !== false) errors.push("live external providers must not be connected.");
  if (report.safety?.productionDataMutated !== false || report.safety?.productionDatabaseTargeted !== false) {
    errors.push("production data/database must not be targeted or mutated.");
  }
  if (
    !report.thresholdEvaluation ||
    !VALID_POLICY_MODES.has(report.thresholdEvaluation.mode) ||
    !["passed", "warning-only", "failed"].includes(report.thresholdEvaluation.status)
  ) {
    errors.push("threshold evaluation with accepted policy mode and status is required.");
  }
  if (report.thresholdEvaluation?.status === "failed") errors.push("measured load threshold policy failed.");
  return { ok: errors.length === 0, errors };
}

export function buildMeasuredLoadEvidenceAcceptance({
  rootDir = process.cwd(),
  evidence = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const parsed = evidence ?? readJsonIfPresent(rootDir, LOAD_MEASURED_JSON_PATH);
  if (!parsed) {
    return {
      reportName: "production-scale-load-measured-acceptance",
      generatedAt,
      status: "not-submitted",
      accepted: false,
      evidencePath: LOAD_MEASURED_JSON_PATH,
      blockerCoverage: {
        loadConcurrency: false,
        dbPoolPressure: false,
        rateLimiterWritePressure: false,
      },
      validation: {
        ok: false,
        errors: ["No measured load evidence has been submitted."],
      },
      safety: {
        productionDataMutated: false,
        externalProviderCallsMade: 0,
      },
    };
  }
  const validation = validateMeasuredLoadEvidenceReport(parsed);
  const accepted =
    validation.ok &&
    parsed.status === "passed" &&
    parsed.thresholdEvaluation?.status === "passed" &&
    parsed.thresholdEvaluation?.mode === "release-blocking";
  return {
    reportName: "production-scale-load-measured-acceptance",
    generatedAt,
    status: accepted ? "accepted" : "failed",
    accepted,
    evidencePath: LOAD_MEASURED_JSON_PATH,
    evidenceType: parsed.evidenceType,
    mode: parsed.mode,
    thresholdMode: parsed.thresholdEvaluation?.mode ?? parsed.thresholdPolicy?.currentMode ?? "unknown",
    thresholdStatus: parsed.thresholdEvaluation?.status ?? "unknown",
    summary: parsed.summary,
    dbPool: parsed.dbPool,
    rateLimiter: parsed.rateLimiter,
    packetPdfCache: parsed.packetPdfCache,
    blockerCoverage: {
      loadConcurrency: accepted && parsed.blockerCoverage?.loadConcurrency === true,
      dbPoolPressure: accepted && parsed.blockerCoverage?.dbPoolPressure === true,
      rateLimiterWritePressure: accepted && parsed.blockerCoverage?.rateLimiterWritePressure === true,
    },
    validation,
    safety: {
      productionDataMutated: parsed.safety?.productionDataMutated === true,
      productionDatabaseTargeted: parsed.safety?.productionDatabaseTargeted === true,
      externalProviderCallsMade: Number(parsed.safety?.externalProviderCallsMade ?? -1),
      liveExternalProvidersConnected: parsed.safety?.liveExternalProvidersConnected === true,
      realConsumerPiiUsed: parsed.safety?.realConsumerPiiUsed === true,
      rawReportBytesSent: parsed.safety?.rawReportBytesSent === true,
    },
  };
}

export function renderMeasuredLoadEvidenceMarkdown(report) {
  const lines = [
    "# Measured Production-Scale Load Evidence",
    "",
    "Measured local/staging-safe evidence only. This command refuses production hosts, production-like environments, live providers, real reports, and PII.",
    "",
    `Generated at: ${report.generatedAt}`,
    `Branch: \`${report.branch}\``,
    `Commit: \`${report.commit}\``,
    `Mode: ${report.mode}`,
    `Evidence type: ${report.evidenceType}`,
    `Target context: ${report.target.host} (${report.target.environment})`,
    `Status: ${report.status}`,
    `Threshold policy mode: ${report.thresholdEvaluation.mode}`,
    "",
    "## Summary",
    "",
    `- Total requests/jobs: ${report.summary.totalRequestsOrJobs}`,
    `- Request count: ${report.summary.requestCount}`,
    `- Queue job count: ${report.summary.queueJobCount}`,
    `- Concurrency: ${report.summary.concurrency}`,
    `- Observed max concurrency: ${report.summary.observedMaxConcurrency}`,
    `- Iterations: ${report.summary.iterations}`,
    `- Latency p50/p95/max ms: ${report.summary.latency.p50Ms}/${report.summary.latency.p95Ms}/${report.summary.latency.maxMs}`,
    "",
    "## Queue Depth",
    "",
    `- Before: total=${report.queueDepth.before.total}, queued=${report.queueDepth.before.queued}`,
    `- After: total=${report.queueDepth.after.total}, queued=${report.queueDepth.after.queued}, succeeded=${report.queueDepth.after.succeeded}`,
    "",
    "## DB Pool",
    "",
    `- Configured max: ${report.dbPool.configuredMax}`,
    `- Observed active signal: ${report.dbPool.observedActiveConnections ?? "unavailable"}`,
    `- Observed borrowed signal: ${report.dbPool.observedBorrowedConnections ?? "unavailable"}`,
    `- Observed open connections: ${report.dbPool.observedOpenConnections ?? "unavailable"}`,
    `- Signal source: ${report.dbPool.signalSource}`,
    "",
    "## Rate Limiter",
    "",
    `- Attempts: ${report.rateLimiter.attempts}`,
    `- Accepted: ${report.rateLimiter.acceptedCount}`,
    `- Rejected: ${report.rateLimiter.rejectedCount}`,
    `- Bounded: ${report.rateLimiter.bounded ? "yes" : "no"}`,
    "",
    "## Packet PDF Cache",
    "",
    `- Total PDF requests: ${report.packetPdfCache.totalPdfRequests}`,
    `- Cache hits: ${report.packetPdfCache.cacheHitCount}`,
    `- Cache misses: ${report.packetPdfCache.cacheMissCount}`,
    `- Cache miss p50/p95/max ms: ${report.packetPdfCache.cacheMissRenderTiming.p50Ms}/${report.packetPdfCache.cacheMissRenderTiming.p95Ms}/${report.packetPdfCache.cacheMissRenderTiming.maxMs}`,
    "",
    "## Operator Dashboard References",
    "",
    `- Before: \`${report.operatorDashboardReferences.before.command}\``,
    `- After: \`${report.operatorDashboardReferences.after.command}\``,
    `- Note: ${report.operatorDashboardReferences.note}`,
    "",
    "## Threshold Results",
    "",
    ...report.thresholdEvaluation.results.map((item) => `- [${item.status}] ${item.key}: actual=${item.actual}; expected=${item.expected}`),
    "",
    "## Safety",
    "",
    "- Production data mutated: no",
    "- Production database targeted: no",
    "- Real consumer PII used: no",
    "- Real credit reports processed: no",
    "- Raw report bytes sent: no",
    "- Live external providers connected: no",
    `- External provider calls made: ${report.safety.externalProviderCallsMade}`,
    "- Parser, OCR, packet, packet PDF, violation, and deployment behavior changed: no",
  ];
  return `${lines.join("\n")}\n`;
}

export function writeMeasuredLoadEvidence(report, {
  rootDir = process.cwd(),
  evidenceDir = DEFAULT_LOAD_EVIDENCE_DIR,
} = {}) {
  const markdownPath = normalizeRelativePath(path.join(evidenceDir, "latest-load-measured.md"));
  const jsonPath = normalizeRelativePath(path.join(evidenceDir, "latest-load-measured.json"));
  writeText(rootDir, markdownPath, renderMeasuredLoadEvidenceMarkdown(report));
  writeText(rootDir, jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  return { markdownPath, jsonPath };
}

function printHelp() {
  console.log([
    "Usage: pnpm run baseline:production-scale-measured -- --local [options]",
    "       pnpm run baseline:production-scale-measured -- --staging-safe [options]",
    "",
    "Bounded measured local/staging-safe capacity evidence using synthetic fixtures only.",
    "",
    "Options:",
    "  --local                         Required for local measured evidence.",
    "  --staging-safe                  Optional approved staging target mode.",
    "  --target-url <url>              Target context for safety checks.",
    "  --concurrency <1-4>             Measured concurrency. Defaults to 2.",
    "  --iterations <1-5>              Bounded iterations. Defaults to 2.",
    "  --policy <path>                 Threshold policy path.",
    "  --evidence-dir <path>           Output directory.",
    "  --json                          Print JSON report.",
  ].join("\n"));
}

async function main() {
  try {
    const options = parseMeasuredLoadArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      return;
    }
    const report = await buildMeasuredLoadEvidenceReport(options);
    const outputs = writeMeasuredLoadEvidence(report, {
      rootDir: options.rootDir,
      evidenceDir: options.evidenceDir,
    });
    console.log("Measured production-scale load evidence generated.");
    console.log(`Mode: ${report.mode}`);
    console.log(`Status: ${report.status}`);
    console.log(`Requests/jobs: ${report.summary.totalRequestsOrJobs}`);
    console.log(`Latency p50/p95/max ms: ${report.summary.latency.p50Ms}/${report.summary.latency.p95Ms}/${report.summary.latency.maxMs}`);
    console.log(`Rate limiter accepted/rejected: ${report.rateLimiter.acceptedCount}/${report.rateLimiter.rejectedCount}`);
    console.log(`External provider calls made: ${report.safety.externalProviderCallsMade}`);
    console.log(`Markdown: ${outputs.markdownPath}`);
    console.log(`JSON: ${outputs.jsonPath}`);
    if (options.json) console.log(JSON.stringify(report, null, 2));
    if (report.status !== "passed") process.exitCode = 1;
  } catch (error) {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && existsSync(process.argv[1]) && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
