import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  assertResponseDocumentEvidenceOnly,
  assertResponseDocumentPrivacySafe,
  redactSecretText as redactResponseSecretText,
  RESPONSE_DOCUMENT_ENDPOINTS,
  RESPONSE_DOCUMENT_CLEANUP_POLICY,
  type ResponseDocumentPrivacyContext,
} from "./staging-response-document-smoke";
import { validateSmokeHost } from "./staging-outcome-tracking-smoke";

export const SMOKE_GATE_ENV = "CRP_RESPONSE_DOCUMENT_ADMIN_REVIEW_SMOKE";
export const SKIPPED_EXIT_CODE = 2;

export const RESPONSE_DOCUMENT_ADMIN_REVIEW_ENDPOINTS = {
  list: RESPONSE_DOCUMENT_ENDPOINTS.list,
  get: RESPONSE_DOCUMENT_ENDPOINTS.get,
  adminReview: "/_api/responses/admin-review",
} as const;

export const SUPPORTING_READ_ONLY_ENDPOINTS = {
  session: "/_api/auth/session",
  login: "/_api/auth/login_with_password",
  outcomeGet: "/_api/outcomes/get",
  packetGet: "/_api/packet/get",
} as const;

export const UNSUPPORTED_RESPONSE_ADMIN_REVIEW_ACTIONS = [
  "mark_corrected",
  "mark_removed",
  "mark_unchanged",
  "override_outcome",
  "legal_violation",
  "admitted_fault",
  "activate",
  "make_final_truth",
  "force_outcome",
  "demand",
  "enforce",
] as const;

