import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const SMOKE_GATE_ENV = "CRP_RUNTIME_BRIDGE_MAPPING_SMOKE";
export const SKIPPED_EXIT_CODE = 2;

export const ALLOWED_HOSTS = new Set(["staging.creditregulatorpro.com", "localhost", "127.0.0.1"]);
export const REFUSED_PRODUCTION_HOSTS = new Set(["creditregulatorpro.com", "www.creditregulatorpro.com"]);

export const RUNTIME_BRIDGE_ENDPOINTS = {
  create: "/_api/regulation-registry/runtime-bridge/create",
  list: "/_api/regulation-registry/runtime-bridge/list",
  updateStatus: "/_api/regulation-registry/runtime-bridge/update-status",
} as const;

export const FORBIDDEN_RUNTIME_MUTATION_ENDPOINTS = [
  { method: "POST", path: "/_api/regulation-registry/runtime-bridge/activate" },
  { method: "POST", path: "/_api/regulation-registry/runtime-bridge/activate-limited-runtime" },
  { method: "GET", path: "/_api/regulation-registry/runtime-bridge/runtime-selector" },
  { method: "POST", path: "/_api/regulation-registry/reconciliation-candidates/create" },
  { method: "POST", path: "/_api/regulation-registry/review" },
  { method: "POST", path: "/_api/regulation-registry/mapping" },
  { method: "POST", path: "/_api/regulation-registry/deactivate" },
  { method: "POST", path: "/_api/regulation-registry/restore" },
] as const;

export const SYNTHETIC_RUNTIME_BRIDGE_MAPPING = {
  bridgeMode: "shadow",
  deterministicRuleId: "UI_SMOKE_RUNTIME_BRIDGE_RULE",
  violationCategory: "UI_SMOKE_CATEGORY",
  staticReferenceId: "UI_SMOKE_STATIC_REF",
  dbRegulationId: "UI_SMOKE_DB_REF",
  referenceClass: "local_procedural",
  consumerWordingMode: "procedural_reference",
  activationReason: "Synthetic runtime bridge smoke only",
  sourceVersion: "ui-smoke",
  staticSnapshotHash: "synthetic-static-hash",
  dbSnapshotHash: "synthetic-db-hash",
} as const;

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

export function buildSyntheticRuntimeBridgePayload(runId: string) {
  const suffix = smokeRunIdentifier(runId);
  return {
    ...SYNTHETIC_RUNTIME_BRIDGE_MAPPING,
    deterministicRuleId: `${SYNTHETIC_RUNTIME_BRIDGE_MAPPING.deterministicRuleId}_${suffix}`,
    staticReferenceId: `${SYNTHETIC_RUNTIME_BRIDGE_MAPPING.staticReferenceId}_${suffix}`,
    dbRegulationId: `${SYNTHETIC_RUNTIME_BRIDGE_MAPPING.dbRegulationId}_${suffix}`,
    staticSnapshotHash: `${SYNTHETIC_RUNTIME_BRIDGE_MAPPING.staticSnapshotHash}-${suffix}`,
    dbSnapshotHash: `${SYNTHETIC_RUNTIME_BRIDGE_MAPPING.dbSnapshotHash}-${suffix}`,
    testManifest: {
      smokeRunId: suffix,
      expectedRuntimeSource: "static_runtime",
      syntheticOnly: true,
    },
  };
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
  const runId = normalizeEnv(env.CRP_RUNTIME_BRIDGE_MAPPING_SMOKE_RUN_ID) ?? `runtime-bridge-smoke-${Date.now()}`;

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
  for (const key of ["mappings", "regulations", "candidates"]) {
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
    throw new Error(`${before.label} response changed during runtime bridge mapping smoke.`);
  }
  return true;
}

async function expectStatus(
  promise: Promise<JsonResponse>,
  expectedStatuses: number[],
  label: string,
): Promise<JsonResponse> {
  const result = await promise;
  if (!expectedStatuses.includes(result.status)) {
    throw new Error(`${label} returned HTTP ${result.status}, expected ${expectedStatuses.join(" or ")}.`);
  }
  return result;
}

function mappingIdFrom(body: any): number {
  const id = Number(body?.mapping?.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Runtime bridge mapping response did not include a valid mapping ID.");
  }
  return id;
}

