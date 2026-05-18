import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  assertPrivacySafe as assertOutcomePrivacySafe,
  redactSecretText as redactOutcomeSecretText,
  validateSmokeHost,
} from "./staging-outcome-tracking-smoke";

export const SMOKE_GATE_ENV = "CRP_RESPONSE_DOCUMENT_SMOKE";
export const SKIPPED_EXIT_CODE = 2;

export const RESPONSE_DOCUMENT_ENDPOINTS = {
  capture: "/_api/responses/capture",
  list: "/_api/responses/list",
  get: "/_api/responses/get",
} as const;

export const SUPPORTING_READ_ONLY_ENDPOINTS = {
  session: "/_api/auth/session",
  login: "/_api/auth/login_with_password",
  outcomeGet: "/_api/outcomes/get",
  uploadResults: "/_api/upload-results/get",
  packetGet: "/_api/packet/get",
} as const;

export const FORBIDDEN_RESPONSE_DOCUMENT_SMOKE_ENDPOINTS = [
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

export const RESPONSE_DOCUMENT_CLEANUP_POLICY =
  "Response document smoke is append-only: it leaves synthetic response metadata, outcome rows, evidence rows, and audit rows in place by design.";

export const RESPONSE_DOCUMENT_ALLOWED_SAFE_PHRASES = [
  "A response was recorded.",
  "This response was captured as evidence.",
  "A later credit report comparison is still needed.",
] as const;

type AuthMode = "credentials" | "session_cookie";
type AuthRole = "admin" | "user";
type EnvPrefix = "STAGING" | "LOCAL_SMOKE";

export type ExistingOutcomeResponseSource = {
  mode: "existing_outcome_run";
  syntheticMarker: string;
  comparisonRunId: number;
  findingOutcomeId?: number;
};

export type PacketLinkedResponseSource = {
  mode: "packet_linked";
  syntheticMarker: string;
  packetId: number;
  disputePacketFindingId?: number;
};

export type MetadataOnlyResponseSource = {
  mode: "metadata_only";
  syntheticMarker: string;
};

export type ResponseDocumentSource =
  | ExistingOutcomeResponseSource
  | PacketLinkedResponseSource
  | MetadataOnlyResponseSource;

export type ResponseDocumentSmokeConfig =
  | {
      status: "ready";
      baseUrl: string;
      host: string;
      prefix: EnvPrefix;
      authMode: AuthMode;
      authRole: AuthRole;
      sessionCookie?: string;
      email?: string;
      password?: string;
      source: ResponseDocumentSource;
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

export type ResponseDocumentPrivacyContext = {
  syntheticMarker?: string | null;
  runId?: string | null;
  responseReferenceId?: string | null;
  responseSubject?: string | null;
  normalizedResponseHash?: string | null;
};

type JsonResponse = {
  response: Response;
  status: number;
  body: any;
  text: string;
};

type AuthenticatedSession = {
  id: number;
  role: string | null;
};

type VerifiedSource = {
  sourceMode: ResponseDocumentSource["mode"];
  syntheticMarker: string;
  comparisonRunId: number | null;
  findingOutcomeId: number | null;
  packetId: number | null;
  disputePacketFindingId: number | null;
  baselineDeterministicHash: string | null;
  baselinePacketHash: string | null;
};

class RuntimeSmokeSkipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeSmokeSkipError";
  }
}

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

function outcomeEnv(env: NodeJS.ProcessEnv, prefix: EnvPrefix, key: string): string | undefined {
  return prefixedEnv(env, prefix, `OUTCOME_${key}`);
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
  return safe || "response-document-smoke";
}

