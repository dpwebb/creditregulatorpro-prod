import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const SMOKE_GATE_ENV = "CRP_ADVISORY_BRIDGE_REPORT_SMOKE";
export const SKIPPED_EXIT_CODE = 2;

export const ALLOWED_HOSTS = new Set(["staging.creditregulatorpro.com", "localhost", "127.0.0.1"]);
export const REFUSED_PRODUCTION_HOSTS = new Set(["creditregulatorpro.com", "www.creditregulatorpro.com"]);

export const ADVISORY_BRIDGE_REPORT_ENDPOINT = "/_api/regulation-registry/advisory-bridge/report";

export const REQUIRED_ADVISORY_BRIDGE_SAFETY_MESSAGES = [
  "This is an advisory diagnostic only.",
  "Static runtime references remain active consumer-facing truth.",
  "DB advisory references are admin/internal only.",
  "This endpoint does not change packet wording, packet readiness, or violation firing.",
  "Runtime activation requires a separate approved implementation, tests, rollback plan, and explicit activation task.",
] as const;

export const FORBIDDEN_ADVISORY_BRIDGE_SMOKE_ENDPOINTS = [
  { method: "POST", path: "/_api/regulation-registry/runtime-bridge/create" },
  { method: "POST", path: "/_api/regulation-registry/runtime-bridge/update-status" },
  { method: "POST", path: "/_api/regulation-registry/runtime-bridge/activate" },
  { method: "POST", path: "/_api/regulation-registry/runtime-bridge/activate-limited-runtime" },
  { method: "GET", path: "/_api/regulation-registry/runtime-bridge/runtime-selector" },
  { method: "POST", path: "/_api/regulation-registry/reconciliation-candidates/create" },
  { method: "POST", path: "/_api/regulation-registry/review" },
  { method: "POST", path: "/_api/regulation-registry/mapping" },
  { method: "POST", path: "/_api/regulation-registry/deactivate" },
  { method: "POST", path: "/_api/regulation-registry/restore" },
  { method: "GET", path: "/_api/packet/readiness" },
  { method: "POST", path: "/_api/packet/build" },
  { method: "POST", path: "/_api/packet/create" },
  { method: "POST", path: "/_api/violations/run" },
  { method: "POST", path: "/_api/parser/run" },
  { method: "POST", path: "/_api/ocr/run" },
] as const;

type AuthMode = "credentials" | "session_cookie";

export type SmokeConfig =
  | {
      status: "ready";
      baseUrl: string;
      host: string;
      authMode: AuthMode;
      adminEmail?: string;
      adminPassword?: string;
      adminSessionCookie?: string;
      nonAdminEmail?: string;
      nonAdminPassword?: string;
      nonAdminSessionCookie?: string;
      runId: string;
    }
  | {
      status: "skipped";
      reason: string;
    }
  | {
      status: "error";
      reason: string;
    };

type JsonResponse = {
  response: Response;
  status: number;
  body: any;
  text: string;
};

type Snapshot =
  | {
      status: "captured";
      label: string;
      hash: string;
      count: number | null;
    }
  | {
      status: "skipped";
      label: string;
      reason: string;
    };

