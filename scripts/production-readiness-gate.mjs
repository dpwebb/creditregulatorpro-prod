import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_STAGING_URL = "https://staging.creditregulatorpro.com";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_BRANCH = "staging";
const DEPLOY_WORKFLOW_NAME = "Deploy staging";
const DEFAULT_EVIDENCE_DIR = "docs/production-scale/evidence";

export const PRODUCTION_SAFE_PROBE_EVIDENCE_OUTPUTS = {
  markdown: "docs/production-scale/evidence/latest-production-safe-probes.md",
  json: "docs/production-scale/evidence/latest-production-safe-probes.json",
};

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

export const RUNTIME_READ_ONLY_METHODS = new Set(["GET", "HEAD"]);

export const CRON_TOKEN_DENIAL_CONTRACTS = [
  {
    name: "missing cron token denial - clock scan",
    route: "/_api/clock/scan",
    method: "POST",
    handlerFile: "endpoints/clock/scan_POST.ts",
    expectedStatus: 401,
    productionExecution: "static-contract-only",
    requiredSourceSnippets: ["deriveCronSecret", "Authorization", "Bearer", "Invalid or missing token"],
  },
  {
    name: "invalid cron token denial - clock scan",
    route: "/_api/clock/scan",
    method: "POST",
    handlerFile: "endpoints/clock/scan_POST.ts",
    expectedStatus: 401,
    productionExecution: "static-contract-only",
    requiredSourceSnippets: ["bearerToken !== CRON_SECRET", "Invalid or missing token"],
  },
  {
    name: "missing cron token denial - regulation scheduled scan",
    route: "/_api/regulation-registry/scheduled-scan",
    method: "POST",
    handlerFile: "endpoints/regulation-registry/scheduled-scan_POST.ts",
    expectedStatus: 401,
    productionExecution: "static-contract-only",
    requiredSourceSnippets: ["deriveCronSecret", "Authorization", "Bearer", "Invalid or missing token"],
  },
  {
    name: "invalid cron token denial - regulation scheduled scan",
    route: "/_api/regulation-registry/scheduled-scan",
    method: "POST",
    handlerFile: "endpoints/regulation-registry/scheduled-scan_POST.ts",
    expectedStatus: 401,
    productionExecution: "static-contract-only",
    requiredSourceSnippets: ["bearerToken !== CRON_SECRET", "Invalid or missing token"],
  },
  {
    name: "missing cron token denial - retention auto purge",
    route: "/_api/retention/auto-purge",
    method: "POST",
    handlerFile: "endpoints/retention/auto-purge_POST.ts",
    expectedStatus: 401,
    productionExecution: "static-contract-only",
    requiredSourceSnippets: ["deriveCronSecret", "Authorization", "Bearer", "Invalid or missing token"],
  },
  {
    name: "invalid cron token denial - retention auto purge",
    route: "/_api/retention/auto-purge",
    method: "POST",
    handlerFile: "endpoints/retention/auto-purge_POST.ts",
    expectedStatus: 401,
    productionExecution: "static-contract-only",
    requiredSourceSnippets: ["bearerToken !== CRON_SECRET", "Invalid or missing token"],
  },
];

export const WEBHOOK_REJECTION_CONTRACTS = [
  {
    name: "unsigned PostGrid webhook rejection",
    route: "/_api/webhook/postgrid",
    method: "POST",
    handlerFile: "endpoints/webhook/postgrid_POST.ts",
    expectedStatuses: [401, 500],
    productionExecution: "static-contract-only",
    requiredSourceSnippets: ["x-postgrid-signature", "Missing x-postgrid-signature", "rejecting unsigned webhook"],
  },
  {
    name: "unsigned Stripe webhook rejection",
    route: "/_api/webhook/stripe",
    method: "POST",
    handlerFile: "endpoints/webhook/stripe_POST.ts",
    expectedStatuses: [401],
    productionExecution: "static-contract-only",
    requiredSourceSnippets: ["stripe-signature", "Missing stripe-signature header", "constructEvent"],
  },
  {
    name: "invalid tracking webhook bearer rejection",
    route: "/_api/webhook/tracking",
    method: "POST",
    handlerFile: "endpoints/webhook/tracking_POST.ts",
    expectedStatuses: [401],
    productionExecution: "static-contract-only",
    requiredSourceSnippets: ["POSTGRID_WEBHOOK_SECRET", "authHeader !== `Bearer ${webhookSecret}`", "Unauthorized"],
  },
];

