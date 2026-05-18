import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium, expect, type BrowserContext, type Page } from "@playwright/test";

import {
  assertNoDestructiveCleanupPlanned as assertAdminReviewCleanupPolicy,
  assertResponseAdminReviewEvidenceOnly,
  assertResponseAdminReviewPrivacySafe,
  redactSecretText as redactAdminReviewSecretText,
  RESPONSE_DOCUMENT_ADMIN_REVIEW_CLEANUP_POLICY,
  RESPONSE_DOCUMENT_ADMIN_REVIEW_ENDPOINTS,
  SUPPORTING_READ_ONLY_ENDPOINTS,
  type ResponseDocumentAdminReviewSource,
} from "./staging-response-document-admin-review-smoke";
import { validateSmokeHost } from "./staging-outcome-tracking-smoke";
import { RESPONSE_DOCUMENT_UI_PATH } from "./staging-response-document-ui-smoke";

export const SMOKE_GATE_ENV = "CRP_RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_SMOKE";
export const SKIPPED_EXIT_CODE = 2;

export const RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_ALLOWED_ACTION = "add_review_note" as const;
export const RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_NOTE =
  "response reviewed; captured as evidence; later report comparison required";

export const RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_CLEANUP_POLICY =
  "Response document admin-review UI smoke is append-only: it leaves response review metadata, audit rows, evidence rows, outcome rows, packet rows, and canonical rows in place by design.";

export const RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_REQUIRED_TEXT = [
  "Response Documents",
  "Response documents are evidence and metadata only.",
  "Admin Metadata Review",
  "Admin review updates response metadata only.",
  "A later credit-report comparison is still required to classify corrected, removed, or unchanged outcomes.",
  "This does not change canonical report facts.",
  "This does not change packet readiness or wording.",
  "This does not create an admin override.",
  "Save Metadata Review",
] as const;

export const RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_FORBIDDEN_VISIBLE_TEXT = [
  "Mark Corrected",
  "Mark Removed",
  "Mark Unchanged",
  "Override Outcome",
  "Legal Violation",
  "Admitted Fault",
  "Activate",
  "Make Final Truth",
  "Force Outcome",
  "Demand",
  "Enforce",
  "Equifax admitted fault",
  "The bureau corrected the item",
  "The bureau violated the law",
  "You won",
  "This proves correction",
  "This is legal proof",
  "The agency must pay",
  "Capture Response",
  "Upload Response",
  "Connect Gmail",
  "Connect IMAP",
  "Inbox Sync",
  "Parse Response",
] as const;