function normalizeBoolean(value: string | undefined): boolean {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function normalizeEnv(value: string | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function toAbsoluteUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

export function validateSmokeHost(baseUrl: string): { ok: true; host: string } | { ok: false; reason: string } {
  const host = hostOf(baseUrl);
  if (!host) return { ok: false, reason: "Invalid smoke base URL." };
  if (REFUSED_PRODUCTION_HOSTS.has(host)) {
    return { ok: false, reason: `Refusing to run against production host ${host}.` };
  }
  if (!ALLOWED_HOSTS.has(host)) {
    return { ok: false, reason: `Refusing to run against unapproved host ${host}.` };
  }
  return { ok: true, host };
}

function smokeRunIdentifier(runId: string): string {
  const safe = runId
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || "run";
}

export function buildNoMatchAdvisoryReportPath(runId: string): string {
  const suffix = smokeRunIdentifier(runId);
  const params = new URLSearchParams({
    deterministicRuleId: `ADVISORY_BRIDGE_SMOKE_NO_MATCH_${suffix}`,
    bridgeMode: "advisory",
    activationStatus: "approved_for_advisory",
    limit: "1",
  });
  return `${ADVISORY_BRIDGE_REPORT_ENDPOINT}?${params}`;
}

export function buildSmokeConfig(env: NodeJS.ProcessEnv): SmokeConfig {
  if (!normalizeBoolean(env[SMOKE_GATE_ENV])) {
    return {
      status: "skipped",
      reason: `SKIPPED: ${SMOKE_GATE_ENV}=true is required.`,
    };
  }

  const stagingBaseUrl = normalizeEnv(env.STAGING_BASE_URL);
  const localBaseUrl = normalizeEnv(env.LOCAL_SMOKE_BASE_URL);
  const baseUrl = stagingBaseUrl ?? localBaseUrl;

  if (!baseUrl) {
    return {
      status: "skipped",
      reason: "SKIPPED: no safe authenticated admin context configured.",
    };
  }

  const hostCheck = validateSmokeHost(baseUrl);
  if (hostCheck.ok === false) {
    return { status: "error", reason: hostCheck.reason };
  }

  const isLocalHost = hostCheck.host === "localhost" || hostCheck.host === "127.0.0.1";
  const adminSessionCookie = stagingBaseUrl
    ? normalizeEnv(env.STAGING_ADMIN_SESSION_COOKIE)
    : normalizeEnv(env.LOCAL_SMOKE_ADMIN_SESSION_COOKIE);
  const adminEmail = stagingBaseUrl
    ? normalizeEnv(env.STAGING_ADMIN_EMAIL)
    : normalizeEnv(env.LOCAL_SMOKE_ADMIN_EMAIL);
  const adminPassword = stagingBaseUrl
    ? normalizeEnv(env.STAGING_ADMIN_PASSWORD)
    : normalizeEnv(env.LOCAL_SMOKE_ADMIN_PASSWORD);

  const nonAdminSessionCookie = stagingBaseUrl
    ? normalizeEnv(env.STAGING_NON_ADMIN_SESSION_COOKIE)
    : normalizeEnv(env.LOCAL_SMOKE_NON_ADMIN_SESSION_COOKIE);
  const nonAdminEmail = stagingBaseUrl
    ? normalizeEnv(env.STAGING_NON_ADMIN_EMAIL)
    : normalizeEnv(env.LOCAL_SMOKE_NON_ADMIN_EMAIL);
  const nonAdminPassword = stagingBaseUrl
    ? normalizeEnv(env.STAGING_NON_ADMIN_PASSWORD)
    : normalizeEnv(env.LOCAL_SMOKE_NON_ADMIN_PASSWORD);
  const runId = normalizeEnv(env.CRP_ADVISORY_BRIDGE_REPORT_SMOKE_RUN_ID) ?? `advisory-bridge-report-smoke-${Date.now()}`;

  if (adminSessionCookie) {
    return {
      status: "ready",
      baseUrl,
      host: hostCheck.host,
      authMode: "session_cookie",
      adminSessionCookie,
      nonAdminSessionCookie: nonAdminSessionCookie ?? undefined,
      nonAdminEmail: nonAdminEmail ?? undefined,
      nonAdminPassword: nonAdminPassword ?? undefined,
      runId,
    };
  }

  if (adminEmail && adminPassword) {
    return {
      status: "ready",
      baseUrl,
      host: hostCheck.host,
      authMode: "credentials",
      adminEmail,
      adminPassword,
      nonAdminSessionCookie: nonAdminSessionCookie ?? undefined,
      nonAdminEmail: nonAdminEmail ?? undefined,
      nonAdminPassword: nonAdminPassword ?? undefined,
      runId,
    };
  }

  return {
    status: "skipped",
    reason: isLocalHost
      ? "SKIPPED: LOCAL_SMOKE_ADMIN_EMAIL/LOCAL_SMOKE_ADMIN_PASSWORD or LOCAL_SMOKE_ADMIN_SESSION_COOKIE is required."
      : "SKIPPED: STAGING_ADMIN_EMAIL/STAGING_ADMIN_PASSWORD or STAGING_ADMIN_SESSION_COOKIE is required.",
  };
}

export function redactSecretText(value: string, env: NodeJS.ProcessEnv): string {
  const secretValues = [
    env.STAGING_ADMIN_PASSWORD,
    env.STAGING_ADMIN_SESSION_COOKIE,
    env.STAGING_NON_ADMIN_PASSWORD,
    env.STAGING_NON_ADMIN_SESSION_COOKIE,
    env.LOCAL_SMOKE_ADMIN_PASSWORD,
    env.LOCAL_SMOKE_ADMIN_SESSION_COOKIE,
    env.LOCAL_SMOKE_NON_ADMIN_PASSWORD,
    env.LOCAL_SMOKE_NON_ADMIN_SESSION_COOKIE,
  ]
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length >= 4);

  return secretValues.reduce((output, secret) => output.split(secret).join("[REDACTED]"), value);
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, stable(nestedValue)]),
    );
  }
  return value ?? null;
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function countTopLevelItems(body: any): number | null {
  for (const key of ["mappings", "regulations", "candidates", "results", "ignoredMappings"]) {
    if (Array.isArray(body?.[key])) return body[key].length;
  }
  return Array.isArray(body) ? body.length : null;
}

