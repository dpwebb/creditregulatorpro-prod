import { fileURLToPath } from "node:url";
import { chromium, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";

import {
  assertResponseDocumentEvidenceOnly,
  assertResponseDocumentPrivacySafe,
  redactSecretText as redactResponseSecretText,
  RESPONSE_DOCUMENT_ENDPOINTS,
  SUPPORTING_READ_ONLY_ENDPOINTS,
  type ResponseDocumentPrivacyContext,
} from "./staging-response-document-smoke";
import { validateSmokeHost } from "./staging-outcome-tracking-smoke";

export const SMOKE_GATE_ENV = "CRP_RESPONSE_DOCUMENT_UI_SMOKE";
export const SKIPPED_EXIT_CODE = 2;
export const RESPONSE_DOCUMENT_UI_PATH = "/admin-response-documents";

export const RESPONSE_DOCUMENT_UI_REQUIRED_TEXT = [
  "Response Documents",
  "Response documents keep immutable evidence plus append-only deterministic processing.",
  "Response classifications are intake outcomes only; later credit-report comparison remains required before source-truth outcomes change.",
  "Deterministic response parsing runs without AI dependency, and fallback extraction is disabled unless explicitly approved.",
  "This page does not change canonical report facts.",
  "This page does not change packet readiness or wording.",
  "This page does not activate regulation runtime truth.",
  "No mailbox, Gmail, IMAP, or inbox integration is used.",
  "Manual Response Capture",
  "Live mailbox connections remain disabled.",
] as const;

export const RESPONSE_DOCUMENT_UI_DETAIL_NOTICE =
  "Response captured and classified deterministically. Later credit-report comparison is still required before corrected, removed, or unchanged source-truth outcomes can change.";

export const RESPONSE_DOCUMENT_UI_FORBIDDEN_CONTROLS = [
  "Review Response",
  "Mark Related",
  "Mark Unrelated",
  "Mark Corrected",
  "Mark Removed",
  "Mark Unchanged",
  "Prove Correction",
  "Legal Violation",
  "Activate",
  "Enforce",
  "Demand",
  "Inbox Sync",
  "Connect Gmail",
  "Connect IMAP",
  "Parse Response",
] as const;

export const RESPONSE_DOCUMENT_UI_FORBIDDEN_VISIBLE_PHRASES = [
  "Equifax admitted fault",
  "The bureau corrected the item",
  "The bureau violated the law",
  "You won",
  "You are entitled to damages",
  "This proves correction",
  "This is legal proof",
  "The agency must pay",
  "confirmed legal violation",
] as const;

export const FORBIDDEN_RESPONSE_DOCUMENT_UI_ENDPOINTS = [
  { method: "POST", path: "/_api/responses/capture" },
  { method: "POST", path: "/_api/responses/admin-review" },
  { method: "POST", path: "/_api/parser/run" },
  { method: "POST", path: "/_api/parser-lab/run" },
  { method: "POST", path: "/_api/ocr/run" },
  { method: "POST", path: "/_api/ingest/process" },
  { method: "POST", path: "/_api/report-artifact/create" },
  { method: "POST", path: "/_api/report-artifact/update" },
  { method: "POST", path: "/_api/report-artifact/delete" },
  { method: "POST", path: "/_api/tradelines/update" },
  { method: "POST", path: "/_api/canonical/update" },
  { method: "POST", path: "/_api/canonical/report/update" },
  { method: "GET", path: "/_api/packet/readiness" },
  { method: "POST", path: "/_api/packet/build" },
  { method: "POST", path: "/_api/packet/create" },
  { method: "POST", path: "/_api/packet/save" },
  { method: "POST", path: "/_api/packet/update-status" },
  { method: "POST", path: "/_api/packet/send" },
  { method: "POST", path: "/_api/packet/delivery" },
  { method: "GET", path: "/_api/packet/pdf" },
  { method: "POST", path: "/_api/violations/run" },
  { method: "POST", path: "/_api/creditor-validation/run" },
  { method: "POST", path: "/_api/regulation-registry/runtime-bridge/activate" },
  { method: "POST", path: "/_api/regulation-registry/runtime-bridge/activate-limited-runtime" },
  { method: "GET", path: "/_api/regulation-registry/runtime-bridge/runtime-selector" },
  { method: "POST", path: "/_api/admin/override" },
  { method: "POST", path: "/_api/furnisher/packet" },
  { method: "POST", path: "/_api/evidence/bureau-communication" },
  { method: "POST", path: "/_api/obligation-instance/record-response" },
  { method: "GET", path: "/_api/gmail/list" },
  { method: "POST", path: "/_api/gmail/sync" },
  { method: "POST", path: "/_api/imap/sync" },
  { method: "POST", path: "/_api/mailbox/sync" },
  { method: "POST", path: "/_api/inbox/scrape" },
] as const;

export const RESPONSE_DOCUMENT_UI_CLEANUP_POLICY =
  "Response document UI smoke is non-mutating: it opens the manual intake surface without submitting it, and no cleanup is needed because it does not create, mutate, or remove response, audit, evidence, outcome, packet, or canonical rows.";

type AuthMode = "credentials" | "session_cookie";
type EnvPrefix = "STAGING" | "LOCAL_SMOKE";

export type ExistingResponseSource = {
  mode: "existing_response";
  syntheticMarker: string;
  responseId: number;
  comparisonRunId?: number;
  findingOutcomeId?: number;
};

export type FindByMarkerResponseSource = {
  mode: "find_by_marker";
  syntheticMarker: string;
  comparisonRunId?: number;
  findingOutcomeId?: number;
};

export type ResponseDocumentUiSource = ExistingResponseSource | FindByMarkerResponseSource;

export type ResponseDocumentUiSmokeConfig =
  | {
      status: "ready";
      baseUrl: string;
      host: string;
      prefix: EnvPrefix;
      authMode: AuthMode;
      adminSessionCookie?: string;
      adminEmail?: string;
      adminPassword?: string;
      source: ResponseDocumentUiSource;
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
  status: number;
  ok: boolean;
  body: any;
  text: string;
};

type VerifiedResponse = {
  response: any;
  responseId: number;
  syntheticMarker: string;
  comparisonRunId: number | null;
  findingOutcomeId: number | null;
  responseChannel: string;
  responseDocumentType: string;
  responseStatus: string;
  privacyContext: ResponseDocumentPrivacyContext;
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

function prefixedEnv(env: NodeJS.ProcessEnv, prefix: EnvPrefix, key: string): string | undefined {
  return env[`${prefix}_${key}`];
}

function responseEnv(env: NodeJS.ProcessEnv, prefix: EnvPrefix, key: string): string | undefined {
  return prefixedEnv(env, prefix, `RESPONSE_${key}`);
}

function markerIsSynthetic(value: string | null): value is string {
  return Boolean(value && /(?:outcome|response)[_-]?smoke/i.test(value));
}

function smokeRunIdentifier(runId: string): string {
  const safe = runId
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || "response-document-ui-smoke";
}

function defaultSmokeRunId(): string {
  return `response-document-ui-smoke-r${Date.now().toString(36)}`;
}

function cookieHeaderFromSetCookie(setCookie: string): string {
  const normalized = setCookie.replace(/^cookie:\s*/i, "").trim();
  const match = normalized.match(/floot_built_app_session=[^;,\s]+/);
  return match?.[0] ?? "";
}

function formatEnumForUi(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value).replace(/_/g, " ");
}

function expectedSafeUiText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value).replace(/\b\d{10,}\b/g, (match) => `...${match.slice(-4)}`);
}