function defaultSmokeRunId(): string {
  return `response-document-smoke-r${Date.now().toString(36)}`;
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

export function buildResponseDocumentSource(env: NodeJS.ProcessEnv, prefix: EnvPrefix): ResponseDocumentSource | null {
  const syntheticMarker =
    normalizeEnv(responseEnv(env, prefix, "SYNTHETIC_MARKER")) ??
    normalizeEnv(outcomeEnv(env, prefix, "SYNTHETIC_MARKER"));
  if (!markerIsSynthetic(syntheticMarker)) return null;

  const comparisonRunId =
    numberEnv(responseEnv(env, prefix, "COMPARISON_RUN_ID")) ??
    numberEnv(outcomeEnv(env, prefix, "COMPARISON_RUN_ID"));
  const findingOutcomeId =
    numberEnv(responseEnv(env, prefix, "FINDING_OUTCOME_ID")) ??
    numberEnv(outcomeEnv(env, prefix, "FINDING_OUTCOME_ID"));
  if (comparisonRunId) {
    return {
      mode: "existing_outcome_run",
      syntheticMarker,
      comparisonRunId,
      findingOutcomeId: findingOutcomeId ?? undefined,
    };
  }

  const packetId = numberEnv(responseEnv(env, prefix, "PACKET_ID"));
  const disputePacketFindingId = numberEnv(responseEnv(env, prefix, "DISPUTE_PACKET_FINDING_ID"));
  if (packetId) {
    return {
      mode: "packet_linked",
      syntheticMarker,
      packetId,
      disputePacketFindingId: disputePacketFindingId ?? undefined,
    };
  }

  if (normalizeBoolean(responseEnv(env, prefix, "ALLOW_METADATA_ONLY"))) {
    return {
      mode: "metadata_only",
      syntheticMarker,
    };
  }

  return null;
}

export function buildSmokeConfig(env: NodeJS.ProcessEnv): ResponseDocumentSmokeConfig {
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
      reason: "SKIPPED: no safe authenticated response smoke context configured.",
    };
  }

  const hostCheck = validateSmokeHost(baseUrl);
  if (hostCheck.ok === false) {
    return { status: "error", reason: hostCheck.reason };
  }

  const adminSessionCookie = normalizeEnv(env[`${prefix}_ADMIN_SESSION_COOKIE`]);
  const userSessionCookie = normalizeEnv(env[`${prefix}_USER_SESSION_COOKIE`]);
  const adminEmail = normalizeEnv(env[`${prefix}_ADMIN_EMAIL`]);
  const adminPassword = normalizeEnv(env[`${prefix}_ADMIN_PASSWORD`]);
  const userEmail = normalizeEnv(env[`${prefix}_USER_EMAIL`]);
  const userPassword = normalizeEnv(env[`${prefix}_USER_PASSWORD`]);

  const source = buildResponseDocumentSource(env, prefix);
  if (!source) {
    return {
      status: "skipped",
      reason:
        prefix === "STAGING"
          ? "SKIPPED: no verified synthetic run, packet, or metadata-only response context configured. Provide STAGING_RESPONSE_SYNTHETIC_MARKER plus STAGING_RESPONSE_COMPARISON_RUN_ID, STAGING_RESPONSE_PACKET_ID, or STAGING_RESPONSE_ALLOW_METADATA_ONLY=true."
          : "SKIPPED: no verified synthetic run, packet, or metadata-only response context configured. Provide LOCAL_SMOKE_RESPONSE_SYNTHETIC_MARKER plus LOCAL_SMOKE_RESPONSE_COMPARISON_RUN_ID, LOCAL_SMOKE_RESPONSE_PACKET_ID, or LOCAL_SMOKE_RESPONSE_ALLOW_METADATA_ONLY=true.",
    };
  }

  const runId = normalizeEnv(env.CRP_RESPONSE_DOCUMENT_SMOKE_RUN_ID) ?? defaultSmokeRunId();
  if (adminSessionCookie || userSessionCookie) {
    return {
      status: "ready",
      baseUrl,
      host: hostCheck.host,
      prefix,
      authMode: "session_cookie",
      authRole: adminSessionCookie ? "admin" : "user",
      sessionCookie: adminSessionCookie ?? userSessionCookie ?? undefined,
      source,
      runId,
    };
  }

  if ((adminEmail && adminPassword) || (userEmail && userPassword)) {
    return {
      status: "ready",
      baseUrl,
      host: hostCheck.host,
      prefix,
      authMode: "credentials",
      authRole: adminEmail && adminPassword ? "admin" : "user",
      email: adminEmail ?? userEmail ?? undefined,
      password: adminPassword ?? userPassword ?? undefined,
      source,
      runId,
    };
  }

  return {
    status: "skipped",
    reason: "SKIPPED: no safe authenticated response smoke context configured.",
  };
}

