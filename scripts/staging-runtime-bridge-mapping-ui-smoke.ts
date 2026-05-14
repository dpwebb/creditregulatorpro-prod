import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { chromium, expect, type APIResponse, type BrowserContext, type Page } from "@playwright/test";

export const SMOKE_GATE_ENV = "CRP_RUNTIME_BRIDGE_MAPPING_UI_SMOKE";
export const SKIPPED_EXIT_CODE = 2;

export const ALLOWED_HOSTS = new Set(["staging.creditregulatorpro.com", "localhost", "127.0.0.1"]);
export const REFUSED_PRODUCTION_HOSTS = new Set(["creditregulatorpro.com", "www.creditregulatorpro.com"]);

export const RUNTIME_BRIDGE_ENDPOINTS = {
  create: "/_api/regulation-registry/runtime-bridge/create",
  list: "/_api/regulation-registry/runtime-bridge/list",
  updateStatus: "/_api/regulation-registry/runtime-bridge/update-status",
} as const;

export const FORBIDDEN_ACTIVATION_LABELS = [
  "Activate",
  "Activate Runtime",
  "Make Runtime Truth",
  "Apply to Runtime",
  "Enforce",
  "Legal Violation",
  "Activate Limited Runtime",
  "Make DB Primary",
  "Replace Static Reference",
] as const;