function responseIdFrom(record: any): number {
  const id = Number(record?.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Verified response record did not include a valid response ID.");
  }
  return id;
}

function responseMatchesMarker(record: any, marker: string): boolean {
  return JSON.stringify(record).includes(marker);
}

function responsePrivacyContext(record: any, marker: string, runId?: string): ResponseDocumentPrivacyContext {
  return {
    syntheticMarker: marker,
    runId: runId ?? null,
    responseReferenceId: record?.responseReferenceId ?? null,
    responseSubject: record?.responseSubject ?? null,
    normalizedResponseHash: record?.normalizedResponseHash ?? null,
  };
}

function verifiedResponseFrom(record: any, marker: string, runId?: string): VerifiedResponse {
  const responseId = responseIdFrom(record);
  if (!responseMatchesMarker(record, marker)) {
    throw new Error(`Response ${responseId} did not include required synthetic marker ${marker}; refusing UI smoke.`);
  }
  const privacyContext = responsePrivacyContext(record, marker, runId);
  assertResponseDocumentUiPrivacySafe(record, privacyContext);
  assertResponseDocumentEvidenceOnly(record);
  const responseChannel = String(record.responseChannel ?? "");
  const responseDocumentType = String(record.responseDocumentType ?? "");
  const responseStatus = String(record.responseStatus ?? "");
  if (responseChannel !== "email") throw new Error(`Synthetic response ${responseId} was ${responseChannel}, expected email.`);
  if (responseDocumentType !== "bureau_email_response") {
    throw new Error(`Synthetic response ${responseId} was ${responseDocumentType}, expected bureau_email_response.`);
  }
  if (responseStatus !== "linked_to_outcome") {
    throw new Error(`Synthetic response ${responseId} was ${responseStatus}, expected linked_to_outcome.`);
  }
  const comparisonRunId = record.comparisonRunId == null ? null : Number(record.comparisonRunId);
  const findingOutcomeId = record.findingOutcomeId == null ? null : Number(record.findingOutcomeId);
  return {
    response: record,
    responseId,
    syntheticMarker: marker,
    comparisonRunId: Number.isInteger(comparisonRunId) && comparisonRunId > 0 ? comparisonRunId : null,
    findingOutcomeId: Number.isInteger(findingOutcomeId) && findingOutcomeId > 0 ? findingOutcomeId : null,
    responseChannel,
    responseDocumentType,
    responseStatus,
    privacyContext,
  };
}