function cookieHeaderFromSetCookie(setCookie: string): string {
  const normalized = setCookie.replace(/^cookie:\s*/i, "").trim();
  return normalized
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("floot_built_app_session=")) ?? "";
}

async function loginWithCredentials(baseUrl: string, email: string, password: string): Promise<string> {
  const response = await fetch(toAbsoluteUrl(baseUrl, "/_api/auth/login_with_password"), {
    method: "POST",
    body: JSON.stringify({ email, password }),
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: baseUrl,
    },
  });
  if (!response.ok) {
    throw new Error(`Configured credentials did not authenticate: HTTP ${response.status}.`);
  }

  const sessionCookie = cookieHeaderFromSetCookie(response.headers.get("set-cookie") ?? "");
  if (!sessionCookie) {
    throw new Error("Configured credentials authenticated without returning a session cookie.");
  }
  return sessionCookie;
}

async function cookieForConfig(config: Extract<SmokeConfig, { status: "ready" }>): Promise<string> {
  if (config.authMode === "session_cookie") {
    const sessionCookie = cookieHeaderFromSetCookie(config.adminSessionCookie!);
    if (!sessionCookie) {
      throw new Error("Configured admin session cookie did not include floot_built_app_session.");
    }
    return sessionCookie;
  }

  return loginWithCredentials(config.baseUrl, config.adminEmail!, config.adminPassword!);
}

async function cookieForNonAdmin(config: Extract<SmokeConfig, { status: "ready" }>): Promise<string | null> {
  if (config.nonAdminSessionCookie) {
    const sessionCookie = cookieHeaderFromSetCookie(config.nonAdminSessionCookie);
    if (!sessionCookie) {
      throw new Error("Configured non-admin session cookie did not include floot_built_app_session.");
    }
    return sessionCookie;
  }

  if (config.nonAdminEmail && config.nonAdminPassword) {
    return loginWithCredentials(config.baseUrl, config.nonAdminEmail, config.nonAdminPassword);
  }

  return null;
}

class SmokeHttpClient {
  readonly observedRequests: string[] = [];

  constructor(
    private readonly baseUrl: string,
    private readonly cookieHeader: string,
  ) {}

  async json(method: "GET" | "POST", path: string, data?: unknown): Promise<JsonResponse> {
    this.observedRequests.push(`${method} ${path.split("?")[0]}`);
    const response = await fetch(toAbsoluteUrl(this.baseUrl, path), {
      method,
      body: method === "POST" ? JSON.stringify(data ?? {}) : undefined,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Cookie: this.cookieHeader,
        Origin: this.baseUrl,
      },
    });
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    return { response, status: response.status, body, text };
  }
}

async function assertAdminSession(client: SmokeHttpClient): Promise<void> {
  const session = await client.json("GET", "/_api/auth/session");
  if (!session.response.ok) {
    throw new Error(`Admin session check returned HTTP ${session.status}.`);
  }
  if (session.body?.user?.role !== "admin") {
    throw new Error("Configured authenticated context did not resolve to admin.");
  }
}

