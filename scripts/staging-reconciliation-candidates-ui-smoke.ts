import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { chromium, expect, type APIResponse, type BrowserContext, type Page } from "@playwright/test";

export const SMOKE_GATE_ENV = "CRP_RECONCILIATION_CANDIDATE_UI_SMOKE";
export const SKIPPED_EXIT_CODE = 2;

export const ALLOWED_HOSTS = new Set(["staging.creditregulatorpro.com", "localhost", "127.0.0.1"]);
export const REFUSED_PRODUCTION_HOSTS = new Set(["creditregulatorpro.com", "www.creditregulatorpro.com"]);

export const FORBIDDEN_ACTIVATION_TERMS = [
  "Activate",
  "Make Runtime Truth",
  "Apply to Runtime",
  "Enforce",
  "Legal Violation",
] as const;

export const FORBIDDEN_MUTATION_ENDPOINTS = [
  { method: "POST", path: "/_api/regulation-registry/review" },
  { method: "POST", path: "/_api/regulation-registry/mapping" },
  { method: "POST", path: "/_api/regulation-registry/deactivate" },
  { method: "POST", path: "/_api/regulation-registry/restore" },
  { method: "POST", path: "/_api/regulation-registry/create-candidate" },
] as const;

export const SYNTHETIC_RECONCILIATION_CANDIDATE = {
  candidateType: "source_url_missing_candidate",
  staticReferenceId: "UI_SMOKE_STATIC_REF",
  dbRegulationId: "UI_SMOKE_DB_REF",
  deterministicRuleId: "UI_SMOKE_RULE",
  jurisdiction: "Federal",
  category: "credit_reporting",
  mismatchType: "source_url_missing",
  severity: "low",
  message: "Synthetic UI smoke candidate only",
  recommendedAction: "Synthetic UI smoke review only. Do not activate runtime references.",
  oldValue: {
    title: "Synthetic static reference for UI smoke",
    citation: "Synthetic citation A",
    sourceUrl: null,
  },
  proposedValue: {
    title: "Synthetic DB governance reference for UI smoke",
    citation: "Synthetic citation B",
    recommendedAction: "Synthetic UI smoke review only. Do not activate runtime references.",
  },
  citation: "Synthetic citation B",
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

type CandidateRow = {
  id: number;
  activeStatus?: string;
  reviewStatus?: string;
  reconciliationRunId?: string | null;
};

type JsonResponse = {
  response: APIResponse;
  body: any;
};

function normalizeBoolean(value: string | undefined): boolean {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function normalizeUrl(value: string | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function smokeRunIdentifier(runId: string): string {
  const safe = runId
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || "run";
}

export function buildSyntheticCandidateForRun(runId: string) {
  const suffix = smokeRunIdentifier(runId);
  return {
    ...SYNTHETIC_RECONCILIATION_CANDIDATE,
    staticReferenceId: `${SYNTHETIC_RECONCILIATION_CANDIDATE.staticReferenceId}_${suffix}`,
    dbRegulationId: `${SYNTHETIC_RECONCILIATION_CANDIDATE.dbRegulationId}_${suffix}`,
    deterministicRuleId: `${SYNTHETIC_RECONCILIATION_CANDIDATE.deterministicRuleId}_${suffix}`,
    message: `${SYNTHETIC_RECONCILIATION_CANDIDATE.message} ${runId}`,
  };
}

function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
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

export function buildSmokeConfig(env: NodeJS.ProcessEnv): SmokeConfig {
  if (!normalizeBoolean(env[SMOKE_GATE_ENV])) {
    return {
      status: "skipped",
      reason: `SKIPPED: ${SMOKE_GATE_ENV}=true is required.`,
    };
  }

  const stagingBaseUrl = normalizeUrl(env.STAGING_BASE_URL);
  const localBaseUrl = normalizeUrl(env.LOCAL_SMOKE_BASE_URL);
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
    ? normalizeUrl(env.STAGING_ADMIN_SESSION_COOKIE)
    : normalizeUrl(env.LOCAL_SMOKE_ADMIN_SESSION_COOKIE);
  const adminEmail = stagingBaseUrl
    ? normalizeUrl(env.STAGING_ADMIN_EMAIL)
    : normalizeUrl(env.LOCAL_SMOKE_ADMIN_EMAIL);
  const adminPassword = stagingBaseUrl
    ? normalizeUrl(env.STAGING_ADMIN_PASSWORD)
    : normalizeUrl(env.LOCAL_SMOKE_ADMIN_PASSWORD);

  const nonAdminSessionCookie = stagingBaseUrl
    ? normalizeUrl(env.STAGING_NON_ADMIN_SESSION_COOKIE)
    : normalizeUrl(env.LOCAL_SMOKE_NON_ADMIN_SESSION_COOKIE);
  const nonAdminEmail = stagingBaseUrl
    ? normalizeUrl(env.STAGING_NON_ADMIN_EMAIL)
    : normalizeUrl(env.LOCAL_SMOKE_NON_ADMIN_EMAIL);
  const nonAdminPassword = stagingBaseUrl
    ? normalizeUrl(env.STAGING_NON_ADMIN_PASSWORD)
    : normalizeUrl(env.LOCAL_SMOKE_NON_ADMIN_PASSWORD);

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
      runId: normalizeUrl(env.CRP_RECONCILIATION_CANDIDATE_UI_SMOKE_RUN_ID) ?? `ui-smoke-${Date.now()}`,
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
      runId: normalizeUrl(env.CRP_RECONCILIATION_CANDIDATE_UI_SMOKE_RUN_ID) ?? `ui-smoke-${Date.now()}`,
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

function cookieHeaderFromSetCookie(setCookie: string): string {
  return setCookie
    .replace(/^cookie:\s*/i, "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("floot_built_app_session=")) ?? "";
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
    throw new Error("Configured admin credentials did not authenticate.");
  }
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

export function buildSyntheticPayload(runId: string) {
  const syntheticCandidate = buildSyntheticCandidateForRun(runId);
  return {
    reconciliationRunId: runId,
    findings: [
      {
        ...syntheticCandidate,
        staticSnapshotHash: `static-${runId}`,
        dbSnapshotHash: `db-${runId}`,
        reconciliationRunId: runId,
      },
    ],
  };
}

async function findSyntheticCandidate(page: Page, runId: string): Promise<CandidateRow | null> {
  const result = await jsonRequest(
    page,
    "GET",
    `/_api/regulation-registry/reconciliation-candidates/list?reconciliationRunId=${encodeURIComponent(runId)}&includeSnapshotData=true`,
  );
  if (!result.response.ok()) {
    throw new Error(`Synthetic candidate lookup returned HTTP ${result.response.status()}.`);
  }
  return (
    (result.body?.candidates ?? []).find(
      (candidate: CandidateRow) =>
        candidate.reconciliationRunId === runId &&
        candidate.activeStatus === "inert" &&
        candidate.reviewStatus !== "archived",
    ) ?? null
  );
}

async function ensureSyntheticCandidate(page: Page, runId: string): Promise<{ candidate: CandidateRow; created: boolean }> {
  const existing = await findSyntheticCandidate(page, runId);
  if (existing) return { candidate: existing, created: false };

  const created = await jsonRequest(
    page,
    "POST",
    "/_api/regulation-registry/reconciliation-candidates/create",
    buildSyntheticPayload(runId),
  );
  if (!created.response.ok()) {
    throw new Error(`Synthetic candidate create returned HTTP ${created.response.status()}.`);
  }
  const candidate = created.body?.createdCandidates?.[0] ?? created.body?.existingCandidates?.[0];
  if (!candidate?.id) {
    throw new Error("Synthetic candidate create did not return a candidate ID.");
  }
  if (candidate.reviewStatus === "archived") {
    throw new Error("Synthetic candidate create/reuse returned an archived candidate. Use a unique smoke run ID.");
  }
  return { candidate, created: true };
}

async function assertValidationFailures(page: Page, candidateId: number): Promise<void> {
  for (const payload of [
    { candidateId, reviewStatus: "approved_for_mapping_review" },
    { candidateId, reviewStatus: "approved_for_registry_update" },
    { candidateId, reviewStatus: "rejected" },
  ]) {
    const result = await jsonRequest(
      page,
      "POST",
      "/_api/regulation-registry/reconciliation-candidates/update-status",
      payload,
    );
    if (result.response.status() !== 400) {
      throw new Error(`Expected validation HTTP 400 for ${payload.reviewStatus}, got ${result.response.status()}.`);
    }
  }
}

async function archiveSyntheticCandidate(page: Page, candidateId: number): Promise<string> {
  const result = await jsonRequest(
    page,
    "POST",
    "/_api/regulation-registry/reconciliation-candidates/update-status",
    {
      candidateId,
      reviewStatus: "archived",
      reviewNotes: "Archived after gated reconciliation candidate UI smoke.",
    },
  );
  if (!result.response.ok()) {
    throw new Error(`Synthetic candidate archive returned HTTP ${result.response.status()}.`);
  }
  return result.body?.candidate?.reviewStatus ?? "archived";
}

async function verifyNonAdminIfConfigured(
  browserBaseUrl: string,
  config: Extract<SmokeConfig, { status: "ready" }>,
): Promise<string> {
  if (!config.nonAdminSessionCookie && !(config.nonAdminEmail && config.nonAdminPassword)) {
    return "skipped: no safe non-admin context configured";
  }

  const context = await chromium.launch({ headless: true }).then((browser) =>
    browser.newContext({ baseURL: browserBaseUrl, ignoreHTTPSErrors: true }).then((ctx) => ({ browser, ctx })),
  );
  try {
    const page = await context.ctx.newPage();
    if (config.nonAdminSessionCookie) {
      await applySessionCookie(context.ctx, browserBaseUrl, config.nonAdminSessionCookie);
      await page.goto("/");
    } else {
      await loginWithCredentials(page, config.nonAdminEmail!, config.nonAdminPassword!);
    }

    await page.goto("/regulatory-updates");
    await expect(page.getByText(/Access Denied|lacks required permissions/i).first()).toBeVisible({ timeout: 15000 });
    const list = await page.request.get("/_api/regulation-registry/reconciliation-candidates/list");
    const update = await page.request.post("/_api/regulation-registry/reconciliation-candidates/update-status", {
      data: { candidateId: 1, reviewStatus: "needs_source" },
    });
    if (![401, 403].includes(list.status())) {
      throw new Error(`Expected non-admin list denial, got HTTP ${list.status()}.`);
    }
    if (![401, 403].includes(update.status())) {
      throw new Error(`Expected non-admin update denial, got HTTP ${update.status()}.`);
    }
    return `blocked page and endpoints (${list.status()}/${update.status()})`;
  } finally {
    await context.ctx.close();
    await context.browser.close();
  }
}

export async function runSmoke(config: Extract<SmokeConfig, { status: "ready" }>) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: config.baseUrl, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const forbiddenCalls: string[] = [];
  const apiServerErrors: string[] = [];
  const pageErrors: string[] = [];
  let candidateId: number | null = null;
  let cleanupStatus = "not needed";

  page.on("request", (request) => {
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    if (FORBIDDEN_MUTATION_ENDPOINTS.some((endpoint) => endpoint.method === method && endpoint.path === url.pathname)) {
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

    const list = await jsonRequest(page, "GET", "/_api/regulation-registry/reconciliation-candidates/list");
    if (!list.response.ok()) {
      throw new Error(`Admin candidate list returned HTTP ${list.response.status()}.`);
    }

    const beforeRegistry = await jsonRequest(page, "GET", "/_api/regulation-registry/list?includeInactive=true");
    const beforeMappings = await jsonRequest(page, "GET", "/_api/regulation-registry/mapping");
    const beforeRegistryHash = hashJson(beforeRegistry.body?.regulations ?? []);
    const beforeMappingsHash = hashJson(beforeMappings.body?.mappings ?? []);

    const synthetic = await ensureSyntheticCandidate(page, config.runId);
    candidateId = synthetic.candidate.id;

    await page.goto("/regulatory-updates");
    await expect(page.getByRole("heading", { name: /Regulations & Law Update Engine/i })).toBeVisible({ timeout: 15000 });
    await page.getByRole("tab", { name: "Reconciliation Candidates" }).click();
    await expect(page.getByText(/This candidate is inert/i).first()).toBeVisible();
    await expect(page.getByText(/Review actions do not change runtime references/i).first()).toBeVisible();
    await expect(page.getByText(/Runtime activation requires a separate approved implementation step/i).first()).toBeVisible();

    for (const term of FORBIDDEN_ACTIVATION_TERMS) {
      const pattern = term === "Activate" || term === "Enforce" ? new RegExp(`^${term}$`, "i") : new RegExp(term, "i");
      if (await page.getByRole("button", { name: pattern }).count()) {
        throw new Error(`Forbidden activation control found: ${term}.`);
      }
    }

    const syntheticCandidate = buildSyntheticCandidateForRun(config.runId);
    await page.getByLabel("Candidate type filter").selectOption(syntheticCandidate.candidateType);
    await page.getByLabel("Severity filter").selectOption(syntheticCandidate.severity);
    await page.getByLabel("Review status filter").selectOption("pending_review");
    await page.getByLabel("Static reference ID filter").fill(syntheticCandidate.staticReferenceId);
    await page.getByLabel("DB regulation ID filter").fill(syntheticCandidate.dbRegulationId);
    await page.getByLabel("Deterministic rule ID filter").fill(syntheticCandidate.deterministicRuleId);
    await page.getByLabel("Reconciliation run ID filter").fill(config.runId);
    const candidateCard = page.getByRole("article").filter({
      hasText: syntheticCandidate.message,
    }).filter({
      hasText: syntheticCandidate.staticReferenceId,
    }).filter({
      hasText: syntheticCandidate.dbRegulationId,
    }).filter({
      hasText: syntheticCandidate.deterministicRuleId,
    }).filter({
      hasText: "pending review",
    });
    await expect(candidateCard).toHaveCount(1, { timeout: 15000 });
    await expect(candidateCard).toBeVisible();

    await candidateCard.getByRole("button", { name: /View Details/i }).click();
    const detailPanel = page.getByLabel("Reconciliation candidate detail");
    await expect(detailPanel.getByText(`Candidate #${candidateId}`)).toBeVisible({ timeout: 15000 });
    await expect(detailPanel.getByText(syntheticCandidate.message)).toBeVisible();
    await expect(detailPanel.getByText("source url missing candidate", { exact: true })).toBeVisible();
    await expect(detailPanel.getByText("low", { exact: true })).toBeVisible();
    await expect(detailPanel.getByText("inert", { exact: true })).toBeVisible();
    await expect(detailPanel.getByText(syntheticCandidate.staticReferenceId, { exact: true })).toBeVisible();
    await expect(detailPanel.getByText(syntheticCandidate.dbRegulationId, { exact: true })).toBeVisible();
    await expect(detailPanel.getByText(syntheticCandidate.deterministicRuleId, { exact: true })).toBeVisible();
    await expect(detailPanel.getByText("Synthetic static reference for UI smoke")).toBeVisible();
    await expect(detailPanel.getByText("Synthetic DB governance reference for UI smoke")).toBeVisible();

    await assertValidationFailures(page, candidateId);

    const statusUpdate = await jsonRequest(page, "POST", "/_api/regulation-registry/reconciliation-candidates/update-status", {
      candidateId,
      reviewStatus: "needs_source",
      reviewNotes: "Gated UI smoke review-only status update.",
    });
    if (!statusUpdate.response.ok()) {
      throw new Error(`Review-only status update returned HTTP ${statusUpdate.response.status()}.`);
    }

    const refreshed = await findSyntheticCandidate(page, config.runId);
    if (refreshed?.activeStatus !== "inert") {
      throw new Error(`Synthetic candidate activeStatus changed to ${refreshed?.activeStatus ?? "missing"}.`);
    }
    if (refreshed.reviewStatus !== "needs_source") {
      throw new Error(`Synthetic candidate reviewStatus is ${refreshed.reviewStatus}, expected needs_source.`);
    }

    cleanupStatus = await archiveSyntheticCandidate(page, candidateId);

    const afterRegistry = await jsonRequest(page, "GET", "/_api/regulation-registry/list?includeInactive=true");
    const afterMappings = await jsonRequest(page, "GET", "/_api/regulation-registry/mapping");
    if (beforeRegistryHash !== hashJson(afterRegistry.body?.regulations ?? [])) {
      throw new Error("Active regulation registry response changed during smoke.");
    }
    if (beforeMappingsHash !== hashJson(afterMappings.body?.mappings ?? [])) {
      throw new Error("Regulation mapping response changed during smoke.");
    }

    const nonAdminResult = await verifyNonAdminIfConfigured(config.baseUrl, config);
    const health = await page.request.get("/");
    if (!health.ok()) throw new Error(`Smoke target health returned HTTP ${health.status()}.`);
    if (forbiddenCalls.length > 0) throw new Error(`Forbidden endpoint calls observed: ${forbiddenCalls.join(", ")}`);
    if (apiServerErrors.length > 0) throw new Error(`API 5xx responses observed: ${apiServerErrors.join(", ")}`);
    if (pageErrors.length > 0) throw new Error(`Page errors observed: ${pageErrors.length}.`);

    return {
      status: "passed" as const,
      baseUrl: config.baseUrl,
      host: config.host,
      authMode: config.authMode,
      candidateId,
      reconciliationRunId: config.runId,
      cleanupStatus,
      nonAdminResult,
      runtimeSafety: {
        forbiddenEndpointCalls: 0,
        registryResponseUnchanged: true,
        mappingResponseUnchanged: true,
        candidateRemainedInert: true,
      },
    };
  } catch (error) {
    if (candidateId) {
      try {
        cleanupStatus = await archiveSyntheticCandidate(page, candidateId);
      } catch {
        cleanupStatus = "archive failed";
      }
    }
    throw new Error(`${error instanceof Error ? error.message : String(error)} Cleanup status: ${cleanupStatus}.`);
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
