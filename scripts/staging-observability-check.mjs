import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_STAGING_URL = "https://staging.creditregulatorpro.com";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_LOG_TAIL = 500;
const MAX_LOG_TAIL = 5000;
const DEFAULT_CONTAINER_NAME = "creditregulatorpro-staging";
const DEFAULT_SSH_HOST = "staging.creditregulatorpro.com";
const DEFAULT_SSH_USER = "root";

export const OBSERVABILITY_CHECK_ENV = "CRP_STAGING_OBSERVABILITY_CHECK";
export const SKIPPED_EXIT_CODE = 2;

export const REFUSED_PRODUCTION_HOSTS = new Set(["creditregulatorpro.com", "www.creditregulatorpro.com"]);
export const ALLOWED_STAGING_HOSTS = new Set(["staging.creditregulatorpro.com"]);
export const ALLOWED_LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export const OBSERVABILITY_HTTP_CHECKS = [
  { name: "app shell", method: "HEAD", path: "/", acceptedStatuses: [200] },
  { name: "login route", method: "GET", path: "/login", acceptedStatuses: [200] },
  { name: "auth session denied", method: "GET", path: "/_api/auth/session", acceptedStatuses: [401, 403] },
];

export const CONTROLLED_NON_ALERT_PATTERNS = [
  /Runtime bridge activation is unavailable in this governance layer/i,
  /Synthetic smoke should fail/i,
  /ZodError/i,
  /Error parsing input/i,
  /Error resolving session/i,
];