async function captureOptionalSnapshot(client: SmokeHttpClient, label: string, path: string): Promise<Snapshot> {
  const result = await client.json("GET", path);
  if (result.status === 404) {
    return { status: "skipped", label, reason: `${label} endpoint returned HTTP 404.` };
  }
  if (!result.response.ok) {
    return { status: "skipped", label, reason: `${label} endpoint returned HTTP ${result.status}.` };
  }
  return {
    status: "captured",
    label,
    hash: hashJson(result.body),
    count: countTopLevelItems(result.body),
  };
}

function assertSnapshotUnchanged(before: Snapshot, after: Snapshot): boolean {
  if (before.status !== "captured" || after.status !== "captured") return false;
  if (before.hash !== after.hash) {
    throw new Error(`${before.label} response changed during advisory bridge report smoke.`);
  }
  return true;
}

function assertAdvisoryReportShape(body: any, label: string): void {
  if (body?.mode !== "advisory") throw new Error(`${label} did not return advisory mode.`);
  if (body?.runtimeSourceUsed !== "static_runtime") {
    throw new Error(`${label} did not preserve static runtime source.`);
  }
  if (!Array.isArray(body?.results)) throw new Error(`${label} did not include results array.`);
  if (!Array.isArray(body?.ignoredMappings)) throw new Error(`${label} did not include ignoredMappings array.`);
  if (!body?.summary || typeof body.summary !== "object") throw new Error(`${label} did not include summary.`);
  for (const message of REQUIRED_ADVISORY_BRIDGE_SAFETY_MESSAGES) {
    if (!body.safetyMessages?.includes(message)) {
      throw new Error(`${label} did not include required safety message: ${message}`);
    }
  }

  for (const result of body.results) {
    if (result?.runtimeSourceUsed !== "static_runtime") {
      throw new Error(`${label} included a result that did not preserve static runtime source.`);
    }
    if (result?.advisoryReference?.displayScope !== undefined &&
      result.advisoryReference.displayScope !== "admin_internal_only") {
      throw new Error(`${label} included advisory metadata outside admin/internal scope.`);
    }
    const advisoryReason = String(result?.advisoryReference?.advisoryReason ?? "");
    if (/\b(this is illegal|violates the law|confirmed violation|entitled to damages|must pay|the bureau broke the law)\b/i.test(advisoryReason)) {
      throw new Error(`${label} included forbidden consumer legal-conclusion language.`);
    }
  }
}

function assertNoForbiddenEndpointCalls(client: SmokeHttpClient): void {
  const forbidden = client.observedRequests.filter((request) =>
    FORBIDDEN_ADVISORY_BRIDGE_SMOKE_ENDPOINTS.some(
      (endpoint) => request === `${endpoint.method} ${endpoint.path}`,
    ),
  );
  if (forbidden.length > 0) {
    throw new Error(`Forbidden advisory bridge smoke endpoint calls observed: ${forbidden.join(", ")}.`);
  }
}

async function verifyNonAdminIfConfigured(
  config: Extract<SmokeConfig, { status: "ready" }>,
): Promise<string> {
  const cookie = await cookieForNonAdmin(config);
  if (!cookie) return "skipped: no safe non-admin context configured";

  const client = new SmokeHttpClient(config.baseUrl, cookie);
  const session = await client.json("GET", "/_api/auth/session");
  if (!session.response.ok) {
    return `skipped: non-admin session check returned HTTP ${session.status}`;
  }
  if (session.body?.user?.role === "admin") {
    throw new Error("Configured non-admin context resolved to admin; refusing non-admin smoke.");
  }

  const report = await client.json("GET", ADVISORY_BRIDGE_REPORT_ENDPOINT);
  if (![401, 403].includes(report.status)) {
    throw new Error(`Expected non-admin advisory report denial, got HTTP ${report.status}.`);
  }
  return `advisory bridge report denied non-admin (${report.status})`;
}

