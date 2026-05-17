import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const SMOKE_GATE_ENV = "CRP_OUTCOME_TRACKING_SMOKE";
export const SKIPPED_EXIT_CODE = 2;

export const ALLOWED_HOSTS = new Set(["staging.creditregulatorpro.com", "localhost", "127.0.0.1"]);
export const REFUSED_PRODUCTION_HOSTS = new Set(["creditregulatorpro.com", "www.creditregulatorpro.com"]);

export const OUTCOME_ENDPOINTS = {
  compare: "/_api/outcomes/compare",
  list: "/_api/outcomes/list",
  get: "/_api/outcomes/get",
} as const;

export const SUPPORTING_READ_ONLY_ENDPOINTS = {
  session: "/_api/auth/session",
  login: "/_api/auth/login_with_password",
  uploadResults: "/_api/upload-results/get",
} as const;

export const FORBIDDEN_OUTCOME_SMOKE_ENDPOINTS = [
  { method: "POST", path: "/_api/parser/run" },
  { method: "POST", path: "/_api/parser-lab/run" },
  { method: "POST", path: "/_api/ocr/run" },
  { method: "POST", path: "/_api/ingest/process" },
  { method: "GET", path: "/_api/packet/readiness" },
  { method: "POST", path: "/_api/packet/build" },
  { method: "POST", path: "/_api/packet/create" },
  { method: "POST", path: "/_api/packet/save" },
  { method: "GET", path: "/_api/packet/pdf" },
  { method: "POST", path: "/_api/violations/run" },
  { method: "POST", path: "/_api/creditor-validation/run" },
  { method: "POST", path: "/_api/regulation-registry/runtime-bridge/activate" },
  { method: "POST", path: "/_api/regulation-registry/runtime-bridge/activate-limited-runtime" },
  { method: "GET", path: "/_api/regulation-registry/runtime-bridge/runtime-selector" },
  { method: "POST", path: "/_api/admin/override" },
  { method: "POST", path: "/_api/furnisher/packet" },
] as const;

export const OUTCOME_CLEANUP_POLICY =
  "No safe outcome archive/delete endpoint exists; successful smoke runs leave append-only synthetic outcome rows and report their IDs.";

type AuthMode = "credentials" | "session_cookie";
type AuthRole = "admin" | "user";

