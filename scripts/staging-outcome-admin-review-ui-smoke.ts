import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { chromium, expect, type APIResponse, type BrowserContext, type Page } from "@playwright/test";

import {
  assertAdminReviewFixturePreflightVerified,
  assertAdminReviewPrivacySafe,
  assertDeterministicOutcomePreserved,
  buildOutcomeRunSource,
  OUTCOME_ADMIN_REVIEW_CLEANUP_POLICY,
  OUTCOME_ADMIN_REVIEW_ENDPOINTS,
  redactSecretText as redactAdminReviewSecretText,
  SUPPORTING_READ_ONLY_ENDPOINTS,
  UNSUPPORTED_ADMIN_REVIEW_ACTIONS,
  type ExistingOutcomeRunSource,
  type FixtureOutcomeRunSource,
  type OutcomeRunSource,
} from "./staging-outcome-admin-review-smoke";
import { validateSmokeHost } from "./staging-outcome-tracking-smoke";

export const SMOKE_GATE_ENV = "CRP_OUTCOME_ADMIN_REVIEW_UI_SMOKE";
export const SKIPPED_EXIT_CODE = 2;
export const OUTCOME_ADMIN_REVIEW_UI_PATH = "/admin-outcome-reviews";

export const OUTCOME_ADMIN_REVIEW_UI_REQUIRED_TEXT = [
  "Outcome Reviews",
  "Admin review changes review metadata only.",
  "Deterministic outcome fields are preserved.",
  "does not change canonical report facts",
  "packet readiness, packet wording",
  "regulation runtime truth",
  "Response documents remain evidence only",
] as const;

export const OUTCOME_ADMIN_REVIEW_UI_PRESERVATION_TEXT = [
  "Admin review does not rewrite outcomeType, matchingMethod, confidenceLevel, reason codes, snapshots, or source records.",
] as const;

export const OUTCOME_ADMIN_REVIEW_UI_VALIDATION_CHECKS = [
  "Mark Needs Review requires notes",
  "Confirm for Admin Review requires notes and confirmations",
  "Reject Match requires notes",
  "Reject Classification requires notes",
] as const;

export const UNSUPPORTED_OUTCOME_ADMIN_REVIEW_UI_CONTROLS = [
  ...UNSUPPORTED_ADMIN_REVIEW_ACTIONS,
  "override to corrected",
  "override to removed",
  "force outcome",
  "make final truth",
  "confirmed legal violation",
] as const;

export const FORBIDDEN_OUTCOME_ADMIN_REVIEW_UI_ENDPOINTS = [
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
] as const;

export const OUTCOME_ADMIN_REVIEW_UI_CLEANUP_POLICY =
  "Outcome admin-review UI smoke is append-only: it leaves review metadata, outcome rows, and audit rows in place by design.";

type AuthMode = "credentials" | "session_cookie";
type EnvPrefix = "STAGING" | "LOCAL_SMOKE";

export type OutcomeAdminReviewUiSmokeConfig =
  | {
      status: "ready";
      baseUrl: string;
      host: string;
      prefix: EnvPrefix;
      authMode: AuthMode;
      adminSessionCookie?: string;
      adminEmail?: string;
      adminPassword?: string;
      source: OutcomeRunSource;
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
  status: number;
  body: any;
  text: string;
};

type VerifiedOutcomeRun = {
  run: any;
  preflight: {
    syntheticMarker: string;
    previousReportArtifactId: number;
    previousReportHash: string;
    laterReportArtifactId?: number | null;
    laterReportHash?: string | null;
  };
  createdComparisonRunId?: number;
};

type DeterministicFindingSnapshot = {
  outcomeType: unknown;
  confidenceLevel: unknown;
  matchingMethod: unknown;
  outcomeReasonCodes: unknown;
  previousSnapshot: unknown;
  laterSnapshot: unknown;
};