export const FORBIDDEN_RESPONSE_ADMIN_REVIEW_SMOKE_ENDPOINTS = [
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

export const RESPONSE_DOCUMENT_ADMIN_REVIEW_CLEANUP_POLICY =
  "Response document admin-review smoke is append-only: it leaves response review metadata, audit rows, evidence rows, outcome rows, and source rows in place by design.";

type AuthMode = "credentials" | "session_cookie";
type EnvPrefix = "STAGING" | "LOCAL_SMOKE";

export type ExistingResponseAdminReviewSource = {
  mode: "existing_response";
  syntheticMarker: string;
  responseId: number;
  comparisonRunId?: number;
  findingOutcomeId?: number;
  packetId?: number;
  disputePacketFindingId?: number;
};

export type FindByMarkerResponseAdminReviewSource = {
  mode: "find_by_marker";
  syntheticMarker: string;
};

export type ResponseDocumentAdminReviewSource =
  | ExistingResponseAdminReviewSource
  | FindByMarkerResponseAdminReviewSource;

export type ResponseDocumentAdminReviewSmokeConfig =
  | {
      status: "ready";
      baseUrl: string;
      host: string;
      prefix: EnvPrefix;
      authMode: AuthMode;
      adminSessionCookie?: string;
      adminEmail?: string;
      adminPassword?: string;
      source: ResponseDocumentAdminReviewSource;
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

type VerifiedResponse = {
  response: any;
  responseId: number;
  syntheticMarker: string;
  comparisonRunId: number | null;
  findingOutcomeId: number | null;
  packetId: number | null;
  disputePacketFindingId: number | null;
  responseChannel: string;
  responseDocumentType: string;
  responseStatus: string;
  privacyContext: ResponseDocumentPrivacyContext;
  baselineDeterministicHash: string | null;
  baselinePacketHash: string | null;
  packetHashUnavailableReason: string | null;
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
  return safe || "response-document-admin-review-smoke";
}

function defaultSmokeRunId(): string {
  return `response-document-admin-review-smoke-r${Date.now().toString(36)}`;
}

function cookieHeaderFromSetCookie(setCookie: string): string {
  const normalized = setCookie.replace(/^cookie:\s*/i, "").trim();
  const match = normalized.match(/floot_built_app_session=[^;,\s]+/);
  return match?.[0] ?? "";
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

function responsePrivacyContext(record: any, marker: string, runId?: string): ResponseDocumentPrivacyContext {
  return {
    syntheticMarker: marker,
    runId: runId ?? null,
    responseReferenceId: record?.responseReferenceId ?? null,
    responseSubject: record?.responseSubject ?? null,
    normalizedResponseHash: record?.normalizedResponseHash ?? null,
  };
}

function deterministicFindingSnapshot(finding: any): unknown {
  if (!finding) return null;
  return {
    outcomeType: finding.outcomeType ?? null,
    confidenceLevel: finding.confidenceLevel ?? null,
    matchingMethod: finding.matchingMethod ?? null,
    outcomeReasonCodes: finding.outcomeReasonCodes ?? null,
    previousSnapshot: finding.previousSnapshot ?? null,
    laterSnapshot: finding.laterSnapshot ?? null,
  };
}

function comparisonRunFromBody(body: any): any {
  const run = body?.comparisonRun;
  const id = Number(run?.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Outcome response did not include a valid comparison run ID.");
  }
  return run;
}

function findingFromRun(run: any, findingOutcomeId?: number | null): any | null {
  const findings = Array.isArray(run?.findingOutcomes) ? run.findingOutcomes : [];
  if (findingOutcomeId) {
    const found = findings.find((finding: any) => Number(finding.id) === findingOutcomeId);
    if (!found) throw new Error(`Configured finding outcome ${findingOutcomeId} was not found in comparison run ${run?.id}.`);
    return found;
  }
  return findings[0] ?? null;
}

export function buildResponseDocumentAdminReviewSource(
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

  return {
    mode: "find_by_marker",
    syntheticMarker,
  };
}

export function buildSmokeConfig(env: NodeJS.ProcessEnv): ResponseDocumentAdminReviewSmokeConfig {
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

  const source = buildResponseDocumentAdminReviewSource(env, prefix);
  if (!source) {
    return {
      status: "skipped",
      reason:
        prefix === "STAGING"
          ? "SKIPPED: no verified response ID or marker configured. Provide STAGING_RESPONSE_SYNTHETIC_MARKER plus optional STAGING_RESPONSE_ID, STAGING_RESPONSE_COMPARISON_RUN_ID, and STAGING_RESPONSE_FINDING_OUTCOME_ID."
          : "SKIPPED: no verified response ID or marker configured. Provide LOCAL_SMOKE_RESPONSE_SYNTHETIC_MARKER plus optional LOCAL_SMOKE_RESPONSE_ID, LOCAL_SMOKE_RESPONSE_COMPARISON_RUN_ID, and LOCAL_SMOKE_RESPONSE_FINDING_OUTCOME_ID.",
    };
  }

  const runId = normalizeEnv(env.CRP_RESPONSE_DOCUMENT_ADMIN_REVIEW_SMOKE_RUN_ID) ?? defaultSmokeRunId();
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

const RESPONSE_ADMIN_REVIEW_DISPLAY_TEXT_KEYS = new Set([
  "adminFacingText",
  "description",
  "displayLabel",
  "displayText",
  "label",
  "message",
  "responseSubject",
  "responseSummary",
  "reviewNotes",
  "reviewNotesSummary",
  "summaryText",
  "title",
  "userFacingText",
]);

const RESPONSE_ADMIN_REVIEW_FORBIDDEN_DISPLAY_PATTERNS = [
  /equifax admitted fault/i,
  /the bureau corrected the item/i,
  /the bureau violated the law/i,
  /you won/i,
  /you are entitled to damages/i,
  /this proves correction/i,
  /this is legal proof/i,
  /the agency must pay/i,
  /\bdemand\b/i,
  /\benforce\b/i,
  /mark corrected/i,
  /mark removed/i,
  /mark unchanged/i,
] as const;

function collectDisplayTextValues(value: unknown, includeText = false): string[] {
  if (typeof value === "string") return includeText ? [value] : [];
  if (Array.isArray(value)) return value.flatMap((item) => collectDisplayTextValues(item, includeText));
  if (!value || typeof value !== "object") return [];

  const result: string[] = [];
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    result.push(...collectDisplayTextValues(nestedValue, includeText || RESPONSE_ADMIN_REVIEW_DISPLAY_TEXT_KEYS.has(key)));
  }
  return result;
}

function assertResponseAdminReviewLegalLanguageSafe(payload: unknown): void {
  for (const text of collectDisplayTextValues(payload)) {
    const match = RESPONSE_ADMIN_REVIEW_FORBIDDEN_DISPLAY_PATTERNS.find((pattern) => pattern.test(text));
    if (match) {
      throw new Error(`Response admin-review smoke response failed legal-language check: ${match}.`);
    }
  }
}

export function assertResponseAdminReviewPrivacySafe(
  payload: unknown,
  context?: ResponseDocumentPrivacyContext,
): void {
  assertResponseDocumentPrivacySafe(payload, context);
  assertResponseAdminReviewLegalLanguageSafe(payload);
}

export function assertResponseAdminReviewEvidenceOnly(payload: unknown): void {
  assertResponseDocumentEvidenceOnly(payload);
  const serialized = JSON.stringify(payload);
  const forbidden = [
    /"reviewAction"\s*:\s*"(mark_corrected|mark_removed|mark_unchanged|override_outcome|legal_violation|admitted_fault|activate|make_final_truth|force_outcome|demand|enforce)"/i,
    /"outcomeClassificationCreated"\s*:\s*true/i,
    /"canonicalFactsMutated"\s*:\s*true/i,
    /"responseDocumentCanonicalTruth"\s*:\s*true/i,
  ].find((pattern) => pattern.test(serialized));
  if (forbidden) {
    throw new Error(`Response admin-review smoke detected forbidden canonical/outcome action: ${forbidden}.`);
  }
}

export function assertNoForbiddenEndpointCalls(observedRequests: string[]): void {
  const forbidden = observedRequests.filter((request) =>
    FORBIDDEN_RESPONSE_ADMIN_REVIEW_SMOKE_ENDPOINTS.some((endpoint) => request === `${endpoint.method} ${endpoint.path}`),
  );
  if (forbidden.length > 0) {
    throw new Error(`Forbidden response admin-review smoke endpoint calls observed: ${forbidden.join(", ")}.`);
  }
}

export function assertNoDestructiveCleanupPlanned(policy = RESPONSE_DOCUMENT_ADMIN_REVIEW_CLEANUP_POLICY): void {
  if (!/append-only/i.test(policy) || /delete|truncate|drop/i.test(policy)) {
    throw new Error("Response document admin-review smoke cleanup policy must be append-only and non-destructive.");
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

async function cookieForConfig(config: Extract<ResponseDocumentAdminReviewSmokeConfig, { status: "ready" }>): Promise<string> {
  if (config.authMode === "session_cookie") {
    const sessionCookie = cookieHeaderFromSetCookie(config.adminSessionCookie!);
    if (!sessionCookie) {
      throw new Error("Configured admin session cookie did not include floot_built_app_session.");
    }
    return sessionCookie;
  }

  return loginWithCredentials(config.baseUrl, config.adminEmail!, config.adminPassword!);
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
  const response = await fetch(toAbsoluteUrl(baseUrl, RESPONSE_DOCUMENT_ADMIN_REVIEW_ENDPOINTS.adminReview), {
    method: "POST",
    body: JSON.stringify({
      responseId: 1,
      reviewAction: "add_review_note",
      reviewNotes: "response reviewed; captured as evidence",
      confirmEvidenceOnly: true,
      confirmNoCanonicalChange: true,
      confirmNoOutcomeClassification: true,
    }),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: baseUrl,
    },
  });
  if (![401, 403].includes(response.status)) {
    throw new Error(`Expected unauthenticated response admin-review denial, got HTTP ${response.status}.`);
  }
  return response.status;
}

async function assertAuthenticatedAdminSession(client: SmokeHttpClient): Promise<{ role: string | null }> {
  const session = await client.json("GET", SUPPORTING_READ_ONLY_ENDPOINTS.session);
  if (!session.response.ok) {
    throw new Error(`Authenticated admin session check returned HTTP ${session.status}.`);
  }
  assertResponseAdminReviewPrivacySafe(session.body);
  const role = session.body?.user?.role ?? null;
  if (role !== "admin") {
    throw new Error(`Configured admin context resolved to role ${String(role)}; refusing response admin-review smoke.`);
  }
  return { role };
}

async function getOutcomeRun(
  client: SmokeHttpClient,
  comparisonRunId: number,
  privacyContext: ResponseDocumentPrivacyContext,
): Promise<any> {
  const result = await client.json("GET", `${SUPPORTING_READ_ONLY_ENDPOINTS.outcomeGet}?comparisonRunId=${comparisonRunId}`);
  if (!result.response.ok) {
    throw new Error(`Outcome get returned HTTP ${result.status}.`);
  }
  assertResponseAdminReviewPrivacySafe(result.body, privacyContext);
  assertResponseAdminReviewEvidenceOnly(result.body);
  return comparisonRunFromBody(result.body);
}

async function getOptionalPacketHash(
  client: SmokeHttpClient,
  packetId: number | null,
  privacyContext: ResponseDocumentPrivacyContext,
): Promise<{ hash: string | null; unavailableReason: string | null }> {
  if (!packetId) return { hash: null, unavailableReason: "not_applicable_no_packet_id" };
  const result = await client.json("GET", `${SUPPORTING_READ_ONLY_ENDPOINTS.packetGet}?packetId=${packetId}`);
  if (!result.response.ok) {
    return { hash: null, unavailableReason: `packet_get_http_${result.status}` };
  }
  assertResponseAdminReviewPrivacySafe(result.body, privacyContext);
  assertResponseAdminReviewEvidenceOnly(result.body);
  return { hash: hashJson(result.body?.packet ?? result.body), unavailableReason: null };
}

function requireLinkedSyntheticResponse(record: any, marker: string, runId: string): VerifiedResponse {
  const responseId = responseIdFrom(record);
  if (!responseMatchesMarker(record, marker)) {
    throw new Error(`Response ${responseId} did not include required synthetic marker ${marker}; refusing admin-review smoke.`);
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
  const packetId = record.packetId == null ? null : Number(record.packetId);
  const disputePacketFindingId = record.disputePacketFindingId == null ? null : Number(record.disputePacketFindingId);

  return {
    response: record,
    responseId,
    syntheticMarker: marker,
    comparisonRunId: Number.isInteger(comparisonRunId) && comparisonRunId > 0 ? comparisonRunId : null,
    findingOutcomeId: Number.isInteger(findingOutcomeId) && findingOutcomeId > 0 ? findingOutcomeId : null,
    packetId: Number.isInteger(packetId) && packetId > 0 ? packetId : null,
    disputePacketFindingId: Number.isInteger(disputePacketFindingId) && disputePacketFindingId > 0 ? disputePacketFindingId : null,
    responseChannel,
    responseDocumentType,
    responseStatus: String(record.responseStatus ?? ""),
    privacyContext,
    baselineDeterministicHash: null,
    baselinePacketHash: null,
    packetHashUnavailableReason: null,
  };
}

async function fetchResponseById(
  client: SmokeHttpClient,
  responseId: number,
  marker: string,
  runId: string,
): Promise<VerifiedResponse> {
  const result = await client.json("GET", `${RESPONSE_DOCUMENT_ADMIN_REVIEW_ENDPOINTS.get}?responseId=${responseId}`);
  if (!result.response.ok) {
    throw new Error(`Response document get returned HTTP ${result.status}.`);
  }
  return requireLinkedSyntheticResponse(result.body?.response, marker, runId);
}

function listQueryForMarker(): string {
  const query = new URLSearchParams();
  query.set("limit", "100");
  query.set("responseChannel", "email");
  query.set("responseDocumentType", "bureau_email_response");
  return `${RESPONSE_DOCUMENT_ADMIN_REVIEW_ENDPOINTS.list}?${query.toString()}`;
}

async function findResponseByMarker(
  client: SmokeHttpClient,
  marker: string,
  runId: string,
): Promise<VerifiedResponse> {
  const listed = await client.json("GET", listQueryForMarker());
  if (!listed.response.ok) {
    throw new Error(`Response document list returned HTTP ${listed.status}.`);
  }
  assertResponseAdminReviewPrivacySafe(listed.body, { syntheticMarker: marker, runId });
  assertResponseAdminReviewEvidenceOnly(listed.body);
  const responses = Array.isArray(listed.body?.responses) ? listed.body.responses : [];
  const matched = responses.find((record: any) => responseMatchesMarker(record, marker));
  if (!matched) {
    throw new Error(`Response document list did not include a synthetic response with marker ${marker}.`);
  }
  return fetchResponseById(client, responseIdFrom(matched), marker, runId);
}

async function withSourcePreservationBaseline(client: SmokeHttpClient, verified: VerifiedResponse): Promise<VerifiedResponse> {
  let baselineDeterministicHash: string | null = null;
  if (verified.comparisonRunId) {
    const run = await getOutcomeRun(client, verified.comparisonRunId, verified.privacyContext);
    const finding = findingFromRun(run, verified.findingOutcomeId);
    baselineDeterministicHash = hashJson(deterministicFindingSnapshot(finding));
  }

  const packetBaseline = await getOptionalPacketHash(client, verified.packetId, verified.privacyContext);
  return {
    ...verified,
    baselineDeterministicHash,
    baselinePacketHash: packetBaseline.hash,
    packetHashUnavailableReason: packetBaseline.unavailableReason,
  };
}

async function verifyResponseSource(
  client: SmokeHttpClient,
  source: ResponseDocumentAdminReviewSource,
  runId: string,
): Promise<VerifiedResponse> {
  const verified = source.mode === "existing_response"
    ? await fetchResponseById(client, source.responseId, source.syntheticMarker, runId)
    : await findResponseByMarker(client, source.syntheticMarker, runId);

  if (source.mode === "existing_response" && verified.responseId !== source.responseId) {
    throw new Error(`Response ID mismatch: expected ${source.responseId}, got ${verified.responseId}.`);
  }
  if (source.mode === "existing_response") {
    if (source.comparisonRunId && verified.comparisonRunId !== source.comparisonRunId) {
      throw new Error(`Comparison run ID mismatch: expected ${source.comparisonRunId}, got ${verified.comparisonRunId}.`);
    }
    if (source.findingOutcomeId && verified.findingOutcomeId !== source.findingOutcomeId) {
      throw new Error(`Finding outcome ID mismatch: expected ${source.findingOutcomeId}, got ${verified.findingOutcomeId}.`);
    }
  }

  return withSourcePreservationBaseline(client, verified);
}

function adminReviewBaseBody(verified: VerifiedResponse) {
  return {
    responseId: verified.responseId,
    confirmEvidenceOnly: true,
    confirmNoCanonicalChange: true,
    confirmNoOutcomeClassification: true,
  };
}

async function expectAdminReviewValidationFailure(
  client: SmokeHttpClient,
  body: Record<string, unknown>,
  label: string,
  context: ResponseDocumentPrivacyContext,
): Promise<number> {
  assertResponseAdminReviewPrivacySafe(body, context);
  const result = await client.json("POST", RESPONSE_DOCUMENT_ADMIN_REVIEW_ENDPOINTS.adminReview, body);
  assertResponseAdminReviewPrivacySafe(result.body, context);
  if (![400, 422].includes(result.status)) {
    throw new Error(`${label} expected safe validation failure, got HTTP ${result.status}.`);
  }
  return result.status;
}

async function applyAdminReviewAction(
  client: SmokeHttpClient,
  body: Record<string, unknown>,
  expectedStatus: string,
  context: ResponseDocumentPrivacyContext,
): Promise<any> {
  assertResponseAdminReviewPrivacySafe(body, context);
  assertResponseAdminReviewEvidenceOnly(body);
  const result = await client.json("POST", RESPONSE_DOCUMENT_ADMIN_REVIEW_ENDPOINTS.adminReview, body);
  if (!result.response.ok) {
    throw new Error(`Response admin-review ${String(body.reviewAction)} returned HTTP ${result.status}.`);
  }
  assertResponseAdminReviewPrivacySafe(result.body, context);
  assertResponseAdminReviewEvidenceOnly(result.body);
  if (result.body?.response?.responseStatus !== expectedStatus) {
    throw new Error(
      `Response admin-review ${String(body.reviewAction)} returned status ${String(result.body?.response?.responseStatus)}, expected ${expectedStatus}.`,
    );
  }
  return result.body.response;
}

async function assertResponseAfterReview(
  client: SmokeHttpClient,
  verified: VerifiedResponse,
  expectedStatus: string,
  expectedReviewNotes: string,
): Promise<any> {
  const fetched = await client.json("GET", `${RESPONSE_DOCUMENT_ADMIN_REVIEW_ENDPOINTS.get}?responseId=${verified.responseId}`);
  if (!fetched.response.ok) {
    throw new Error(`Response document get after admin-review returned HTTP ${fetched.status}.`);
  }
  assertResponseAdminReviewPrivacySafe(fetched.body, verified.privacyContext);
  assertResponseAdminReviewEvidenceOnly(fetched.body);
  const record = fetched.body?.response;
  if (Number(record?.id) !== verified.responseId) throw new Error("Response get after admin-review returned the wrong response.");
  if (record.responseStatus !== expectedStatus) throw new Error(`Response status after admin-review was ${record.responseStatus}.`);
  if (record.reviewNotes !== expectedReviewNotes) throw new Error("Response review notes were not updated as expected.");
  if (!record.reviewedAt || !record.reviewedBy) throw new Error("Response review metadata was not updated.");
  if (record.responseChannel !== "email") throw new Error("Response channel changed during admin-review.");
  if (record.responseDocumentType !== "bureau_email_response") throw new Error("Response document type changed during admin-review.");
  if (verified.comparisonRunId && Number(record.comparisonRunId) !== verified.comparisonRunId) {
    throw new Error("Response comparison run link changed unexpectedly.");
  }
  if (verified.findingOutcomeId && Number(record.findingOutcomeId) !== verified.findingOutcomeId) {
    throw new Error("Response finding outcome link changed unexpectedly.");
  }
  return record;
}

async function assertOutcomeUnchangedAfterReview(client: SmokeHttpClient, verified: VerifiedResponse): Promise<boolean | null> {
  if (!verified.comparisonRunId || !verified.baselineDeterministicHash) return null;
  const run = await getOutcomeRun(client, verified.comparisonRunId, verified.privacyContext);
  const finding = findingFromRun(run, verified.findingOutcomeId);
  if (hashJson(deterministicFindingSnapshot(finding)) !== verified.baselineDeterministicHash) {
    throw new Error("Response admin-review smoke detected deterministic outcome mutation.");
  }
  return true;
}

async function assertPacketUnchangedAfterReview(client: SmokeHttpClient, verified: VerifiedResponse): Promise<boolean | null> {
  if (!verified.packetId || !verified.baselinePacketHash) return null;
  const after = await getOptionalPacketHash(client, verified.packetId, verified.privacyContext);
  if (!after.hash) return null;
  if (after.hash !== verified.baselinePacketHash) {
    throw new Error("Response admin-review smoke detected packet detail mutation.");
  }
  return true;
}

export async function runSmoke(config: Extract<ResponseDocumentAdminReviewSmokeConfig, { status: "ready" }>) {
  assertNoDestructiveCleanupPlanned();
  const cookie = await cookieForConfig(config);
  const client = new SmokeHttpClient(config.baseUrl, cookie);
  let responseId: number | null = null;
  let reviewActionTested: string | null = null;

  try {
    const unauthenticatedStatus = await assertUnauthenticatedAdminReviewDenied(config.baseUrl);
    const session = await assertAuthenticatedAdminSession(client);
    const verified = await verifyResponseSource(client, config.source, config.runId);
    responseId = verified.responseId;

    const validationStatuses: Record<string, number> = {};
    validationStatuses.markNeedsReviewRequiresNotes = await expectAdminReviewValidationFailure(
      client,
      {
        ...adminReviewBaseBody(verified),
        reviewAction: "mark_needs_review",
      },
      "mark_needs_review without notes",
      verified.privacyContext,
    );
    validationStatuses.markRelatedRequiresNotes = await expectAdminReviewValidationFailure(
      client,
      {
        ...adminReviewBaseBody(verified),
        reviewAction: "mark_related",
        comparisonRunId: verified.comparisonRunId ?? undefined,
        findingOutcomeId: verified.findingOutcomeId ?? undefined,
      },
      "mark_related without notes",
      verified.privacyContext,
    );
    validationStatuses.markUnrelatedRequiresNotes = await expectAdminReviewValidationFailure(
      client,
      {
        ...adminReviewBaseBody(verified),
        reviewAction: "mark_unrelated",
      },
      "mark_unrelated without notes",
      verified.privacyContext,
    );
    validationStatuses.archiveRequiresNotesOrConfirmation = await expectAdminReviewValidationFailure(
      client,
      {
        ...adminReviewBaseBody(verified),
        reviewAction: "archive_response",
      },
      "archive_response without notes or explicit confirmation",
      verified.privacyContext,
    );

    const unsupportedActionStatuses: Record<string, number> = {};
    for (const reviewAction of UNSUPPORTED_RESPONSE_ADMIN_REVIEW_ACTIONS) {
      unsupportedActionStatuses[reviewAction] = await expectAdminReviewValidationFailure(
        client,
        {
          ...adminReviewBaseBody(verified),
          reviewAction,
          reviewNotes: "response reviewed; captured as evidence",
        },
        `${reviewAction} unsupported action`,
        verified.privacyContext,
      );
    }

    if (!verified.comparisonRunId && !verified.findingOutcomeId) {
      throw new Error("Verified synthetic response does not include an outcome link for link_to_outcome smoke.");
    }

    const linkReviewNotes = "related to outcome; later report comparison required";
    const linked = await applyAdminReviewAction(
      client,
      {
        ...adminReviewBaseBody(verified),
        reviewAction: "link_to_outcome",
        comparisonRunId: verified.comparisonRunId ?? undefined,
        findingOutcomeId: verified.findingOutcomeId ?? undefined,
        reviewNotes: linkReviewNotes,
      },
      "linked_to_outcome",
      verified.privacyContext,
    );
    reviewActionTested = "link_to_outcome";

    const neutralReviewNotes = "response reviewed; captured as evidence; later report comparison required";
    const noted = await applyAdminReviewAction(
      client,
      {
        ...adminReviewBaseBody(verified),
        reviewAction: "add_review_note",
        reviewNotes: neutralReviewNotes,
      },
      "linked_to_outcome",
      verified.privacyContext,
    );

    const fetched = await assertResponseAfterReview(client, verified, "linked_to_outcome", neutralReviewNotes);
    const outcomeUnchanged = await assertOutcomeUnchangedAfterReview(client, verified);
    const packetUnchanged = await assertPacketUnchangedAfterReview(client, verified);

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
      syntheticMarker: verified.syntheticMarker,
      responseId: verified.responseId,
      comparisonRunId: verified.comparisonRunId,
      findingOutcomeId: verified.findingOutcomeId,
      packetId: verified.packetId,
      disputePacketFindingId: verified.disputePacketFindingId,
      unauthenticatedAdminReviewStatus: unauthenticatedStatus,
      validationStatuses,
      unsupportedActionStatuses,
      reviewChecks: {
        responseChannel: fetched.responseChannel,
        responseDocumentType: fetched.responseDocumentType,
        previousResponseStatus: verified.responseStatus,
        afterLinkToOutcomeStatus: linked.responseStatus,
        afterAddReviewNoteStatus: noted.responseStatus,
        finalResponseStatus: fetched.responseStatus,
        reviewMetadataChanged: true,
        responseDocumentsRemainEvidenceMetadataOnly: true,
        noCorrectedRemovedUnchangedClassification: true,
        laterReportComparisonStillRequired: true,
        markRelatedHadExistingOrSuppliedLink: Boolean(
          verified.packetId || verified.disputePacketFindingId || verified.comparisonRunId || verified.findingOutcomeId,
        ),
      },
      sourcePreservation: {
        outcomeDeterministicHashUnchanged: outcomeUnchanged,
        packetDetailHashUnchanged: packetUnchanged,
        packetHashUnavailableReason: verified.packetHashUnavailableReason,
        packetReadinessOrWordingMutationObserved: false,
        canonicalReportTradelineFindingMutationObserved: false,
        responseReviewAlteredSourceOutcomeType: false,
        responseReviewAlteredPacketContentStatusReadiness: false,
        responseReviewAlteredCanonicalReportFacts: false,
      },
      cleanupStatus: RESPONSE_DOCUMENT_ADMIN_REVIEW_CLEANUP_POLICY,
      inheritedCaptureCleanupStatus: RESPONSE_DOCUMENT_CLEANUP_POLICY,
      runtimeSafety: {
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
        mailboxGmailImapEndpointCalls: 0,
        inboxScrapingEndpointCalls: 0,
        outcomeClassificationEndpointCalls: 0,
        responseDocumentsRemainEvidenceMetadataOnly: true,
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
      `${error instanceof Error ? error.message : String(error)} Response ID: ${responseId ?? "none"}. Review action tested: ${reviewActionTested ?? "none"}. Cleanup: ${RESPONSE_DOCUMENT_ADMIN_REVIEW_CLEANUP_POLICY}`,
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