export const RETIRED_PUBLIC_ROUTE_CONTRACTS = [
  "endpoints/admin/letter-template/delete_POST.ts",
  "endpoints/admin/letter-template/history_GET.ts",
  "endpoints/admin/letter-template/humanize_POST.ts",
  "endpoints/admin/letter-template/rollback_POST.ts",
  "endpoints/admin/letter-template/seed_POST.ts",
  "endpoints/admin/letter-template_POST.ts",
  "endpoints/admin/letter-templates_GET.ts",
].map((handlerFile) => ({
  name: `retired public route remains reset - ${handlerFile}`,
  route: handlerFile,
  method: handlerFile.includes("_GET") ? "GET" : "POST",
  handlerFile,
  expectedStatus: 410,
  productionExecution: "static-contract-only",
  requiredSourceSnippets: ["RESET_MESSAGE", "status: 410"],
}));

export const STATIC_REJECTION_CONTRACTS = [
  ...CRON_TOKEN_DENIAL_CONTRACTS,
  ...WEBHOOK_REJECTION_CONTRACTS,
  ...RETIRED_PUBLIC_ROUTE_CONTRACTS,
];

const PROBE_SENSITIVE_PATTERNS = [
  { name: "ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: "sin", pattern: /\b\d{3}[- ]?\d{3}[- ]?\d{3}\b/ },
  { name: "credit-card", pattern: /\b(?:\d[ -]*?){13,16}\b/ },
  { name: "raw-pdf-base64", pattern: /JVBERi0x[0-9A-Za-z+/=]{24,}/ },
  { name: "private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "stripe-secret", pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/ },
  { name: "github-token", pattern: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/ },
  { name: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { name: "credential-url", pattern: /[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^@\s]+@/i },
];

function fail(message) {
  console.error(`[ERROR] ${message}`);
  process.exit(1);
}

function runGit(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function safeGit(args, fallback = "unknown") {
  try {
    const output = runGit(args);
    return output.length > 0 ? output : fallback;
  } catch {
    return fallback;
  }
}

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
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

export function productionRuntimeHttpProbePlan() {
  return [
    ...PUBLIC_STAGING_CHECKS,
    ...PROTECTED_UNAUTHENTICATED_ENDPOINT_CHECKS,
    ...PROTECTED_INVALID_SESSION_ENDPOINT_CHECKS,
  ].map((check) => ({
    method: check.method ?? "GET",
    readOnly: true,
    mutationExpected: false,
    ...check,
  }));
}

export function assertProductionProbePlanReadOnly(checks = productionRuntimeHttpProbePlan()) {
  const unsafe = checks.filter((check) => !RUNTIME_READ_ONLY_METHODS.has((check.method ?? "GET").toUpperCase()));
  return {
    ok: unsafe.length === 0,
    unsafe,
  };
}

export function scanProbeBodyForSensitiveContent(text) {
  const body = String(text ?? "");
  return PROBE_SENSITIVE_PATTERNS
    .filter((entry) => entry.pattern.test(body))
    .map((entry) => entry.name);
}

export function evaluateStaticRejectionContracts({ rootDir = process.cwd() } = {}) {
  return STATIC_REJECTION_CONTRACTS.map((contract) => {
    const sourcePath = repoPath(rootDir, contract.handlerFile);
    const source = readFileSync(sourcePath, "utf8");
    const missingSourceSnippets = contract.requiredSourceSnippets.filter((snippet) => !source.includes(snippet));
    return {
      name: contract.name,
      route: contract.route,
      method: contract.method,
      handlerFile: contract.handlerFile,
      expectedStatus: contract.expectedStatus ?? null,
      expectedStatuses: contract.expectedStatuses ?? null,
      productionExecution: contract.productionExecution,
      productionHttpRequestExecuted: false,
      productionMutationExpected: false,
      status: missingSourceSnippets.length === 0 ? "passed" : "failed",
      missingSourceSnippets,
    };
  });
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
    planOnly: flags.has("--plan-only"),
    writeEvidence: flags.has("--write-evidence"),
    stagingUrl: normalizeBaseUrl(
      valueAfter(argv, "--staging-url") ?? process.env.STAGING_APP_URL ?? process.env.STAGING_API_URL,
    ),
    timeoutMs: Number(valueAfter(argv, "--timeout-ms") ?? process.env.PRODUCTION_READINESS_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    evidenceDir: normalizeRelativePath(valueAfter(argv, "--evidence-dir") ?? DEFAULT_EVIDENCE_DIR),
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
  const method = (check.method ?? "GET").toUpperCase();
  if (!RUNTIME_READ_ONLY_METHODS.has(method)) {
    throw new Error(`${check.name} uses ${method}; production readiness runtime probes must be read-only GET/HEAD requests.`);
  }
  const response = await fetchWithTimeout(toAbsoluteUrl(baseUrl, check.path), timeoutMs, {
    method,
    headers: check.headers ?? {},
  });
  if (!check.acceptedStatuses.includes(response.status)) {
    throw new Error(`${check.name} returned HTTP ${response.status}; expected ${check.acceptedStatuses.join(", ")}.`);
  }
  const result = {
    name: check.name,
    path: check.path,
    method,
    status: response.status,
    readOnly: true,
    mutationExpected: false,
    responseBodyScanned: false,
    sensitiveFindings: [],
  };

  if (method === "GET" && check.scanResponseForSensitiveContent !== false) {
    const body = await response.text();
    result.responseBodyScanned = true;
    result.sensitiveFindings = scanProbeBodyForSensitiveContent(body);
    if (result.sensitiveFindings.length > 0) {
      throw new Error(`${check.name} response contained sensitive marker(s): ${result.sensitiveFindings.join(", ")}.`);
    }
  }

  return result;
}

function assertStaticContractsPassed(staticRejectionContracts) {
  const failed = staticRejectionContracts.filter((contract) => contract.status !== "passed");
  if (failed.length > 0) {
    throw new Error(`Static rejection contract checks failed: ${failed.map((contract) => contract.name).join(", ")}.`);
  }
}

function summarizeProbeSafety(results) {
  const runtimeChecks = [
    ...results.publicChecks,
    ...results.protectedUnauthenticatedChecks,
    ...results.protectedInvalidSessionChecks,
  ];
  const plannedRuntimeChecks = results.runtimeProbePlan ?? [];
  return {
    runtimeProbeCount: runtimeChecks.length,
    runtimeProbeMethods: Array.from(new Set(runtimeChecks.map((check) => check.method))).sort(),
    runtimeProbePlanCount: plannedRuntimeChecks.length,
    runtimeProbePlanMethods: Array.from(new Set(plannedRuntimeChecks.map((check) => check.method))).sort(),
    runtimeProbePlanReadOnly: plannedRuntimeChecks.every((check) => check.readOnly === true && check.mutationExpected === false),
    runtimeProbesReadOnly: runtimeChecks.every((check) => check.readOnly === true && check.mutationExpected === false),
    staticContractCount: results.staticRejectionContracts.length,
    staticContractsPassed: results.staticRejectionContracts.every((contract) => contract.status === "passed"),
    cronTokenDenialCovered: results.staticRejectionContracts.some((contract) => contract.name.includes("cron token denial")),
    webhookRejectionCovered: results.staticRejectionContracts.some((contract) => contract.name.includes("webhook rejection")),
    retiredPublicRoutesCovered: results.staticRejectionContracts.some((contract) => contract.name.includes("retired public route")),
    unauthenticatedBodiesScanned: runtimeChecks.filter((check) => check.responseBodyScanned).length,
    unauthenticatedSensitiveFindings: runtimeChecks.flatMap((check) => check.sensitiveFindings ?? []),
    productionDataMutated: false,
    productionFixturesCreated: false,
    productionWorkerActivated: false,
    liveExternalProvidersConnected: false,
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

  const readOnlyPlan = assertProductionProbePlanReadOnly();
  if (!readOnlyPlan.ok) {
    throw new Error(`Production readiness runtime probe plan includes unsafe method(s): ${readOnlyPlan.unsafe.map((check) => `${check.name}:${check.method}`).join(", ")}.`);
  }

  const target = validateReadinessTarget(options.stagingUrl, { allowLocal: options.allowLocal });
  if (!target.ok) throw new Error(target.reason);

  const startedAt = new Date().toISOString();
  const staticRejectionContracts = evaluateStaticRejectionContracts();
  assertStaticContractsPassed(staticRejectionContracts);

  const results = {
    status: "passed",
    startedAt,
    completedAt: "",
    branch: safeGit(["branch", "--show-current"]),
    commit: safeGit(["rev-parse", "HEAD"]),
    targetHost: target.host,
    planOnly: options.planOnly === true,
    runtimeProbePlan: productionRuntimeHttpProbePlan(),
    localChecks: [],
    stagingDeploy: null,
    publicChecks: [],
    protectedUnauthenticatedChecks: [],
    protectedInvalidSessionChecks: [],
    staticRejectionContracts,
    safety: null,
    statements: [
      "Production runtime probes are read-only GET/HEAD requests only.",
      "POST-only cron, webhook, and retired-route rejection checks are static contract evidence and are not executed against production by this gate.",
      "Unauthenticated runtime probe bodies are scanned for high-confidence PII, raw report, credential, and token markers where a body is returned.",
      "This gate does not create production fixtures, mutate production data, activate production workers, or call live external providers.",
    ],
  };

  if (!options.planOnly && !options.skipLocalChecks) {
    for (const check of REQUIRED_LOCAL_CHECKS) {
      runCommand(check);
      results.localChecks.push({ label: check.label, status: "passed" });
    }
  }

  if (!options.planOnly && !options.skipGithubDeployCheck) {
    results.stagingDeploy = assertLatestStagingDeployMatchesHead();
  }

  if (!options.planOnly) {
    for (const check of PUBLIC_STAGING_CHECKS) {
      results.publicChecks.push(await runHttpCheck(options.stagingUrl, options.timeoutMs, check));
    }

    for (const check of PROTECTED_UNAUTHENTICATED_ENDPOINT_CHECKS) {
      results.protectedUnauthenticatedChecks.push(await runHttpCheck(options.stagingUrl, options.timeoutMs, check));
    }

    for (const check of PROTECTED_INVALID_SESSION_ENDPOINT_CHECKS) {
      results.protectedInvalidSessionChecks.push(await runHttpCheck(options.stagingUrl, options.timeoutMs, check));
    }
  }

  results.completedAt = new Date().toISOString();
  results.safety = summarizeProbeSafety(results);
  return results;
}

function formatContractStatus(contract) {
  const status = contract.expectedStatus ? `HTTP ${contract.expectedStatus}` : `HTTP ${contract.expectedStatuses.join("/")}`;
  return `${contract.method} ${contract.route} (${status}; ${contract.productionExecution})`;
}

export function renderProductionSafeProbeEvidenceMarkdown(report) {
  const lines = [
    "# Latest Production-Safe Probe Evidence",
    "",
    `Generated at: ${report.completedAt || report.startedAt}`,
    `Current branch: \`${report.branch}\``,
    `Current commit hash: \`${report.commit}\``,
    `Target host: \`${report.targetHost}\``,
    `Plan-only mode: ${report.planOnly ? "yes" : "no"}`,
    "",
    "## Required Warnings",
    "",
    "- Production runtime probes are read-only `GET`/`HEAD` requests only.",
    "- POST-only cron, webhook, and retired-route rejection checks are static contract evidence and are not executed against production by this gate.",
    "- This evidence does not create production fixtures, mutate production data, activate production workers, or call live external providers.",
    "- Local/staging owner-denial proof is synthetic and is not production mutation proof.",
    "- Dashboard PASS alone is not sufficient release evidence.",
    "- This report does not claim production-at-scale readiness.",
    "",
    "## Runtime Read-Only Probe Results",
    "",
  ];

  lines.push("Planned runtime probes:", "");
  for (const check of report.runtimeProbePlan ?? []) {
    lines.push(`- ${check.name}: ${check.method} ${check.path}; accepted=${check.acceptedStatuses.join("/")}; read-only=${check.readOnly ? "yes" : "no"}`);
  }
  lines.push("");

  const runtimeChecks = [
    ...report.publicChecks,
    ...report.protectedUnauthenticatedChecks,
    ...report.protectedInvalidSessionChecks,
  ];
  if (runtimeChecks.length === 0) {
    lines.push("- No runtime HTTP probes executed by this plan-only report.");
  } else {
    for (const check of runtimeChecks) {
      lines.push(`- ${check.name}: ${check.method} ${check.path} -> HTTP ${check.status}; read-only=${check.readOnly ? "yes" : "no"}; body scanned=${check.responseBodyScanned ? "yes" : "no"}`);
    }
  }

  lines.push(
    "",
    "## Static Rejection Contract Evidence",
    "",
    "These POST-capable routes are not executed against production by this gate. The evidence verifies fail-closed source contracts.",
    "",
  );
  for (const contract of report.staticRejectionContracts) {
    lines.push(`- ${contract.name}: ${formatContractStatus(contract)}; status=${contract.status}`);
  }

  lines.push(
    "",
    "## Safety Summary",
    "",
    `- Runtime probes read-only: ${report.safety.runtimeProbesReadOnly ? "yes" : "no"}`,
    `- Runtime probe plan read-only: ${report.safety.runtimeProbePlanReadOnly ? "yes" : "no"}`,
    `- Runtime probe plan methods: ${report.safety.runtimeProbePlanMethods.length > 0 ? report.safety.runtimeProbePlanMethods.map((method) => `\`${method}\``).join(", ") : "none"}`,
    `- Runtime probe methods: ${report.safety.runtimeProbeMethods.length > 0 ? report.safety.runtimeProbeMethods.map((method) => `\`${method}\``).join(", ") : "none"}`,
    `- Cron token denial covered by static contract: ${report.safety.cronTokenDenialCovered ? "yes" : "no"}`,
    `- Webhook rejection covered by static contract: ${report.safety.webhookRejectionCovered ? "yes" : "no"}`,
    `- Retired public routes covered by static contract: ${report.safety.retiredPublicRoutesCovered ? "yes" : "no"}`,
    `- Unauthenticated sensitive findings: ${report.safety.unauthenticatedSensitiveFindings.length === 0 ? "none" : report.safety.unauthenticatedSensitiveFindings.join(", ")}`,
    `- Production data mutated: ${report.safety.productionDataMutated ? "yes" : "no"}`,
    `- Production fixtures created: ${report.safety.productionFixturesCreated ? "yes" : "no"}`,
    `- Production worker activated: ${report.safety.productionWorkerActivated ? "yes" : "no"}`,
    `- Live external providers connected: ${report.safety.liveExternalProvidersConnected ? "yes" : "no"}`,
    "",
  );

  return `${lines.join("\n")}\n`;
}

export function writeProductionSafeProbeEvidence(report, { rootDir = process.cwd(), evidenceDir = DEFAULT_EVIDENCE_DIR } = {}) {
  const absoluteEvidenceDir = repoPath(rootDir, evidenceDir);
  mkdirSync(absoluteEvidenceDir, { recursive: true });
  const markdownPath = normalizeRelativePath(path.join(evidenceDir, "latest-production-safe-probes.md"));
  const jsonPath = normalizeRelativePath(path.join(evidenceDir, "latest-production-safe-probes.json"));
  writeFileSync(repoPath(rootDir, markdownPath), renderProductionSafeProbeEvidenceMarkdown(report), "utf8");
  writeFileSync(repoPath(rootDir, jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { markdownPath, jsonPath };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  try {
    const result = await runProductionReadinessGate(options);
    const outputs = options.writeEvidence ? writeProductionSafeProbeEvidence(result, { evidenceDir: options.evidenceDir }) : null;
    if (options.json || normalizeBoolean(process.env.PRODUCTION_READINESS_JSON)) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("\nProduction readiness gate passed.");
      console.log(`Target host: ${result.targetHost}`);
      console.log(`Plan-only mode: ${result.planOnly ? "yes" : "no"}`);
      console.log(`Local checks: ${options.skipLocalChecks || result.planOnly ? "skipped" : result.localChecks.length}`);
      console.log(`Staging deploy: ${options.skipGithubDeployCheck || result.planOnly ? "skipped" : result.stagingDeploy?.headSha}`);
      console.log(`Public checks: ${result.publicChecks.length}`);
      console.log(`Protected unauthenticated checks: ${result.protectedUnauthenticatedChecks.length}`);
      console.log(`Protected invalid-session checks: ${result.protectedInvalidSessionChecks.length}`);
      console.log(`Static rejection contracts: ${result.staticRejectionContracts.length}`);
      console.log("Production runtime probes are read-only. POST-only rejection contracts are not executed against production by this gate.");
      if (outputs) {
        console.log(`Markdown: ${outputs.markdownPath}`);
        console.log(`JSON: ${outputs.jsonPath}`);
      }
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

if (process.argv[1] && existsSync(process.argv[1]) && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