function normalizeBoolean(value: string | undefined): boolean {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function normalizeEnv(value: string | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function smokeRunIdentifier(runId: string): string {
  const safe = runId
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || "outcome-admin-review-ui-smoke";
}

function toAbsoluteUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
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

function formatEnumForUi(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value).replace(/_/g, " ");
}

function comparisonRunFromBody(body: any): any {
  const run = body?.comparisonRun;
  const id = Number(run?.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Outcome response did not include a valid comparison run ID.");
  }
  return run;
}

function findingFromRun(run: any, findingOutcomeId?: number): any {
  const findings = Array.isArray(run?.findingOutcomes) ? run.findingOutcomes : [];
  if (findingOutcomeId) {
    const found = findings.find((finding: any) => Number(finding.id) === findingOutcomeId);
    if (!found) throw new Error(`Configured finding outcome ${findingOutcomeId} was not found in comparison run ${run?.id}.`);
    return found;
  }
  const first = findings[0];
  if (!first) throw new Error(`Comparison run ${run?.id} has no finding outcomes to review.`);
  return first;
}

function deterministicFindingSnapshot(finding: any): DeterministicFindingSnapshot {
  return {
    outcomeType: finding?.outcomeType ?? null,
    confidenceLevel: finding?.confidenceLevel ?? null,
    matchingMethod: finding?.matchingMethod ?? null,
    outcomeReasonCodes: finding?.outcomeReasonCodes ?? null,
    previousSnapshot: finding?.previousSnapshot ?? null,
    laterSnapshot: finding?.laterSnapshot ?? null,
  };
}

function collectOutcomeTypes(body: any): string[] {
  const outcomes = Array.isArray(body?.comparisonRun?.findingOutcomes) ? body.comparisonRun.findingOutcomes : [];
  return Array.from(new Set(outcomes.map((item: any) => String(item.outcomeType ?? "")).filter(Boolean)));
}

function hasRun(body: any, runId: number): boolean {
  const runs = Array.isArray(body?.runs) ? body.runs : [];
  return runs.some((run: any) => Number(run.id) === runId);
}

export function buildSmokeConfig(env: NodeJS.ProcessEnv): OutcomeAdminReviewUiSmokeConfig {
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

  const source = buildOutcomeRunSource(env, prefix);
  if (!source) {
    return {
      status: "skipped",
      reason:
        prefix === "STAGING"
          ? "SKIPPED: no verified outcome run or fixture IDs configured. Provide STAGING_OUTCOME_COMPARISON_RUN_ID plus STAGING_OUTCOME_SYNTHETIC_MARKER, or STAGING_OUTCOME_PREVIOUS_REPORT_ARTIFACT_ID, STAGING_OUTCOME_LATER_REPORT_ARTIFACT_ID, and STAGING_OUTCOME_SYNTHETIC_MARKER."
          : "SKIPPED: no verified outcome run or fixture IDs configured. Provide LOCAL_SMOKE_OUTCOME_COMPARISON_RUN_ID plus LOCAL_SMOKE_OUTCOME_SYNTHETIC_MARKER, or LOCAL_SMOKE_OUTCOME_PREVIOUS_REPORT_ARTIFACT_ID, LOCAL_SMOKE_OUTCOME_LATER_REPORT_ARTIFACT_ID, and LOCAL_SMOKE_OUTCOME_SYNTHETIC_MARKER.",
    };
  }

  const runId = normalizeEnv(env.CRP_OUTCOME_ADMIN_REVIEW_UI_SMOKE_RUN_ID) ?? `outcome-admin-review-ui-smoke-${Date.now()}`;
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
  return redactAdminReviewSecretText(value, env);
}

export function assertOutcomeAdminReviewUiPrivacySafe(payload: unknown): void {
  assertAdminReviewPrivacySafe(payload);
}

export function assertNoForbiddenEndpointCalls(observedRequests: string[]): void {
  const forbidden = observedRequests.filter((request) =>
    FORBIDDEN_OUTCOME_ADMIN_REVIEW_UI_ENDPOINTS.some((endpoint) => request === `${endpoint.method} ${endpoint.path}`),
  );
  if (forbidden.length > 0) {
    throw new Error(`Forbidden outcome admin-review UI smoke endpoint calls observed: ${forbidden.join(", ")}.`);
  }
}

export function assertNoDestructiveCleanupPlanned(policy = OUTCOME_ADMIN_REVIEW_UI_CLEANUP_POLICY): void {
  if (!/append-only/i.test(policy) || /delete|truncate|drop/i.test(policy)) {
    throw new Error("Outcome admin-review UI smoke cleanup policy must be append-only and non-destructive.");
  }
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
  config: Extract<OutcomeAdminReviewUiSmokeConfig, { status: "ready" }>,
): Promise<{ role: string | null }> {
  if (config.authMode === "session_cookie") {
    await applySessionCookie(context, config.baseUrl, config.adminSessionCookie!);
    await page.goto("/");
  } else {
    await loginWithCredentials(page, config.adminEmail!, config.adminPassword!);
  }

  const session = await jsonRequest(page, "GET", SUPPORTING_READ_ONLY_ENDPOINTS.session);
  if (!session.response.ok()) {
    throw new Error(`Admin session check returned HTTP ${session.status}.`);
  }
  assertOutcomeAdminReviewUiPrivacySafe(session.body);
  const role = session.body?.user?.role ?? null;
  if (role !== "admin") {
    throw new Error(`Configured authenticated context resolved to role ${String(role)}; refusing admin UI smoke.`);
  }
  return { role };
}

async function jsonRequest(page: Page, method: "GET" | "POST", path: string, data?: unknown): Promise<JsonResponse> {
  const response = method === "GET" ? await page.request.get(path) : await page.request.post(path, { data });
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  assertOutcomeAdminReviewUiPrivacySafe(body);
  return { response, status: response.status(), body, text };
}

async function validateSyntheticReportMarker(
  page: Page,
  artifactId: number,
  marker: string,
  label: string,
): Promise<string> {
  const result = await jsonRequest(page, "GET", `${SUPPORTING_READ_ONLY_ENDPOINTS.uploadResults}?artifactId=${artifactId}`);
  if (!result.response.ok()) {
    throw new Error(`${label} synthetic report verification returned HTTP ${result.status}.`);
  }
  if (!JSON.stringify(result.body).includes(marker)) {
    throw new Error(
      `Outcome admin-review UI fixture marker is not visible through a safe verification surface; ${label} did not include required synthetic marker ${marker}.`,
    );
  }
  return hashJson(result.body);
}

async function getRun(page: Page, comparisonRunId: number): Promise<any> {
  const result = await jsonRequest(page, "GET", `${OUTCOME_ADMIN_REVIEW_ENDPOINTS.get}?comparisonRunId=${comparisonRunId}`);
  if (!result.response.ok()) {
    throw new Error(`Outcome get returned HTTP ${result.status}.`);
  }
  return comparisonRunFromBody(result.body);
}

async function verifyExistingRunPreflight(page: Page, source: ExistingOutcomeRunSource): Promise<VerifiedOutcomeRun> {
  const run = await getRun(page, source.comparisonRunId);
  const previousReportArtifactId = Number(run.previousReportArtifactId);
  const laterReportArtifactId = run.laterReportArtifactId == null ? null : Number(run.laterReportArtifactId);
  if (!Number.isInteger(previousReportArtifactId) || previousReportArtifactId <= 0) {
    throw new Error("Existing outcome run did not include a valid previous report artifact ID.");
  }

  const previousReportHash = await validateSyntheticReportMarker(
    page,
    previousReportArtifactId,
    source.syntheticMarker,
    "previous report fixture",
  );
  const laterReportHash = laterReportArtifactId
    ? await validateSyntheticReportMarker(page, laterReportArtifactId, source.syntheticMarker, "later report fixture")
    : null;
  const preflight = {
    syntheticMarker: source.syntheticMarker,
    previousReportArtifactId,
    previousReportHash,
    laterReportArtifactId,
    laterReportHash,
  };
  assertAdminReviewFixturePreflightVerified(preflight);
  return { run, preflight };
}

async function createOutcomeRunFromFixture(page: Page, source: FixtureOutcomeRunSource): Promise<VerifiedOutcomeRun> {
  const previousReportHash = await validateSyntheticReportMarker(
    page,
    source.previousReportArtifactId,
    source.syntheticMarker,
    "previous report fixture",
  );
  const laterReportHash = await validateSyntheticReportMarker(
    page,
    source.laterReportArtifactId,
    source.syntheticMarker,
    "later report fixture",
  );
  const preflight = {
    syntheticMarker: source.syntheticMarker,
    previousReportArtifactId: source.previousReportArtifactId,
    previousReportHash,
    laterReportArtifactId: source.laterReportArtifactId,
    laterReportHash,
  };
  assertAdminReviewFixturePreflightVerified(preflight);

  const compareBody = source.runResponseOnly
    ? {
        previousReportArtifactId: source.previousReportArtifactId,
        comparisonScope: "response_only",
        response: {
          responseReceivedAt: "2026-05-17T00:00:00.000Z",
          responseType: "bureau_response",
          source: "manual_record",
        },
      }
    : {
        previousReportArtifactId: source.previousReportArtifactId,
        laterReportArtifactId: source.laterReportArtifactId,
        comparisonScope: "report_to_report",
      };
  const compared = await jsonRequest(page, "POST", OUTCOME_ADMIN_REVIEW_ENDPOINTS.compare, compareBody);
  if (!compared.response.ok()) {
    throw new Error(`Outcome compare returned HTTP ${compared.status}.`);
  }
  const outcomeTypes = collectOutcomeTypes(compared.body);
  if (outcomeTypes.length === 0 || !outcomeTypes.some((type) => source.expectedOutcomeTypes.includes(type))) {
    throw new Error(`Outcome compare returned unexpected outcome types: ${outcomeTypes.join(", ") || "none"}.`);
  }
  const run = comparisonRunFromBody(compared.body);
  return { run, preflight, createdComparisonRunId: Number(run.id) };
}

async function verifyOutcomeRunSource(page: Page, source: OutcomeRunSource): Promise<VerifiedOutcomeRun> {
  return source.mode === "existing_run"
    ? verifyExistingRunPreflight(page, source)
    : createOutcomeRunFromFixture(page, source);
}

async function assertUiSafetyText(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Outcome Reviews" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Admin review changes review metadata only.")).toBeVisible();
  await expect(page.getByText(/Deterministic outcome fields are preserved/i).first()).toBeVisible();
  await expect(page.getByText(/does not change canonical report facts/i).first()).toBeVisible();
  await expect(page.getByText(/packet readiness, packet wording/i).first()).toBeVisible();
  await expect(page.getByText(/regulation runtime truth/i).first()).toBeVisible();
  await expect(page.getByText(/Response documents remain evidence only/i).first()).toBeVisible();
}