export const FORBIDDEN_RESPONSE_ADMIN_REVIEW_UI_ENDPOINTS = [
  { method: "POST", path: "/_api/responses/capture" },
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

type AuthMode = "credentials" | "session_cookie" | "storage_state";
type EnvPrefix = "STAGING" | "LOCAL_SMOKE";

export type ResponseDocumentAdminReviewUiSmokeConfig =
  | {
      status: "ready";
      baseUrl: string;
      host: string;
      prefix: EnvPrefix;
      authMode: AuthMode;
      adminSessionCookie?: string;
      adminEmail?: string;
      adminPassword?: string;
      adminStorageStatePath?: string;
      source: ResponseDocumentAdminReviewSource;
      runId: string;
    }
  | { status: "skipped"; reason: string }
  | { status: "error"; reason: string };

type VerifiedResponse = {
  response: any;
  responseId: number;
  syntheticMarker: string;
  comparisonRunId: number | null;
  findingOutcomeId: number | null;
  responseChannel: string;
  responseDocumentType: string;
  responseStatus: string;
  privacyContext: {
    syntheticMarker: string;
    runId: string | null;
    responseReferenceId?: string | null;
    responseSubject?: string | null;
    normalizedResponseHash?: string | null;
  };
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

function defaultSmokeRunId(): string {
  return `response-document-admin-review-ui-smoke-r${Date.now().toString(36)}`;
}

function smokeRunIdentifier(runId: string): string {
  const safe = runId
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || "response-document-admin-review-ui-smoke";
}

function cookieHeaderFromSetCookie(setCookie: string): string {
  const normalized = setCookie.replace(/^cookie:\s*/i, "").trim();
  const match = normalized.match(/floot_built_app_session=[^;,\s]+/);
  return match?.[0] ?? "";
}

function responseMatchesMarker(record: any, marker: string): boolean {
  return JSON.stringify(record).includes(marker);
}

function responseIdFrom(record: any): number {
  const id = Number(record?.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Verified response record did not include a valid response ID.");
  }
  return id;
}

function responsePrivacyContext(record: any, marker: string, runId: string) {
  return {
    syntheticMarker: marker,
    runId,
    responseReferenceId: record?.responseReferenceId ?? null,
    responseSubject: record?.responseSubject ?? null,
    normalizedResponseHash: record?.normalizedResponseHash ?? null,
  };
}

function formatEnumForUi(value: unknown): string {
  return String(value ?? "").replace(/_/g, " ");
}

function toAbsoluteUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

export function buildResponseDocumentAdminReviewUiSource(
  env: NodeJS.ProcessEnv,
  prefix: EnvPrefix,
): ResponseDocumentAdminReviewSource | null {
  const syntheticMarker = normalizeEnv(responseEnv(env, prefix, "SYNTHETIC_MARKER"));
  if (!markerIsSynthetic(syntheticMarker)) return null;

  const responseId = numberEnv(responseEnv(env, prefix, "ID"));
  if (responseId) {
    return {
      mode: "existing_response",
      syntheticMarker,
      responseId,
      comparisonRunId: numberEnv(responseEnv(env, prefix, "COMPARISON_RUN_ID")) ?? undefined,
      findingOutcomeId: numberEnv(responseEnv(env, prefix, "FINDING_OUTCOME_ID")) ?? undefined,
      packetId: numberEnv(responseEnv(env, prefix, "PACKET_ID")) ?? undefined,
      disputePacketFindingId: numberEnv(responseEnv(env, prefix, "DISPUTE_PACKET_FINDING_ID")) ?? undefined,
    };
  }

  return { mode: "find_by_marker", syntheticMarker };
}

export function buildSmokeConfig(env: NodeJS.ProcessEnv): ResponseDocumentAdminReviewUiSmokeConfig {
  if (!normalizeBoolean(env[SMOKE_GATE_ENV])) {
    return { status: "skipped", reason: `SKIPPED: ${SMOKE_GATE_ENV}=true is required.` };
  }

  const stagingBaseUrl = normalizeEnv(env.STAGING_BASE_URL);
  const localBaseUrl = normalizeEnv(env.LOCAL_SMOKE_BASE_URL);
  const baseUrl = stagingBaseUrl ?? localBaseUrl;
  const prefix: EnvPrefix = stagingBaseUrl ? "STAGING" : "LOCAL_SMOKE";
  if (!baseUrl) return { status: "skipped", reason: "SKIPPED: no safe authenticated admin context configured." };

  const hostCheck = validateSmokeHost(baseUrl);
  if (hostCheck.ok === false) return { status: "error", reason: hostCheck.reason };

  const adminSessionCookie = normalizeEnv(env[`${prefix}_ADMIN_SESSION_COOKIE`]);
  const adminStorageStatePath = normalizeEnv(env[`${prefix}_ADMIN_STORAGE_STATE_PATH`]);
  const adminEmail = normalizeEnv(env[`${prefix}_ADMIN_EMAIL`]);
  const adminPassword = normalizeEnv(env[`${prefix}_ADMIN_PASSWORD`]);

  if (adminStorageStatePath && !existsSync(adminStorageStatePath)) {
    return { status: "skipped", reason: `SKIPPED: configured admin storage state file was not found: ${adminStorageStatePath}` };
  }

  if (!adminSessionCookie && !adminStorageStatePath && (!adminEmail || !adminPassword)) {
    return { status: "skipped", reason: "SKIPPED: no safe authenticated admin context configured." };
  }

  const source = buildResponseDocumentAdminReviewUiSource(env, prefix);
  if (!source) {
    return {
      status: "skipped",
      reason:
        prefix === "STAGING"
          ? "SKIPPED: no verified response ID or marker configured. Provide STAGING_RESPONSE_SYNTHETIC_MARKER plus optional STAGING_RESPONSE_ID, STAGING_RESPONSE_COMPARISON_RUN_ID, and STAGING_RESPONSE_FINDING_OUTCOME_ID."
          : "SKIPPED: no verified response ID or marker configured. Provide LOCAL_SMOKE_RESPONSE_SYNTHETIC_MARKER plus optional LOCAL_SMOKE_RESPONSE_ID, LOCAL_SMOKE_RESPONSE_COMPARISON_RUN_ID, and LOCAL_SMOKE_RESPONSE_FINDING_OUTCOME_ID.",
    };
  }

  const runId = normalizeEnv(env.CRP_RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_SMOKE_RUN_ID) ?? defaultSmokeRunId();
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
  if (adminStorageStatePath) {
    return {
      status: "ready",
      baseUrl,
      host: hostCheck.host,
      prefix,
      authMode: "storage_state",
      adminStorageStatePath,
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
  return redactAdminReviewSecretText(value, env);
}

export function assertNoForbiddenEndpointCalls(observedRequests: string[]): void {
  const forbidden = observedRequests.filter((request) =>
    FORBIDDEN_RESPONSE_ADMIN_REVIEW_UI_ENDPOINTS.some((endpoint) => request === `${endpoint.method} ${endpoint.path}`),
  );
  if (forbidden.length > 0) {
    throw new Error(`Forbidden response admin-review UI smoke endpoint calls observed: ${forbidden.join(", ")}.`);
  }
}

export function assertNoForbiddenVisibleText(text: string): void {
  for (const phrase of RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_FORBIDDEN_VISIBLE_TEXT) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = ["Demand", "Enforce", "Activate"].includes(phrase)
      ? new RegExp(`\\b${escaped}\\b`, "i")
      : new RegExp(escaped, "i");
    if (pattern.test(text)) throw new Error(`Forbidden response admin-review UI text found: ${phrase}.`);
  }
}

export function assertNoDestructiveCleanupPlanned(policy = RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_CLEANUP_POLICY): void {
  if (!/append-only/i.test(policy) || /delete|truncate|drop/i.test(policy)) {
    throw new Error("Response document admin-review UI smoke cleanup policy must be append-only and non-destructive.");
  }
}

async function applySessionCookie(context: BrowserContext, baseUrl: string, cookieHeader: string): Promise<void> {
  const sessionPart = cookieHeaderFromSetCookie(cookieHeader);
  if (!sessionPart) throw new Error("Configured admin session cookie did not include floot_built_app_session.");
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
  if (outcome !== "navigated") throw new Error("Configured admin credentials did not authenticate.");
}

async function jsonRequest(page: Page, method: "GET" | "POST", path: string, data?: unknown, context?: VerifiedResponse["privacyContext"]) {
  const response = method === "GET" ? await page.request.get(path) : await page.request.post(path, { data });
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  assertResponseAdminReviewPrivacySafe(body, context);
  assertResponseAdminReviewEvidenceOnly(body);
  return { status: response.status(), ok: response.ok(), body, text };
}

async function authenticateAdmin(
  context: BrowserContext,
  page: Page,
  config: Extract<ResponseDocumentAdminReviewUiSmokeConfig, { status: "ready" }>,
): Promise<{ role: string | null }> {
  if (config.authMode === "session_cookie") {
    await applySessionCookie(context, config.baseUrl, config.adminSessionCookie!);
    await page.goto("/");
  } else if (config.authMode === "credentials") {
    await loginWithCredentials(page, config.adminEmail!, config.adminPassword!);
  } else {
    await page.goto("/");
  }

  const session = await jsonRequest(page, "GET", SUPPORTING_READ_ONLY_ENDPOINTS.session);
  if (!session.ok) throw new Error(`Admin session check returned HTTP ${session.status}.`);
  const role = session.body?.user?.role ?? null;
  if (role !== "admin") {
    throw new Error(`Configured authenticated context resolved to role ${String(role)}; refusing admin-review UI smoke.`);
  }
  return { role };
}

function verifiedResponseFrom(record: any, marker: string, runId: string): VerifiedResponse {
  const responseId = responseIdFrom(record);
  if (!responseMatchesMarker(record, marker)) {
    throw new Error(`Response ${responseId} did not include required synthetic marker ${marker}; refusing admin-review UI smoke.`);
  }
  const privacyContext = responsePrivacyContext(record, marker, runId);
  assertResponseAdminReviewPrivacySafe(record, privacyContext);
  assertResponseAdminReviewEvidenceOnly(record);
  const responseChannel = String(record.responseChannel ?? "");
  const responseDocumentType = String(record.responseDocumentType ?? "");
  if (responseChannel !== "email") throw new Error(`Synthetic response ${responseId} was ${responseChannel}, expected email.`);
  if (responseDocumentType !== "bureau_email_response") {
    throw new Error(`Synthetic response ${responseId} was ${responseDocumentType}, expected bureau_email_response.`);
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
    responseStatus: String(record.responseStatus ?? ""),
    privacyContext,
  };
}

async function fetchResponseById(page: Page, responseId: number, marker: string, runId: string): Promise<VerifiedResponse> {
  const result = await jsonRequest(page, "GET", `${RESPONSE_DOCUMENT_ADMIN_REVIEW_ENDPOINTS.get}?responseId=${responseId}`);
  if (!result.ok) throw new Error(`Response document get returned HTTP ${result.status}.`);
  return verifiedResponseFrom(result.body?.response, marker, runId);
}

async function verifyResponseSource(
  page: Page,
  source: ResponseDocumentAdminReviewSource,
  runId: string,
): Promise<VerifiedResponse> {
  if (source.mode === "existing_response") {
    const verified = await fetchResponseById(page, source.responseId, source.syntheticMarker, runId);
    if (source.comparisonRunId && verified.comparisonRunId !== source.comparisonRunId) {
      throw new Error(`Comparison run ID mismatch: expected ${source.comparisonRunId}, got ${verified.comparisonRunId}.`);
    }
    if (source.findingOutcomeId && verified.findingOutcomeId !== source.findingOutcomeId) {
      throw new Error(`Finding outcome ID mismatch: expected ${source.findingOutcomeId}, got ${verified.findingOutcomeId}.`);
    }
    return verified;
  }

  const listed = await jsonRequest(page, "GET", `${RESPONSE_DOCUMENT_ADMIN_REVIEW_ENDPOINTS.list}?limit=100&responseChannel=email&responseDocumentType=bureau_email_response`, undefined, {
    syntheticMarker: source.syntheticMarker,
    runId,
  });
  if (!listed.ok) throw new Error(`Response document list returned HTTP ${listed.status}.`);
  const responses = Array.isArray(listed.body?.responses) ? listed.body.responses : [];
  const matched = responses.find((record: any) => responseMatchesMarker(record, source.syntheticMarker));
  if (!matched) throw new Error(`Response document list did not include a synthetic response with marker ${source.syntheticMarker}.`);
  return fetchResponseById(page, responseIdFrom(matched), source.syntheticMarker, runId);
}

async function openResponseDetail(page: Page, verified: VerifiedResponse): Promise<void> {
  await page.goto(RESPONSE_DOCUMENT_UI_PATH);
  for (const text of RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_REQUIRED_TEXT) {
    await expect(page.getByText(text, { exact: true }).first()).toBeVisible({ timeout: 15000 });
  }
  await page.getByLabel("Response channel").selectOption(verified.responseChannel);
  await page.getByLabel("Document type").selectOption(verified.responseDocumentType);
  if (verified.comparisonRunId) await page.getByLabel("Comparison run ID").fill(String(verified.comparisonRunId));
  if (verified.findingOutcomeId) await page.getByLabel("Finding outcome ID").fill(String(verified.findingOutcomeId));

  const card = page.getByRole("article").filter({ hasText: `Response #${verified.responseId}` });
  await expect(card).toHaveCount(1, { timeout: 15000 });
  await card.getByRole("button", { name: /View Details/i }).click();
  await expect(page.getByText(`Response #${verified.responseId}`, { exact: true }).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(formatEnumForUi(verified.responseChannel), { exact: true }).first()).toBeVisible();
  await expect(page.getByText(formatEnumForUi(verified.responseDocumentType), { exact: true }).first()).toBeVisible();
}

async function submitAdminReviewUiAction(page: Page): Promise<void> {
  await page.getByLabel("Review action").selectOption(RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_ALLOWED_ACTION);
  await page.getByLabel("Review notes").fill(RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_NOTE);
  await page.getByLabel(/response remains evidence\/metadata only/i).check();
  await page.getByLabel(/does not change canonical report facts/i).check();
  await page.getByLabel(/does not classify corrected, removed, or unchanged outcomes/i).check();
  await page.getByRole("button", { name: /Save Metadata Review/i }).click();
  await expect(page.getByText("Response review metadata saved.", { exact: true })).toBeVisible({ timeout: 15000 });
}

async function verifyPostReviewResponse(page: Page, verified: VerifiedResponse): Promise<any> {
  const result = await jsonRequest(page, "GET", `${RESPONSE_DOCUMENT_ADMIN_REVIEW_ENDPOINTS.get}?responseId=${verified.responseId}`, undefined, verified.privacyContext);
  if (!result.ok) throw new Error(`Response document get after UI review returned HTTP ${result.status}.`);
  const record = result.body?.response;
  if (Number(record?.id) !== verified.responseId) throw new Error("Response get after UI review returned the wrong response.");
  if (record.reviewNotes !== RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_NOTE) throw new Error("UI review note was not persisted as expected.");
  if (!record.reviewedAt || !record.reviewedBy) throw new Error("UI review metadata was not updated.");
  if (record.responseChannel !== "email") throw new Error("Response channel changed during UI review.");
  if (record.responseDocumentType !== "bureau_email_response") throw new Error("Response document type changed during UI review.");
  return record;
}

export async function runSmoke(config: Extract<ResponseDocumentAdminReviewUiSmokeConfig, { status: "ready" }>) {
  assertAdminReviewCleanupPolicy();
  assertNoDestructiveCleanupPlanned();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: config.baseUrl,
    ignoreHTTPSErrors: true,
    storageState: config.authMode === "storage_state" ? config.adminStorageStatePath : undefined,
  });
  const page = await context.newPage();
  const observedRequests: string[] = [];
  const pageErrors: string[] = [];
  let verified: VerifiedResponse | null = null;

  page.on("request", (request) => {
    const url = new URL(request.url());
    observedRequests.push(`${request.method().toUpperCase()} ${url.pathname}`);
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    const session = await authenticateAdmin(context, page, config);
    verified = await verifyResponseSource(page, config.source, config.runId);
    await openResponseDetail(page, verified);
    const beforeText = await page.locator("body").innerText();
    assertNoForbiddenVisibleText(beforeText);
    assertResponseAdminReviewPrivacySafe({ displayText: beforeText }, verified.privacyContext);

    await submitAdminReviewUiAction(page);
    const updated = await verifyPostReviewResponse(page, verified);

    const health = await page.request.get("/");
    if (!health.ok()) throw new Error(`Smoke target health returned HTTP ${health.status()}.`);
    assertNoForbiddenEndpointCalls(observedRequests);
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
      reviewAction: RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_ALLOWED_ACTION,
      responseChannel: updated.responseChannel,
      responseDocumentType: updated.responseDocumentType,
      responseStatus: updated.responseStatus,
      reviewMetadataChanged: true,
      responseDocumentsRemainEvidenceMetadataOnly: true,
      laterReportComparisonStillRequired: true,
      noCorrectedRemovedUnchangedClassification: true,
      cleanupStatus: RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_CLEANUP_POLICY,
      runtimeSafety: {
        responseCaptureEndpointCalls: 0,
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
      `${error instanceof Error ? error.message : String(error)} Response ID: ${verified?.responseId ?? "none"}. Cleanup: ${RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_CLEANUP_POLICY}`,
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
