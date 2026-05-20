import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_STAGING_URL = "https://staging.creditregulatorpro.com";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_BRANCH = "staging";
const DEPLOY_WORKFLOW_NAME = "Deploy staging";

export const REFUSED_PRODUCTION_HOSTS = new Set(["creditregulatorpro.com", "www.creditregulatorpro.com"]);
export const ALLOWED_STAGING_HOSTS = new Set(["staging.creditregulatorpro.com"]);
export const ALLOWED_LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export const REQUIRED_LOCAL_CHECKS = [
  { label: "source of truth", command: "node", args: ["scripts/check-github-source-of-truth.mjs"] },
  { label: "typecheck", command: "pnpm", args: ["run", "typecheck"] },
  { label: "golden path", command: "pnpm", args: ["run", "test:golden-path"] },
  { label: "contracts", command: "pnpm", args: ["run", "test:contracts"] },
  { label: "api", command: "pnpm", args: ["run", "test:api"] },
  { label: "deterministic ingestion", command: "pnpm", args: ["run", "test:deterministic-ingestion-report"] },
  { label: "credit regression", command: "pnpm", args: ["run", "test:credit-regression"] },
  { label: "tradeline internal", command: "pnpm", args: ["run", "test:tradeline-internal"] },
  { label: "violation corrections", command: "pnpm", args: ["run", "test:violation-corrections"] },
  { label: "staging gate", command: "pnpm", args: ["run", "check:staging-gate"] },
];

export const PROTECTED_UNAUTHENTICATED_ENDPOINT_CHECKS = [
  {
    name: "auth session endpoint",
    path: "/_api/auth/session",
    acceptedStatuses: [401, 403],
  },
  {
    name: "admin mock lifecycle endpoint",
    path: "/_api/admin/mock-lifecycle/list?limit=1",
    acceptedStatuses: [401, 403],
  },
  {
    name: "runtime bridge mapping list endpoint",
    path: "/_api/regulation-registry/runtime-bridge/list",
    acceptedStatuses: [401, 403],
  },
  {
    name: "advisory bridge report endpoint",
    path: "/_api/regulation-registry/advisory-bridge/report",
    acceptedStatuses: [401, 403],
  },
  {
    name: "report artifact list endpoint",
    path: "/_api/report-artifact/list?limit=1",
    acceptedStatuses: [401, 403],
  },
  {
    name: "packet list endpoint",
    path: "/_api/packet/list?limit=1",
    acceptedStatuses: [401, 403],
  },
  {
    name: "evidence event list endpoint",
    path: "/_api/evidence/list?limit=1",
    acceptedStatuses: [401, 403],
  },
  {
    name: "response document list endpoint",
    path: "/_api/responses/list?limit=1",
    acceptedStatuses: [401, 403],
  },
  {
    name: "support ticket list endpoint",
    path: "/_api/support-ticket/list?limit=1",
    acceptedStatuses: [401, 403],
  },
];

export const INVALID_SESSION_COOKIE = "floot_built_app_session=invalid-production-readiness-probe";

export const PROTECTED_INVALID_SESSION_ENDPOINT_CHECKS = PROTECTED_UNAUTHENTICATED_ENDPOINT_CHECKS.map((check) => ({
  ...check,
  name: `${check.name} invalid session`,
  headers: {
    Cookie: INVALID_SESSION_COOKIE,
  },
}));

export const PUBLIC_STAGING_CHECKS = [
  { name: "app shell", path: "/", method: "HEAD", acceptedStatuses: [200] },
  { name: "login route", path: "/login", method: "GET", acceptedStatuses: [200] },
];

function fail(message) {
  console.error(`[ERROR] ${message}`);
  process.exit(1);
}

function runGit(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function normalizeBoolean(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function normalizeBaseUrl(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed || DEFAULT_STAGING_URL;
}

function toAbsoluteUrl(baseUrl, path) {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

export function validateReadinessTarget(baseUrl, options = {}) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return { ok: false, reason: "Invalid readiness target URL." };
  }

  const host = parsed.hostname.toLowerCase();
  if (REFUSED_PRODUCTION_HOSTS.has(host)) {
    return { ok: false, reason: `Refusing to run production readiness gate against production host ${host}.` };
  }

  if (ALLOWED_STAGING_HOSTS.has(host)) {
    return { ok: true, host };
  }

  if (options.allowLocal === true && ALLOWED_LOCAL_HOSTS.has(host)) {
    return { ok: true, host };
  }

  return { ok: false, reason: `Refusing to run production readiness gate against unapproved host ${host}.` };
}

export function parseArgs(argv) {
  const flags = new Set(argv);
  return {
    skipLocalChecks: flags.has("--skip-local-checks"),
    skipGithubDeployCheck: flags.has("--skip-github-deploy-check"),
    allowLocal: flags.has("--allow-local"),
    json: flags.has("--json"),
    stagingUrl: normalizeBaseUrl(
      valueAfter(argv, "--staging-url") ?? process.env.STAGING_APP_URL ?? process.env.STAGING_API_URL,
    ),
    timeoutMs: Number(valueAfter(argv, "--timeout-ms") ?? process.env.PRODUCTION_READINESS_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
  };
}

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) return null;
  return argv[index + 1] ?? null;
}