async function applyRunFilters(page: Page, run: any): Promise<void> {
  const previousReportArtifactId = run.previousReportArtifactId ? String(run.previousReportArtifactId) : "";
  const laterReportArtifactId = run.laterReportArtifactId ? String(run.laterReportArtifactId) : "";
  const packetId = run.packetId ? String(run.packetId) : "";

  if (previousReportArtifactId) {
    await page.getByLabel("Previous report ID").fill(previousReportArtifactId);
  }
  if (laterReportArtifactId) {
    await page.getByLabel("Later report ID").fill(laterReportArtifactId);
  }
  if (packetId) {
    await page.getByLabel("Packet ID").fill(packetId);
  }
}

async function assertUnsupportedControlsAbsent(page: Page): Promise<void> {
  for (const control of UNSUPPORTED_OUTCOME_ADMIN_REVIEW_UI_CONTROLS) {
    const escaped = control.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\ /g, "\\s+");
    const pattern = new RegExp(control === "activate" ? `^${escaped}$` : escaped, "i");
    if (await page.getByRole("button", { name: pattern }).count()) {
      throw new Error(`Forbidden outcome admin-review UI control found: ${control}.`);
    }
  }
}

async function assertReviewValidation(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Mark Needs Review" }).click();
  await expect(page.getByText("This review action requires review notes.")).toBeVisible();

  await page.getByLabel("Review notes").fill("Confirmed for admin review. Deterministic result preserved.");
  await page.getByRole("button", { name: "Confirm for Admin Review" }).click();
  await expect(page.getByText("Confirm that this action does not change canonical facts.")).toBeVisible();

  await page.getByLabel("Review notes").fill("");
  await page.getByRole("button", { name: "Reject Match for Review Purposes" }).click();
  await expect(page.getByText("This review action requires review notes.")).toBeVisible();

  await page.getByRole("button", { name: "Reject Classification for Review Purposes" }).click();
  await expect(page.getByText("This review action requires review notes.")).toBeVisible();
}