export function buildResponseDocumentUiSource(env: NodeJS.ProcessEnv, prefix: EnvPrefix): ResponseDocumentUiSource | null {
  const syntheticMarker = normalizeEnv(responseEnv(env, prefix, "SYNTHETIC_MARKER"));
  if (!markerIsSynthetic(syntheticMarker)) return null;

  const responseId = numberEnv(responseEnv(env, prefix, "ID"));
  const comparisonRunId = numberEnv(responseEnv(env, prefix, "COMPARISON_RUN_ID"));
  const findingOutcomeId = numberEnv(responseEnv(env, prefix, "FINDING_OUTCOME_ID"));

  if (responseId) {
    return {
      mode: "existing_response",
      syntheticMarker,
      responseId,
      comparisonRunId: comparisonRunId ?? undefined,
      findingOutcomeId: findingOutcomeId ?? undefined,
    };
  }

  return {
    mode: "find_by_marker",
    syntheticMarker,
    comparisonRunId: comparisonRunId ?? undefined,
    findingOutcomeId: findingOutcomeId ?? undefined,
  };
}

export function buildSmokeConfig(env: NodeJS.ProcessEnv): ResponseDocumentUiSmokeConfig {
  if (!normalizeBoolean(env[SMOKE_GATE_ENV])) {
    return {
      status: "skipped",
      reason: `SKIPPED: ${SMOKE_GATE_ENV}=true is required.`,
    };
  }

  const stagingBaseUrl = normalizeEnv(env.STAGING_BASE_URL);
  const localBaseUrl = normalizeEnv(env.LOCAL_SMOKE_BASE_URL);
  const baseUrl = stagingBaseUrl ?? localBaseUrl;
  const prefix: EnvPrefix = stagingBaseUrl ? "STAGING" : "LOCAL_SMOKE";

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

  const adminSessionCookie = normalizeEnv(env[`${prefix}_ADMIN_SESSION_COOKIE`]);
  const adminEmail = normalizeEnv(env[`${prefix}_ADMIN_EMAIL`]);
  const adminPassword = normalizeEnv(env[`${prefix}_ADMIN_PASSWORD`]);
  if (!adminSessionCookie && (!adminEmail || !adminPassword)) {
    return {
      status: "skipped",
      reason: "SKIPPED: no safe authenticated admin context configured.",
    };
  }

  const source = buildResponseDocumentUiSource(env, prefix);
  if (!source) {
    return {
      status: "skipped",
      reason:
        prefix === "STAGING"
          ? "SKIPPED: no verified response ID or marker configured. Provide STAGING_RESPONSE_SYNTHETIC_MARKER plus optional STAGING_RESPONSE_ID, STAGING_RESPONSE_COMPARISON_RUN_ID, and STAGING_RESPONSE_FINDING_OUTCOME_ID."
          : "SKIPPED: no verified response ID or marker configured. Provide LOCAL_SMOKE_RESPONSE_SYNTHETIC_MARKER plus optional LOCAL_SMOKE_RESPONSE_ID, LOCAL_SMOKE_RESPONSE_COMPARISON_RUN_ID, and LOCAL_SMOKE_RESPONSE_FINDING_OUTCOME_ID.",
    };
  }

  const runId = normalizeEnv(env.CRP_RESPONSE_DOCUMENT_UI_SMOKE_RUN_ID) ?? defaultSmokeRunId();
  if (adminSessionCookie) {
    return {
      status: "ready",
      baseUrl,
      host: hostCheck.host,
      prefix,
      authMode: "session_cookie",
      adminSessionCookie,
      source,
      runId,
    };
  }

  return {
    status: "ready",
    baseUrl,
    host: hostCheck.host,
    prefix,
    authMode: "credentials",
    adminEmail: adminEmail!,
    adminPassword: adminPassword!,
    source,
    runId,
  };
}