async function archiveSyntheticMapping(client: SmokeHttpClient, mappingId: number): Promise<string> {
  const result = await client.json("POST", RUNTIME_BRIDGE_ENDPOINTS.updateStatus, {
    mappingId,
    activationStatus: "archived",
    activationReason: "Archived after gated runtime bridge mapping smoke.",
  });
  if (!result.response.ok) {
    throw new Error(`Synthetic runtime bridge mapping archive returned HTTP ${result.status}.`);
  }
  return result.body?.mapping?.activationStatus ?? "archived";
}

function assertNoForbiddenEndpointCalls(client: SmokeHttpClient): void {
  const forbidden = client.observedRequests.filter((request) =>
    FORBIDDEN_RUNTIME_MUTATION_ENDPOINTS.some(
      (endpoint) => request === `${endpoint.method} ${endpoint.path}`,
    ),
  );
  if (forbidden.length > 0) {
    throw new Error(`Forbidden runtime mutation endpoint calls observed: ${forbidden.join(", ")}.`);
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

  const list = await client.json("GET", RUNTIME_BRIDGE_ENDPOINTS.list);
  const create = await client.json("POST", RUNTIME_BRIDGE_ENDPOINTS.create, {});
  const update = await client.json("POST", RUNTIME_BRIDGE_ENDPOINTS.updateStatus, { mappingId: -1 });
  for (const [label, result] of [
    ["list", list],
    ["create", create],
    ["update", update],
  ] as const) {
    if (![401, 403].includes(result.status)) {
      throw new Error(`Expected non-admin ${label} denial, got HTTP ${result.status}.`);
    }
  }
  return `runtime bridge endpoints denied non-admin (${list.status}/${create.status}/${update.status})`;
}

export async function runSmoke(config: Extract<SmokeConfig, { status: "ready" }>) {
  const adminCookie = await cookieForConfig(config);
  const client = new SmokeHttpClient(config.baseUrl, adminCookie);
  const payload = buildSyntheticRuntimeBridgePayload(config.runId);
  let mappingId: number | null = null;
  let cleanupStatus = "not needed";

  try {
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
    const candidatePath =
      `/_api/regulation-registry/reconciliation-candidates/list?reconciliationRunId=${encodeURIComponent(config.runId)}`;
    const beforeCandidates = await captureOptionalSnapshot(client, "reconciliation candidates", candidatePath);

    const created = await client.json("POST", RUNTIME_BRIDGE_ENDPOINTS.create, payload);
    if (!created.response.ok) {
      throw new Error(`Runtime bridge mapping create returned HTTP ${created.status}.`);
    }
    mappingId = mappingIdFrom(created.body);
    if (created.body?.mapping?.activationStatus !== "draft") {
      throw new Error(`Synthetic mapping was created with ${created.body?.mapping?.activationStatus}, expected draft.`);
    }

    const duplicate = await client.json("POST", RUNTIME_BRIDGE_ENDPOINTS.create, payload);
    let duplicateBehavior = "";
    if (duplicate.status === 409) {
      duplicateBehavior = "blocked with HTTP 409";
    } else if (duplicate.response.ok && mappingIdFrom(duplicate.body) === mappingId) {
      duplicateBehavior = "reused existing mapping";
    } else {
      throw new Error(`Duplicate create returned unsafe HTTP ${duplicate.status}.`);
    }

    const listParams = new URLSearchParams({
      bridgeMode: payload.bridgeMode,
      activationStatus: "draft",
      deterministicRuleId: payload.deterministicRuleId,
      violationCategory: payload.violationCategory,
      staticReferenceId: payload.staticReferenceId,
      dbRegulationId: payload.dbRegulationId,
      referenceClass: payload.referenceClass,
      consumerWordingMode: payload.consumerWordingMode,
      limit: "25",
    });
    const listed = await client.json("GET", `${RUNTIME_BRIDGE_ENDPOINTS.list}?${listParams}`);
    if (!listed.response.ok) {
      throw new Error(`Runtime bridge mapping filtered list returned HTTP ${listed.status}.`);
    }
    const listedMappings = Array.isArray(listed.body?.mappings) ? listed.body.mappings : [];
    if (!listedMappings.some((mapping: any) => Number(mapping.id) === mappingId)) {
      throw new Error("Filtered runtime bridge mapping list did not find the synthetic mapping.");
    }

    await expectStatus(
      client.json("POST", RUNTIME_BRIDGE_ENDPOINTS.updateStatus, {
        mappingId,
        activationStatus: "approved_for_shadow",
        activationReason: "Synthetic smoke approved for shadow review only.",
      }),
      [200],
      "approved_for_shadow update",
    );
    await expectStatus(
      client.json("POST", RUNTIME_BRIDGE_ENDPOINTS.updateStatus, {
        mappingId,
        activationStatus: "approved_for_advisory",
        activationReason: "Synthetic smoke approved for advisory review only.",
      }),
      [200],
      "approved_for_advisory update",
    );
    await expectStatus(
      client.json("POST", RUNTIME_BRIDGE_ENDPOINTS.updateStatus, {
        mappingId,
        activationStatus: "approved_for_limited_runtime",
        activationReason: "Synthetic smoke should fail without rollback reference.",
        testManifest: { expectedRuntimeSource: "static_runtime", syntheticOnly: true },
      }),
      [400],
      "approved_for_limited_runtime without rollbackStaticReferenceId",
    );
    await expectStatus(
      client.json("POST", RUNTIME_BRIDGE_ENDPOINTS.updateStatus, {
        mappingId,
        activationStatus: "approved_for_limited_runtime",
        activationReason: "Synthetic smoke should fail without test manifest.",
        rollbackStaticReferenceId: payload.staticReferenceId,
      }),
      [400],
      "approved_for_limited_runtime without testManifest",
    );
    await expectStatus(
      client.json("POST", RUNTIME_BRIDGE_ENDPOINTS.updateStatus, {
        mappingId,
        activationStatus: "active_limited_runtime",
        activationReason: "Synthetic smoke must not activate runtime truth.",
      }),
      [400],
      "active_limited_runtime rejection",
    );

    cleanupStatus = await archiveSyntheticMapping(client, mappingId);

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
    const afterCandidates = await captureOptionalSnapshot(client, "reconciliation candidates", candidatePath);

    const registryResponseUnchanged = assertSnapshotUnchanged(beforeRegistry, afterRegistry);
    const mappingResponseUnchanged = assertSnapshotUnchanged(beforeMappings, afterMappings);
    const reconciliationCandidatesUnchanged = assertSnapshotUnchanged(beforeCandidates, afterCandidates);

    const finalLookup = await client.json(
      "GET",
      `${RUNTIME_BRIDGE_ENDPOINTS.list}?dbRegulationId=${encodeURIComponent(payload.dbRegulationId)}&limit=25`,
    );
    if (!finalLookup.response.ok) {
      throw new Error(`Final runtime bridge mapping lookup returned HTTP ${finalLookup.status}.`);
    }
    const finalMapping = (finalLookup.body?.mappings ?? []).find((mapping: any) => Number(mapping.id) === mappingId);
    if (finalMapping?.activationStatus !== "archived") {
      throw new Error(`Synthetic mapping final status is ${finalMapping?.activationStatus ?? "missing"}, expected archived.`);
    }

    const nonAdminResult = await verifyNonAdminIfConfigured(config);
    const health = await fetch(toAbsoluteUrl(config.baseUrl, "/"), { method: "HEAD" });
    if (!health.ok) throw new Error(`Smoke target health returned HTTP ${health.status}.`);
    assertNoForbiddenEndpointCalls(client);

    return {
      status: "passed" as const,
      baseUrl: config.baseUrl,
      host: config.host,
      authMode: config.authMode,
      mappingId,
      runId: config.runId,
      duplicateBehavior,
      cleanupStatus,
      nonAdminResult,
      runtimeSafety: {
        noRuntimeSelectorEndpointCalled: true,
        dbRegistryRemainedGovernanceMetadata: true,
        staticRuntimeTruthUnchangedBySmoke: true,
        registryResponseUnchanged,
        mappingResponseUnchanged,
        reconciliationCandidatesUnchanged,
        packetReadinessEndpointCalls: 0,
        packetWordingEndpointCalls: 0,
        violationFiringEndpointCalls: 0,
        syntheticMappingGovernanceOnly: true,
      },
      optionalSnapshots: {
        beforeRegistry,
        afterRegistry,
        beforeMappings,
        afterMappings,
        beforeCandidates,
        afterCandidates,
      },
    };
  } catch (error) {
    if (mappingId && cleanupStatus === "not needed") {
      try {
        cleanupStatus = await archiveSyntheticMapping(client, mappingId);
      } catch {
        cleanupStatus = "archive failed";
      }
    }
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} Mapping ID: ${mappingId ?? "none"}. Final cleanup status: ${cleanupStatus}.`,
    );
  }
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