async function assertOutcomeDetailVisible(page: Page, run: any, finding: any): Promise<void> {
  await expect(page.getByText(`Finding outcome #${finding.id}`)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(`Comparison run #${run.id}`).first()).toBeVisible();
  await expect(page.getByText("Reason codes")).toBeVisible();
  await expect(page.getByText("Review notes")).toBeVisible();
  await expect(page.getByText(OUTCOME_ADMIN_REVIEW_UI_PRESERVATION_TEXT[0]).first()).toBeVisible();

  for (const value of [finding.outcomeType, finding.matchingMethod, finding.confidenceLevel]) {
    const formatted = formatEnumForUi(value);
    if (formatted) {
      await expect(page.getByText(formatted, { exact: true }).first()).toBeVisible();
    }
  }

  const reasonCodes = Array.isArray(finding.outcomeReasonCodes) ? finding.outcomeReasonCodes : [];
  for (const reasonCode of reasonCodes) {
    const formatted = formatEnumForUi(reasonCode);
    if (formatted) {
      await expect(page.getByText(formatted, { exact: true }).first()).toBeVisible();
    }
  }
}

async function openSyntheticRunDetail(page: Page, run: any, finding: any): Promise<void> {
  await page.goto(OUTCOME_ADMIN_REVIEW_UI_PATH);
  await assertUiSafetyText(page);
  await assertUnsupportedControlsAbsent(page);
  await applyRunFilters(page, run);

  const runCard = page.getByRole("article")
    .filter({ hasText: `Comparison run #${run.id}` })
    .filter({ hasText: formatEnumForUi(run.comparisonScope) ?? "" });
  await expect(runCard).toHaveCount(1, { timeout: 15000 });
  await expect(runCard).toBeVisible();
  await runCard.getByRole("button", { name: /View Details/i }).click();
  await assertOutcomeDetailVisible(page, run, finding);
}

