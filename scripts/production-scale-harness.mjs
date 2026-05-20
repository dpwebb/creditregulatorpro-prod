import { fileURLToPath } from "node:url";

export const DEFAULT_PRODUCTION_SCALE_TARGET_URL = "http://localhost:3333";
export const DEFAULT_PRODUCTION_SCALE_CONCURRENCY = 2;
export const MAX_PRODUCTION_SCALE_CONCURRENCY = 4;
export const DEFAULT_PRODUCTION_SCALE_ITERATIONS = 1;
export const MAX_PRODUCTION_SCALE_ITERATIONS = 5;

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
      "pnpm run baseline:production-scale-local -- --dry-run",
      "pnpm run ingest:worker -- --dry-run --max-jobs 1 --concurrency 1",
    ],
  },
  {
    key: "ingestWorkerBoundedConcurrency",
    title: "Ingest worker bounded concurrency",
    evidence: [
      "Worker concurrency remains one unless a later safe concurrency task explicitly changes it.",
      "Harness self-check verifies its own bounded concurrency scheduler does not exceed the configured cap.",
    ],
    commands: ["pnpm run ingest:worker -- --dry-run --max-jobs 1 --concurrency 1"],
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
      "Plan repeated packet PDF downloads against a fixture packet to prove cache reuse.",
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

export function parseProductionScaleHarnessArgs(args, env = process.env) {
  const options = {
    dryRun: true,
    json: false,
    targetUrl: env.CRP_PRODUCTION_SCALE_HARNESS_TARGET_URL ?? DEFAULT_PRODUCTION_SCALE_TARGET_URL,
    maxConcurrency: DEFAULT_PRODUCTION_SCALE_CONCURRENCY,
    iterations: DEFAULT_PRODUCTION_SCALE_ITERATIONS,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
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
    if (arg === "--apply" || arg === "--execute" || arg === "--run") {
      fail(`${arg} is intentionally unsupported. This harness is dry-run and non-mutating only.`);
    }
    fail(`Unknown option: ${arg}`);
  }

  const target = classifyProductionScaleTarget(options.targetUrl);
  if (!target.ok) fail(target.reason);

  return {
    ...options,
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
  return {
    CRP_DB_POOL_MAX: env.CRP_DB_POOL_MAX ?? "default",
    CRP_DB_IDLE_TIMEOUT_SECONDS: env.CRP_DB_IDLE_TIMEOUT_SECONDS ?? "default",
    CRP_SESSION_TOUCH_INTERVAL_SECONDS: env.CRP_SESSION_TOUCH_INTERVAL_SECONDS ?? "default",
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
      dryRunDefault: true,
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

export async function runProductionScaleHarness(config, dependencies = {}) {
  const target = classifyProductionScaleTarget(config.targetUrl);
  if (!target.ok) fail(target.reason);
  if (config.dryRun !== true) {
    fail("Production-scale harness execution is dry-run only and refuses mutation.");
  }
  return buildProductionScaleHarnessReport({
    ...config,
    targetHost: config.targetHost ?? target.host,
    targetEnvironment: config.targetEnvironment ?? target.environment,
  }, dependencies);
}

function printHelp() {
  console.log([
    "Usage: pnpm run baseline:production-scale-local -- [options]",
    "",
    "Dry-run, non-mutating production-scale evidence harness. No production execution is supported.",
    "",
    "Options:",
    "  --dry-run                         Default. Build the local/staging-safe evidence plan and bounded-concurrency self-check.",
    "  --target-url <url>                Target context for the plan. Defaults to http://localhost:3333.",
    "  --max-concurrency <1-4>           Harness concurrency cap. Defaults to 2.",
    "  --iterations <1-5>                Planned bounded iterations. Defaults to 1.",
    "  --json                           Print JSON report.",
    "",
    "Safety:",
    "  - Production hosts are refused.",
    "  - Unknown hosts fail closed.",
    "  - Mutating execution flags are rejected.",
    "  - External provider calls are not allowed or made.",
  ].join("\n"));
}

function renderHumanReport(report) {
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
    console.log(options.json ? JSON.stringify(report, null, 2) : renderHumanReport(report));
  } catch (error) {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