export async function runSmoke(config: Extract<SmokeConfig, { status: "ready" }>) {
  const adminCookie = await cookieForConfig(config);
  const client = new SmokeHttpClient(config.baseUrl, adminCookie);

  await assertAdminSession(client);

  const beforeRegistry = await captureOptionalSnapshot(
    client,
    "regulation registry",
    "/_api/regulation-registry/list?includeInactive=true",
  );
  const beforeMappings = await captureOptionalSnapshot(
    client,
    "regulation violation mappings",
    "/_api/regulation-registry/mapping",
  );
  const beforeBridgeMappings = await captureOptionalSnapshot(
    client,
    "runtime bridge mappings",
    "/_api/regulation-registry/runtime-bridge/list?limit=300",
  );
  const beforeCandidates = await captureOptionalSnapshot(
    client,
    "reconciliation candidates",
    "/_api/regulation-registry/reconciliation-candidates/list?limit=300",
  );

  const report = await client.json("GET", `${ADVISORY_BRIDGE_REPORT_ENDPOINT}?limit=25`);
  if (!report.response.ok) {
    throw new Error(`Advisory bridge report returned HTTP ${report.status}.`);
  }
  assertAdvisoryReportShape(report.body, "Advisory bridge report");

  const noMatchReport = await client.json("GET", buildNoMatchAdvisoryReportPath(config.runId));
  if (!noMatchReport.response.ok) {
    throw new Error(`No-match advisory bridge report returned HTTP ${noMatchReport.status}.`);
  }
  assertAdvisoryReportShape(noMatchReport.body, "No-match advisory bridge report");
  if ((noMatchReport.body?.results ?? []).some((result: any) => result?.advisoryReference)) {
    throw new Error("No-match advisory bridge report returned advisory metadata.");
  }

  const afterRegistry = await captureOptionalSnapshot(
    client,
    "regulation registry",
    "/_api/regulation-registry/list?includeInactive=true",
  );
  const afterMappings = await captureOptionalSnapshot(
    client,
    "regulation violation mappings",
    "/_api/regulation-registry/mapping",
  );
  const afterBridgeMappings = await captureOptionalSnapshot(
    client,
    "runtime bridge mappings",
    "/_api/regulation-registry/runtime-bridge/list?limit=300",
  );
  const afterCandidates = await captureOptionalSnapshot(
    client,
    "reconciliation candidates",
    "/_api/regulation-registry/reconciliation-candidates/list?limit=300",
  );

  const registryResponseUnchanged = assertSnapshotUnchanged(beforeRegistry, afterRegistry);
  const mappingResponseUnchanged = assertSnapshotUnchanged(beforeMappings, afterMappings);
  const runtimeBridgeMappingsUnchanged = assertSnapshotUnchanged(beforeBridgeMappings, afterBridgeMappings);
  const reconciliationCandidatesUnchanged = assertSnapshotUnchanged(beforeCandidates, afterCandidates);

  const nonAdminResult = await verifyNonAdminIfConfigured(config);
  const health = await fetch(toAbsoluteUrl(config.baseUrl, "/"), { method: "HEAD" });
  if (!health.ok) throw new Error(`Smoke target health returned HTTP ${health.status}.`);
  assertNoForbiddenEndpointCalls(client);

  return {
    status: "passed" as const,
    baseUrl: config.baseUrl,
    host: config.host,
    authMode: config.authMode,
    runId: config.runId,
    reportSummary: report.body.summary,
    noMatchReportSummary: noMatchReport.body.summary,
    nonAdminResult,
    runtimeSafety: {
      noRuntimeSelectorEndpointCalled: true,
      dbRegistryRemainedGovernanceMetadata: true,
      staticRuntimeTruthUnchangedBySmoke: true,
      registryResponseUnchanged,
      mappingResponseUnchanged,
      runtimeBridgeMappingsUnchanged,
      reconciliationCandidatesUnchanged,
      packetReadinessEndpointCalls: 0,
      packetWordingEndpointCalls: 0,
      violationFiringEndpointCalls: 0,
      advisoryDiagnosticsOnly: true,
    },
    optionalSnapshots: {
      beforeRegistry,
      afterRegistry,
      beforeMappings,
      afterMappings,
      beforeBridgeMappings,
      afterBridgeMappings,
      beforeCandidates,
      afterCandidates,
    },
  };
}

export async function runCli(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const config = buildSmokeConfig(env);
  if (config.status === "skipped") {
    console.log(config.reason);
    return SKIPPED_EXIT_CODE;
  }
  if (config.status === "error") {
    console.error(config.reason);
    return 1;
  }

  try {
    const result = await runSmoke(config);
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    console.error(redactSecretText(error instanceof Error ? error.message : String(error), env));
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCli().then((code) => {
    process.exitCode = code;
  });
}
