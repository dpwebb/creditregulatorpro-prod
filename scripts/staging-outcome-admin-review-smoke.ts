import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  assertPrivacySafe as assertOutcomePrivacySafe,
  redactSecretText as redactOutcomeSecretText,
  validateSmokeHost,
} from "./staging-outcome-tracking-smoke";

export const SMOKE_GATE_ENV = "CRP_OUTCOME_ADMIN_REVIEW_SMOKE";
export const SKIPPED_EXIT_CODE = 2;

export const OUTCOME_ADMIN_REVIEW_ENDPOINTS = {
  compare: "/_api/outcomes/compare",
  get: "/_api/outcomes/get",
  adminReview: "/_api/outcomes/admin-review",
} as const;

export const SUPPORTING_READ_ONLY_ENDPOINTS = {
  session: "/_api/auth/session",
  login: "/_api/auth/login_with_password",
  uploadResults: "/_api/upload-results/get",
} as const;

export const UNSUPPORTED_ADMIN_REVIEW_ACTIONS = [
  "override_to_corrected",
  "override_to_removed",
  "force_outcome",
  "make_final_truth",
  "legal_violation",
  "activate",
] as const;

export const FORBIDDEN_ADMIN_REVIEW_SMOKE_ENDPOINTS = [
  { method: "POST", path: "/_api/parser/run" },
  { method: "POST", path: "/_api/parser-lab/run" },
  { method: "POST", path: "/_api/ocr/run" },
  { method: "POST", path: "/_api/ingest/process" },
  { method: "POST", path: "/_api/report-artifact/create" },
  { method: "POST", path: "/_api/report-artifact/update" },
  { method: "POST", path: "/_api/tradelines/update" },
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

export const OUTCOME_ADMIN_REVIEW_CLEANUP_POLICY =
  "Outcome admin-review smoke is append-only: it leaves review metadata, outcome rows, and audit rows in place by design.";

type AuthMode = "credentials" | "session_cookie";
type EnvPrefix = "STAGING" | "LOCAL_SMOKE";

export type ExistingOutcomeRunSource = {
  mode: "existing_run";
  comparisonRunId: number;
  findingOutcomeId?: number;
  syntheticMarker: string;
};

export type FixtureOutcomeRunSource = {
  mode: "create_from_fixture";
  previousReportArtifactId: number;
  laterReportArtifactId: number;
  syntheticMarker: string;
  runResponseOnly: boolean;
  expectedOutcomeTypes: string[];
};

export type OutcomeRunSource = ExistingOutcomeRunSource | FixtureOutcomeRunSource;

export type AdminReviewSmokeConfig =
  | {
      status: "ready";
      baseUrl: string;
      host: string;
      prefix: EnvPrefix;
      authMode: AuthMode;
      sessionCookie?: string;
      email?: string;
      password?: string;
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

export type AdminReviewFixturePreflight = {
  syntheticMarker: string;
  previousReportArtifactId: number;
  previousReportHash: string;
  laterReportArtifactId?: number | null;
  laterReportHash?: string | null;
};

type JsonResponse = {
  response: Response;
  status: number;
  body: any;
  text: string;
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

function numberEnv(value: string | undefined): number | null {
  const raw = normalizeEnv(value);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function prefixedEnv(env: NodeJS.ProcessEnv, prefix: EnvPrefix, key: string): string | undefined {
  return env[`${prefix}_OUTCOME_${key}`];
}

function markerIsSynthetic(value: string | null): value is string {
  return Boolean(value && /outcome[_-]?smoke/i.test(value));
}

function expectedOutcomeTypes(value: string | undefined): string[] {
  const raw = normalizeEnv(value);
  if (!raw) return ["unchanged", "corrected"];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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

function smokeRunIdentifier(runId: string): string {
  const safe = runId
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || "outcome-admin-review-smoke";
}

export function buildOutcomeRunSource(env: NodeJS.ProcessEnv, prefix: EnvPrefix): OutcomeRunSource | null {
  const syntheticMarker = normalizeEnv(prefixedEnv(env, prefix, "SYNTHETIC_MARKER"));
  if (!markerIsSynthetic(syntheticMarker)) return null;

  const comparisonRunId = numberEnv(prefixedEnv(env, prefix, "COMPARISON_RUN_ID"));
  const findingOutcomeId = numberEnv(prefixedEnv(env, prefix, "FINDING_OUTCOME_ID"));
  if (comparisonRunId) {
    return {
      mode: "existing_run",
      comparisonRunId,
      findingOutcomeId: findingOutcomeId ?? undefined,
      syntheticMarker,
    };
  }

  const previousReportArtifactId = numberEnv(prefixedEnv(env, prefix, "PREVIOUS_REPORT_ARTIFACT_ID"));
  const laterReportArtifactId = numberEnv(prefixedEnv(env, prefix, "LATER_REPORT_ARTIFACT_ID"));
  if (!previousReportArtifactId || !laterReportArtifactId) return null;

  return {
    mode: "create_from_fixture",
    previousReportArtifactId,
    laterReportArtifactId,
    syntheticMarker,
    runResponseOnly: normalizeBoolean(prefixedEnv(env, prefix, "RUN_RESPONSE_ONLY")),
    expectedOutcomeTypes: expectedOutcomeTypes(prefixedEnv(env, prefix, "EXPECTED_OUTCOME_TYPES")),
  };
}

export function buildSmokeConfig(env: NodeJS.ProcessEnv): AdminReviewSmokeConfig {
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

  const runId = normalizeEnv(env.CRP_OUTCOME_ADMIN_REVIEW_SMOKE_RUN_ID) ?? `outcome-admin-review-smoke-${Date.now()}`;
  if (adminSessionCookie) {
    return {
      status: "ready",
      baseUrl,
      host: hostCheck.host,
      prefix,
      authMode: "session_cookie",
      sessionCookie: adminSessionCookie,
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
    email: adminEmail!,
    password: adminPassword!,
    source,
    runId,
  };
}

export function redactSecretText(value: string, env: NodeJS.ProcessEnv): string {
  return redactOutcomeSecretText(value, env);
}

const ADMIN_REVIEW_DISPLAY_TEXT_KEYS = new Set([
  "adminFacingText",
  "availableActions",
  "description",
  "displayLabel",
  "displayText",
  "label",
  "message",
  "outcomeText",
  "reviewLabel",
  "reviewNotes",
  "adminReviewNotes",
  "reviewNotesSummary",
  "reviewSummary",
  "summaryText",
  "title",
  "userFacingText",
]);

const ADMIN_REVIEW_FORBIDDEN_DISPLAY_PATTERNS = [
  /you won/i,
  /this is illegal/i,
  /violat(?:e|es|ed|ing)\s+the\s+law/i,
  /admitted fault/i,
  /entitled to damages/i,
  /must pay/i,
  /confirmed legal violation/i,
  /override[_ ]to[_ ]corrected/i,
  /override[_ ]to[_ ]removed/i,
  /force[_ ]outcome/i,
  /make[_ ]final[_ ]truth/i,
  /legal[_ ]violation/i,
] as const;

const ADMIN_REVIEW_UNSAFE_ACTIVATION_DISPLAY_PATTERNS = [
  /activate\s+(?:db\s+)?(?:regulation\s+)?runtime\s+truth/i,
  /activate\s+(?:db\s+)?registry\s+(?:as\s+)?runtime\s+truth/i,
  /make\s+(?:db\s+)?(?:registry\s+)?active\s+truth/i,
  /apply\s+(?:db\s+)?(?:registry\s+)?to\s+runtime/i,
] as const;

const ADMIN_REVIEW_SAFE_NEGATED_ACTIVATION_PATTERNS = [
  /does\s+not\s+activate/i,
  /do\s+not\s+activate/i,
  /will\s+not\s+activate/i,
  /without\s+activating/i,
  /no\s+runtime\s+activation/i,
  /not\s+runtime\s+truth/i,
  /confirmNoRuntimeActivation/,
] as const;

function collectDisplayTextValues(value: unknown, includeText = false): string[] {
  if (typeof value === "string") return includeText ? [value] : [];
  if (Array.isArray(value)) return value.flatMap((item) => collectDisplayTextValues(item, includeText));
  if (!value || typeof value !== "object") return [];

  const result: string[] = [];
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    const nestedIsDisplayText = includeText || ADMIN_REVIEW_DISPLAY_TEXT_KEYS.has(key);
    result.push(...collectDisplayTextValues(nestedValue, nestedIsDisplayText));
  }
  return result;
}

function assertAdminReviewDisplayTextSafe(payload: unknown): void {
  for (const text of collectDisplayTextValues(payload)) {
    const forbiddenPattern = ADMIN_REVIEW_FORBIDDEN_DISPLAY_PATTERNS.find((pattern) => pattern.test(text));
    if (forbiddenPattern) {
      throw new Error(`Outcome admin-review smoke response failed privacy/legal-language check: ${forbiddenPattern}.`);
    }

    const unsafeActivationPattern = ADMIN_REVIEW_UNSAFE_ACTIVATION_DISPLAY_PATTERNS.find((pattern) => pattern.test(text));
    const safeNegatedActivation = ADMIN_REVIEW_SAFE_NEGATED_ACTIVATION_PATTERNS.some((pattern) => pattern.test(text));
    if (unsafeActivationPattern && !safeNegatedActivation) {
      throw new Error(`Outcome admin-review smoke response failed privacy/legal-language check: ${unsafeActivationPattern}.`);
    }
  }
}

export function assertAdminReviewPrivacySafe(payload: unknown): void {
  assertOutcomePrivacySafe(payload);
  assertAdminReviewDisplayTextSafe(payload);
}

export function assertAdminReviewFixturePreflightVerified(
  verification: Partial<AdminReviewFixturePreflight> | null | undefined,
): asserts verification is AdminReviewFixturePreflight {
  const hashPattern = /^[a-f0-9]{64}$/i;
  if (
    !verification ||
    !markerIsSynthetic(verification.syntheticMarker ?? null) ||
    !Number.isInteger(verification.previousReportArtifactId) ||
    !hashPattern.test(String(verification.previousReportHash ?? "")) ||
    (verification.laterReportArtifactId !== null &&
      verification.laterReportArtifactId !== undefined &&
      !Number.isInteger(verification.laterReportArtifactId)) ||
    (verification.laterReportArtifactId !== null &&
      verification.laterReportArtifactId !== undefined &&
      !hashPattern.test(String(verification.laterReportHash ?? "")))
  ) {
    throw new Error(
      "Outcome admin-review fixture marker is not visible through a safe verification surface; configure a synthetic outcome run or rerun fixture setup.",
    );
  }
}

export function assertNoForbiddenEndpointCalls(observedRequests: string[]): void {
  const forbidden = observedRequests.filter((request) =>
    FORBIDDEN_ADMIN_REVIEW_SMOKE_ENDPOINTS.some((endpoint) => request === `${endpoint.method} ${endpoint.path}`),
  );
  if (forbidden.length > 0) {
    throw new Error(`Forbidden outcome admin-review smoke endpoint calls observed: ${forbidden.join(", ")}.`);
  }
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

export function assertDeterministicOutcomePreserved(before: unknown, after: unknown): void {
  const beforeHash = hashJson(before);
  const afterHash = hashJson(after);
  if (beforeHash !== afterHash) {
    throw new Error("Outcome admin-review smoke detected deterministic outcome field or snapshot mutation.");
  }
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
    throw new Error(`Configured admin credentials did not authenticate: HTTP ${response.status}.`);
  }

  const sessionCookie = cookieHeaderFromSetCookie(response.headers.get("set-cookie") ?? "");
  if (!sessionCookie) {
    throw new Error("Configured admin credentials authenticated without returning a session cookie.");
  }
  return sessionCookie;
}

async function cookieForConfig(config: Extract<AdminReviewSmokeConfig, { status: "ready" }>): Promise<string> {
  if (config.authMode === "session_cookie") {
    const sessionCookie = cookieHeaderFromSetCookie(config.sessionCookie!);
    if (!sessionCookie) {
      throw new Error("Configured admin session cookie did not include floot_built_app_session.");
    }
    return sessionCookie;
  }

  return loginWithCredentials(config.baseUrl, config.email!, config.password!);
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

async function assertUnauthenticatedAdminReviewDenied(baseUrl: string): Promise<number> {
  const response = await fetch(toAbsoluteUrl(baseUrl, OUTCOME_ADMIN_REVIEW_ENDPOINTS.adminReview), {
    method: "POST",
    body: JSON.stringify({
      comparisonRunId: 1,
      reviewAction: "review_outcome",
    }),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: baseUrl,
    },
  });
  if (![401, 403].includes(response.status)) {
    throw new Error(`Expected unauthenticated admin-review denial, got HTTP ${response.status}.`);
  }
  return response.status;
}

async function assertAuthenticatedAdminSession(client: SmokeHttpClient): Promise<{ role: string | null }> {
  const session = await client.json("GET", SUPPORTING_READ_ONLY_ENDPOINTS.session);
  if (!session.response.ok) {
    throw new Error(`Authenticated admin session check returned HTTP ${session.status}.`);
  }
  assertAdminReviewPrivacySafe(session.body);
  const role = session.body?.user?.role ?? null;
  if (role !== "admin") {
    throw new Error(`Configured admin context resolved to role ${String(role)}; refusing admin-review smoke.`);
  }
  return { role };
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
  assertAdminReviewPrivacySafe(result.body);
  if (!JSON.stringify(result.body).includes(marker)) {
    throw new Error(
      `Outcome admin-review fixture marker is not visible through a safe verification surface; ${label} did not include required synthetic marker ${marker}.`,
    );
  }
  return hashJson(result.body);
}

function collectOutcomeTypes(body: any): string[] {
  const outcomes = Array.isArray(body?.comparisonRun?.findingOutcomes) ? body.comparisonRun.findingOutcomes : [];
  return Array.from(new Set(outcomes.map((item: any) => String(item.outcomeType ?? "")).filter(Boolean)));
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

async function getRun(client: SmokeHttpClient, comparisonRunId: number): Promise<any> {
  const result = await client.json("GET", `${OUTCOME_ADMIN_REVIEW_ENDPOINTS.get}?comparisonRunId=${comparisonRunId}`);
  if (!result.response.ok) {
    throw new Error(`Outcome get returned HTTP ${result.status}.`);
  }
  assertAdminReviewPrivacySafe(result.body);
  return comparisonRunFromBody(result.body);
}

async function verifyExistingRunPreflight(
  client: SmokeHttpClient,
  source: ExistingOutcomeRunSource,
): Promise<{ run: any; preflight: AdminReviewFixturePreflight }> {
  const run = await getRun(client, source.comparisonRunId);
  const previousReportArtifactId = Number(run.previousReportArtifactId);
  const laterReportArtifactId = run.laterReportArtifactId === null ? null : Number(run.laterReportArtifactId);
  if (!Number.isInteger(previousReportArtifactId) || previousReportArtifactId <= 0) {
    throw new Error("Existing outcome run did not include a valid previous report artifact ID.");
  }
  const previousReportHash = await validateSyntheticReportMarker(
    client,
    previousReportArtifactId,
    source.syntheticMarker,
    "previous report fixture",
  );
  const laterReportHash = laterReportArtifactId
    ? await validateSyntheticReportMarker(client, laterReportArtifactId, source.syntheticMarker, "later report fixture")
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

async function createOutcomeRunFromFixture(
  client: SmokeHttpClient,
  source: FixtureOutcomeRunSource,
): Promise<{ run: any; preflight: AdminReviewFixturePreflight; createdComparisonRunId: number }> {
  const previousReportHash = await validateSyntheticReportMarker(
    client,
    source.previousReportArtifactId,
    source.syntheticMarker,
    "previous report fixture",
  );
  const laterReportHash = await validateSyntheticReportMarker(
    client,
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
  const compared = await client.json("POST", OUTCOME_ADMIN_REVIEW_ENDPOINTS.compare, compareBody);
  if (!compared.response.ok) {
    throw new Error(`Outcome compare returned HTTP ${compared.status}.`);
  }
  assertAdminReviewPrivacySafe(compared.body);
  const outcomeTypes = collectOutcomeTypes(compared.body);
  if (outcomeTypes.length === 0 || !outcomeTypes.some((type) => source.expectedOutcomeTypes.includes(type))) {
    throw new Error(`Outcome compare returned unexpected outcome types: ${outcomeTypes.join(", ") || "none"}.`);
  }
  const run = comparisonRunFromBody(compared.body);
  return { run, preflight, createdComparisonRunId: Number(run.id) };
}

async function expectAdminReviewValidationFailure(
  client: SmokeHttpClient,
  body: Record<string, unknown>,
  label: string,
): Promise<number> {
  const result = await client.json("POST", OUTCOME_ADMIN_REVIEW_ENDPOINTS.adminReview, body);
  assertAdminReviewPrivacySafe(result.body);
  if (![400, 422].includes(result.status)) {
    throw new Error(`${label} expected safe validation failure, got HTTP ${result.status}.`);
  }
  return result.status;
}

async function applyAdminReviewAction(
  client: SmokeHttpClient,
  body: Record<string, unknown>,
  expectedFindingStatus: string,
  baselineDeterministic: DeterministicFindingSnapshot,
  findingOutcomeId: number,
): Promise<any> {
  const result = await client.json("POST", OUTCOME_ADMIN_REVIEW_ENDPOINTS.adminReview, body);
  if (!result.response.ok) {
    throw new Error(`Outcome admin-review ${String(body.reviewAction)} returned HTTP ${result.status}.`);
  }
  assertAdminReviewPrivacySafe(result.body);
  const run = comparisonRunFromBody(result.body);
  const reviewedFinding = findingFromRun(run, findingOutcomeId);
  if (reviewedFinding.adminReviewStatus !== expectedFindingStatus) {
    throw new Error(
      `Outcome admin-review ${String(body.reviewAction)} returned finding status ${String(reviewedFinding.adminReviewStatus)}, expected ${expectedFindingStatus}.`,
    );
  }
  assertDeterministicOutcomePreserved(baselineDeterministic, deterministicFindingSnapshot(reviewedFinding));

  const fetchedRun = await getRun(client, Number(run.id));
  const fetchedFinding = findingFromRun(fetchedRun, findingOutcomeId);
  assertDeterministicOutcomePreserved(baselineDeterministic, deterministicFindingSnapshot(fetchedFinding));
  if (fetchedFinding.adminReviewStatus !== expectedFindingStatus) {
    throw new Error(`Outcome get did not confirm review status ${expectedFindingStatus}.`);
  }
  return fetchedRun;
}

export async function runSmoke(config: Extract<AdminReviewSmokeConfig, { status: "ready" }>) {
  const cookie = await cookieForConfig(config);
  const client = new SmokeHttpClient(config.baseUrl, cookie);
  const createdOutcomeRunIds: number[] = [];

  try {
    const unauthenticatedStatus = await assertUnauthenticatedAdminReviewDenied(config.baseUrl);
    const session = await assertAuthenticatedAdminSession(client);
    const sourceResult = config.source.mode === "existing_run"
      ? await verifyExistingRunPreflight(client, config.source)
      : await createOutcomeRunFromFixture(client, config.source);
    const run = sourceResult.run;
    if (
      "createdComparisonRunId" in sourceResult &&
      typeof sourceResult.createdComparisonRunId === "number"
    ) {
      createdOutcomeRunIds.push(sourceResult.createdComparisonRunId);
    }

    const comparisonRunId = Number(run.id);
    const finding = findingFromRun(
      run,
      config.source.mode === "existing_run" ? config.source.findingOutcomeId : undefined,
    );
    const findingOutcomeId = Number(finding.id);
    if (!Number.isInteger(findingOutcomeId) || findingOutcomeId <= 0) {
      throw new Error("Selected finding outcome did not include a valid ID.");
    }
    const baselineDeterministic = deterministicFindingSnapshot(finding);
    const sourceRowsHash = hashJson({
      deterministic: baselineDeterministic,
      previousReportArtifactId: run.previousReportArtifactId ?? null,
      laterReportArtifactId: run.laterReportArtifactId ?? null,
      packetId: run.packetId ?? null,
    });

    const validationStatuses: Record<string, number> = {};
    validationStatuses.markNeedsReviewRequiresNotes = await expectAdminReviewValidationFailure(
      client,
      {
        comparisonRunId,
        findingOutcomeId,
        reviewAction: "mark_needs_review",
      },
      "mark_needs_review without notes",
    );
    validationStatuses.confirmRequiresConfirmations = await expectAdminReviewValidationFailure(
      client,
      {
        comparisonRunId,
        findingOutcomeId,
        reviewAction: "confirm_outcome",
        reviewNotes: "Confirmed for admin review. Deterministic result preserved.",
      },
      "confirm_outcome without confirmations",
    );
    validationStatuses.rejectMatchRequiresNotes = await expectAdminReviewValidationFailure(
      client,
      {
        comparisonRunId,
        findingOutcomeId,
        reviewAction: "reject_match",
        confirmNoCanonicalChange: true,
        confirmNoRuntimeActivation: true,
      },
      "reject_match without notes",
    );
    validationStatuses.rejectClassificationRequiresNotes = await expectAdminReviewValidationFailure(
      client,
      {
        comparisonRunId,
        findingOutcomeId,
        reviewAction: "reject_classification",
        confirmNoCanonicalChange: true,
        confirmNoRuntimeActivation: true,
      },
      "reject_classification without notes",
    );

    const unsupportedActionStatuses: Record<string, number> = {};
    for (const reviewAction of UNSUPPORTED_ADMIN_REVIEW_ACTIONS) {
      unsupportedActionStatuses[reviewAction] = await expectAdminReviewValidationFailure(
        client,
        {
          comparisonRunId,
          findingOutcomeId,
          reviewAction,
          reviewNotes: "Unsupported action should be rejected.",
          confirmNoCanonicalChange: true,
          confirmNoRuntimeActivation: true,
        },
        `${reviewAction} unsupported action`,
      );
    }

    const reviewedRun = await applyAdminReviewAction(
      client,
      {
        comparisonRunId,
        findingOutcomeId,
        reviewAction: "review_outcome",
      },
      "reviewed",
      baselineDeterministic,
      findingOutcomeId,
    );
    const needsReviewRun = await applyAdminReviewAction(
      client,
      {
        comparisonRunId,
        findingOutcomeId,
        reviewAction: "mark_needs_review",
        reviewNotes: "Needs review because the synthetic match requires an admin check.",
      },
      "needs_review",
      baselineDeterministic,
      findingOutcomeId,
    );
    const confirmedRun = await applyAdminReviewAction(
      client,
      {
        comparisonRunId,
        findingOutcomeId,
        reviewAction: "confirm_outcome",
        reviewNotes: "Confirmed for admin review. Deterministic result preserved.",
        confirmNoCanonicalChange: true,
        confirmNoRuntimeActivation: true,
        confirmNoPacketMutation: true,
      },
      "confirmed",
      baselineDeterministic,
      findingOutcomeId,
    );
    const rejectedMatchRun = await applyAdminReviewAction(
      client,
      {
        comparisonRunId,
        findingOutcomeId,
        reviewAction: "reject_match",
        reviewNotes: "Match rejected for review purposes. Deterministic result preserved.",
        confirmNoCanonicalChange: true,
        confirmNoRuntimeActivation: true,
        confirmNoPacketMutation: true,
      },
      "rejected_match",
      baselineDeterministic,
      findingOutcomeId,
    );
    const rejectedClassificationRun = await applyAdminReviewAction(
      client,
      {
        comparisonRunId,
        findingOutcomeId,
        reviewAction: "reject_classification",
        reviewNotes: "Classification rejected for review purposes. Deterministic result preserved.",
        confirmNoCanonicalChange: true,
        confirmNoRuntimeActivation: true,
        confirmNoPacketMutation: true,
      },
      "rejected_classification",
      baselineDeterministic,
      findingOutcomeId,
    );

    const sourceRowsHashAfter = hashJson({
      deterministic: deterministicFindingSnapshot(findingFromRun(rejectedClassificationRun, findingOutcomeId)),
      previousReportArtifactId: rejectedClassificationRun.previousReportArtifactId ?? null,
      laterReportArtifactId: rejectedClassificationRun.laterReportArtifactId ?? null,
      packetId: rejectedClassificationRun.packetId ?? null,
    });
    if (sourceRowsHash !== sourceRowsHashAfter) {
      throw new Error("Outcome admin-review smoke detected source identity or deterministic response hash mutation.");
    }

    const health = await fetch(toAbsoluteUrl(config.baseUrl, "/"), { method: "HEAD" });
    if (!health.ok) throw new Error(`Smoke target health returned HTTP ${health.status}.`);

    assertNoForbiddenEndpointCalls(client.observedRequests);

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
      unauthenticatedAdminReviewStatus: unauthenticatedStatus,
      validationStatuses,
      unsupportedActionStatuses,
      reviewStatuses: {
        afterReviewOutcome: findingFromRun(reviewedRun, findingOutcomeId).adminReviewStatus,
        afterMarkNeedsReview: findingFromRun(needsReviewRun, findingOutcomeId).adminReviewStatus,
        afterConfirmOutcome: findingFromRun(confirmedRun, findingOutcomeId).adminReviewStatus,
        afterRejectMatch: findingFromRun(rejectedMatchRun, findingOutcomeId).adminReviewStatus,
        afterRejectClassification: findingFromRun(rejectedClassificationRun, findingOutcomeId).adminReviewStatus,
      },
      deterministicPreservation: {
        outcomeTypeUnchanged: true,
        matchingMethodUnchanged: true,
        confidenceLevelUnchanged: true,
        snapshotsUnchanged: true,
        sourceResponseHashUnchanged: true,
      },
      cleanupStatus: OUTCOME_ADMIN_REVIEW_CLEANUP_POLICY,
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
      `${error instanceof Error ? error.message : String(error)} Created outcome run IDs: ${createdOutcomeRunIds.join(", ") || "none"}. Cleanup: ${OUTCOME_ADMIN_REVIEW_CLEANUP_POLICY}`,
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