export function redactSecretText(value: string, env: NodeJS.ProcessEnv): string {
  return redactResponseSecretText(value, env);
}

export function assertResponseDocumentUiPrivacySafe(
  payload: unknown,
  context?: ResponseDocumentPrivacyContext,
): void {
  assertResponseDocumentPrivacySafe(payload, context);
}

export function assertNoForbiddenEndpointCalls(observedRequests: string[]): void {
  const forbidden = observedRequests.filter((request) =>
    FORBIDDEN_RESPONSE_DOCUMENT_UI_ENDPOINTS.some((endpoint) => request === `${endpoint.method} ${endpoint.path}`),
  );
  if (forbidden.length > 0) {
    throw new Error(`Forbidden response document UI smoke endpoint calls observed: ${forbidden.join(", ")}.`);
  }
}

export function assertNoDestructiveCleanupPlanned(policy = RESPONSE_DOCUMENT_UI_CLEANUP_POLICY): void {
  if (!/non-mutating/i.test(policy) || /submit manual response intake|connect mailbox|sync mailbox|archive response/i.test(policy)) {
    throw new Error("Response document UI smoke cleanup policy must be non-mutating.");
  }
}

function toAbsoluteUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

async function jsonRequest(
  page: Page,
  method: "GET" | "POST",
  path: string,
  context?: ResponseDocumentPrivacyContext,
): Promise<JsonResponse> {
  const response = method === "GET" ? await page.request.get(path) : await page.request.post(path);
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  assertResponseDocumentUiPrivacySafe(body, context);
  assertResponseDocumentEvidenceOnly(body);
  return { status: response.status(), ok: response.ok(), body, text };
}

async function applySessionCookie(context: BrowserContext, baseUrl: string, cookieHeader: string): Promise<void> {
  const sessionPart = cookieHeaderFromSetCookie(cookieHeader);
  if (!sessionPart) {
    throw new Error("Configured admin session cookie did not include floot_built_app_session.");
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
    throw new Error("Configured admin credentials did not authenticate.");
  }
}

async function authenticateAdmin(
  context: BrowserContext,
  page: Page,
  config: Extract<ResponseDocumentUiSmokeConfig, { status: "ready" }>,
): Promise<{ role: string | null }> {
  if (config.authMode === "session_cookie") {
    await applySessionCookie(context, config.baseUrl, config.adminSessionCookie!);
    await page.goto("/");
  } else {
    await loginWithCredentials(page, config.adminEmail!, config.adminPassword!);
  }

  const session = await jsonRequest(page, "GET", SUPPORTING_READ_ONLY_ENDPOINTS.session);
  if (!session.ok) {
    throw new Error(`Admin session check returned HTTP ${session.status}.`);
  }
  const role = session.body?.user?.role ?? null;
  if (role !== "admin") {
    throw new Error(`Configured authenticated context resolved to role ${String(role)}; refusing admin UI smoke.`);
  }
  return { role };
}