export function redactSecretText(value: string, env: NodeJS.ProcessEnv): string {
  return redactOutcomeSecretText(value, env);
}

const RESPONSE_DISPLAY_TEXT_KEYS = new Set([
  "adminFacingText",
  "description",
  "displayLabel",
  "displayText",
  "label",
  "message",
  "responseSubject",
  "responseSummary",
  "reviewNotes",
  "summary",
  "summaryText",
  "title",
  "userFacingText",
]);

const RESPONSE_FORBIDDEN_DISPLAY_PATTERNS = [
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
] as const;

const RESPONSE_ADDITIONAL_PRIVACY_PATTERNS = [
  /full email body|raw email body|email body dump/i,
  /mailbox password|imap password|smtp password|email auth token|oauth refresh token/i,
] as const;

const NUMERIC_DATABASE_ID_KEYS = new Set([
  "id",
  "userId",
  "packetId",
  "disputePacketFindingId",
  "findingOutcomeId",
  "comparisonRunId",
  "bureauId",
  "agencyId",
  "attachmentEvidenceId",
  "evidenceAttachmentId",
  "responseId",
  "createdBy",
  "reviewedBy",
  "createdResponseIds",
]);

const HASH_FIELD_KEYS = new Set([
  "normalizedResponseHash",
  "previousReportHash",
  "laterReportHash",
  "baselineDeterministicHash",
  "baselinePacketHash",
  "sourceResponseHash",
]);

function collectDisplayTextValues(value: unknown, includeText = false): string[] {
  if (typeof value === "string") return includeText ? [value] : [];
  if (Array.isArray(value)) return value.flatMap((item) => collectDisplayTextValues(item, includeText));
  if (!value || typeof value !== "object") return [];

  const result: string[] = [];
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    result.push(...collectDisplayTextValues(nestedValue, includeText || RESPONSE_DISPLAY_TEXT_KEYS.has(key)));
  }
  return result;
}

function assertResponseLegalLanguageSafe(payload: unknown): void {
  for (const text of collectDisplayTextValues(payload)) {
    const match = RESPONSE_FORBIDDEN_DISPLAY_PATTERNS.find((pattern) => pattern.test(text));
    if (match) {
      throw new Error(`Response document smoke response failed legal-language check: ${match}.`);
    }
  }
}

function contextValues(context?: ResponseDocumentPrivacyContext): string[] {
  return [
    context?.syntheticMarker,
    context?.runId,
    context?.responseReferenceId,
    context?.responseSubject,
    context?.normalizedResponseHash,
  ]
    .map((value) => String(value ?? "").trim())
    .filter((value) => value.length >= 4);
}

function isIntegerish(value: string): boolean {
  return /^\d+$/.test(value);
}

function isHashValue(value: string): boolean {
  return /^[a-f0-9]{32,128}$/i.test(value);
}

function redactExactValues(value: string, allowedValues: string[]): string {
  return allowedValues.reduce((output, allowedValue) => output.split(allowedValue).join("[REDACTED_SMOKE_VALUE]"), value);
}

