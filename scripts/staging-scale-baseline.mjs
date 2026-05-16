import { fileURLToPath } from "node:url";

const DEFAULT_STAGING_URL = "https://staging.creditregulatorpro.com";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_ITERATIONS = 3;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_DELAY_MS = 150;
const MAX_ITERATIONS = 10;
const MAX_CONCURRENCY = 5;

export const SCALE_BASELINE_GATE_ENV = "CRP_STAGING_SCALE_BASELINE";
export const SKIPPED_EXIT_CODE = 2;

export const REFUSED_PRODUCTION_HOSTS = new Set(["creditregulatorpro.com", "www.creditregulatorpro.com"]);
export const ALLOWED_STAGING_HOSTS = new Set(["staging.creditregulatorpro.com"]);
export const ALLOWED_LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export const SCALE_BASELINE_SCENARIOS = [
  {
    name: "public app shell",
    method: "HEAD",
    path: "/",
    acceptedStatuses: [200],
  },
  {
    name: "public login route",
    method: "GET",
    path: "/login",
    acceptedStatuses: [200],
  },
  {
    name: "auth session denial",
    method: "GET",
    path: "/_api/auth/session",
    acceptedStatuses: [401, 403],
  },
  {
    name: "upload contract invalid payload",
    method: "POST",
    path: "/_api/ingest/report",
    acceptedStatuses: [400, 401, 403],
    body: {},
  },
  {
    name: "admin mock lifecycle denial",
    method: "GET",
    path: "/_api/admin/mock-lifecycle/list?limit=1",
    acceptedStatuses: [401, 403],
  },
  {
    name: "runtime bridge mapping denial",
    method: "GET",
    path: "/_api/regulation-registry/runtime-bridge/list",
    acceptedStatuses: [401, 403],
  },
  {
    name: "advisory bridge report denial",
    method: "GET",
    path: "/_api/regulation-registry/advisory-bridge/report",
    acceptedStatuses: [401, 403],
  },
];

export const FORBIDDEN_SCALE_BASELINE_ENDPOINTS = [
  "/_api/regulation-registry/runtime-bridge/create",
  "/_api/regulation-registry/runtime-bridge/update-status",
  "/_api/regulation-registry/runtime-bridge/activate",
  "/_api/regulation-registry/runtime-bridge/activate-limited-runtime",
  "/_api/regulation-registry/reconciliation-candidates/create",
  "/_api/regulation-registry/reconciliation-candidates/update-status",
  "/_api/regulation-registry/review",
  "/_api/regulation-registry/mapping",
  "/_api/regulation-registry/deactivate",
  "/_api/regulation-registry/restore",
  "/_api/packet/validate-readiness",
  "/_api/packet/build",
  "/_api/packet/create",
  "/_api/violations/run",
  "/_api/parser/run",
  "/_api/ocr/run",
];

function normalizeBoolean(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) return null;
  return argv[index + 1] ?? null;
}

function normalizeBaseUrl(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed || DEFAULT_STAGING_URL;
}

function clampInteger(value, defaultValue, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function toAbsoluteUrl(baseUrl, path) {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function validateScaleBaselineTarget(baseUrl, options = {}) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return { ok: false, reason: "Invalid scale baseline target URL." };
  }

  const host = parsed.hostname.toLowerCase();
  if (REFUSED_PRODUCTION_HOSTS.has(host)) {
    return { ok: false, reason: `Refusing to run staging scale baseline against production host ${host}.` };
  }

  if (ALLOWED_STAGING_HOSTS.has(host)) {
    return { ok: true, host };
  }

  if (options.allowLocal === true && ALLOWED_LOCAL_HOSTS.has(host)) {
    return { ok: true, host };
  }

  return { ok: false, reason: `Refusing to run staging scale baseline against unapproved host ${host}.` };
}

export function parseArgs(argv, env = process.env) {
  const flags = new Set(argv);
  return {
    allowLocal: flags.has("--allow-local"),
    json: flags.has("--json"),
    baseUrl: normalizeBaseUrl(valueAfter(argv, "--base-url") ?? env.STAGING_BASE_URL ?? env.STAGING_APP_URL),
    timeoutMs: clampInteger(valueAfter(argv, "--timeout-ms") ?? env.STAGING_SCALE_BASELINE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1000, 60000),
    iterations: clampInteger(valueAfter(argv, "--iterations") ?? env.STAGING_SCALE_BASELINE_ITERATIONS, DEFAULT_ITERATIONS, 1, MAX_ITERATIONS),
    concurrency: clampInteger(valueAfter(argv, "--concurrency") ?? env.STAGING_SCALE_BASELINE_CONCURRENCY, DEFAULT_CONCURRENCY, 1, MAX_CONCURRENCY),
    delayMs: clampInteger(valueAfter(argv, "--delay-ms") ?? env.STAGING_SCALE_BASELINE_DELAY_MS, DEFAULT_DELAY_MS, 0, 5000),
  };
}

export function shouldRunScaleBaseline(env = process.env) {
  if (!normalizeBoolean(env[SCALE_BASELINE_GATE_ENV])) {
    return {
      ok: false,
      reason: `SKIPPED: ${SCALE_BASELINE_GATE_ENV}=true is required.`,
    };
  }
  return { ok: true };
}

export function assertSafeScenarioSet(scenarios = SCALE_BASELINE_SCENARIOS) {
  for (const scenario of scenarios) {
    if (FORBIDDEN_SCALE_BASELINE_ENDPOINTS.includes(scenario.path)) {
      throw new Error(`Scale baseline scenario uses forbidden endpoint ${scenario.path}.`);
    }
  }
}

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;
  return sortedValues[Math.min(Math.max(index, 0), sortedValues.length - 1)];
}