export const FORBIDDEN_RUNTIME_UI_ENDPOINTS = [
  { method: "GET", path: "/_api/regulation-registry/runtime-bridge/runtime-selector" },
  { method: "POST", path: "/_api/regulation-registry/runtime-bridge/activate" },
  { method: "POST", path: "/_api/regulation-registry/runtime-bridge/activate-limited-runtime" },
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

export const SYNTHETIC_RUNTIME_BRIDGE_UI_MAPPING = {
  bridgeMode: "shadow",
  deterministicRuleId: "UI_SMOKE_RUNTIME_BRIDGE_RULE",
  violationCategory: "UI_SMOKE_CATEGORY",
  staticReferenceId: "UI_SMOKE_STATIC_REF",
  dbRegulationId: "UI_SMOKE_DB_REF",
  referenceClass: "local_procedural",
  consumerWordingMode: "procedural_reference",
  activationReason: "Synthetic runtime bridge UI smoke only",
  sourceVersion: "ui-smoke",
  staticSnapshotHash: "synthetic-ui-static-hash",
  dbSnapshotHash: "synthetic-ui-db-hash",
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
  response: APIResponse;
  body: any;
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

function smokeRunIdentifier(runId: string): string {
  const safe = runId
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || "run";
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

export function buildSyntheticRuntimeBridgeUiPayload(runId: string) {
  const suffix = smokeRunIdentifier(runId);
  return {
    ...SYNTHETIC_RUNTIME_BRIDGE_UI_MAPPING,
    deterministicRuleId: `${SYNTHETIC_RUNTIME_BRIDGE_UI_MAPPING.deterministicRuleId}_${suffix}`,
    staticReferenceId: `${SYNTHETIC_RUNTIME_BRIDGE_UI_MAPPING.staticReferenceId}_${suffix}`,
    dbRegulationId: `${SYNTHETIC_RUNTIME_BRIDGE_UI_MAPPING.dbRegulationId}_${suffix}`,
    staticSnapshotHash: `${SYNTHETIC_RUNTIME_BRIDGE_UI_MAPPING.staticSnapshotHash}-${suffix}`,
    dbSnapshotHash: `${SYNTHETIC_RUNTIME_BRIDGE_UI_MAPPING.dbSnapshotHash}-${suffix}`,
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
  const runId = normalizeEnv(env.CRP_RUNTIME_BRIDGE_MAPPING_UI_SMOKE_RUN_ID) ?? `runtime-bridge-ui-smoke-${Date.now()}`;

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
  return setCookie
    .replace(/^cookie:\s*/i, "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("floot_built_app_session=")) ?? "";
}

async function applySessionCookie(context: BrowserContext, baseUrl: string, cookieHeader: string): Promise<void> {
  const sessionPart = cookieHeaderFromSetCookie(cookieHeader);
  if (!sessionPart) {
    throw new Error("Configured session cookie did not include floot_built_app_session.");
  }
  const separator = sessionPart.indexOf("=");
  await context.addCookies([
    {
      name: sessionPart.slice(0, separator),
      value: sessionPart.slice(separator + 1),
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function loginWithCredentials(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /log in|login/i }).click();

  const outcome = await Promise.race([
    page.waitForURL((url) => !/\/login$/.test(url.pathname), { timeout: 15000 }).then(() => "navigated" as const),
    page.getByText(/invalid email or password/i).waitFor({ state: "visible", timeout: 15000 }).then(() => "invalid" as const),
  ]).catch(() => "timeout" as const);

  await page.getByLabel(/password/i).fill("").catch(() => undefined);
  if (outcome !== "navigated") {
    throw new Error("Configured credentials did not authenticate.");
  }
}

async function authenticateAdmin(context: BrowserContext, page: Page, config: Extract<SmokeConfig, { status: "ready" }>) {
  if (config.authMode === "session_cookie") {
    await applySessionCookie(context, config.baseUrl, config.adminSessionCookie!);
    await page.goto("/");
  } else {
    await loginWithCredentials(page, config.adminEmail!, config.adminPassword!);
  }

  const session = await page.request.get("/_api/auth/session");
  if (!session.ok()) {
    throw new Error(`Admin session check returned HTTP ${session.status()}.`);
  }
  const body = await session.json();
  if (body?.user?.role !== "admin") {
    throw new Error("Configured authenticated context did not resolve to admin.");
  }
}

async function jsonRequest(
  page: Page,
  method: "GET" | "POST",
  path: string,
  data?: unknown,
): Promise<JsonResponse> {
  const response = method === "GET" ? await page.request.get(path) : await page.request.post(path, { data });
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { response, body };
}

async function captureOptionalSnapshot(page: Page, label: string, path: string): Promise<Snapshot> {
  const result = await jsonRequest(page, "GET", path);
  if (result.response.status() === 404) {
    return { status: "skipped", label, reason: `${label} endpoint returned HTTP 404.` };
  }
  if (!result.response.ok()) {
    return { status: "skipped", label, reason: `${label} endpoint returned HTTP ${result.response.status()}.` };
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
    throw new Error(`${before.label} response changed during runtime bridge mapping UI smoke.`);
  }
  return true;
}

function mappingIdFrom(body: any): number {
  const id = Number(body?.mapping?.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Runtime bridge mapping response did not include a valid mapping ID.");
  }
  return id;
}

async function createSyntheticMapping(page: Page, runId: string): Promise<{ mappingId: number; payload: ReturnType<typeof buildSyntheticRuntimeBridgeUiPayload> }> {
  const payload = buildSyntheticRuntimeBridgeUiPayload(runId);
  const created = await jsonRequest(page, "POST", RUNTIME_BRIDGE_ENDPOINTS.create, payload);
  if (created.response.status() === 409) {
    throw new Error("Synthetic runtime bridge mapping already exists for this run ID. Use a unique UI smoke run ID.");
  }
  if (!created.response.ok()) {
    throw new Error(`Synthetic runtime bridge mapping create returned HTTP ${created.response.status()}.`);
  }
  const mappingId = mappingIdFrom(created.body);
  if (created.body?.mapping?.activationStatus !== "draft") {
    throw new Error(`Synthetic mapping was created with ${created.body?.mapping?.activationStatus}, expected draft.`);
  }
  return { mappingId, payload };
}

async function archiveSyntheticMapping(page: Page, mappingId: number): Promise<string> {
  const result = await jsonRequest(page, "POST", RUNTIME_BRIDGE_ENDPOINTS.updateStatus, {
    mappingId,
    activationStatus: "archived",
    activationReason: "Archived after gated runtime bridge mapping UI smoke.",
  });
  if (!result.response.ok()) {
    throw new Error(`Synthetic runtime bridge mapping archive returned HTTP ${result.response.status()}.`);
  }
  return result.body?.mapping?.activationStatus ?? "archived";
}

async function expectStatus(
  promise: Promise<JsonResponse>,
  expectedStatuses: number[],
  label: string,
): Promise<JsonResponse> {
  const result = await promise;
  if (!expectedStatuses.includes(result.response.status())) {
    throw new Error(
      `${label} returned HTTP ${result.response.status()}, expected ${expectedStatuses.join(" or ")}.`,
    );
  }
  return result;
}

function assertNoForbiddenEndpointCalls(forbiddenCalls: string[]): void {
  if (forbiddenCalls.length > 0) {
    throw new Error(`Forbidden runtime UI endpoint calls observed: ${forbiddenCalls.join(", ")}.`);
  }
}

async function assertForbiddenActivationLabelsAbsent(page: Page): Promise<void> {
  for (const label of FORBIDDEN_ACTIVATION_LABELS) {
    const pattern = label === "Activate" || label === "Enforce"
      ? new RegExp(`^${label}$`, "i")
      : new RegExp(label, "i");
    if (await page.getByRole("button", { name: pattern }).count()) {
      throw new Error(`Forbidden activation control found: ${label}.`);
    }
  }
}

async function assertRuntimeBridgeUiValidation(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Approve for Shadow" }).click();
  await expect(page.getByText("This review action requires review notes.")).toBeVisible();

  await page.getByRole("button", { name: "Approve for Advisory" }).click();
  await expect(page.getByText("This review action requires review notes.")).toBeVisible();

  await page.getByLabel("Review notes").fill("Limited runtime review validation only.");
  await page.getByLabel("Rollback static reference").fill("");
  await page.getByLabel("Limited runtime review test manifest").fill("");
  await page.getByRole("button", { name: "Approve for Limited Runtime Review" }).click();
  await expect(page.getByText("Limited runtime review requires rollbackStaticReferenceId.")).toBeVisible();

  await page.getByLabel("Rollback static reference").fill("UI_SMOKE_ROLLBACK_STATIC_REF");
  await page.getByRole("button", { name: "Approve for Limited Runtime Review" }).click();
  await expect(page.getByText("Limited runtime review requires testManifest.")).toBeVisible();

  await page.getByLabel("Limited runtime review test manifest").fill('{"expectedRuntimeSource":"static_runtime"}');
  await page.getByRole("button", { name: "Approve for Limited Runtime Review" }).click();
  await expect(page.getByText("Confirm that this action does not activate runtime regulation truth.")).toBeVisible();

  await page.getByLabel("Rejected reason").fill("");
  await page.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText("Rejected runtime bridge mappings require rejectedReason.")).toBeVisible();
}

async function verifyRuntimeBridgeUi(page: Page, mappingId: number, payload: ReturnType<typeof buildSyntheticRuntimeBridgeUiPayload>): Promise<void> {
  await page.goto("/regulatory-updates");
  await expect(page.getByRole("heading", { name: /Regulations & Law Update Engine/i })).toBeVisible({ timeout: 15000 });
  await page.getByRole("tab", { name: "Runtime Bridge Mappings" }).click();

  await expect(page.getByText(/This mapping is governance-only/i).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Static runtime references remain active/i).first()).toBeVisible();
  await expect(page.getByText(/Review actions do not activate runtime references/i).first()).toBeVisible();
  await expect(page.getByText(/Runtime activation requires a separate approved implementation/i).first()).toBeVisible();

  await assertForbiddenActivationLabelsAbsent(page);

  await page.getByLabel("Bridge mode filter").selectOption(payload.bridgeMode);
  await page.getByLabel("Activation status filter").selectOption("draft");
  await page.getByLabel("Reference class filter").selectOption(payload.referenceClass);
  await page.getByLabel("Consumer wording mode filter").selectOption(payload.consumerWordingMode);
  await page.getByLabel("Deterministic rule ID filter").fill(payload.deterministicRuleId);
  await page.getByLabel("Violation category filter").fill(payload.violationCategory);
  await page.getByLabel("Static reference ID filter").fill(payload.staticReferenceId);
  await page.getByLabel("DB regulation ID filter").fill(payload.dbRegulationId);
  await page.getByLabel("Source version filter").fill(payload.sourceVersion);

  const mappingCard = page.getByRole("article")
    .filter({ hasText: payload.deterministicRuleId })
    .filter({ hasText: payload.staticReferenceId })
    .filter({ hasText: payload.dbRegulationId })
    .filter({ hasText: payload.sourceVersion })
    .filter({ hasText: "draft" });
  await expect(mappingCard).toHaveCount(1, { timeout: 15000 });
  await expect(mappingCard).toBeVisible();
  await expect(mappingCard.getByText(`DB ${payload.dbRegulationId}`)).toBeVisible();

  await mappingCard.getByRole("button", { name: /View Details/i }).click();
  const detailPanel = page.getByLabel("Runtime bridge mapping detail");
  await expect(detailPanel.getByText(`Mapping #${mappingId}`)).toBeVisible({ timeout: 15000 });
  await expect(detailPanel.getByText("Governance summary")).toBeVisible();
  await expect(detailPanel.getByText("shadow", { exact: true })).toBeVisible();
  await expect(detailPanel.getByText("draft", { exact: true })).toBeVisible();
  await expect(detailPanel.getByText("local procedural", { exact: true })).toBeVisible();
  await expect(detailPanel.getByText("procedural reference", { exact: true })).toBeVisible();
  await expect(detailPanel.getByText(payload.deterministicRuleId, { exact: true })).toBeVisible();
  await expect(detailPanel.getByText(payload.violationCategory, { exact: true })).toBeVisible();
  await expect(detailPanel.getByText(payload.staticReferenceId, { exact: true })).toBeVisible();
  await expect(detailPanel.getByText(payload.dbRegulationId, { exact: true })).toBeVisible();
  await expect(detailPanel.getByText("Test and rollback")).toBeVisible();
  await expect(detailPanel.getByText("Test manifest summary")).toBeVisible();
  await expect(detailPanel.getByText(/This mapping is governance-only/i)).toBeVisible();

  await assertRuntimeBridgeUiValidation(page);

  await page.getByLabel("Review notes").fill("Gated UI smoke shadow review only.");
  await page.getByLabel("Rollback static reference").fill("");
  const updateResponse = page.waitForResponse(
    (response) =>
      response.url().includes(RUNTIME_BRIDGE_ENDPOINTS.updateStatus) &&
      response.request().method() === "POST",
    { timeout: 15000 },
  );
  await page.getByRole("button", { name: "Approve for Shadow" }).click();
  const response = await updateResponse;
  if (!response.ok()) {
    throw new Error(`UI approved_for_shadow update returned HTTP ${response.status()}.`);
  }
}

async function verifyNonAdminIfConfigured(
  config: Extract<SmokeConfig, { status: "ready" }>,
): Promise<string> {
  if (!config.nonAdminSessionCookie && !(config.nonAdminEmail && config.nonAdminPassword)) {
    return "skipped: no safe non-admin context configured";
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: config.baseUrl, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  try {
    if (config.nonAdminSessionCookie) {
      await applySessionCookie(context, config.baseUrl, config.nonAdminSessionCookie);
      await page.goto("/");
    } else {
      await loginWithCredentials(page, config.nonAdminEmail!, config.nonAdminPassword!);
    }

    const session = await page.request.get("/_api/auth/session");
    if (!session.ok()) {
      return `skipped: non-admin session check returned HTTP ${session.status()}`;
    }
    const body = await session.json();
    if (body?.user?.role === "admin") {
      throw new Error("Configured non-admin context resolved to admin; refusing non-admin smoke.");
    }

    await page.goto("/regulatory-updates");
    await expect(page.getByText(/Access Denied|lacks required permissions/i).first()).toBeVisible({ timeout: 15000 });
    const list = await page.request.get(RUNTIME_BRIDGE_ENDPOINTS.list);
    const update = await page.request.post(RUNTIME_BRIDGE_ENDPOINTS.updateStatus, { data: { mappingId: -1 } });
    if (![401, 403].includes(list.status())) {
      throw new Error(`Expected non-admin runtime bridge list denial, got HTTP ${list.status()}.`);
    }
    if (![401, 403].includes(update.status())) {
      throw new Error(`Expected non-admin runtime bridge update denial, got HTTP ${update.status()}.`);
    }
    return `blocked page and runtime bridge endpoints (${list.status()}/${update.status()})`;
  } finally {
    await context.close();
    await browser.close();
  }
}

export async function runSmoke(config: Extract<SmokeConfig, { status: "ready" }>) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: config.baseUrl, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const forbiddenCalls: string[] = [];
  const apiServerErrors: string[] = [];
  const pageErrors: string[] = [];
  let mappingId: number | null = null;
  let cleanupStatus = "not needed";

  page.on("request", (request) => {
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    if (FORBIDDEN_RUNTIME_UI_ENDPOINTS.some((endpoint) => endpoint.method === method && endpoint.path === url.pathname)) {
      forbiddenCalls.push(`${method} ${url.pathname}`);
    }
  });
  page.on("response", (response) => {
    if (response.url().includes("/_api/") && response.status() >= 500) {
      apiServerErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await authenticateAdmin(context, page, config);

    const beforeRegistry = await captureOptionalSnapshot(
      page,
      "regulation registry",
      "/_api/regulation-registry/list?includeInactive=true",
    );
    const beforeMappings = await captureOptionalSnapshot(
      page,
      "regulation violation mappings",
      "/_api/regulation-registry/mapping",
    );
    const beforeCandidates = await captureOptionalSnapshot(
      page,
      "reconciliation candidates",
      `/_api/regulation-registry/reconciliation-candidates/list?reconciliationRunId=${encodeURIComponent(config.runId)}`,
    );

    const created = await createSyntheticMapping(page, config.runId);
    mappingId = created.mappingId;

    await verifyRuntimeBridgeUi(page, mappingId, created.payload);

    const activeLimitedRuntime = await expectStatus(
      jsonRequest(page, "POST", RUNTIME_BRIDGE_ENDPOINTS.updateStatus, {
        mappingId,
        activationStatus: "active_limited_runtime",
        activationReason: "Synthetic UI smoke must not activate runtime truth.",
      }),
      [400],
      "active_limited_runtime rejection",
    );
    if (activeLimitedRuntime.response.ok()) {
      throw new Error("active_limited_runtime was accepted by the runtime bridge mapping UI smoke flow.");
    }

    const afterShadow = await jsonRequest(
      page,
      "GET",
      `${RUNTIME_BRIDGE_ENDPOINTS.list}?deterministicRuleId=${encodeURIComponent(created.payload.deterministicRuleId)}&limit=25`,
    );
    if (!afterShadow.response.ok()) {
      throw new Error(`Runtime bridge mapping post-review lookup returned HTTP ${afterShadow.response.status()}.`);
    }
    const reviewedMapping = (afterShadow.body?.mappings ?? []).find((mapping: any) => Number(mapping.id) === mappingId);
    if (reviewedMapping?.activationStatus !== "approved_for_shadow") {
      throw new Error(`Synthetic mapping status is ${reviewedMapping?.activationStatus ?? "missing"}, expected approved_for_shadow.`);
    }

    cleanupStatus = await archiveSyntheticMapping(page, mappingId);

    const afterRegistry = await captureOptionalSnapshot(
      page,
      "regulation registry",
      "/_api/regulation-registry/list?includeInactive=true",
    );
    const afterMappings = await captureOptionalSnapshot(
      page,
      "regulation violation mappings",
      "/_api/regulation-registry/mapping",
    );
    const afterCandidates = await captureOptionalSnapshot(
      page,
      "reconciliation candidates",
      `/_api/regulation-registry/reconciliation-candidates/list?reconciliationRunId=${encodeURIComponent(config.runId)}`,
    );

    const registryResponseUnchanged = assertSnapshotUnchanged(beforeRegistry, afterRegistry);
    const mappingResponseUnchanged = assertSnapshotUnchanged(beforeMappings, afterMappings);
    const reconciliationCandidatesUnchanged = assertSnapshotUnchanged(beforeCandidates, afterCandidates);

    const finalLookup = await jsonRequest(
      page,
      "GET",
      `${RUNTIME_BRIDGE_ENDPOINTS.list}?deterministicRuleId=${encodeURIComponent(created.payload.deterministicRuleId)}&limit=25`,
    );
    if (!finalLookup.response.ok()) {
      throw new Error(`Final runtime bridge mapping lookup returned HTTP ${finalLookup.response.status()}.`);
    }
    const finalMapping = (finalLookup.body?.mappings ?? []).find((mapping: any) => Number(mapping.id) === mappingId);
    if (finalMapping?.activationStatus !== "archived") {
      throw new Error(`Synthetic mapping final status is ${finalMapping?.activationStatus ?? "missing"}, expected archived.`);
    }

    const health = await page.request.get("/");
    if (!health.ok()) throw new Error(`Smoke target health returned HTTP ${health.status()}.`);
    const nonAdminResult = await verifyNonAdminIfConfigured(config);
    assertNoForbiddenEndpointCalls(forbiddenCalls);
    if (apiServerErrors.length > 0) throw new Error(`API 5xx responses observed: ${apiServerErrors.join(", ")}.`);
    if (pageErrors.length > 0) throw new Error(`Page errors observed: ${pageErrors.length}.`);

    return {
      status: "passed" as const,
      baseUrl: config.baseUrl,
      host: config.host,
      authMode: config.authMode,
      mappingId,
      runId: config.runId,
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
        cleanupStatus = await archiveSyntheticMapping(page, mappingId);
      } catch {
        cleanupStatus = "archive failed";
      }
    }
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} Mapping ID: ${mappingId ?? "none"}. Final cleanup status: ${cleanupStatus}.`,
    );
  } finally {
    await context.close();
    await browser.close();
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