export function redactKnownResponseSmokePrivacyValues(
  payload: unknown,
  context?: ResponseDocumentPrivacyContext,
): unknown {
  const allowedValues = contextValues(context);

  function visit(value: unknown, key: string | null): unknown {
    if (typeof value === "string") {
      if (key && HASH_FIELD_KEYS.has(key) && isHashValue(value)) return "[REDACTED_HASH]";
      if (key && NUMERIC_DATABASE_ID_KEYS.has(key) && isIntegerish(value)) return "[REDACTED_ID]";
      return redactExactValues(value, allowedValues);
    }
    if (typeof value === "number") {
      if (key && NUMERIC_DATABASE_ID_KEYS.has(key) && Number.isInteger(value)) return 0;
      return value;
    }
    if (Array.isArray(value)) return value.map((item) => visit(item, key));
    if (!value || typeof value !== "object") return value;

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([nestedKey, nestedValue]) => [
        nestedKey,
        visit(nestedValue, nestedKey),
      ]),
    );
  }

  return visit(payload, null);
}

export function assertResponseDocumentPrivacySafe(
  payload: unknown,
  context?: ResponseDocumentPrivacyContext,
): void {
  assertOutcomePrivacySafe(redactKnownResponseSmokePrivacyValues(payload, context));
  const serialized = JSON.stringify(payload);
  const match = RESPONSE_ADDITIONAL_PRIVACY_PATTERNS.find((pattern) => pattern.test(serialized));
  if (match) {
    throw new Error(`Response document smoke response failed privacy check: ${match}.`);
  }
  assertResponseLegalLanguageSafe(payload);
}

export function assertResponseDocumentEvidenceOnly(payload: unknown): void {
  const serialized = JSON.stringify(payload);
  const forbidden = [
    /"outcomeType"\s*:\s*"(corrected|removed|unchanged|reinserted|new_issue|partially_corrected)"/i,
    /"successOutcome"\s*:\s*"(corrected|removed|unchanged|success|won)"/i,
    /"classification"\s*:\s*"(corrected|removed|unchanged|reinserted|new_issue|partially_corrected)"/i,
    /"packetReady"\s*:\s*true/i,
    /"responseDocumentCanonicalTruth"\s*:\s*true/i,
  ].find((pattern) => pattern.test(serialized));
  if (forbidden) {
    throw new Error(`Response document smoke detected forbidden outcome/canonical classification: ${forbidden}.`);
  }
}

export function assertSyntheticMarkerPresent(payload: unknown, marker: string, label: string): void {
  if (!JSON.stringify(payload).includes(marker)) {
    throw new Error(`${label} did not include required synthetic marker ${marker}; refusing to smoke against unverified data.`);
  }
}

export function assertNoForbiddenEndpointCalls(observedRequests: string[]): void {
  const forbidden = observedRequests.filter((request) =>
    FORBIDDEN_RESPONSE_DOCUMENT_SMOKE_ENDPOINTS.some((endpoint) => request === `${endpoint.method} ${endpoint.path}`),
  );
  if (forbidden.length > 0) {
    throw new Error(`Forbidden response document smoke endpoint calls observed: ${forbidden.join(", ")}.`);
  }
}

export function assertNoDestructiveCleanupPlanned(policy = RESPONSE_DOCUMENT_CLEANUP_POLICY): void {
  if (!/append-only/i.test(policy) || /delete|truncate|drop/i.test(policy)) {
    throw new Error("Response document smoke cleanup policy must be append-only and non-destructive.");
  }
}

function comparisonRunFromBody(body: any): any {
  const run = body?.comparisonRun;
  const id = Number(run?.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Outcome response did not include a valid comparison run ID.");
  }
  return run;
}

