import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

export const DEFAULT_PRODUCTION_SCALE_TARGET_URL = "http://localhost:3333";
export const DEFAULT_PRODUCTION_SCALE_CONCURRENCY = 2;
export const MAX_PRODUCTION_SCALE_CONCURRENCY = 4;
export const DEFAULT_PRODUCTION_SCALE_ITERATIONS = 1;
export const MAX_PRODUCTION_SCALE_ITERATIONS = 5;
export const DEFAULT_LOAD_EVIDENCE_DIR = "docs/production-scale/evidence";

export const REFUSED_PRODUCTION_SCALE_HOSTS = new Set([
  "creditregulatorpro.com",
  "www.creditregulatorpro.com",
  "app.creditregulatorpro.com",
  "prod.creditregulatorpro.com",
  "production.creditregulatorpro.com",
]);

export const ALLOWED_PRODUCTION_SCALE_STAGING_HOSTS = new Set(["staging.creditregulatorpro.com"]);
export const ALLOWED_PRODUCTION_SCALE_LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export const EXTERNAL_PROVIDER_DENYLIST = [
  "postgrid",
  "stripe",
  "email",
  "smtp",
  "imap",
  "gmail",
  "slack",
  "webhook",
  "sms",
  "gcs-signed-url",
];

export const REQUIRED_PRODUCTION_SCALE_SECTION_KEYS = [
  "concurrentAuthenticatedUploadProcessEnqueue",
  "ingestWorkerBoundedConcurrency",
  "ocrFallbackPath",
  "packetCreateBuildBoundedLoad",
  "packetPdfCacheRepeatedDownload",
  "responseQueueOperations",
  "operatorDashboardReadLatency",
  "dbPoolConfigVisibility",
  "failureDeadLetterBehavior",
];

const PRODUCTION_ENV_KEYS = ["NODE_ENV", "CRP_ENV", "FLOOT_ENV", "APP_ENV", "VERCEL_ENV", "DEPLOYMENT_ENV", "ENVIRONMENT"];
const PRODUCTION_SECRET_KEYS = ["FLOOT_DATABASE_URL", "DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "CRP_DATABASE_URL"];
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

const PRODUCTION_SCALE_SECTIONS = [
  {
    key: "concurrentAuthenticatedUploadProcessEnqueue",
    title: "Concurrent authenticated upload/process enqueue behavior",
    evidence: [
      "Plan bounded authenticated report upload and process enqueue attempts against local or staging fixtures only.",
      "Verify duplicate process requests collapse through active ingest idempotency before worker execution.",
      "Do not send report bytes in dry-run mode.",
    ],
    commands: [
      "pnpm run baseline:production-scale-local -- --simulated",
      "pnpm run ingest:worker --dry-run --max-jobs 1 --concurrency 1",
    ],
  },
  {
    key: "ingestWorkerBoundedConcurrency",
    title: "Ingest worker bounded concurrency",
    evidence: [
      "Worker concurrency remains one unless a later safe concurrency task explicitly changes it.",
      "Harness self-check verifies its own bounded concurrency scheduler does not exceed the configured cap.",
    ],
    commands: ["pnpm run ingest:worker --dry-run --max-jobs 1 --concurrency 1"],
  },
  {
    key: "ocrFallbackPath",
    title: "OCR fallback path",
    evidence: [
      "Report scanned/image-only handling as a separate fixture-backed local or staging check when OCR fixtures are available.",
      "Dry-run mode records the planned check without sending raw PDF bytes or extracted text.",
    ],
    commands: ["pnpm run test:deterministic-ingestion-report"],
  },
  {
    key: "packetCreateBuildBoundedLoad",
    title: "Packet creation/build under bounded load",
    evidence: [
      "Plan bounded packet readiness/build/create checks against seeded local or staging fixtures.",
      "Keep packet wording, readiness, violation, and evidence behavior under existing endpoint tests.",
    ],
    commands: ["pnpm exec vitest run --config vitest.config.ts tests/api/packet-lifecycle-endpoint.spec.ts"],
  },
  {
    key: "packetPdfCacheRepeatedDownload",
    title: "Packet PDF cache repeated download behavior",
    evidence: [
      "SIMULATED cache-miss evidence records miss/hit counts and render timing only.",
      "Do not call mail providers or delivery routes from this harness.",
    ],
    commands: ["pnpm exec vitest run --config vitest.config.ts tests/unit/packet-pdf-cache.spec.ts"],
  },
  {
    key: "responseQueueOperations",
    title: "Response queue operations",
    evidence: [
      "Use existing bounded response queue load/soak checks for duplicate collapse, retry, dead-letter, stale-running, and cleanup evidence.",
      "Queue payloads remain sanitized and no live mailbox integration is used.",
    ],
    commands: ["pnpm run response:soak-check"],
  },
  {
    key: "operatorDashboardReadLatency",
    title: "Operator dashboard read latency",
    evidence: [
      "Plan repeated read-only operator dashboard runs and record elapsed time.",
      "Dashboard reads must not create data or call external providers.",
    ],
    commands: ["pnpm run operator:dashboard"],
  },
  {
    key: "dbPoolConfigVisibility",
    title: "DB pool config visibility",
    evidence: [
      "Report configured pool max, idle timeout, and session touch interval from environment-visible settings.",
      "No database schema or query behavior is changed by this harness.",
    ],
    commands: ["pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-tuning-config.spec.ts"],
  },
  {
    key: "failureDeadLetterBehavior",
    title: "Failure/dead-letter behavior",
    evidence: [
      "Plan bounded ingest and response failure/dead-letter checks using synthetic fixtures only.",
      "Failures must remain visible through queue events and operator dashboard metrics without raw text or bytes.",
    ],
    commands: [
      "pnpm exec vitest run --config vitest.config.ts tests/api/ingest-processing-queue.spec.ts",
      "pnpm exec vitest run --config vitest.config.ts tests/api/response-processing-queue.spec.ts",
    ],
  },
];

function fail(message) {
  throw new Error(message);
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

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
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

function normalizeHost(hostname) {
  return String(hostname ?? "").trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
}

export function classifyProductionScaleTarget(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl ?? "").trim());
  } catch {
    return { ok: false, reason: "Invalid production-scale harness target URL." };
  }

  const host = normalizeHost(parsed.hostname);
  if (REFUSED_PRODUCTION_SCALE_HOSTS.has(host)) {
    return { ok: false, reason: `Refusing production-scale harness against production host ${host}.` };
  }

  if (ALLOWED_PRODUCTION_SCALE_LOCAL_HOSTS.has(host)) {
    return { ok: true, host, environment: "local" };
  }

  if (ALLOWED_PRODUCTION_SCALE_STAGING_HOSTS.has(host)) {
    if (parsed.protocol !== "https:") {
      return { ok: false, reason: `Refusing staging target ${host} without https.` };
    }
    return { ok: true, host, environment: "staging" };
  }

  return { ok: false, reason: `Refusing production-scale harness against unapproved host ${host || "unknown"}.` };
}