async function applyMetadataOnlyReview(page: Page): Promise<number> {
  const reviewResponse = page.waitForResponse(
    (response) =>
      response.url().includes(OUTCOME_ADMIN_REVIEW_ENDPOINTS.adminReview) &&
      response.request().method().toUpperCase() === "POST",
    { timeout: 15000 },
  );
  await page.getByRole("button", { name: "Review Outcome" }).click();
  const response = await reviewResponse;
  if (!response.ok()) {
    throw new Error(`UI review_outcome returned HTTP ${response.status()}.`);
  }
  const body = await response.json();
  assertOutcomeAdminReviewUiPrivacySafe(body);
  return response.status();
}

export async function runSmoke(config: Extract<OutcomeAdminReviewUiSmokeConfig, { status: "ready" }>) {
  assertNoDestructiveCleanupPlanned();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: config.baseUrl, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const observedRequests: string[] = [];
  const apiServerErrors: string[] = [];
  const pageErrors: string[] = [];
  const createdOutcomeRunIds: number[] = [];
  let comparisonRunId: number | null = null;
  let findingOutcomeId: number | null = null;

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
    const sourceResult = await verifyOutcomeRunSource(page, config.source);
    const run = sourceResult.run;
    if (sourceResult.createdComparisonRunId) {
      createdOutcomeRunIds.push(sourceResult.createdComparisonRunId);
    }
    comparisonRunId = Number(run.id);
    const finding = findingFromRun(
      run,
      config.source.mode === "existing_run" ? config.source.findingOutcomeId : undefined,
    );
    findingOutcomeId = Number(finding.id);
    if (!Number.isInteger(findingOutcomeId) || findingOutcomeId <= 0) {
      throw new Error("Selected finding outcome did not include a valid ID.");
    }

    const baselineDeterministic = deterministicFindingSnapshot(finding);
    const baselineDeterministicHash = hashJson(baselineDeterministic);

    const listed = await jsonRequest(
      page,
      "GET",
      `${OUTCOME_ADMIN_REVIEW_ENDPOINTS.get.replace("/get", "/list")}?previousReportArtifactId=${run.previousReportArtifactId}&limit=25`,
    );
    if (!listed.response.ok()) {
      throw new Error(`Outcome list returned HTTP ${listed.status}.`);
    }
    if (!hasRun(listed.body, comparisonRunId)) {
      throw new Error("Outcome list did not include the verified synthetic comparison run.");
    }

    await openSyntheticRunDetail(page, run, finding);
    const bodyTextBefore = await page.locator("body").innerText();
    assertOutcomeAdminReviewUiPrivacySafe({ displayText: bodyTextBefore });

    await assertReviewValidation(page);
    const reviewStatus = await applyMetadataOnlyReview(page);

    const updatedRun = await getRun(page, comparisonRunId);
    const updatedFinding = findingFromRun(updatedRun, findingOutcomeId);
    assertDeterministicOutcomePreserved(baselineDeterministic, deterministicFindingSnapshot(updatedFinding));
    if (updatedFinding.adminReviewStatus !== "reviewed") {
      throw new Error(`Outcome review metadata status is ${String(updatedFinding.adminReviewStatus)}, expected reviewed.`);
    }

    await openSyntheticRunDetail(page, updatedRun, updatedFinding);
    const bodyTextAfter = await page.locator("body").innerText();
    assertOutcomeAdminReviewUiPrivacySafe({ displayText: bodyTextAfter });
    await assertUnsupportedControlsAbsent(page);

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
      syntheticMarker: config.source.syntheticMarker,
      comparisonRunId,
      findingOutcomeId,
      createdOutcomeRunIds,
      ui: {
        adminRouteRendered: true,
        safetyBannerRendered: true,
        preservationNoticesRendered: true,
        outcomeListLoaded: true,
        syntheticRunVisible: true,
        detailPanelOpened: true,
        reviewActionValidationChecked: true,
        metadataOnlyReviewActionStatus: reviewStatus,
        unsupportedOverrideControlsAbsent: true,
        consumerFacingOutcomeUiUsed: false,
      },
      deterministicPreservation: {
        outcomeTypeUnchanged: true,
        matchingMethodUnchanged: true,
        confidenceLevelUnchanged: true,
        snapshotsUnchanged: true,
        baselineDeterministicHash,
      },
      cleanupStatus: OUTCOME_ADMIN_REVIEW_UI_CLEANUP_POLICY,
      inheritedBackendCleanupStatus: OUTCOME_ADMIN_REVIEW_CLEANUP_POLICY,
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
        packetMutationEndpointCalls: 0,
        canonicalReportTradelineMutationEndpointCalls: 0,
        reviewMetadataOnly: true,
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
        noForbiddenLegalConclusionPhrases: true,
      },
    };
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} Comparison run ID: ${comparisonRunId ?? "none"}. Finding outcome ID: ${findingOutcomeId ?? "none"}. Created outcome run IDs: ${createdOutcomeRunIds.join(", ") || "none"}. Cleanup: ${OUTCOME_ADMIN_REVIEW_UI_CLEANUP_POLICY}`,
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