function findingFromRun(run: any, findingOutcomeId?: number): any | null {
  const findings = Array.isArray(run?.findingOutcomes) ? run.findingOutcomes : [];
  if (findingOutcomeId) {
    const found = findings.find((finding: any) => Number(finding.id) === findingOutcomeId);
    if (!found) throw new Error(`Configured finding outcome ${findingOutcomeId} was not found in comparison run ${run?.id}.`);
    return found;
  }
  return findings[0] ?? null;
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
    throw new Error(`Configured response smoke credentials did not authenticate: HTTP ${response.status}.`);
  }

  const sessionCookie = cookieHeaderFromSetCookie(response.headers.get("set-cookie") ?? "");
  if (!sessionCookie) {
    throw new Error("Configured response smoke credentials authenticated without returning a session cookie.");
  }
  return sessionCookie;
}

async function cookieForConfig(config: Extract<ResponseDocumentSmokeConfig, { status: "ready" }>): Promise<string> {
  if (config.authMode === "session_cookie") {
    const sessionCookie = cookieHeaderFromSetCookie(config.sessionCookie!);
    if (!sessionCookie) {
      throw new Error("Configured response smoke session cookie did not include floot_built_app_session.");
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

async function assertUnauthenticatedResponsesDenied(baseUrl: string): Promise<number> {
  const response = await fetch(toAbsoluteUrl(baseUrl, `${RESPONSE_DOCUMENT_ENDPOINTS.list}?limit=1`), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Origin: baseUrl,
    },
  });
  if (![401, 403].includes(response.status)) {
    throw new Error(`Expected unauthenticated response document denial, got HTTP ${response.status}.`);
  }
  return response.status;
}

async function assertAuthenticatedResponseSession(client: SmokeHttpClient): Promise<AuthenticatedSession> {
  const session = await client.json("GET", SUPPORTING_READ_ONLY_ENDPOINTS.session);
  if (!session.response.ok) {
    throw new Error(`Authenticated response smoke session check returned HTTP ${session.status}.`);
  }
  assertResponseDocumentPrivacySafe(session.body);
  const role = session.body?.user?.role ?? null;
  if (role !== "admin" && role !== "user") {
    throw new Error(`Configured response smoke context resolved to role ${String(role)}; expected user or admin.`);
  }
  const id = Number(session.body?.user?.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Authenticated response smoke session did not include a valid user ID.");
  }
  return { id, role };
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
  assertResponseDocumentPrivacySafe(result.body, { syntheticMarker: marker });
  assertSyntheticMarkerPresent(result.body, marker, label);
  return hashJson(result.body);
}

async function getOutcomeRun(
  client: SmokeHttpClient,
  comparisonRunId: number,
  privacyContext?: ResponseDocumentPrivacyContext,
): Promise<any> {
  const result = await client.json("GET", `${SUPPORTING_READ_ONLY_ENDPOINTS.outcomeGet}?comparisonRunId=${comparisonRunId}`);
  if (!result.response.ok) {
    throw new Error(`Outcome get returned HTTP ${result.status}.`);
  }
  assertResponseDocumentPrivacySafe(result.body, privacyContext);
  assertResponseDocumentEvidenceOnly(result.body);
  return comparisonRunFromBody(result.body);
}

async function verifyExistingOutcomeSource(
  client: SmokeHttpClient,
  source: ExistingOutcomeResponseSource,
): Promise<VerifiedSource> {
  const run = await getOutcomeRun(client, source.comparisonRunId, { syntheticMarker: source.syntheticMarker });
  const previousReportArtifactId = Number(run.previousReportArtifactId);
  const laterReportArtifactId = run.laterReportArtifactId === null ? null : Number(run.laterReportArtifactId);
  if (!Number.isInteger(previousReportArtifactId) || previousReportArtifactId <= 0) {
    throw new Error("Existing outcome run did not include a valid previous report artifact ID.");
  }
  await validateSyntheticReportMarker(client, previousReportArtifactId, source.syntheticMarker, "previous report fixture");
  if (laterReportArtifactId) {
    await validateSyntheticReportMarker(client, laterReportArtifactId, source.syntheticMarker, "later report fixture");
  }

  const finding = findingFromRun(run, source.findingOutcomeId);
  const findingOutcomeId = finding ? Number(finding.id) : source.findingOutcomeId ?? null;
  if (findingOutcomeId !== null && (!Number.isInteger(findingOutcomeId) || findingOutcomeId <= 0)) {
    throw new Error("Selected finding outcome did not include a valid ID.");
  }

  return {
    sourceMode: source.mode,
    syntheticMarker: source.syntheticMarker,
    comparisonRunId: Number(run.id),
    findingOutcomeId,
    packetId: run.packetId == null ? null : Number(run.packetId),
    disputePacketFindingId: finding?.disputePacketFindingId == null ? null : Number(finding.disputePacketFindingId),
    baselineDeterministicHash: hashJson(deterministicFindingSnapshot(finding)),
    baselinePacketHash: null,
  };
}

async function getPacket(
  client: SmokeHttpClient,
  packetId: number,
  privacyContext?: ResponseDocumentPrivacyContext,
): Promise<any> {
  const result = await client.json("GET", `${SUPPORTING_READ_ONLY_ENDPOINTS.packetGet}?packetId=${packetId}`);
  if (!result.response.ok) {
    throw new Error(`Packet get returned HTTP ${result.status}.`);
  }
  assertResponseDocumentPrivacySafe(result.body, privacyContext);
  return result.body?.packet;
}

async function verifyPacketLinkedSource(
  client: SmokeHttpClient,
  source: PacketLinkedResponseSource,
): Promise<VerifiedSource> {
  const packet = await getPacket(client, source.packetId, { syntheticMarker: source.syntheticMarker });
  if (!packet) throw new Error("Packet get did not return a packet.");
  if (!JSON.stringify(packet).includes(source.syntheticMarker)) {
    throw new RuntimeSmokeSkipError(
      "SKIPPED: packet-linked response smoke could not verify the synthetic marker through a safe packet surface.",
    );
  }
  return {
    sourceMode: source.mode,
    syntheticMarker: source.syntheticMarker,
    comparisonRunId: null,
    findingOutcomeId: null,
    packetId: source.packetId,
    disputePacketFindingId: source.disputePacketFindingId ?? null,
    baselineDeterministicHash: null,
    baselinePacketHash: hashJson(packet),
  };
}

async function verifySource(
  client: SmokeHttpClient,
  source: ResponseDocumentSource,
): Promise<VerifiedSource> {
  if (source.mode === "existing_outcome_run") return verifyExistingOutcomeSource(client, source);
  if (source.mode === "packet_linked") return verifyPacketLinkedSource(client, source);
  return {
    sourceMode: source.mode,
    syntheticMarker: source.syntheticMarker,
    comparisonRunId: null,
    findingOutcomeId: null,
    packetId: null,
    disputePacketFindingId: null,
    baselineDeterministicHash: null,
    baselinePacketHash: null,
  };
}

function buildCaptureBody(source: VerifiedSource, session: AuthenticatedSession, runId: string) {
  const referenceSuffix = smokeRunIdentifier(runId);
  return {
    ...(source.comparisonRunId ? { comparisonRunId: source.comparisonRunId } : {}),
    ...(source.findingOutcomeId ? { findingOutcomeId: source.findingOutcomeId } : {}),
    ...(source.packetId ? { packetId: source.packetId } : {}),
    ...(source.disputePacketFindingId ? { disputePacketFindingId: source.disputePacketFindingId } : {}),
    ...(!source.comparisonRunId && !source.packetId ? { userId: session.id } : {}),
    responseChannel: "email",
    responseDocumentType: "bureau_email_response",
    responseReceivedAt: new Date().toISOString(),
    responseSource: "manual_record",
    responseSubject: source.syntheticMarker,
    responseSenderDomain: "example.test",
    responseReferenceId: `${source.syntheticMarker}-${referenceSuffix}`.slice(0, 160),
    responseSummary:
      "Synthetic bureau email response recorded for smoke testing. Later report comparison is still required.",
    responseStatus: source.comparisonRunId ? "linked_to_outcome" : source.packetId ? "linked_to_packet" : "received",
  };
}

function responseIdFrom(body: any): number {
  const id = Number(body?.response?.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Response capture did not return a valid response ID.");
  }
  return id;
}

function hasResponse(body: any, responseId: number): boolean {
  const responses = Array.isArray(body?.responses) ? body.responses : [];
  return responses.some((response: any) => Number(response.id) === responseId);
}

function assertResponseFields(record: any, expected: ReturnType<typeof buildCaptureBody>, responseId: number): void {
  if (Number(record?.id) !== responseId) throw new Error("Response get returned a different response ID.");
  if (record.responseChannel !== expected.responseChannel) throw new Error("Response channel did not match.");
  if (record.responseDocumentType !== expected.responseDocumentType) throw new Error("Response document type did not match.");
  if (record.responseStatus !== expected.responseStatus) throw new Error("Response status did not match.");
  if (record.responseSubject !== expected.responseSubject) throw new Error("Response subject did not match.");
  if (record.responseSenderDomain !== expected.responseSenderDomain) throw new Error("Response sender domain did not match.");
  if (record.responseReferenceId !== expected.responseReferenceId) throw new Error("Response reference ID did not match.");
  if (record.responseSummary !== expected.responseSummary) throw new Error("Response summary did not match.");
}

async function assertOutcomeUnchangedAfterCapture(
  client: SmokeHttpClient,
  source: VerifiedSource,
): Promise<boolean> {
  if (!source.comparisonRunId || !source.baselineDeterministicHash) return true;
  const run = await getOutcomeRun(client, source.comparisonRunId, { syntheticMarker: source.syntheticMarker });
  const finding = findingFromRun(run, source.findingOutcomeId ?? undefined);
  if (hashJson(deterministicFindingSnapshot(finding)) !== source.baselineDeterministicHash) {
    throw new Error("Response capture smoke detected deterministic outcome mutation.");
  }
  return true;
}

async function assertPacketUnchangedAfterCapture(
  client: SmokeHttpClient,
  source: VerifiedSource,
): Promise<boolean> {
  if (!source.packetId || !source.baselinePacketHash) return true;
  const packet = await getPacket(client, source.packetId, { syntheticMarker: source.syntheticMarker });
  if (hashJson(packet) !== source.baselinePacketHash) {
    throw new Error("Response capture smoke detected packet detail mutation.");
  }
  return true;
}

export async function runSmoke(config: Extract<ResponseDocumentSmokeConfig, { status: "ready" }>) {
  assertNoDestructiveCleanupPlanned();
  const cookie = await cookieForConfig(config);
  const client = new SmokeHttpClient(config.baseUrl, cookie);
  const createdResponseIds: number[] = [];

  try {
    const unauthenticatedStatus = await assertUnauthenticatedResponsesDenied(config.baseUrl);
    const session = await assertAuthenticatedResponseSession(client);
    const verifiedSource = await verifySource(client, config.source);
    const captureBody = buildCaptureBody(verifiedSource, session, config.runId);
    const capturePrivacyContext: ResponseDocumentPrivacyContext = {
      syntheticMarker: verifiedSource.syntheticMarker,
      runId: config.runId,
      responseReferenceId: captureBody.responseReferenceId,
      responseSubject: captureBody.responseSubject,
    };

    assertResponseDocumentPrivacySafe(captureBody, capturePrivacyContext);
    assertResponseDocumentEvidenceOnly(captureBody);

    const captured = await client.json("POST", RESPONSE_DOCUMENT_ENDPOINTS.capture, captureBody);
    if (!captured.response.ok) {
      throw new Error(`Response document capture returned HTTP ${captured.status}.`);
    }
    const capturedPrivacyContext = {
      ...capturePrivacyContext,
      normalizedResponseHash: captured.body?.response?.normalizedResponseHash ?? null,
    };
    assertResponseDocumentPrivacySafe(captured.body, capturedPrivacyContext);
    assertResponseDocumentEvidenceOnly(captured.body);
    const responseId = responseIdFrom(captured.body);
    createdResponseIds.push(responseId);
    assertResponseFields(captured.body.response, captureBody, responseId);

    const listFilters = new URLSearchParams();
    listFilters.set("limit", "25");
    if (verifiedSource.comparisonRunId) listFilters.set("comparisonRunId", String(verifiedSource.comparisonRunId));
    if (verifiedSource.packetId) listFilters.set("packetId", String(verifiedSource.packetId));
    listFilters.set("responseChannel", "email");
    listFilters.set("responseDocumentType", "bureau_email_response");
    const listed = await client.json("GET", `${RESPONSE_DOCUMENT_ENDPOINTS.list}?${listFilters.toString()}`);
    if (!listed.response.ok) {
      throw new Error(`Response document list returned HTTP ${listed.status}.`);
    }
    assertResponseDocumentPrivacySafe(listed.body, capturedPrivacyContext);
    assertResponseDocumentEvidenceOnly(listed.body);
    if (!hasResponse(listed.body, responseId)) {
      throw new Error("Response document list did not include the captured synthetic response.");
    }

    const fetched = await client.json("GET", `${RESPONSE_DOCUMENT_ENDPOINTS.get}?responseId=${responseId}`);
    if (!fetched.response.ok) {
      throw new Error(`Response document get returned HTTP ${fetched.status}.`);
    }
    assertResponseDocumentPrivacySafe(fetched.body, capturedPrivacyContext);
    assertResponseDocumentEvidenceOnly(fetched.body);
    assertResponseFields(fetched.body.response, captureBody, responseId);

    await assertOutcomeUnchangedAfterCapture(client, verifiedSource);
    await assertPacketUnchangedAfterCapture(client, verifiedSource);

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
      sourceMode: verifiedSource.sourceMode,
      syntheticMarker: verifiedSource.syntheticMarker,
      comparisonRunId: verifiedSource.comparisonRunId,
      findingOutcomeId: verifiedSource.findingOutcomeId,
      packetId: verifiedSource.packetId,
      disputePacketFindingId: verifiedSource.disputePacketFindingId,
      responseId,
      createdResponseIds,
      unauthenticatedResponsesStatus: unauthenticatedStatus,
      responseChecks: {
        captureReturnedResponseId: true,
        listFoundResponse: true,
        getFoundResponse: true,
        responseChannel: fetched.body.response.responseChannel,
        responseDocumentType: fetched.body.response.responseDocumentType,
        responseStatus: fetched.body.response.responseStatus,
        responseMetadataOnly: true,
        noCorrectedRemovedUnchangedClassification: true,
        laterReportComparisonStillRequired: true,
      },
      sourcePreservation: {
        outcomeDeterministicHashUnchanged: true,
        packetDetailHashUnchanged: true,
        packetReadinessOrWordingMutationObserved: false,
        canonicalReportTradelineFindingMutationObserved: false,
      },
      cleanupStatus: RESPONSE_DOCUMENT_CLEANUP_POLICY,
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
      `${error instanceof Error ? error.message : String(error)} Created response IDs: ${createdResponseIds.join(", ") || "none"}. Cleanup: ${RESPONSE_DOCUMENT_CLEANUP_POLICY}`,
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
    if (error instanceof RuntimeSmokeSkipError || /SKIPPED:/.test(error instanceof Error ? error.message : String(error))) {
      console.log(redactSecretText(error instanceof Error ? error.message : String(error), env));
      return SKIPPED_EXIT_CODE;
    }
    console.error(redactSecretText(error instanceof Error ? error.message : String(error), env));
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCli().then((code) => {
    process.exitCode = code;
  });
}