function listQueryForSource(source: ResponseDocumentUiSource, record?: any): string {
  const query = new URLSearchParams();
  query.set("limit", "100");
  query.set("responseChannel", "email");
  query.set("responseDocumentType", "bureau_email_response");
  query.set("responseStatus", "linked_to_outcome");
  const comparisonRunId = source.comparisonRunId ?? (record?.comparisonRunId == null ? undefined : Number(record.comparisonRunId));
  const findingOutcomeId = source.findingOutcomeId ?? (record?.findingOutcomeId == null ? undefined : Number(record.findingOutcomeId));
  if (comparisonRunId) query.set("comparisonRunId", String(comparisonRunId));
  if (findingOutcomeId) query.set("findingOutcomeId", String(findingOutcomeId));
  return `${RESPONSE_DOCUMENT_ENDPOINTS.list}?${query.toString()}`;
}

async function fetchResponseById(
  page: Page,
  responseId: number,
  marker: string,
  runId: string,
): Promise<VerifiedResponse> {
  const context = { syntheticMarker: marker, runId };
  const result = await jsonRequest(page, "GET", `${RESPONSE_DOCUMENT_ENDPOINTS.get}?responseId=${responseId}`, context);
  if (!result.ok) {
    throw new Error(`Response document get returned HTTP ${result.status}.`);
  }
  return verifiedResponseFrom(result.body?.response, marker, runId);
}

async function verifyResponseSource(
  page: Page,
  source: ResponseDocumentUiSource,
  runId: string,
): Promise<VerifiedResponse> {
  if (source.mode === "existing_response") {
    const verified = await fetchResponseById(page, source.responseId, source.syntheticMarker, runId);
    const listed = await jsonRequest(page, "GET", listQueryForSource(source, verified.response), verified.privacyContext);
    if (!listed.ok) {
      throw new Error(`Response document list returned HTTP ${listed.status}.`);
    }
    const responses = Array.isArray(listed.body?.responses) ? listed.body.responses : [];
    if (!responses.some((record: any) => Number(record.id) === verified.responseId && responseMatchesMarker(record, source.syntheticMarker))) {
      throw new Error(`Response document list did not include verified synthetic response ${verified.responseId}.`);
    }
    return verified;
  }

  const listed = await jsonRequest(page, "GET", listQueryForSource(source), {
    syntheticMarker: source.syntheticMarker,
    runId,
  });
  if (!listed.ok) {
    throw new Error(`Response document list returned HTTP ${listed.status}.`);
  }
  const responses = Array.isArray(listed.body?.responses) ? listed.body.responses : [];
  const matched = responses.find((record: any) => responseMatchesMarker(record, source.syntheticMarker));
  if (!matched) {
    throw new Error(`Response document list did not include a synthetic response with marker ${source.syntheticMarker}.`);
  }
  return fetchResponseById(page, responseIdFrom(matched), source.syntheticMarker, runId);
}

async function assertUiSafetyText(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Response Documents" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Response documents keep immutable evidence plus append-only deterministic processing.")).toBeVisible();
  await expect(page.getByText(/later credit-report comparison remains required/i)).toBeVisible();
  await expect(page.getByText("Deterministic response parsing runs without AI dependency, and fallback extraction is disabled unless explicitly approved.")).toBeVisible();
  await expect(page.getByText("This page does not change canonical report facts.")).toBeVisible();
  await expect(page.getByText("This page does not change packet readiness or wording.")).toBeVisible();
  await expect(page.getByText("This page does not activate regulation runtime truth.")).toBeVisible();
  await expect(page.getByText("No mailbox, Gmail, IMAP, or inbox integration is used.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Manual Response Capture" })).toBeVisible();
  await expect(page.getByText(/Live mailbox connections remain disabled/i)).toBeVisible();
}