export function detectProductionScaleEnvironment(env = process.env) {
  for (const key of PRODUCTION_ENV_KEYS) {
    const value = String(env[key] ?? "").trim().toLowerCase();
    if (value === "production" || value === "prod" || value.includes("production")) {
      return { productionLike: true, reason: `${key} indicates a production environment.` };
    }
  }
  for (const key of PRODUCTION_SECRET_KEYS) {
    const value = String(env[key] ?? "").trim().toLowerCase();
    if (!value) continue;
    if (value.includes("creditregulatorpro-prod") || value.includes("production") || value.includes("/prod") || value.includes("prod.")) {
      return { productionLike: true, reason: `${key} appears to reference a production database target.` };
    }
  }
  return { productionLike: false, reason: "" };
}

export function detectLiveProviderFlags(env = process.env) {
  const enabledFlags = [];
  for (const key of LIVE_PROVIDER_FLAG_KEYS) {
    const value = String(env[key] ?? "").trim().toLowerCase();
    if (["1", "true", "yes", "on", "enabled"].includes(value)) enabledFlags.push(key);
  }
  return {
    enabled: enabledFlags.length > 0,
    enabledFlags,
  };
}

export function parseProductionScaleHarnessArgs(args, env = process.env) {
  const options = {
    dryRun: false,
    simulated: false,
    localSafetyFlag: false,
    explicitSafetyFlag: false,
    json: false,
    targetUrl: env.CRP_PRODUCTION_SCALE_HARNESS_TARGET_URL ?? DEFAULT_PRODUCTION_SCALE_TARGET_URL,
    maxConcurrency: DEFAULT_PRODUCTION_SCALE_CONCURRENCY,
    iterations: DEFAULT_PRODUCTION_SCALE_ITERATIONS,
    rootDir: process.cwd(),
    evidenceDir: DEFAULT_LOAD_EVIDENCE_DIR,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      options.explicitSafetyFlag = true;
      continue;
    }
    if (arg === "--simulated") {
      options.simulated = true;
      options.explicitSafetyFlag = true;
      continue;
    }
    if (arg === "--local") {
      options.localSafetyFlag = true;
      options.simulated = true;
      options.explicitSafetyFlag = true;
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
    if (arg === "--max-concurrency" || arg === "--concurrency") {
      options.maxConcurrency = parseBoundedInteger(
        nextValue(args, index, arg),
        DEFAULT_PRODUCTION_SCALE_CONCURRENCY,
        arg,
        1,
        MAX_PRODUCTION_SCALE_CONCURRENCY,
      );
      index += 1;
      continue;
    }
    if (arg === "--iterations") {
      options.iterations = parseBoundedInteger(
        nextValue(args, index, arg),
        DEFAULT_PRODUCTION_SCALE_ITERATIONS,
        arg,
        1,
        MAX_PRODUCTION_SCALE_ITERATIONS,
      );
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
    if (arg === "--apply" || arg === "--execute" || arg === "--run") {
      fail(`${arg} is intentionally unsupported. This harness is dry-run or SIMULATED local evidence only.`);
    }
    fail(`Unknown option: ${arg}`);
  }

  if (!options.explicitSafetyFlag) {
    fail("Refusing production-scale harness without an explicit safety flag such as --simulated, --local, or --dry-run.");
  }
  if (options.dryRun && options.simulated) {
    fail("Choose either --dry-run or --simulated, not both.");
  }

  const productionEnvironment = detectProductionScaleEnvironment(env);
  if (productionEnvironment.productionLike) {
    fail(`Refusing production-scale harness in a production-like environment: ${productionEnvironment.reason}`);
  }

  const liveProviderFlags = detectLiveProviderFlags(env);
  if (liveProviderFlags.enabled) {
    fail(`Refusing production-scale harness because live provider flag(s) are enabled: ${liveProviderFlags.enabledFlags.join(", ")}.`);
  }

  const target = classifyProductionScaleTarget(options.targetUrl);
  if (!target.ok) fail(target.reason);

  return {
    ...options,
    mode: options.simulated ? "simulated" : "dry-run",
    targetHost: target.host,
    targetEnvironment: target.environment,
  };
}

export async function runBoundedConcurrency(taskFactories, concurrency) {
  const limit = parseBoundedInteger(
    String(concurrency),
    DEFAULT_PRODUCTION_SCALE_CONCURRENCY,
    "concurrency",
    1,
    MAX_PRODUCTION_SCALE_CONCURRENCY,
  );
  const tasks = Array.isArray(taskFactories) ? taskFactories : [];
  const results = new Array(tasks.length);
  let nextIndex = 0;
  let active = 0;
  let observedMaxConcurrency = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      active += 1;
      observedMaxConcurrency = Math.max(observedMaxConcurrency, active);
      try {
        results[currentIndex] = await tasks[currentIndex]();
      } finally {
        active -= 1;
      }
    }
  }

  const workerCount = Math.min(limit, tasks.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return {
    results,
    observedMaxConcurrency,
    configuredMaxConcurrency: limit,
  };
}