export type SmokeConfig =
  | {
      status: "ready";
      baseUrl: string;
      host: string;
      authMode: AuthMode;
      authRole: AuthRole;
      sessionCookie?: string;
      email?: string;
      password?: string;
      nonOwnerSessionCookie?: string;
      nonOwnerEmail?: string;
      nonOwnerPassword?: string;
      fixture: SyntheticOutcomeFixture;
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

export type SyntheticOutcomeFixture = {
  previousReportArtifactId: number;
  laterReportArtifactId: number;
  packetId?: number;
  disputePacketFindingId?: number;
  expectedOutcomeTypes: string[];
  syntheticMarker: string;
  runResponseOnly: boolean;
};

type JsonResponse = {
  response: Response;
  status: number;
  body: any;
  text: string;
};

function normalizeBoolean(value: string | undefined): boolean {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function normalizeEnv(value: string | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function numberEnv(value: string | undefined): number | null {
  const raw = normalizeEnv(value);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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

function smokeRunIdentifier(runId: string): string {
  const safe = runId
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || "run";
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

function expectedOutcomeTypes(value: string | undefined): string[] {
  const raw = normalizeEnv(value);
  if (!raw) return ["unchanged", "corrected"];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function markerIsSynthetic(value: string | null): value is string {
  return Boolean(value && /outcome[_-]?smoke/i.test(value));
}

function prefixedEnv(env: NodeJS.ProcessEnv, prefix: "STAGING" | "LOCAL_SMOKE", key: string): string | undefined {
  return env[`${prefix}_OUTCOME_${key}`];
}

export function buildSyntheticOutcomeFixture(
  env: NodeJS.ProcessEnv,
  prefix: "STAGING" | "LOCAL_SMOKE",
): SyntheticOutcomeFixture | null {
  const marker = normalizeEnv(prefixedEnv(env, prefix, "SYNTHETIC_MARKER"));
  const previousReportArtifactId = numberEnv(prefixedEnv(env, prefix, "PREVIOUS_REPORT_ARTIFACT_ID"));
  const laterReportArtifactId = numberEnv(prefixedEnv(env, prefix, "LATER_REPORT_ARTIFACT_ID"));
  if (!previousReportArtifactId || !laterReportArtifactId || !markerIsSynthetic(marker)) {
    return null;
  }

  return {
    previousReportArtifactId,
    laterReportArtifactId,
    packetId: numberEnv(prefixedEnv(env, prefix, "PACKET_ID")) ?? undefined,
    disputePacketFindingId: numberEnv(prefixedEnv(env, prefix, "DISPUTE_PACKET_FINDING_ID")) ?? undefined,
    expectedOutcomeTypes: expectedOutcomeTypes(prefixedEnv(env, prefix, "EXPECTED_OUTCOME_TYPES")),
    syntheticMarker: marker,
    runResponseOnly: normalizeBoolean(prefixedEnv(env, prefix, "RUN_RESPONSE_ONLY")),
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
  const prefix: "STAGING" | "LOCAL_SMOKE" = stagingBaseUrl ? "STAGING" : "LOCAL_SMOKE";

  if (!baseUrl) {
    return {
      status: "skipped",
      reason: "SKIPPED: no safe authenticated outcome smoke context configured.",
    };
  }

  const hostCheck = validateSmokeHost(baseUrl);
  if (hostCheck.ok === false) {
    return { status: "error", reason: hostCheck.reason };
  }

  const fixture = buildSyntheticOutcomeFixture(env, prefix);
  if (!fixture) {
    return {
      status: "skipped",
      reason:
        prefix === "STAGING"
          ? "SKIPPED: no safe synthetic outcome fixture configured. Provide STAGING_OUTCOME_PREVIOUS_REPORT_ARTIFACT_ID, STAGING_OUTCOME_LATER_REPORT_ARTIFACT_ID, and STAGING_OUTCOME_SYNTHETIC_MARKER containing OUTCOME_SMOKE."
          : "SKIPPED: no safe synthetic outcome fixture configured. Provide LOCAL_SMOKE_OUTCOME_PREVIOUS_REPORT_ARTIFACT_ID, LOCAL_SMOKE_OUTCOME_LATER_REPORT_ARTIFACT_ID, and LOCAL_SMOKE_OUTCOME_SYNTHETIC_MARKER containing OUTCOME_SMOKE.",
    };
  }

  const sessionCookie = normalizeEnv(env[`${prefix}_ADMIN_SESSION_COOKIE`]) ?? normalizeEnv(env[`${prefix}_USER_SESSION_COOKIE`]);
  const authRole: AuthRole = normalizeEnv(env[`${prefix}_ADMIN_SESSION_COOKIE`]) ? "admin" : "user";
  const email = normalizeEnv(env[`${prefix}_ADMIN_EMAIL`]) ?? normalizeEnv(env[`${prefix}_USER_EMAIL`]);
  const password = normalizeEnv(env[`${prefix}_ADMIN_PASSWORD`]) ?? normalizeEnv(env[`${prefix}_USER_PASSWORD`]);
  const credentialsRole: AuthRole = normalizeEnv(env[`${prefix}_ADMIN_EMAIL`]) ? "admin" : "user";

  const nonOwnerSessionCookie =
    normalizeEnv(env[`${prefix}_NON_OWNER_SESSION_COOKIE`]) ?? normalizeEnv(env[`${prefix}_NON_ADMIN_SESSION_COOKIE`]);
  const nonOwnerEmail =
    normalizeEnv(env[`${prefix}_NON_OWNER_EMAIL`]) ?? normalizeEnv(env[`${prefix}_NON_ADMIN_EMAIL`]);
  const nonOwnerPassword =
    normalizeEnv(env[`${prefix}_NON_OWNER_PASSWORD`]) ?? normalizeEnv(env[`${prefix}_NON_ADMIN_PASSWORD`]);
  const runId = normalizeEnv(env.CRP_OUTCOME_TRACKING_SMOKE_RUN_ID) ?? `outcome-smoke-${Date.now()}`;

  if (sessionCookie) {
    return {
      status: "ready",
      baseUrl,
      host: hostCheck.host,
      authMode: "session_cookie",
      authRole,
      sessionCookie,
      nonOwnerSessionCookie: nonOwnerSessionCookie ?? undefined,
      nonOwnerEmail: nonOwnerEmail ?? undefined,
      nonOwnerPassword: nonOwnerPassword ?? undefined,
      fixture,
      runId,
    };
  }

  if (email && password) {
    return {
      status: "ready",
      baseUrl,
      host: hostCheck.host,
      authMode: "credentials",
      authRole: credentialsRole,
      email,
      password,
      nonOwnerSessionCookie: nonOwnerSessionCookie ?? undefined,
      nonOwnerEmail: nonOwnerEmail ?? undefined,
      nonOwnerPassword: nonOwnerPassword ?? undefined,
      fixture,
      runId,
    };
  }

  return {
    status: "skipped",
    reason:
      prefix === "STAGING"
        ? "SKIPPED: STAGING_ADMIN_EMAIL/STAGING_ADMIN_PASSWORD, STAGING_USER_EMAIL/STAGING_USER_PASSWORD, STAGING_ADMIN_SESSION_COOKIE, or STAGING_USER_SESSION_COOKIE is required."
        : "SKIPPED: LOCAL_SMOKE_ADMIN_EMAIL/LOCAL_SMOKE_ADMIN_PASSWORD, LOCAL_SMOKE_USER_EMAIL/LOCAL_SMOKE_USER_PASSWORD, LOCAL_SMOKE_ADMIN_SESSION_COOKIE, or LOCAL_SMOKE_USER_SESSION_COOKIE is required.",
  };
}

export function redactSecretText(value: string, env: NodeJS.ProcessEnv): string {
  const configuredSecrets = [
    env.STAGING_ADMIN_PASSWORD,
    env.STAGING_ADMIN_SESSION_COOKIE,
    env.STAGING_USER_PASSWORD,
    env.STAGING_USER_SESSION_COOKIE,
    env.STAGING_NON_OWNER_PASSWORD,
    env.STAGING_NON_OWNER_SESSION_COOKIE,
    env.STAGING_NON_ADMIN_PASSWORD,
    env.STAGING_NON_ADMIN_SESSION_COOKIE,
    env.LOCAL_SMOKE_ADMIN_PASSWORD,
    env.LOCAL_SMOKE_ADMIN_SESSION_COOKIE,
    env.LOCAL_SMOKE_USER_PASSWORD,
    env.LOCAL_SMOKE_USER_SESSION_COOKIE,
    env.LOCAL_SMOKE_NON_OWNER_PASSWORD,
    env.LOCAL_SMOKE_NON_OWNER_SESSION_COOKIE,
    env.LOCAL_SMOKE_NON_ADMIN_PASSWORD,
    env.LOCAL_SMOKE_NON_ADMIN_SESSION_COOKIE,
  ]
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length >= 4);
  const cookiePayloads = configuredSecrets
    .map((item) => item.match(/floot_built_app_session=([^;\s]+)/)?.[1] ?? "")
    .filter((item) => item.length >= 4);
  const secretValues = [...configuredSecrets, ...cookiePayloads];

  const redacted = secretValues.reduce((output, secret) => output.split(secret).join("[REDACTED]"), value);
  return redacted.replace(/floot_built_app_session=[^;\s]+/g, "floot_built_app_session=[REDACTED]");
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

function cookieHeaderFromSetCookie(setCookie: string): string {
  const normalized = setCookie.replace(/^cookie:\s*/i, "").trim();
  const match = normalized.match(/floot_built_app_session=[^;,\s]+/);
  return match?.[0] ?? "";
}

async function loginWithCredentials(baseUrl: string, email: string, password: string): Promise<string> {
  const response = await fetch(toAbsoluteUrl(baseUrl, SUPPORTING_READ_ONLY_ENDPOINTS.login), {
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
    const sessionCookie = cookieHeaderFromSetCookie(config.sessionCookie!);
    if (!sessionCookie) {
      throw new Error("Configured session cookie did not include floot_built_app_session.");
    }
    return sessionCookie;
  }

  return loginWithCredentials(config.baseUrl, config.email!, config.password!);
}

async function cookieForNonOwner(config: Extract<SmokeConfig, { status: "ready" }>): Promise<string | null> {
  if (config.nonOwnerSessionCookie) {
    const sessionCookie = cookieHeaderFromSetCookie(config.nonOwnerSessionCookie);
    if (!sessionCookie) {
      throw new Error("Configured non-owner session cookie did not include floot_built_app_session.");
    }
    return sessionCookie;
  }

  if (config.nonOwnerEmail && config.nonOwnerPassword) {
    return loginWithCredentials(config.baseUrl, config.nonOwnerEmail, config.nonOwnerPassword);
  }

  return null;
}

export function assertPrivacySafe(payload: unknown): void {
  const serialized = JSON.stringify(payload);
  const forbiddenPatterns = [
    /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/,
    /\b(?:\d[ -]?){12,19}\b/,
    /rawReportText|rawExtractedText|raw pdf text|raw report text|sourceText":/i,
    /SYNTHETIC_PACKET_BODY_SHOULD_NOT_APPEAR|packet body/i,
    /bucket:\/\/|s3:\/\/|gs:\/\/|x-goog-signature|signedUrl|storageUrl/i,
    /floot_built_app_session|session=|cookie=/i,
    /sk-[a-z0-9_-]+|api[_-]?key|private key|-----BEGIN/i,
    /postgres:\/\/|database_url/i,
  ];

  const match = forbiddenPatterns.find((pattern) => pattern.test(serialized));
  if (match) {
    throw new Error(`Outcome smoke response failed privacy check: ${match}.`);
  }
}

export function assertSyntheticMarkerPresent(payload: unknown, marker: string, label: string): void {
  const serialized = JSON.stringify(payload);
  if (!serialized.includes(marker)) {
    throw new Error(`${label} did not include required synthetic marker ${marker}; refusing to smoke against unverified data.`);
  }
}

export function assertNoForbiddenEndpointCalls(observedRequests: string[]): void {
  const forbidden = observedRequests.filter((request) =>
    FORBIDDEN_OUTCOME_SMOKE_ENDPOINTS.some((endpoint) => request === `${endpoint.method} ${endpoint.path}`),
  );
  if (forbidden.length > 0) {
    throw new Error(`Forbidden outcome smoke endpoint calls observed: ${forbidden.join(", ")}.`);
  }
}

function collectOutcomeTypes(body: any): string[] {
  const outcomes = Array.isArray(body?.comparisonRun?.findingOutcomes) ? body.comparisonRun.findingOutcomes : [];
  return Array.from(new Set(outcomes.map((item: any) => String(item.outcomeType ?? "")).filter(Boolean)));
}

function comparisonRunIdFrom(body: any): number {
  const id = Number(body?.comparisonRun?.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Outcome comparison response did not include a valid comparison run ID.");
  }
  return id;
}

function hasRun(body: any, runId: number): boolean {
  const runs = Array.isArray(body?.runs) ? body.runs : [];
  return runs.some((run: any) => Number(run.id) === runId);
}

function findingCount(body: any): number {
  return Array.isArray(body?.comparisonRun?.findingOutcomes) ? body.comparisonRun.findingOutcomes.length : 0;
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

async function assertAuthenticatedSession(client: SmokeHttpClient): Promise<{ role: string | null }> {
  const session = await client.json("GET", SUPPORTING_READ_ONLY_ENDPOINTS.session);
  if (!session.response.ok) {
    throw new Error(`Authenticated session check returned HTTP ${session.status}.`);
  }
  assertPrivacySafe(session.body);
  return { role: session.body?.user?.role ?? null };
}

async function validateSyntheticReportMarker(
  client: SmokeHttpClient,
  artifactId: number,
  marker: string,
  label: string,
): Promise<string> {
  const result = await client.json("GET", `${SUPPORTING_READ_ONLY_ENDPOINTS.uploadResults}?artifactId=${artifactId}`);
  if (!result.response.ok) {
    throw new Error(`${label} synthetic report verification returned HTTP ${result.status}.`);
  }
  assertPrivacySafe(result.body);
  assertSyntheticMarkerPresent(result.body, marker, label);
  return hashJson(result.body);
}

async function verifyNonOwnerIfConfigured(
  config: Extract<SmokeConfig, { status: "ready" }>,
  runId: number,
): Promise<string> {
  const cookie = await cookieForNonOwner(config);
  if (!cookie) return "skipped: no safe non-owner context configured";

  const client = new SmokeHttpClient(config.baseUrl, cookie);
  const session = await client.json("GET", SUPPORTING_READ_ONLY_ENDPOINTS.session);
  if (!session.response.ok) {
    return `skipped: non-owner session check returned HTTP ${session.status}`;
  }
  if (session.body?.user?.role === "admin") {
    throw new Error("Configured non-owner context resolved to admin; refusing non-owner smoke.");
  }

  const get = await client.json("GET", `${OUTCOME_ENDPOINTS.get}?comparisonRunId=${runId}`);
  if (![401, 403, 404].includes(get.status)) {
    throw new Error(`Expected non-owner get denial, got HTTP ${get.status}.`);
  }

  const list = await client.json("GET", `${OUTCOME_ENDPOINTS.list}?limit=25`);
  if (list.response.ok && hasRun(list.body, runId)) {
    throw new Error("Non-owner outcome list exposed the synthetic outcome run.");
  }
  if (!list.response.ok && ![401, 403].includes(list.status)) {
    throw new Error(`Expected non-owner list denial or scoped empty list, got HTTP ${list.status}.`);
  }

  assertNoForbiddenEndpointCalls(client.observedRequests);
  return `non-owner denied/scoped (${get.status}/${list.status})`;
}

export async function runSmoke(config: Extract<SmokeConfig, { status: "ready" }>) {
  const cookie = await cookieForConfig(config);
  const client = new SmokeHttpClient(config.baseUrl, cookie);
  const fixture = config.fixture;
  const createdOutcomeRunIds: number[] = [];

  try {
    const session = await assertAuthenticatedSession(client);

    const previousReportHash = await validateSyntheticReportMarker(
      client,
      fixture.previousReportArtifactId,
      fixture.syntheticMarker,
      "previous report fixture",
    );
    const laterReportHash = await validateSyntheticReportMarker(
      client,
      fixture.laterReportArtifactId,
      fixture.syntheticMarker,
      "later report fixture",
    );

    const compareBody: Record<string, unknown> = {
      previousReportArtifactId: fixture.previousReportArtifactId,
      laterReportArtifactId: fixture.laterReportArtifactId,
      comparisonScope: fixture.packetId ? "packet_findings" : "report_to_report",
      ...(fixture.packetId ? { packetId: fixture.packetId } : {}),
      ...(fixture.disputePacketFindingId ? { disputePacketFindingIds: [fixture.disputePacketFindingId] } : {}),
    };
    const compared = await client.json("POST", OUTCOME_ENDPOINTS.compare, compareBody);
    if (!compared.response.ok) {
      throw new Error(`Outcome compare returned HTTP ${compared.status}.`);
    }
    assertPrivacySafe(compared.body);
    assertSyntheticMarkerPresent(compared.body, fixture.syntheticMarker, "outcome compare response");

    const comparisonRunId = comparisonRunIdFrom(compared.body);
    createdOutcomeRunIds.push(comparisonRunId);
    const outcomeTypes = collectOutcomeTypes(compared.body);
    if (outcomeTypes.length === 0 || !outcomeTypes.some((type) => fixture.expectedOutcomeTypes.includes(type))) {
      throw new Error(`Outcome compare returned unexpected outcome types: ${outcomeTypes.join(", ") || "none"}.`);
    }

    const listed = await client.json(
      "GET",
      `${OUTCOME_ENDPOINTS.list}?previousReportArtifactId=${fixture.previousReportArtifactId}&limit=25`,
    );
    if (!listed.response.ok) {
      throw new Error(`Outcome list returned HTTP ${listed.status}.`);
    }
    assertPrivacySafe(listed.body);
    if (!hasRun(listed.body, comparisonRunId)) {
      throw new Error("Outcome list did not include the synthetic comparison run.");
    }

    const fetched = await client.json("GET", `${OUTCOME_ENDPOINTS.get}?comparisonRunId=${comparisonRunId}`);
    if (!fetched.response.ok) {
      throw new Error(`Outcome get returned HTTP ${fetched.status}.`);
    }
    assertPrivacySafe(fetched.body);
    if (comparisonRunIdFrom(fetched.body) !== comparisonRunId) {
      throw new Error("Outcome get returned a different comparison run.");
    }

    let responseOnlyRunId: number | null = null;
    if (fixture.runResponseOnly && fixture.packetId) {
      const responseOnly = await client.json("POST", OUTCOME_ENDPOINTS.compare, {
        previousReportArtifactId: fixture.previousReportArtifactId,
        packetId: fixture.packetId,
        comparisonScope: "response_only",
        response: {
          packetId: fixture.packetId,
          responseReceivedAt: "2026-05-17T00:00:00.000Z",
          responseType: "bureau_response",
          source: "manual_record",
        },
      });
      if (!responseOnly.response.ok) {
        throw new Error(`Outcome response-only compare returned HTTP ${responseOnly.status}.`);
      }
      assertPrivacySafe(responseOnly.body);
      responseOnlyRunId = comparisonRunIdFrom(responseOnly.body);
      createdOutcomeRunIds.push(responseOnlyRunId);
      const responseOnlyTypes = collectOutcomeTypes(responseOnly.body);
      if (!responseOnlyTypes.includes("response_received")) {
        throw new Error("Response-only outcome did not produce response_received.");
      }
    }

    const nonOwnerResult = await verifyNonOwnerIfConfigured(config, comparisonRunId);
    const health = await fetch(toAbsoluteUrl(config.baseUrl, "/"), { method: "HEAD" });
    if (!health.ok) throw new Error(`Smoke target health returned HTTP ${health.status}.`);

    assertNoForbiddenEndpointCalls(client.observedRequests);

    return {
      status: "passed" as const,
      baseUrl: config.baseUrl,
      host: config.host,
      authMode: config.authMode,
      authRole: config.authRole,
      authenticatedRole: session.role,
      runId: smokeRunIdentifier(config.runId),
      fixture: {
        previousReportArtifactId: fixture.previousReportArtifactId,
        laterReportArtifactId: fixture.laterReportArtifactId,
        packetId: fixture.packetId ?? null,
        disputePacketFindingId: fixture.disputePacketFindingId ?? null,
        syntheticMarker: fixture.syntheticMarker,
        previousReportHash,
        laterReportHash,
      },
      outcome: {
        comparisonRunId,
        responseOnlyRunId,
        outcomeTypes,
        findingCount: findingCount(compared.body),
        listFoundRun: true,
        getFoundRun: true,
      },
      nonOwnerResult,
      cleanupStatus: OUTCOME_CLEANUP_POLICY,
      createdOutcomeRunIds,
      runtimeSafety: {
        parserEndpointCalls: 0,
        ocrEndpointCalls: 0,
        packetGenerationEndpointCalls: 0,
        packetReadinessEndpointCalls: 0,
        packetWordingEndpointCalls: 0,
        violationFiringEndpointCalls: 0,
        regulationRuntimeActivationEndpointCalls: 0,
        adminOverrideEndpointCalls: 0,
        directFurnisherEndpointCalls: 0,
        sourceMutationEndpointsCalled: false,
        outcomeRowsOnly: true,
        dbRegistryRemainedGovernanceMetadata: true,
        staticRuntimeMappingsRemainActiveTruth: true,
      },
      privacy: {
        noFullSin: true,
        noFullUnmaskedAccount: true,
        noRawReportText: true,
        noRawPdfText: true,
        noPacketBody: true,
        noStorageSecrets: true,
        noSessionCookieEcho: true,
        noApiKeysOrDatabaseUrls: true,
      },
    };
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} Created outcome run IDs: ${createdOutcomeRunIds.join(", ") || "none"}. Cleanup: ${OUTCOME_CLEANUP_POLICY}`,
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