export function summarizeSamples(samples) {
  const durations = samples
    .filter((sample) => typeof sample.durationMs === "number")
    .map((sample) => sample.durationMs)
    .sort((a, b) => a - b);

  const statusCounts = {};
  for (const sample of samples) {
    const key = sample.status === null ? "network_error" : String(sample.status);
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
  }

  const failures = samples.filter((sample) => sample.ok !== true);
  const totalDuration = durations.reduce((sum, value) => sum + value, 0);

  return {
    requests: samples.length,
    failures: failures.length,
    statusCounts,
    minMs: durations[0] ?? 0,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    maxMs: durations[durations.length - 1] ?? 0,
    avgMs: durations.length > 0 ? Math.round(totalDuration / durations.length) : 0,
  };
}

async function fetchWithTimeout(url, timeoutMs, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "creditregulatorpro-staging-scale-baseline/1.0",
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function runOneRequest(baseUrl, timeoutMs, scenario) {
  const headers = {
    Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
    Origin: baseUrl,
  };
  const init = { method: scenario.method, headers };

  if (scenario.body !== undefined) {
    init.body = JSON.stringify(scenario.body);
    init.headers = {
      ...headers,
      "Content-Type": "application/json",
    };
  }

  const started = Date.now();
  try {
    const response = await fetchWithTimeout(toAbsoluteUrl(baseUrl, scenario.path), timeoutMs, init);
    const durationMs = Date.now() - started;
    return {
      ok: scenario.acceptedStatuses.includes(response.status),
      status: response.status,
      durationMs,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.name : "UnknownError",
    };
  }
}

async function runScenario(baseUrl, options, scenario) {
  const samples = [];
  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    const batch = Array.from({ length: options.concurrency }, () => runOneRequest(baseUrl, options.timeoutMs, scenario));
    samples.push(...await Promise.all(batch));
    if (options.delayMs > 0 && iteration + 1 < options.iterations) {
      await sleep(options.delayMs);
    }
  }

  return {
    name: scenario.name,
    method: scenario.method,
    path: scenario.path,
    acceptedStatuses: scenario.acceptedStatuses,
    summary: summarizeSamples(samples),
    samples,
  };
}

export async function runStagingScaleBaseline(options, env = process.env) {
  const gate = shouldRunScaleBaseline(env);
  if (!gate.ok) {
    return { status: "skipped", reason: gate.reason };
  }

  const target = validateScaleBaselineTarget(options.baseUrl, { allowLocal: options.allowLocal });
  if (!target.ok) throw new Error(target.reason);

  assertSafeScenarioSet();

  const startedAt = new Date().toISOString();
  const scenarioResults = [];
  for (const scenario of SCALE_BASELINE_SCENARIOS) {
    scenarioResults.push(await runScenario(options.baseUrl, options, scenario));
  }

  const failedScenarios = scenarioResults.filter((result) => result.summary.failures > 0);
  const totalRequests = scenarioResults.reduce((sum, result) => sum + result.summary.requests, 0);
  const totalFailures = scenarioResults.reduce((sum, result) => sum + result.summary.failures, 0);

  const report = {
    status: totalFailures === 0 ? "passed" : "failed",
    startedAt,
    completedAt: new Date().toISOString(),
    targetHost: target.host,
    bounded: {
      iterations: options.iterations,
      concurrency: options.concurrency,
      delayMs: options.delayMs,
      timeoutMs: options.timeoutMs,
      totalRequests,
    },
    scenarios: scenarioResults,
    summary: {
      totalScenarios: scenarioResults.length,
      failedScenarios: failedScenarios.length,
      totalRequests,
      totalFailures,
    },
    safety: {
      productionHostsRefused: true,
      authenticatedRequests: 0,
      mutatingRuntimeEndpointsCalled: 0,
      packetEndpointCalls: 0,
      violationEndpointCalls: 0,
      parserOrOcrEndpointCalls: 0,
      realConsumerDataUsed: false,
    },
  };

  if (failedScenarios.length > 0) {
    const names = failedScenarios.map((scenario) => scenario.name).join(", ");
    throw Object.assign(new Error(`Staging scale baseline failed for: ${names}.`), { report });
  }

  return report;
}

function printHumanReport(report) {
  if (report.status === "skipped") {
    console.log(report.reason);
    return;
  }

  console.log("Staging scale baseline passed.");
  console.log(`Target host: ${report.targetHost}`);
  console.log(`Bound: ${report.bounded.iterations} iterations x ${report.bounded.concurrency} concurrency`);
  console.log(`Total requests: ${report.summary.totalRequests}`);
  for (const scenario of report.scenarios) {
    console.log(
      `[OK] ${scenario.name}: statuses ${JSON.stringify(scenario.summary.statusCounts)}, p95 ${scenario.summary.p95Ms}ms`,
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const json = options.json || normalizeBoolean(process.env.STAGING_SCALE_BASELINE_JSON);
  try {
    const result = await runStagingScaleBaseline(options);
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printHumanReport(result);
    }
    if (result.status === "skipped") process.exit(SKIPPED_EXIT_CODE);
  } catch (error) {
    const report = error && typeof error === "object" && "report" in error ? error.report : null;
    if (json && report) {
      console.error(JSON.stringify(report, null, 2));
    }
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