async function applyResponseFilters(page: Page, verified: VerifiedResponse): Promise<void> {
  const filters = page.locator("section[aria-label='Response document filters']");
  await filters.locator("label", { hasText: "Response channel" }).locator("select").selectOption(verified.responseChannel);
  await filters.locator("label", { hasText: "Document type" }).locator("select").selectOption(verified.responseDocumentType);
  await filters.locator("label", { hasText: "Status" }).locator("select").selectOption(verified.responseStatus);
  if (verified.comparisonRunId) {
    await filters.locator("label", { hasText: "Comparison run ID" }).locator("input").fill(String(verified.comparisonRunId));
  }
  if (verified.findingOutcomeId) {
    await filters.locator("label", { hasText: "Finding outcome ID" }).locator("input").fill(String(verified.findingOutcomeId));
  }
}

function responseDetailPanel(page: Page): Locator {
  return page.locator("section", { has: page.getByRole("heading", { name: "Response Detail" }) });
}

function responseCardFor(page: Page, responseId: number): Locator {
  return page.getByRole("article").filter({ hasText: `Response #${responseId}` });
}

async function assertForbiddenControlsAbsent(page: Page): Promise<void> {
  for (const control of RESPONSE_DOCUMENT_UI_FORBIDDEN_CONTROLS) {
    const escaped = control.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\ /g, "\\s+");
    const pattern = new RegExp(`^${escaped}$`, "i");
    if (await page.getByRole("button", { name: pattern }).count()) {
      throw new Error(`Forbidden response document UI control found: ${control}.`);
    }
  }
}

export function assertNoForbiddenLegalConclusionText(text: string): void {
  for (const phrase of RESPONSE_DOCUMENT_UI_FORBIDDEN_VISIBLE_PHRASES) {
    if (new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text)) {
      throw new Error(`Forbidden response document UI legal-conclusion phrase found: ${phrase}.`);
    }
  }
  if (/\bdemand\b/i.test(text) || /\benforce\b/i.test(text)) {
    throw new Error("Forbidden response document UI legal-conclusion phrase found: demand/enforce.");
  }
}

async function assertResponseDetailVisible(page: Page, verified: VerifiedResponse): Promise<Locator> {
  const detailPanel = responseDetailPanel(page);
  await expect(detailPanel).toHaveCount(1, { timeout: 15000 });
  await expect(detailPanel.getByText(`Response #${verified.responseId}`, { exact: true })).toBeVisible();
  await expect(detailPanel.getByText(formatEnumForUi(verified.responseChannel)!, { exact: true }).first()).toBeVisible();
  await expect(detailPanel.getByText(formatEnumForUi(verified.responseDocumentType)!, { exact: true }).first()).toBeVisible();
  await expect(detailPanel.getByText(formatEnumForUi(verified.responseStatus)!, { exact: true }).first()).toBeVisible();
  if (verified.comparisonRunId) {
    await expect(detailPanel.getByText(String(verified.comparisonRunId), { exact: true }).first()).toBeVisible();
  }
  if (verified.findingOutcomeId) {
    await expect(detailPanel.getByText(String(verified.findingOutcomeId), { exact: true }).first()).toBeVisible();
  }
  for (const value of [verified.response.responseSubject, verified.response.responseReferenceId, verified.response.responseSummary]) {
    const expected = expectedSafeUiText(value);
    if (expected) {
      await expect(detailPanel.getByText(expected, { exact: true }).first()).toBeVisible();
    }
  }
  await expect(detailPanel.getByText(RESPONSE_DOCUMENT_UI_DETAIL_NOTICE, { exact: true })).toBeVisible();
  return detailPanel;
}

async function openSyntheticResponseDetail(page: Page, verified: VerifiedResponse): Promise<Locator> {
  await page.goto(RESPONSE_DOCUMENT_UI_PATH);
  await assertUiSafetyText(page);
  await assertForbiddenControlsAbsent(page);
  await applyResponseFilters(page, verified);

  const card = responseCardFor(page, verified.responseId);
  await expect(card).toHaveCount(1, { timeout: 15000 });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: /View Details/i }).click();
  return assertResponseDetailVisible(page, verified);
}