function buildSectionReport(section, config) {
  return {
    ...section,
    status: "planned_dry_run",
    targetEnvironment: config.targetEnvironment,
    mutationAllowed: false,
    externalProviderCallsAllowed: false,
    rawReportBytesSent: false,
    rawExtractedTextStored: false,
    maxConcurrency: config.maxConcurrency,
    iterations: config.iterations,
  };
}

function readDbPoolConfig(env) {
  const parse = (name, defaultValue, min, max) => {
    const raw = env[name];
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : defaultValue;
  };
  return {
    max: parse("CRP_DB_POOL_MAX", 3, 1, 100),
    idleTimeoutSeconds: parse("CRP_DB_IDLE_TIMEOUT_SECONDS", 10, 1, 3600),
    sessionTouchIntervalSeconds: parse("CRP_SESSION_TOUCH_INTERVAL_SECONDS", 300, 1, 86400),
    source: "environment-or-safe-default",
  };
}

export async function buildProductionScaleHarnessReport(config, dependencies = {}) {
  const taskCount = Math.max(config.maxConcurrency * 2, 1);
  const tasks = Array.from({ length: taskCount }, (_, index) => async () => ({ index, status: "ok" }));
  const selfCheck = await runBoundedConcurrency(tasks, config.maxConcurrency);
  const observedLimitRespected = selfCheck.observedMaxConcurrency <= config.maxConcurrency;

  return {
    harness: "production-scale-load-harness",
    script: "scripts/production-scale-harness.mjs",
    generatedAt: new Date().toISOString(),
    mode: "dry-run",
    evidenceType: "DRY_RUN_PLAN",
    target: {
      url: config.targetUrl,
      host: config.targetHost,
      environment: config.targetEnvironment,
    },
    bounds: {
      maxConcurrency: config.maxConcurrency,
      iterations: config.iterations,
      totalSyntheticSelfCheckTasks: taskCount,
    },
    safety: {
      explicitSafetyFlagRequired: true,
      dryRunDefault: false,
      mutationExecutionSupported: false,
      productionMutationRefused: true,
      productionHostsRefused: Array.from(REFUSED_PRODUCTION_SCALE_HOSTS).sort(),
      failClosedForUnknownHosts: true,
      runtimeMutationRequestsSent: 0,
      rawReportBytesSent: false,
      rawExtractedTextStored: false,
      externalProviderCallsAllowed: false,
      externalProviderCallsMade: 0,
      externalProviderDenylist: EXTERNAL_PROVIDER_DENYLIST,
    },
    dbPoolConfigVisibility: readDbPoolConfig(dependencies.env ?? process.env),
    selfChecks: {
      boundedConcurrency: {
        status: observedLimitRespected ? "passed" : "failed",
        configuredMaxConcurrency: selfCheck.configuredMaxConcurrency,
        observedMaxConcurrency: selfCheck.observedMaxConcurrency,
        taskCount,
      },
      externalProviderCalls: {
        status: "passed",
        callsMade: 0,
      },
    },
    testedDomains: PRODUCTION_SCALE_SECTIONS.map((section) => section.title),
    sections: PRODUCTION_SCALE_SECTIONS.map((section) => buildSectionReport(section, config)),
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

export function simulateRateLimitPressure({
  attempts = 12,
  maxAttempts = 5,
  identifier = "SIMULATED_RATE_LIMIT_SUBJECT",
} = {}) {
  const totalAttempts = parseBoundedInteger(String(attempts), 12, "attempts", 1, 100);
  const cappedMaxAttempts = parseBoundedInteger(String(maxAttempts), 5, "maxAttempts", 1, 100);
  let accepted = 0;
  let rejected = 0;
  const decisions = [];

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    const allowed = attempt <= cappedMaxAttempts;
    if (allowed) accepted += 1;
    else rejected += 1;
    decisions.push({
      attempt,
      allowed,
      remaining: allowed ? cappedMaxAttempts - attempt : 0,
    });
  }

  return {
    evidenceType: "SIMULATED",
    identifier,
    action: "SIMULATED_PRODUCTION_SCALE_RATE_LIMIT",
    attempts: totalAttempts,
    maxAttempts: cappedMaxAttempts,
    acceptedCount: accepted,
    rejectedCount: rejected,
    simulatedWritePressureEvents: totalAttempts,
    realTrafficSent: false,
    databaseMutated: false,
    decisions,
  };
}

async function simulatePacketPdfCacheLoad(config) {
  const uniquePacketCount = Math.max(1, config.iterations);
  const downloadsPerPacket = Math.max(2, config.maxConcurrency + 1);
  const cache = new Set();
  const renderTimings = [];
  let hitCount = 0;
  let missCount = 0;

  for (let packetIndex = 0; packetIndex < uniquePacketCount; packetIndex += 1) {
    const cacheKey = `SIMULATED_PACKET_PDF_CACHE_KEY_${packetIndex}`;
    for (let download = 0; download < downloadsPerPacket; download += 1) {
      if (cache.has(cacheKey)) {
        hitCount += 1;
        continue;
      }
      missCount += 1;
      const renderStarted = performance.now();
      await sleep(6 + packetIndex);
      renderTimings.push(performance.now() - renderStarted);
      cache.add(cacheKey);
    }
  }

  return {
    evidenceType: "SIMULATED",
    label: "Packet PDF cache-miss capacity evidence only; this is not a queue/envelope fix.",
    totalPdfRequests: uniquePacketCount * downloadsPerPacket,
    uniquePacketCount,
    downloadsPerPacket,
    cacheHitCount: hitCount,
    cacheMissCount: missCount,
    cacheMissRenderTiming: latencyStats(renderTimings),
    queueOrEnvelopeImplemented: false,
    packetPdfBehaviorChanged: false,
    liveDeliveryRoutesCalled: false,
  };
}

function dashboardWarningSummary(report) {
  if (!report?.summary) {
    return {
      available: false,
      warningCount: null,
      openCount: null,
      failCount: null,
      skipCount: null,
    };
  }
  return {
    available: true,
    warningCount: Number(report.summary.open ?? 0) + Number(report.summary.fail ?? 0),
    openCount: Number(report.summary.open ?? 0),
    failCount: Number(report.summary.fail ?? 0),
    skipCount: Number(report.summary.skip ?? 0),
  };
}

export async function buildSimulatedProductionScaleLoadEvidence(config, dependencies = {}) {
  const generatedAt = dependencies.generatedAt ?? new Date().toISOString();
  const rootDir = config.rootDir ?? process.cwd();
  const env = dependencies.env ?? process.env;
  const requestCount = Math.max(config.maxConcurrency * config.iterations * 4, 1);
  const queueJobCount = Math.max(config.maxConcurrency * config.iterations * 2, 1);
  const plannedLatencies = [7, 11, 5, 13, 17, 9, 19, 23, 15, 21];
  const taskFactories = Array.from({ length: requestCount }, (_, index) => async () => {
    const started = performance.now();
    await sleep(plannedLatencies[index % plannedLatencies.length]);
    return {
      index,
      status: "ok",
      latencyMs: performance.now() - started,
    };
  });

  const elapsedStarted = performance.now();
  const concurrencyResult = await runBoundedConcurrency(taskFactories, config.maxConcurrency);
  const elapsedMs = performance.now() - elapsedStarted;
  const requestLatencies = concurrencyResult.results.map((result) => result.latencyMs);
  const rateLimit = simulateRateLimitPressure({
    attempts: Math.max(config.maxConcurrency * config.iterations * 4, 8),
    maxAttempts: Math.max(2, config.maxConcurrency),
  });
  const packetPdf = await simulatePacketPdfCacheLoad(config);
  const dbPoolConfig = readDbPoolConfig(env);
  const dashboardBefore = dashboardWarningSummary(dependencies.dashboardBefore);
  const dashboardAfter = dashboardWarningSummary(dependencies.dashboardAfter);

  const totalSyntheticRequestsOrJobs =
    requestCount + queueJobCount + packetPdf.totalPdfRequests + rateLimit.attempts;

  const report = {
    reportName: "production-scale-load-simulated",
    evidenceType: "SIMULATED",
    generatedAt,
    branch: safeGit(["branch", "--show-current"], rootDir),
    commit: safeGit(["rev-parse", "HEAD"], rootDir),
    mode: "simulated-local",
    target: {
      url: config.targetUrl,
      host: config.targetHost,
      environment: config.targetEnvironment,
      networkRequestsMade: 0,
    },
    warning: "SIMULATED local load evidence is not repeated target-environment production-scale proof.",
    status: "passed",
    summary: {
      totalSyntheticRequestsOrJobs,
      syntheticRequestCount: requestCount,
      syntheticQueueJobCount: queueJobCount,
      concurrencyLevel: config.maxConcurrency,
      iterations: config.iterations,
      elapsedMs: Number(elapsedMs.toFixed(2)),
      throughputPerSecond: Number((requestCount / Math.max(elapsedMs / 1000, 0.001)).toFixed(2)),
      latency: latencyStats(requestLatencies),
    },
    ingestQueueDepth: {
      evidenceType: "SIMULATED",
      available: true,
      source: "synthetic in-memory queue scope",
      before: {
        total: queueJobCount,
        queued: queueJobCount,
        running: 0,
        succeeded: 0,
        failed: 0,
        deadLettered: 0,
      },
      after: {
        total: queueJobCount,
        queued: 0,
        running: 0,
        succeeded: queueJobCount,
        failed: 0,
        deadLettered: 0,
      },
      staleQueuedJobsRemaining: 0,
    },
    packetPdfCache: packetPdf,
    dbPool: {
      evidenceType: "SIMULATED",
      configuredMax: dbPoolConfig.max,
      idleTimeoutSeconds: dbPoolConfig.idleTimeoutSeconds,
      sessionTouchIntervalSeconds: dbPoolConfig.sessionTouchIntervalSeconds,
      observedActiveConnections: null,
      observedOpenConnections: null,
      observedBorrowedConnections: concurrencyResult.observedMaxConcurrency,
      observedSignalAvailable: true,
      signalSource: "SIMULATED in-process bounded worker borrowing; no database was stressed.",
    },
    rateLimiter: rateLimit,
    dashboardWarnings: {
      before: dashboardBefore,
      after: dashboardAfter,
      source: dashboardBefore.available || dashboardAfter.available
        ? "provided dashboard reports"
        : "not collected by harness; run pnpm run operator:dashboard for live dashboard state",
    },
    safety: {
      productionMutationForbidden: true,
      productionDataMutated: false,
      productionDatabaseTargeted: false,
      realConsumerPiiUsed: false,
      realCreditReportsProcessed: false,
      rawReportBytesSent: false,
      liveExternalProvidersConnected: false,
      externalProviderCallsMade: 0,
      mailDeliveryRoutesCalled: false,
      parserBehaviorChanged: false,
      ocrBehaviorChanged: false,
      packetWordingChanged: false,
      packetPdfBehaviorChanged: false,
      packetPdfQueueingImplemented: false,
      violationLogicChanged: false,
      storageBehaviorChanged: false,
      responseQueueSemanticsChanged: false,
      retentionBehaviorChanged: false,
      deploymentActivationChanged: false,
      productionScaleReadinessClaimed: false,
    },
    blockers: {
      blocker3LoadConcurrency: "SIMULATED evidence only; repeated local/staging measured proof remains required.",
      blocker4PacketPdfScaling: "Cache-miss timing evidence captured; packet PDF queue/envelope fix is not implemented.",
      blocker16DbPoolPressure: "SIMULATED pool signal only; staging DB pool pressure evidence remains required.",
      blocker17RateLimiterWritePressure: "SIMULATED pressure only; no real abusive traffic or production DB writes.",
    },
  };

  const validation = validateSimulatedLoadEvidenceReport(report);
  if (!validation.ok) {
    throw new Error(`SIMULATED load evidence validation failed: ${validation.errors.join("; ")}`);
  }

  return {
    ...report,
    validation,
  };
}

export function validateSimulatedLoadEvidenceReport(report) {
  const errors = [];
  if (report.evidenceType !== "SIMULATED") errors.push("report evidenceType must be SIMULATED");
  if (report.safety?.productionDataMutated !== false) errors.push("production data must not be mutated");
  if (report.safety?.liveExternalProvidersConnected !== false) errors.push("live external providers must not be connected");
  if (report.safety?.externalProviderCallsMade !== 0) errors.push("external provider call count must be zero");
  if (report.safety?.packetPdfQueueingImplemented !== false) errors.push("packet PDF queueing must not be implemented by this harness");
  if (!report.summary || report.summary.totalSyntheticRequestsOrJobs <= 0) errors.push("synthetic request/job count is missing");
  if (!report.summary?.latency || report.summary.latency.maxMs < report.summary.latency.p50Ms) errors.push("latency metrics are invalid");
  if (report.packetPdfCache?.cacheMissCount < 1) errors.push("packet PDF cache miss count is missing");
  if (report.packetPdfCache?.queueOrEnvelopeImplemented !== false) errors.push("cache-miss proof must not be represented as a fix");
  if (report.rateLimiter?.acceptedCount < 1 || report.rateLimiter?.rejectedCount < 1) errors.push("rate-limit accepted/rejected counts are missing");
  if (report.ingestQueueDepth?.after?.queued !== 0) errors.push("synthetic queue was not drained");
  return { ok: errors.length === 0, errors };
}

export function renderSimulatedLoadEvidenceMarkdown(report) {
  const lines = [
    "# SIMULATED Production-Scale Load Evidence",
    "",
    "SIMULATED local evidence only. This is not repeated target-environment production-scale proof and does not claim production-at-scale readiness.",
    "",
    `Generated at: ${report.generatedAt}`,
    `Branch: \`${report.branch}\``,
    `Commit: \`${report.commit}\``,
    `Target context: ${report.target.host} (${report.target.environment})`,
    `Status: ${report.status}`,
    "",
    "## Summary",
    "",
    `- Total synthetic requests/jobs: ${report.summary.totalSyntheticRequestsOrJobs}`,
    `- Synthetic request count: ${report.summary.syntheticRequestCount}`,
    `- Synthetic queue job count: ${report.summary.syntheticQueueJobCount}`,
    `- Concurrency level: ${report.summary.concurrencyLevel}`,
    `- Iterations: ${report.summary.iterations}`,
    `- Elapsed ms: ${report.summary.elapsedMs}`,
    `- Throughput/sec: ${report.summary.throughputPerSecond}`,
    `- Latency p50/p95/max ms: ${report.summary.latency.p50Ms}/${report.summary.latency.p95Ms}/${report.summary.latency.maxMs}`,
    "",
    "## Ingest Queue Depth",
    "",
    `- SIMULATED before: total=${report.ingestQueueDepth.before.total}, queued=${report.ingestQueueDepth.before.queued}`,
    `- SIMULATED after: total=${report.ingestQueueDepth.after.total}, queued=${report.ingestQueueDepth.after.queued}, succeeded=${report.ingestQueueDepth.after.succeeded}`,
    `- Stale queued jobs remaining: ${report.ingestQueueDepth.staleQueuedJobsRemaining}`,
    "",
    "## Packet PDF Cache",
    "",
    `- Cache hits: ${report.packetPdfCache.cacheHitCount}`,
    `- Cache misses: ${report.packetPdfCache.cacheMissCount}`,
    `- Cache-miss render timing p50/p95/max ms: ${report.packetPdfCache.cacheMissRenderTiming.p50Ms}/${report.packetPdfCache.cacheMissRenderTiming.p95Ms}/${report.packetPdfCache.cacheMissRenderTiming.maxMs}`,
    "- Packet PDF queue/envelope implemented by this task: no",
    "",
    "## DB Pool Signal",
    "",
    `- Configured max: ${report.dbPool.configuredMax}`,
    `- Observed active connections: ${report.dbPool.observedActiveConnections ?? "not available"}`,
    `- Observed open connections: ${report.dbPool.observedOpenConnections ?? "not available"}`,
    `- Observed borrowed signal: ${report.dbPool.observedBorrowedConnections}`,
    `- Signal source: ${report.dbPool.signalSource}`,
    "",
    "## Rate Limiter Pressure",
    "",
    `- SIMULATED attempts: ${report.rateLimiter.attempts}`,
    `- Accepted: ${report.rateLimiter.acceptedCount}`,
    `- Rejected: ${report.rateLimiter.rejectedCount}`,
    "- Real abusive traffic sent: no",
    "- Database mutated: no",
    "",
    "## Dashboard Warnings",
    "",
    `- Before available: ${report.dashboardWarnings.before.available ? "yes" : "no"}`,
    `- After available: ${report.dashboardWarnings.after.available ? "yes" : "no"}`,
    `- Source: ${report.dashboardWarnings.source}`,
    "",
    "## Safety",
    "",
    "- Production data mutated: no",
    "- Production database targeted: no",
    "- Real consumer PII used: no",
    "- Real credit reports processed: no",
    "- Live external providers connected: no",
    "- External provider calls made: 0",
    "- Parser, OCR, packet wording, packet PDF behavior, violation logic, storage behavior, response queue semantics, retention behavior, and deployment activation changed: no",
    "- Production-at-scale readiness claimed: no",
    "",
    "## Remaining Blockers",
    "",
    `- Blocker 3: ${report.blockers.blocker3LoadConcurrency}`,
    `- Blocker 4: ${report.blockers.blocker4PacketPdfScaling}`,
    `- Blocker 16: ${report.blockers.blocker16DbPoolPressure}`,
    `- Blocker 17: ${report.blockers.blocker17RateLimiterWritePressure}`,
  ];
  return `${lines.join("\n")}\n`;
}

export function writeSimulatedLoadEvidence(report, {
  rootDir = process.cwd(),
  evidenceDir = DEFAULT_LOAD_EVIDENCE_DIR,
} = {}) {
  const absoluteEvidenceDir = repoPath(rootDir, evidenceDir);
  mkdirSync(absoluteEvidenceDir, { recursive: true });
  const markdownPath = normalizeRelativePath(path.join(evidenceDir, "latest-load-simulated.md"));
  const jsonPath = normalizeRelativePath(path.join(evidenceDir, "latest-load-simulated.json"));
  writeFileSync(repoPath(rootDir, markdownPath), renderSimulatedLoadEvidenceMarkdown(report), "utf8");
  writeFileSync(repoPath(rootDir, jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { markdownPath, jsonPath };
}

export async function runProductionScaleHarness(config, dependencies = {}) {
  const target = classifyProductionScaleTarget(config.targetUrl);
  if (!target.ok) fail(target.reason);
  if (config.simulated === true) {
    return buildSimulatedProductionScaleLoadEvidence({
      ...config,
      targetHost: config.targetHost ?? target.host,
      targetEnvironment: config.targetEnvironment ?? target.environment,
    }, dependencies);
  }
  if (config.dryRun !== true) {
    fail("Production-scale harness requires explicit --simulated or --dry-run and refuses mutation.");
  }
  return buildProductionScaleHarnessReport({
    ...config,
    targetHost: config.targetHost ?? target.host,
    targetEnvironment: config.targetEnvironment ?? target.environment,
  }, dependencies);
}

function printHelp() {
  console.log([
    "Usage: pnpm run baseline:production-scale-local -- --simulated [options]",
    "",
    "SIMULATED local production-scale evidence harness. No production execution is supported.",
    "",
    "Options:",
    "  --simulated                      Generate bounded SIMULATED load evidence and write docs/production-scale/evidence/latest-load-simulated.{md,json}.",
    "  --dry-run                        Build the local/staging-safe evidence plan and bounded-concurrency self-check.",
    "  --local                          Alias for --simulated with local safety intent.",
    "  --target-url <url>               Target context for safety checks. Defaults to http://localhost:3333.",
    "  --max-concurrency <1-4>          Harness concurrency cap. Defaults to 2.",
    "  --iterations <1-5>               Bounded iterations. Defaults to 1.",
    "  --evidence-dir <path>            Output directory. Defaults to docs/production-scale/evidence.",
    "  --json                           Print JSON report.",
    "",
    "Safety:",
    "  - An explicit safety flag is required.",
    "  - Production-looking environments and DB URLs are refused.",
    "  - Production and unknown hosts fail closed.",
    "  - Live provider enablement flags are refused.",
    "  - Mutating execution flags are rejected.",
    "  - External provider calls are not allowed or made.",
  ].join("\n"));
}

function renderHumanReport(report) {
  if (report.evidenceType === "SIMULATED") {
    return [
      "SIMULATED production-scale load evidence generated.",
      "SIMULATED evidence is not production proof and does not claim production-at-scale readiness.",
      `Target context: ${report.target.host} (${report.target.environment})`,
      `Total synthetic requests/jobs: ${report.summary.totalSyntheticRequestsOrJobs}`,
      `Latency p50/p95/max ms: ${report.summary.latency.p50Ms}/${report.summary.latency.p95Ms}/${report.summary.latency.maxMs}`,
      `Packet PDF cache hits/misses: ${report.packetPdfCache.cacheHitCount}/${report.packetPdfCache.cacheMissCount}`,
      `Rate limiter accepted/rejected: ${report.rateLimiter.acceptedCount}/${report.rateLimiter.rejectedCount}`,
      `External provider calls made: ${report.safety.externalProviderCallsMade}`,
    ].join("\n");
  }

  const lines = [
    "Production-scale load/concurrency harness dry-run complete.",
    `Target: ${report.target.host} (${report.target.environment})`,
    `Bounds: concurrency ${report.bounds.maxConcurrency}, iterations ${report.bounds.iterations}`,
    `Production mutation refused: ${report.safety.productionMutationRefused ? "yes" : "no"}`,
    `External provider calls made: ${report.safety.externalProviderCallsMade}`,
    `Bounded concurrency self-check: ${report.selfChecks.boundedConcurrency.status} (observed ${report.selfChecks.boundedConcurrency.observedMaxConcurrency})`,
    "",
    "Reported domains:",
  ];
  for (const section of report.sections) {
    lines.push(`- ${section.title}: ${section.status}`);
  }
  return lines.join("\n");
}

async function main() {
  try {
    const options = parseProductionScaleHarnessArgs(process.argv.slice(2));
    const report = await runProductionScaleHarness(options);
    if (report.evidenceType === "SIMULATED") {
      const outputs = writeSimulatedLoadEvidence(report, {
        rootDir: options.rootDir,
        evidenceDir: options.evidenceDir,
      });
      console.log(renderHumanReport(report));
      console.log(`Markdown: ${outputs.markdownPath}`);
      console.log(`JSON: ${outputs.jsonPath}`);
      if (options.json) console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(options.json ? JSON.stringify(report, null, 2) : renderHumanReport(report));
  } catch (error) {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