function runCommand(check) {
  console.log(`\n[RUN] ${check.label}`);
  const result = process.platform === "win32" && check.command === "pnpm"
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", ["pnpm", ...check.args].join(" ")], { stdio: "inherit" })
    : spawnSync(check.command, check.args, { stdio: "inherit" });

  if (result.status !== 0) {
    throw new Error(`${check.label} failed with exit code ${result.status ?? "unknown"}.`);
  }
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
        "User-Agent": "creditregulatorpro-production-readiness-gate/1.0",
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function runHttpCheck(baseUrl, timeoutMs, check) {
  const response = await fetchWithTimeout(toAbsoluteUrl(baseUrl, check.path), timeoutMs, {
    method: check.method ?? "GET",
    headers: check.headers ?? {},
  });
  if (!check.acceptedStatuses.includes(response.status)) {
    throw new Error(`${check.name} returned HTTP ${response.status}; expected ${check.acceptedStatuses.join(", ")}.`);
  }
  return {
    name: check.name,
    status: response.status,
  };
}

function latestStagingDeploy() {
  const output = execFileSync("gh", [
    "run",
    "list",
    "--branch",
    DEFAULT_BRANCH,
    "--workflow",
    DEPLOY_WORKFLOW_NAME,
    "--limit",
    "1",
    "--json",
    "status,conclusion,headSha,databaseId,displayTitle,createdAt",
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

  const runs = JSON.parse(output);
  if (!Array.isArray(runs) || runs.length === 0) {
    throw new Error(`No ${DEPLOY_WORKFLOW_NAME} workflow run found for ${DEFAULT_BRANCH}.`);
  }
  return runs[0];
}

function assertLatestStagingDeployMatchesHead() {
  const head = runGit(["rev-parse", "HEAD"]);
  const deploy = latestStagingDeploy();
  if (deploy.status !== "completed" || deploy.conclusion !== "success") {
    throw new Error(`Latest staging deploy is ${deploy.status}/${deploy.conclusion ?? "none"}.`);
  }
  if (deploy.headSha !== head) {
    throw new Error(`Latest staging deploy ${deploy.headSha} does not match local HEAD ${head}.`);
  }
  return {
    databaseId: deploy.databaseId,
    headSha: deploy.headSha,
    displayTitle: deploy.displayTitle,
    createdAt: deploy.createdAt,
  };
}

export async function runProductionReadinessGate(options) {
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1000) {
    throw new Error(`Invalid timeout ${options.timeoutMs}.`);
  }

  const target = validateReadinessTarget(options.stagingUrl, { allowLocal: options.allowLocal });
  if (!target.ok) throw new Error(target.reason);

  const startedAt = new Date().toISOString();
  const results = {
    status: "passed",
    startedAt,
    completedAt: "",
    targetHost: target.host,
    localChecks: [],
    stagingDeploy: null,
    publicChecks: [],
    protectedUnauthenticatedChecks: [],
    protectedInvalidSessionChecks: [],
  };

  if (!options.skipLocalChecks) {
    for (const check of REQUIRED_LOCAL_CHECKS) {
      runCommand(check);
      results.localChecks.push({ label: check.label, status: "passed" });
    }
  }

  if (!options.skipGithubDeployCheck) {
    results.stagingDeploy = assertLatestStagingDeployMatchesHead();
  }

  for (const check of PUBLIC_STAGING_CHECKS) {
    results.publicChecks.push(await runHttpCheck(options.stagingUrl, options.timeoutMs, check));
  }

  for (const check of PROTECTED_UNAUTHENTICATED_ENDPOINT_CHECKS) {
    results.protectedUnauthenticatedChecks.push(await runHttpCheck(options.stagingUrl, options.timeoutMs, check));
  }

  for (const check of PROTECTED_INVALID_SESSION_ENDPOINT_CHECKS) {
    results.protectedInvalidSessionChecks.push(await runHttpCheck(options.stagingUrl, options.timeoutMs, check));
  }

  results.completedAt = new Date().toISOString();
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  try {
    const result = await runProductionReadinessGate(options);
    if (options.json || normalizeBoolean(process.env.PRODUCTION_READINESS_JSON)) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("\nProduction readiness gate passed.");
      console.log(`Target host: ${result.targetHost}`);
      console.log(`Local checks: ${options.skipLocalChecks ? "skipped" : result.localChecks.length}`);
      console.log(`Staging deploy: ${options.skipGithubDeployCheck ? "skipped" : result.stagingDeploy?.headSha}`);
      console.log(`Public checks: ${result.publicChecks.length}`);
      console.log(`Protected unauthenticated checks: ${result.protectedUnauthenticatedChecks.length}`);
      console.log(`Protected invalid-session checks: ${result.protectedInvalidSessionChecks.length}`);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