export async function runSmoke(config: Extract<ResponseDocumentUiSmokeConfig, { status: "ready" }>) {
  assertNoDestructiveCleanupPlanned();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: config.baseUrl, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const observedRequests: string[] = [];
  const apiServerErrors: string[] = [];
  const pageErrors: string[] = [];
  let verified: VerifiedResponse | null = null;

  page.on("request", (request) => {
    const url = new URL(request.url());
    observedRequests.push(`${request.method().toUpperCase()} ${url.pathname}`);
  });
  page.on("response", (response) => {
    if (response.url().includes("/_api/") && response.status() >= 500) {
      apiServerErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    const session = await authenticateAdmin(context, page, config);
    verified = await verifyResponseSource(page, config.source, config.runId);
    const detailPanel = await openSyntheticResponseDetail(page, verified);
    const detailText = await detailPanel.innerText();
    assertResponseDocumentUiPrivacySafe({ displayText: detailText }, verified.privacyContext);
    assertNoForbiddenLegalConclusionText(detailText);
    await assertForbiddenControlsAbsent(page);

    const health = await page.request.get("/");
    if (!health.ok()) throw new Error(`Smoke target health returned HTTP ${health.status()}.`);

    assertNoForbiddenEndpointCalls(observedRequests);
    if (apiServerErrors.length > 0) throw new Error(`API 5xx responses observed: ${apiServerErrors.join(", ")}.`);
    if (pageErrors.length > 0) throw new Error(`Page errors observed: ${pageErrors.length}.`);

    return {
      status: "passed" as const,
      baseUrl: config.baseUrl,
      host: config.host,
      authMode: config.authMode,
      authenticatedRole: session.role,
      runId: smokeRunIdentifier(config.runId),
      sourceMode: config.source.mode,
      syntheticMarker: verified.syntheticMarker,
      responseId: verified.responseId,
      comparisonRunId: verified.comparisonRunId,
      findingOutcomeId: verified.findingOutcomeId,
      ui: {
        adminRouteRendered: true,
        safetyBannerRendered: true,
        evidenceMetadataOnlyNoticeRendered: true,
        laterReportComparisonNoticeRendered: true,
        responseListLoaded: true,
        syntheticResponseVisible: true,
        detailPanelOpened: true,
        nonMutatingRouteSmoke: true,
        correctedRemovedUnchangedControlsAbsent: true,
        parserInboxMailboxControlsAbsent: true,
        legalConclusionWordingAbsent: true,
        consumerFacingResponseUiUsed: false,
      },
      responseDetail: {
        responseChannel: verified.responseChannel,
        responseDocumentType: verified.responseDocumentType,
        responseStatus: verified.responseStatus,
        responseDocumentsRemainEvidenceMetadataOnly: true,
        laterReportComparisonStillRequired: true,
      },
      cleanupStatus: RESPONSE_DOCUMENT_UI_CLEANUP_POLICY,
      runtimeSafety: {
        responseCaptureEndpointCalls: 0,
        responseAdminReviewEndpointCalls: 0,
        parserEndpointCalls: 0,
        ocrEndpointCalls: 0,
        canonicalExtractionEndpointCalls: 0,
        packetGenerationEndpointCalls: 0,
        packetReadinessEndpointCalls: 0,
        packetWordingPdfEndpointCalls: 0,
        violationFiringEndpointCalls: 0,
        regulationRuntimeActivationEndpointCalls: 0,
        adminOverrideEndpointCalls: 0,
        directFurnisherEndpointCalls: 0,
        mailboxGmailImapInboxEndpointCalls: 0,
        packetMutationEndpointCalls: 0,
        canonicalReportTradelineMutationEndpointCalls: 0,
        dbRegistryRemainedGovernanceMetadata: true,
        staticRuntimeMappingsRemainActiveTruth: true,
      },
      privacy: {
        noFullSin: true,
        noFullUnmaskedAccount: true,
        noRawReportText: true,
        noRawPdfText: true,
        noFullEmailBody: true,
        noPacketBody: true,
        noStorageSecrets: true,
        noSignedUrls: true,
        noSessionCookieEcho: true,
        noApiKeysOrDatabaseUrls: true,
        noMailboxCredentials: true,
        noEmailAuthTokens: true,
        noForbiddenLegalConclusionPhrases: true,
      },
    };
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} Response ID: ${verified?.responseId ?? "none"}. Cleanup: ${RESPONSE_DOCUMENT_UI_CLEANUP_POLICY}`,
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
    console.error(redactSecretText(config.reason, env));
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