export const OBSERVABILITY_LOG_CATEGORIES = [
  {
    key: "http5xx",
    label: "HTTP 5xx responses",
    defaultMax: 0,
    patterns: [
      /\bHTTP\s+5\d\d\b/i,
      /\bstatus(?:Code)?["'\s:=]+5\d\d\b/i,
      /\b5\d\d\b.*\b(api|request|response|endpoint)\b/i,
    ],
  },
  {
    key: "parserOcrFailures",
    label: "Parser/OCR failures",
    defaultMax: 0,
    patterns: [
      /\b(parser|parseReport|extraction|ocr|tesseract|pdftoppm)\b.*\b(failed|failure|error|exception)\b/i,
      /\b(failed|failure|error|exception)\b.*\b(parser|parseReport|extraction|ocr|tesseract|pdftoppm)\b/i,
      /\bPARSER_[A-Z0-9_]*(FAILED|ERROR)\b/i,
    ],
  },
  {
    key: "packetFailures",
    label: "Packet generation failures",
    defaultMax: 0,
    patterns: [
      /\bpacket\b.*\b(failed|failure|error|exception)\b/i,
      /\b(failed|failure|error|exception)\b.*\bpacket\b/i,
    ],
  },
  {
    key: "backgroundJobErrors",
    label: "Background/unhandled errors",
    defaultMax: 0,
    patterns: [
      /UnhandledPromiseRejection/i,
      /unhandled rejection/i,
      /uncaught exception/i,
      /\bfatal error\b/i,
      /\bout of memory\b/i,
      /\bECONNREFUSED\b/i,
      /\bETIMEDOUT\b/i,
    ],
  },
];

function normalizeBoolean(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function normalizeString(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) return null;
  return argv[index + 1] ?? null;
}

function clampInteger(value, defaultValue, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function toAbsoluteUrl(baseUrl, path) {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

function hostOf(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function validateHost(host, { allowLocal = false, label = "target" } = {}) {
  const normalized = String(host ?? "").trim().toLowerCase();
  if (!normalized) return { ok: false, reason: `Invalid ${label} host.` };
  if (REFUSED_PRODUCTION_HOSTS.has(normalized)) {
    return { ok: false, reason: `Refusing to run staging observability check against production host ${normalized}.` };
  }
  if (ALLOWED_STAGING_HOSTS.has(normalized)) return { ok: true, host: normalized };
  if (allowLocal && ALLOWED_LOCAL_HOSTS.has(normalized)) return { ok: true, host: normalized };
  return { ok: false, reason: `Refusing to run staging observability check against unapproved host ${normalized}.` };
}

export function validateObservabilityTarget(baseUrl, options = {}) {
  const host = hostOf(baseUrl);
  if (!host) return { ok: false, reason: "Invalid staging observability target URL." };
  return validateHost(host, { allowLocal: options.allowLocal, label: "target" });
}

export function validateSshHost(host, options = {}) {
  return validateHost(host, { allowLocal: options.allowLocal, label: "ssh" });
}

export function shouldRunObservabilityCheck(env = process.env) {
  if (!normalizeBoolean(env[OBSERVABILITY_CHECK_ENV])) {
    return {
      ok: false,
      reason: `SKIPPED: ${OBSERVABILITY_CHECK_ENV}=true is required.`,
    };
  }
  return { ok: true };
}

export function parseArgs(argv, env = process.env) {
  const flags = new Set(argv);
  const source = valueAfter(argv, "--source") ?? env.STAGING_OBSERVABILITY_SOURCE ?? "ssh";
  return {
    allowLocal: flags.has("--allow-local"),
    json: flags.has("--json"),
    source,
    baseUrl: normalizeString(valueAfter(argv, "--base-url") ?? env.STAGING_BASE_URL ?? env.STAGING_APP_URL) ?? DEFAULT_STAGING_URL,
    sshHost: normalizeString(valueAfter(argv, "--ssh-host") ?? env.STAGING_OBSERVABILITY_SSH_HOST ?? env.STAGING_HOST) ?? DEFAULT_SSH_HOST,
    sshUser: normalizeString(valueAfter(argv, "--ssh-user") ?? env.STAGING_OBSERVABILITY_SSH_USER ?? env.STAGING_USER) ?? DEFAULT_SSH_USER,
    sshKey: normalizeString(valueAfter(argv, "--ssh-key") ?? env.STAGING_OBSERVABILITY_SSH_KEY ?? env.STAGING_SSH_PRIVATE_KEY),
    logFile: normalizeString(valueAfter(argv, "--log-file") ?? env.STAGING_OBSERVABILITY_LOG_FILE),
    containerName: normalizeString(valueAfter(argv, "--container") ?? env.STAGING_OBSERVABILITY_CONTAINER) ?? DEFAULT_CONTAINER_NAME,
    logTail: clampInteger(valueAfter(argv, "--tail") ?? env.STAGING_OBSERVABILITY_LOG_TAIL, DEFAULT_LOG_TAIL, 50, MAX_LOG_TAIL),
    timeoutMs: clampInteger(valueAfter(argv, "--timeout-ms") ?? env.STAGING_OBSERVABILITY_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1000, 60000),
  };
}

export function buildThresholds(env = process.env) {
  const thresholds = {};
  for (const category of OBSERVABILITY_LOG_CATEGORIES) {
    const envKey = `STAGING_OBSERVABILITY_MAX_${category.key.replace(/[A-Z]/g, (char) => `_${char}`).toUpperCase()}`;
    thresholds[category.key] = clampInteger(env[envKey], category.defaultMax, 0, 100000);
  }
  return thresholds;
}

export function redactPotentialSecrets(text) {
  return String(text)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/(session|token|password|secret|key)=([^;\s]+)/gi, "$1=[REDACTED]")
    .replace(/(postgres(?:ql)?:\/\/)[^\s'"]+/gi, "$1[REDACTED]");
}

function isControlledNonAlert(line) {
  return CONTROLLED_NON_ALERT_PATTERNS.some((pattern) => pattern.test(line));
}

export function analyzeLogText(logText, thresholds = buildThresholds({})) {
  const lines = String(logText ?? "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  const categories = {};
  const controlledNonAlerts = [];

  for (const category of OBSERVABILITY_LOG_CATEGORIES) {
    const matchingLines = [];
    for (const line of lines) {
      if (isControlledNonAlert(line)) {
        if (!controlledNonAlerts.includes(line)) controlledNonAlerts.push(line);
        continue;
      }
      if (category.patterns.some((pattern) => pattern.test(line))) {
        matchingLines.push(line);
      }
    }
    const maxAllowed = thresholds[category.key] ?? category.defaultMax;
    categories[category.key] = {
      label: category.label,
      count: matchingLines.length,
      maxAllowed,
      ok: matchingLines.length <= maxAllowed,
      sampleCount: Math.min(matchingLines.length, 3),
    };
  }

  const failedCategories = Object.entries(categories)
    .filter(([, result]) => !result.ok)
    .map(([key]) => key);

  return {
    ok: failedCategories.length === 0,
    totalLines: lines.length,
    categories,
    failedCategories,
    controlledNonAlertCount: controlledNonAlerts.length,
    rawLogsIncluded: false,
  };
}

export function parseDockerStatus(output, expectedContainerName) {
  const lines = String(output ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const exactLine = lines.find((line) => line.split(/\s+/)[0] === expectedContainerName) ?? lines[0] ?? "";
  const [name, ...statusParts] = exactLine.split(/\s+/);
  const status = statusParts.join(" ");
  return {
    name: name || null,
    status: status || null,
    up: Boolean(name) && status.startsWith("Up"),
  };
}

function runCommand(command, args, timeoutMs) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: timeoutMs,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status ?? "unknown"}: ${redactPotentialSecrets(result.stderr || result.stdout || "")}`);
  }
  return result.stdout;
}

function sshArgs(options, remoteCommand) {
  const args = [
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
  ];
  if (options.sshKey) {
    args.push("-i", options.sshKey);
  }
  args.push(`${options.sshUser}@${options.sshHost}`, remoteCommand);
  return args;
}

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function dockerStatusCommand(containerName) {
  return `docker ps --filter ${shellSingleQuote(`name=^/${containerName}$`)} --format '{{.Names}} {{.Status}}'`;
}

function dockerLogsCommand(containerName, tail) {
  return `docker logs --tail=${tail} ${shellSingleQuote(containerName)} 2>&1`;
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
        "User-Agent": "creditregulatorpro-staging-observability-check/1.0",
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function runHttpChecks(baseUrl, timeoutMs) {
  const results = [];
  for (const check of OBSERVABILITY_HTTP_CHECKS) {
    const response = await fetchWithTimeout(toAbsoluteUrl(baseUrl, check.path), timeoutMs, {
      method: check.method,
    });
    results.push({
      name: check.name,
      status: response.status,
      ok: check.acceptedStatuses.includes(response.status),
    });
  }
  return results;
}

function readObservationSource(options) {
  if (options.source === "log-file") {
    if (!options.logFile || !existsSync(options.logFile)) {
      throw new Error("--log-file is required for source log-file.");
    }
    return {
      source: "log-file",
      container: { name: options.containerName, status: "not checked from log-file", up: true },
      logText: readFileSync(options.logFile, "utf8"),
    };
  }

  if (options.source === "local-docker") {
    const statusOutput = runCommand("docker", [
      "ps",
      "--filter",
      `name=^/${options.containerName}$`,
      "--format",
      "{{.Names}} {{.Status}}",
    ], options.timeoutMs);
    const logText = runCommand("docker", ["logs", `--tail=${options.logTail}`, options.containerName], options.timeoutMs);
    return {
      source: "local-docker",
      container: parseDockerStatus(statusOutput, options.containerName),
      logText,
    };
  }

  if (options.source === "ssh") {
    const sshHost = validateSshHost(options.sshHost, { allowLocal: options.allowLocal });
    if (!sshHost.ok) throw new Error(sshHost.reason);
    const statusOutput = runCommand("ssh", sshArgs(options, dockerStatusCommand(options.containerName)), options.timeoutMs);
    const logText = runCommand("ssh", sshArgs(options, dockerLogsCommand(options.containerName, options.logTail)), options.timeoutMs);
    return {
      source: "ssh",
      container: parseDockerStatus(statusOutput, options.containerName),
      logText,
    };
  }

  throw new Error("--source must be ssh, local-docker, or log-file.");
}

export async function runStagingObservabilityCheck(options, env = process.env) {
  const gate = shouldRunObservabilityCheck(env);
  if (!gate.ok) {
    return { status: "skipped", reason: gate.reason };
  }

  const target = validateObservabilityTarget(options.baseUrl, { allowLocal: options.allowLocal });
  if (!target.ok) throw new Error(target.reason);

  const startedAt = new Date().toISOString();
  const httpChecks = await runHttpChecks(options.baseUrl, options.timeoutMs);
  const observation = readObservationSource(options);
  const thresholds = buildThresholds(env);
  const logAnalysis = analyzeLogText(observation.logText, thresholds);
  const failedHttpChecks = httpChecks.filter((check) => !check.ok);

  const failures = [];
  if (!observation.container.up) {
    failures.push(`Container ${options.containerName} is not Up.`);
  }
  for (const check of failedHttpChecks) {
    failures.push(`${check.name} returned HTTP ${check.status}.`);
  }
  for (const key of logAnalysis.failedCategories) {
    const category = logAnalysis.categories[key];
    failures.push(`${category.label} count ${category.count} exceeds threshold ${category.maxAllowed}.`);
  }

  return {
    status: failures.length === 0 ? "passed" : "failed",
    startedAt,
    completedAt: new Date().toISOString(),
    targetHost: target.host,
    source: observation.source,
    container: observation.container,
    httpChecks,
    logWindow: {
      tail: options.source === "log-file" ? null : options.logTail,
      totalLines: logAnalysis.totalLines,
      rawLogsIncluded: false,
    },
    logAnalysis,
    failures,
    safety: {
      readOnly: true,
      productionHostsRefused: true,
      rawLogsPrinted: false,
      secretsRedacted: true,
      appCodeModified: false,
      schemaModified: false,
      runtimeTruthModified: false,
      packetBehaviorModified: false,
    },
  };
}

function printHumanReport(report) {
  if (report.status === "skipped") {
    console.log(report.reason);
    return;
  }

  console.log(`Staging observability check ${report.status}.`);
  console.log(`Target host: ${report.targetHost}`);
  console.log(`Container: ${report.container.name ?? "unknown"} ${report.container.status ?? ""}`);
  for (const check of report.httpChecks) {
    console.log(`[${check.ok ? "OK" : "FAIL"}] ${check.name}: HTTP ${check.status}`);
  }
  for (const category of Object.values(report.logAnalysis.categories)) {
    console.log(`[${category.ok ? "OK" : "FAIL"}] ${category.label}: ${category.count}/${category.maxAllowed}`);
  }
  if (report.failures.length > 0) {
    for (const failure of report.failures) console.error(`[FAIL] ${failure}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const json = options.json || normalizeBoolean(process.env.STAGING_OBSERVABILITY_JSON);
  try {
    const report = await runStagingObservabilityCheck(options);
    if (json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHumanReport(report);
    }
    if (report.status === "skipped") process.exit(SKIPPED_EXIT_CODE);
    if (report.status === "failed") process.exit(1);
  } catch (error) {
    console.error(`[ERROR] ${error instanceof Error ? redactPotentialSecrets(error.message) : redactPotentialSecrets(String(error))}`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
