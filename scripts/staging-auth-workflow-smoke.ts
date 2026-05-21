import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import PdfPrinter from "pdfmake";

import { transUnionCollapsedSyntheticFixture } from "../tests/fixtures/creditReportFixtures";

export const AUTH_WORKFLOW_SMOKE_ENV = "CRP_AUTH_WORKFLOW_SMOKE";
export const SKIPPED_EXIT_CODE = 2;

export const ALLOWED_HOSTS = new Set(["staging.creditregulatorpro.com", "localhost", "127.0.0.1"]);
export const REFUSED_PRODUCTION_HOSTS = new Set(["creditregulatorpro.com", "www.creditregulatorpro.com"]);

export const AUTH_WORKFLOW_ENDPOINTS = {
  register: "/_api/auth/register_with_password",
  logout: "/_api/auth/logout",
  login: "/_api/auth/login_with_password",
  session: "/_api/auth/session",
  profile: "/_api/user/profile",
  ingestReport: "/_api/ingest/report",
  ingestProcess: "/_api/ingest/process",
  ingestStatus: "/_api/ingest/status",
  reportArtifactGet: "/_api/report-artifact/get",
  uploadResults: "/_api/upload-results/get",
  packetRecommend: "/_api/packet/recommend",
  packetValidateReadiness: "/_api/packet/validate-readiness",
  packetBuild: "/_api/packet/build",
  packetCreate: "/_api/packet/create",
  packetPdf: "/_api/packet/pdf",
  deleteAccount: "/_api/user/delete-account",
} as const;

const MOCK_IDENTIFICATION_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lEQP2wAAAABJRU5ErkJggg==";

type AuthMode = "self_registered";

export type SmokeConfig =
  | {
      status: "ready";
      baseUrl: string;
      origin: string;
      host: string;
      authMode: AuthMode;
      runId: string;
      email: string;
      password: string;
      cleanup: boolean;
      includePacket: boolean;
    }
  | {
      status: "skipped";
      reason: string;
    }
  | {
      status: "error";
      reason: string;
    };

type RegisterResponse = {
  user: {
    id: number;
    email: string;
    displayName: string;
    role?: string;
  };
};

type AuthenticatedSessionResponse = {
  user: {
    id: number;
    email: string;
    displayName: string;
    role: string;
  };
};

type SessionResponse =
  | AuthenticatedSessionResponse
  | {
      error: string;
    };

type IngestPhase1Response = {
  artifactId: number;
  extractionStatus: "extracted" | "pending" | "failed";
  error?: string;
};

type IngestPhase2Response = {
  ok: boolean;
  storageUrl: string;
  tradelinesCount: number;
  tradelineIds: number[];
  parserQuality?: {
    confidenceScore?: number;
    requiresManualReview?: boolean;
  };
};

type QueuedIngestProcessResponse = {
  ok: boolean;
  queued?: boolean;
  artifactId: number;
  storageUrl?: string;
  jobId?: number | null;
  queueStatus?: string | null;
  processingStatus?: string | null;
  uploadStatus?: IngestStatusResponse["status"];
  nextAction?: string | null;
  userMessage?: string | null;
  diagnosticCode?: string | null;
  workerRequired?: boolean;
  retryAt?: string | null;
};

type IngestProcessResponse = IngestPhase2Response | QueuedIngestProcessResponse;

type IngestStatusResponse = {
  ok: boolean;
  artifactId: number;
  jobId: number | null;
  status:
    | "queued_waiting_for_worker"
    | "processing"
    | "completed"
    | "failed"
    | "manual_review_required"
    | "stalled_no_worker_heartbeat"
    | "stale";
  queueStatus: string | null;
  processingStatus: string;
  nextAction: string;
  userMessage: string;
  diagnosticCode: string;
  workerRequired: boolean;
  canLeavePage: boolean;
  canCheckStatus: boolean;
  retryAt: string | null;
  checkedAt: string;
};

type IngestStatusSummary = Pick<
  IngestStatusResponse,
  | "artifactId"
  | "jobId"
  | "status"
  | "queueStatus"
  | "processingStatus"
  | "nextAction"
  | "diagnosticCode"
  | "workerRequired"
  | "retryAt"
  | "checkedAt"
>;

type ReportArtifactGetResponse = {
  reportArtifact: {
    id: number;
    userId?: number | null;
    organizationId?: number | null;
    processingStatus?: string | null;
    createdAt?: string;
    sha256?: string | null;
  };
};

type UploadResultsResponse = {
  metadata: {
    region: string;
    bureauName: string;
    platformScope: string;
  };
  stats: {
    totalTradelines: number;
    actionableCount: number;
  };
};

type PacketCandidate = {
  issueId: number;
  tradelineId: number;
  packetTypes: string[];
  bureauName: string | null;
  issueType: string;
};

type PacketRecommendResponse = {
  recommendations: PacketCandidate[];
};

type PacketReadinessResponse = {
  packetReady: boolean;
  eligibleFindingIds: number[];
  ineligibleFindingIds: number[];
  reasonCodes: string[];
};

type PacketBuildResponse = {
  packet: {
    packetType: string;
    metadata?: {
      selectedIssueIds?: number[];
    };
    disputedItems?: Array<{ issueId?: number }>;
  };
};

type PacketCreateResponse = {
  success: boolean;
  packetId: number;
  status: string;
};

type PacketPdfDiagnostics = {
  packetId: number;
  selectedIssueId: number;
  pdfStatus: number;
  pdfContentType: string;
  pdfByteLength: number;
  pdfStartsWithPdf: boolean;
  responseSnippet?: string;
};

type DeleteAccountResponse = {
  success: boolean;
  purgedCounts?: Record<string, number>;
};

type HttpResult = {
  ok: boolean;
  status: number;
  raw: string;
  json: unknown | null;
};

type UploadedReport = {
  artifactId: number;
  phase1: IngestPhase1Response;
  phase2: IngestProcessResponse;
  terminalStatus: IngestStatusResponse;
  statusPolls: IngestStatusSummary[];
};

type SmokeActor = {
  label: "owner" | "non-owner";
  api: ApiClient;
  config: Extract<SmokeConfig, { status: "ready" }>;
  userId: number;
  cleanupStatus: { status: string; purgedCounts?: Record<string, number> };
};

function normalizeBoolean(value: string | undefined): boolean {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function normalizeEnv(value: string | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePositiveInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(parsed)));
}

function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function smokeRunIdentifier(runId: string): string {
  const safe = runId
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || "run";
}

export function validateSmokeHost(baseUrl: string): { ok: true; host: string } | { ok: false; reason: string } {
  const host = hostOf(baseUrl);
  if (!host) return { ok: false, reason: "Invalid authenticated workflow smoke base URL." };
  if (REFUSED_PRODUCTION_HOSTS.has(host)) {
    return { ok: false, reason: `Refusing to run authenticated workflow smoke against production host ${host}.` };
  }
  if (!ALLOWED_HOSTS.has(host)) {
    return { ok: false, reason: `Refusing to run authenticated workflow smoke against unapproved host ${host}.` };
  }
  return { ok: true, host };
}

export function buildSyntheticEmail(runId: string, now = Date.now()): string {
  return `auth.workflow.${smokeRunIdentifier(runId)}.${now}@example.com`.toLowerCase();
}

function buildSyntheticPassword(): string {
  return `Smoke${Date.now()}${randomBytes(2).toString("hex")}A1x`;
}

function buildSecondarySmokeConfig(config: Extract<SmokeConfig, { status: "ready" }>): Extract<SmokeConfig, { status: "ready" }> {
  return {
    ...config,
    runId: `${config.runId}-non-owner`,
    email: buildSyntheticEmail(`${config.runId}-non-owner`),
    password: buildSyntheticPassword(),
  };
}

export function buildSmokeConfig(env: NodeJS.ProcessEnv): SmokeConfig {
  if (!normalizeBoolean(env[AUTH_WORKFLOW_SMOKE_ENV])) {
    return {
      status: "skipped",
      reason: `SKIPPED: ${AUTH_WORKFLOW_SMOKE_ENV}=true is required.`,
    };
  }

  const stagingBaseUrl = normalizeEnv(env.STAGING_BASE_URL) ?? normalizeEnv(env.STAGING_APP_URL);
  const localBaseUrl = normalizeEnv(env.LOCAL_SMOKE_BASE_URL);
  const baseUrl = stagingBaseUrl ?? localBaseUrl;

  if (!baseUrl) {
    return {
      status: "skipped",
      reason: "SKIPPED: STAGING_BASE_URL, STAGING_APP_URL, or LOCAL_SMOKE_BASE_URL is required.",
    };
  }

  const hostCheck = validateSmokeHost(baseUrl);
  if (hostCheck.ok === false) {
    return { status: "error", reason: hostCheck.reason };
  }

  const skipCleanup = normalizeBoolean(env.CRP_AUTH_WORKFLOW_SMOKE_SKIP_CLEANUP);
  if (stagingBaseUrl && skipCleanup) {
    return {
      status: "error",
      reason: "Refusing to run staging authenticated workflow smoke without cleanup.",
    };
  }

  const runId = normalizeEnv(env.CRP_AUTH_WORKFLOW_SMOKE_RUN_ID) ?? `auth-workflow-smoke-${Date.now()}`;
  const origin =
    normalizeEnv(env.CRP_AUTH_WORKFLOW_SMOKE_ORIGIN) ??
    normalizeEnv(env.LOCAL_SMOKE_ORIGIN) ??
    baseUrl;

  return {
    status: "ready",
    baseUrl,
    origin,
    host: hostCheck.host,
    authMode: "self_registered",
    runId,
    email: normalizeEnv(env.CRP_AUTH_WORKFLOW_SMOKE_EMAIL) ?? buildSyntheticEmail(runId),
    password: normalizeEnv(env.CRP_AUTH_WORKFLOW_SMOKE_PASSWORD) ?? buildSyntheticPassword(),
    cleanup: !skipCleanup,
    includePacket: normalizeBoolean(env.CRP_AUTH_WORKFLOW_SMOKE_INCLUDE_PACKET),
  };
}

export function redactSecretText(value: string, env: NodeJS.ProcessEnv): string {
  const secretValues = [
    env.CRP_AUTH_WORKFLOW_SMOKE_PASSWORD,
    env.STAGING_ADMIN_PASSWORD,
    env.STAGING_ADMIN_SESSION_COOKIE,
    env.LOCAL_SMOKE_ADMIN_PASSWORD,
    env.LOCAL_SMOKE_ADMIN_SESSION_COOKIE,
  ]
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length >= 4);

  return secretValues.reduce((output, secret) => output.split(secret).join("[REDACTED]"), value);
}

export async function buildSyntheticCreditReportPdfBase64(): Promise<string> {
  const printer = new PdfPrinter({
    Helvetica: {
      normal: "Helvetica",
      bold: "Helvetica-Bold",
      italics: "Helvetica-Oblique",
      bolditalics: "Helvetica-BoldOblique",
    },
  });

  const document = printer.createPdfKitDocument({
    pageMargins: [36, 36, 36, 36],
    defaultStyle: { font: "Helvetica", fontSize: 9 },
    content: transUnionCollapsedSyntheticFixture
      .split("\n")
      .map((line) => ({ text: line || " ", margin: [0, 0, 0, 1] })),
  });

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    document.on("end", () => resolve(Buffer.concat(chunks).toString("base64")));
    document.on("error", reject);
    document.end();
  });
}

class ApiClient {
  private cookies = new Map<string, string>();
  readonly apiServerErrors: string[] = [];

  constructor(
    private readonly baseUrl: string,
    private readonly origin: string,
  ) {}

  async json<T>(pathSuffix: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const response = await this.raw(pathSuffix, init);
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${pathSuffix}: ${extractErrorMessage(raw)}`);
    }
    return raw.trim() ? JSON.parse(raw) as T : ({} as T);
  }

  async request(pathSuffix: string, init?: { method?: string; body?: unknown }): Promise<HttpResult> {
    const response = await this.raw(pathSuffix, init);
    const raw = await response.text();
    let json: unknown | null = null;
    try {
      json = raw.trim() ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      raw,
      json,
    };
  }

  async raw(pathSuffix: string, init?: { method?: string; body?: unknown }): Promise<Response> {
    const response = await fetch(this.url(pathSuffix), this.buildRequestInit(init));
    this.captureCookies(response);
    if (pathSuffix.startsWith("/_api/") && response.status >= 500) {
      this.apiServerErrors.push(`${response.status} ${pathSuffix.split("?")[0]}`);
    }
    return response;
  }

  async sse<T>(
    pathSuffix: string,
    body: unknown,
    onProgress?: (stage: string, percent: number, message?: string) => void,
  ): Promise<T> {
    const response = await this.raw(pathSuffix, { method: "POST", body });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`HTTP ${response.status} ${pathSuffix}: ${extractErrorMessage(raw)}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/event-stream")) {
      return JSON.parse(await response.text()) as T;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error(`Could not open SSE stream for ${pathSuffix}`);
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let finalData: T | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (!payload) continue;

        let event: {
          type: string;
          stage?: string;
          percent?: number;
          message?: string;
          data?: T;
          error?: string;
        };

        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }

        if (event.type === "progress") {
          onProgress?.(event.stage ?? "unknown", event.percent ?? 0, event.message);
          continue;
        }
        if (event.type === "error") {
          throw new Error(event.error ?? "SSE processing failed");
        }
        if (event.type === "complete") {
          finalData = event.data ?? null;
        }
      }
    }

    if (finalData === null) {
      throw new Error(`SSE stream for ${pathSuffix} ended without a completion payload`);
    }
    return finalData;
  }

  private buildRequestInit(init?: { method?: string; body?: unknown }): RequestInit {
    const headers: Record<string, string> = {
      Accept: "application/json",
      Origin: this.origin,
      Referer: `${this.origin.replace(/\/$/, "")}/`,
    };

    const cookieHeader = this.serializeCookies();
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    const requestInit: RequestInit = {
      method: init?.method ?? "GET",
      headers,
    };

    if (init?.body !== undefined) {
      headers["Content-Type"] = "application/json";
      requestInit.body = JSON.stringify(init.body);
    }

    return requestInit;
  }

  private url(pathSuffix: string): string {
    const base = this.baseUrl.endsWith("/") ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const suffix = pathSuffix.startsWith("/") ? pathSuffix : `/${pathSuffix}`;
    return `${base}${suffix}`;
  }

  private captureCookies(response: Response): void {
    const headersWithSetCookie = response.headers as Headers & {
      getSetCookie?: () => string[];
    };
    const cookieHeaders = [...(headersWithSetCookie.getSetCookie?.() ?? [])];
    const setCookieRaw = response.headers.get("set-cookie");
    if (setCookieRaw) {
      cookieHeaders.push(...setCookieRaw.split(/,(?=[^;,]+=)/));
    }

    for (const header of cookieHeaders) {
      const firstPart = header.split(";")[0]?.trim();
      if (!firstPart) continue;
      const separatorIndex = firstPart.indexOf("=");
      if (separatorIndex <= 0) continue;
      const name = firstPart.slice(0, separatorIndex).trim();
      const value = firstPart.slice(separatorIndex + 1).trim();
      if (!name) continue;
      this.cookies.set(name, value);
    }
  }

  private serializeCookies(): string {
    if (this.cookies.size === 0) return "";
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

function extractErrorMessage(raw: string): string {
  if (!raw.trim()) return "Unknown error";
  try {
    const parsed = JSON.parse(raw) as { error?: string; message?: string };
    return parsed.error ?? parsed.message ?? raw;
  } catch {
    return raw;
  }
}

function assertCondition(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

export function isCompletedIngestPhase2Response(value: unknown): value is IngestPhase2Response {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.ok === true &&
    typeof record.storageUrl === "string" &&
    Number.isFinite(record.tradelinesCount) &&
    Array.isArray(record.tradelineIds)
  );
}

export function summarizeIngestStatus(status: IngestStatusResponse): IngestStatusSummary {
  return {
    artifactId: status.artifactId,
    jobId: status.jobId,
    status: status.status,
    queueStatus: status.queueStatus,
    processingStatus: status.processingStatus,
    nextAction: status.nextAction,
    diagnosticCode: status.diagnosticCode,
    workerRequired: status.workerRequired,
    retryAt: status.retryAt,
    checkedAt: status.checkedAt,
  };
}

export function isSuccessfulTerminalIngestStatus(status: IngestStatusResponse): boolean {
  return status.status === "completed";
}

export function isFailedTerminalIngestStatus(status: IngestStatusResponse): boolean {
  return ["failed", "manual_review_required", "stalled_no_worker_heartbeat", "stale"].includes(status.status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function registerSyntheticUser(api: ApiClient, config: Extract<SmokeConfig, { status: "ready" }>) {
  const registered = await api.json<RegisterResponse>(AUTH_WORKFLOW_ENDPOINTS.register, {
    method: "POST",
    body: {
      email: config.email,
      password: config.password,
      displayName: "Synthetic Workflow Smoke",
      termsAccepted: true,
      dataConsentAccepted: true,
      legalNameSignature: "Synthetic Workflow Smoke",
      identificationFileName: "synthetic-workflow-smoke.png",
      identificationFileType: "image/png",
      identificationFileDataBase64: MOCK_IDENTIFICATION_DATA_URL,
    },
  });

  assertCondition(registered.user?.id, "Registration did not return a user ID.");
  return registered.user;
}

async function ensureLoginRoundTrip(
  api: ApiClient,
  config: Extract<SmokeConfig, { status: "ready" }>,
): Promise<AuthenticatedSessionResponse> {
  await api.json<{ success: boolean }>(AUTH_WORKFLOW_ENDPOINTS.logout, { method: "POST", body: {} });
  await api.json<{ user: { id: number; role: string } }>(AUTH_WORKFLOW_ENDPOINTS.login, {
    method: "POST",
    body: {
      email: config.email,
      password: config.password,
    },
  });

  const session = await api.json<SessionResponse>(AUTH_WORKFLOW_ENDPOINTS.session);
  if ("error" in session) {
    throw new Error(`Login succeeded but session was not authenticated: ${session.error}`);
  }
  if (session.user.role !== "user") {
    throw new Error(`Synthetic workflow user resolved to ${session.user.role}, expected user.`);
  }
  return session;
}

async function updateSyntheticProfile(api: ApiClient) {
  return await api.json(AUTH_WORKFLOW_ENDPOINTS.profile, {
    method: "POST",
    body: {
      fullName: "Synthetic Workflow Smoke",
      addressLine1: "101 Test Avenue",
      addressLine2: null,
      city: "Halifax",
      province: "NS",
      postalCode: "B3J 1A1",
      dateOfBirth: "1984-07-12",
      phone: "9025550100",
    },
  });
}

async function verifyArtifactOwnership(
  api: ApiClient,
  artifactId: number,
  expectedUserId: number,
): Promise<ReportArtifactGetResponse["reportArtifact"]> {
  const artifact = await api.json<ReportArtifactGetResponse>(
    `${AUTH_WORKFLOW_ENDPOINTS.reportArtifactGet}?id=${encodeURIComponent(String(artifactId))}`,
  );
  if (Number(artifact.reportArtifact.id) !== artifactId) {
    throw new Error(`Artifact detail returned id ${artifact.reportArtifact.id}, expected ${artifactId}.`);
  }
  if (Number(artifact.reportArtifact.userId) !== expectedUserId) {
    throw new Error(
      `Artifact owner was ${artifact.reportArtifact.userId ?? "missing"}, expected authenticated user ${expectedUserId}.`,
    );
  }
  return artifact.reportArtifact;
}

async function pollIngestStatus(
  api: ApiClient,
  artifactId: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ terminalStatus: IngestStatusResponse; polls: IngestStatusSummary[] }> {
  const timeoutMs = normalizePositiveInteger(env.CRP_AUTH_WORKFLOW_SMOKE_TIMEOUT_MS, 240_000, 30_000, 900_000);
  const pollMs = normalizePositiveInteger(env.CRP_AUTH_WORKFLOW_SMOKE_POLL_MS, 5_000, 1_000, 30_000);
  const startedAtMs = Date.now();
  const deadlineMs = startedAtMs + timeoutMs;
  const polls: IngestStatusSummary[] = [];

  while (true) {
    const status = await api.json<IngestStatusResponse>(
      `${AUTH_WORKFLOW_ENDPOINTS.ingestStatus}?artifactId=${encodeURIComponent(String(artifactId))}`,
    );
    const summary = summarizeIngestStatus(status);
    polls.push(summary);
    console.log(`[auth-smoke] ingest-status ${JSON.stringify(summary)}`);

    if (isSuccessfulTerminalIngestStatus(status)) {
      return { terminalStatus: status, polls };
    }

    if (isFailedTerminalIngestStatus(status)) {
      throw new Error(`Ingest processing reached terminal failure: ${JSON.stringify(summary)}.`);
    }

    const now = Date.now();
    if (now >= deadlineMs) {
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for ingest terminal status. Last status: ${JSON.stringify(summary)}.`,
      );
    }

    await sleep(Math.min(pollMs, Math.max(0, deadlineMs - now)));
  }
}

async function uploadSyntheticReport(api: ApiClient, runId: string): Promise<UploadedReport> {
  const bytesBase64 = await buildSyntheticCreditReportPdfBase64();
  const phase1 = await api.json<IngestPhase1Response>(AUTH_WORKFLOW_ENDPOINTS.ingestReport, {
    method: "POST",
    body: {
      region: "CA",
      fileName: `synthetic-auth-workflow-${smokeRunIdentifier(runId)}.pdf`,
      mimeType: "application/pdf",
      bytesBase64,
    },
  });

  if (phase1.extractionStatus === "failed") {
    throw new Error(`Synthetic upload failed in phase 1: ${phase1.error ?? "unknown error"}`);
  }

  const phase2 = await api.sse<IngestProcessResponse>(
    AUTH_WORKFLOW_ENDPOINTS.ingestProcess,
    { artifactId: phase1.artifactId },
  );
  const parsedStorageId = isCompletedIngestPhase2Response(phase2)
    ? Number(phase2.storageUrl)
    : Number(phase2.storageUrl ?? phase2.artifactId);
  const artifactId = Number.isFinite(parsedStorageId) ? parsedStorageId : phase1.artifactId;
  const { terminalStatus, polls } = await pollIngestStatus(api, artifactId);

  return {
    phase1,
    phase2,
    artifactId,
    terminalStatus,
    statusPolls: polls,
  };
}

async function reviewParserResults(api: ApiClient, artifactId: number): Promise<UploadResultsResponse> {
  const results = await api.json<UploadResultsResponse>(
    `${AUTH_WORKFLOW_ENDPOINTS.uploadResults}?artifactId=${encodeURIComponent(String(artifactId))}`,
  );

  if (results.metadata.region !== "CA") {
    throw new Error(`Upload result region was ${results.metadata.region}, expected CA.`);
  }
  if (results.stats.totalTradelines < 2) {
    throw new Error(`Expected at least 2 synthetic tradelines, found ${results.stats.totalTradelines}.`);
  }
  return results;
}

async function assertNonOwnerUploadResultsDenied(api: ApiClient, artifactId: number) {
  const response = await api.request(
    `${AUTH_WORKFLOW_ENDPOINTS.uploadResults}?artifactId=${encodeURIComponent(String(artifactId))}`,
  );
  if (response.ok) {
    throw new Error("Non-owner could retrieve owner upload results.");
  }
  if (response.status !== 403 && response.status !== 404) {
    throw new Error(`Non-owner upload-results check returned HTTP ${response.status}, expected 403 or 404.`);
  }
  return {
    denied: true,
    status: response.status,
  };
}

async function assertNonOwnerPacketPdfDenied(api: ApiClient, packetId: number) {
  const response = await api.raw(
    `${AUTH_WORKFLOW_ENDPOINTS.packetPdf}?packetId=${encodeURIComponent(String(packetId))}`,
  );
  const raw = await response.text();
  if (response.ok) {
    throw new Error(`Non-owner could retrieve owner packet PDF ${packetId}.`);
  }
  if (response.status !== 403 && response.status !== 404) {
    throw new Error(
      `Non-owner packet PDF check returned HTTP ${response.status}, expected 403 or 404. Body: ${extractErrorMessage(raw)}`,
    );
  }
  return {
    denied: true,
    status: response.status,
  };
}

async function selectPacketReadyFinding(api: ApiClient): Promise<PacketCandidate> {
  const recommendations = await api.json<PacketRecommendResponse>(
    `${AUTH_WORKFLOW_ENDPOINTS.packetRecommend}?packetType=credit_bureau&limit=25`,
  );
  const candidate = recommendations.recommendations.find((item) =>
    item.packetTypes.includes("credit_bureau") && Number.isInteger(item.issueId),
  );
  if (!candidate) {
    throw new Error("No packet-ready synthetic credit bureau finding was returned after upload.");
  }
  return candidate;
}

async function validateBuildCreateAndDownloadPacket(api: ApiClient, issueId: number) {
  const packetInput = {
    packetType: "credit_bureau",
    selectedIssueIds: [issueId],
  };

  const readiness = await api.json<PacketReadinessResponse>(AUTH_WORKFLOW_ENDPOINTS.packetValidateReadiness, {
    method: "POST",
    body: packetInput,
  });
  console.log(`[auth-smoke] packet-readiness ${JSON.stringify({
    selectedIssueId: issueId,
    packetReady: readiness.packetReady,
    eligibleFindingIds: readiness.eligibleFindingIds,
    ineligibleFindingIds: readiness.ineligibleFindingIds,
    reasonCodes: readiness.reasonCodes,
  })}`);
  if (!readiness.packetReady || !readiness.eligibleFindingIds.includes(issueId)) {
    throw new Error(`Selected finding was not packet-ready: ${readiness.reasonCodes.join(", ") || "no reason codes"}`);
  }

  const built = await api.json<PacketBuildResponse>(AUTH_WORKFLOW_ENDPOINTS.packetBuild, {
    method: "POST",
    body: packetInput,
  });
  console.log(`[auth-smoke] packet-build ${JSON.stringify({
    selectedIssueId: issueId,
    packetType: built.packet.packetType,
    buildSelectedIssueIds: built.packet.metadata?.selectedIssueIds ?? [],
    disputedIssueIds: built.packet.disputedItems?.map((item) => item.issueId ?? null) ?? [],
  })}`);
  if (built.packet.packetType !== "credit_bureau") {
    throw new Error(`Built packet type was ${built.packet.packetType}, expected credit_bureau.`);
  }
  if (!built.packet.metadata?.selectedIssueIds?.includes(issueId)) {
    throw new Error("Built packet metadata did not preserve selectedIssueIds.");
  }

  const created = await api.json<PacketCreateResponse>(AUTH_WORKFLOW_ENDPOINTS.packetCreate, {
    method: "POST",
    body: packetInput,
  });
  if (!created.success || !Number.isInteger(created.packetId)) {
    throw new Error("Packet create did not return success and packetId.");
  }
  console.log(`[auth-smoke] packet-created ${JSON.stringify({
    selectedIssueId: issueId,
    packetId: created.packetId,
    packetStatus: created.status,
  })}`);

  const pdfResponse = await api.raw(
    `${AUTH_WORKFLOW_ENDPOINTS.packetPdf}?packetId=${encodeURIComponent(String(created.packetId))}`,
  );
  const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
  const contentType = pdfResponse.headers.get("content-type") ?? "";
  const diagnostics: PacketPdfDiagnostics = {
    packetId: created.packetId,
    selectedIssueId: issueId,
    pdfStatus: pdfResponse.status,
    pdfContentType: contentType,
    pdfByteLength: pdfBytes.byteLength,
    pdfStartsWithPdf: pdfBytes.subarray(0, 4).toString("utf8") === "%PDF",
    responseSnippet: contentType.includes("application/pdf")
      ? undefined
      : pdfBytes.toString("utf8").slice(0, 500),
  };

  console.log(`[auth-smoke] packet-pdf ${JSON.stringify(diagnostics)}`);

  if (!pdfResponse.ok) {
    throw new Error(`Packet PDF retrieval failed: ${JSON.stringify({
      selectedIssueId: issueId,
      readiness,
      buildSelectedIssueIds: built.packet.metadata?.selectedIssueIds ?? [],
      packetId: created.packetId,
      packetStatus: created.status,
      pdf: diagnostics,
    })}`);
  }
  if (!contentType.includes("application/pdf")) {
    throw new Error(`Packet PDF content-type was invalid: ${JSON.stringify(diagnostics)}`);
  }
  if (pdfBytes.subarray(0, 4).toString("utf8") !== "%PDF") {
    throw new Error(`Packet PDF response did not start with %PDF: ${JSON.stringify(diagnostics)}`);
  }
  if (pdfBytes.byteLength < 1000) {
    throw new Error(`Packet PDF was unexpectedly small: ${JSON.stringify(diagnostics)}`);
  }

  return {
    packetId: created.packetId,
    packetStatus: created.status,
    selectedIssueId: issueId,
    buildSelectedIssueIds: built.packet.metadata?.selectedIssueIds ?? [],
    pdfStatus: pdfResponse.status,
    pdfContentType: contentType,
    pdfByteLength: pdfBytes.byteLength,
    pdfStartsWithPdf: true,
    readiness,
  };
}

async function cleanupSyntheticAccount(api: ApiClient, config: Extract<SmokeConfig, { status: "ready" }>) {
  const deleteBody = {
    confirmEmail: config.email,
    confirmPhrase: "DELETE MY ACCOUNT",
  };
  const currentSessionDelete = await api.request(AUTH_WORKFLOW_ENDPOINTS.deleteAccount, {
    method: "POST",
    body: deleteBody,
  });
  if (currentSessionDelete.ok) {
    const parsed = currentSessionDelete.json as DeleteAccountResponse | null;
    if (!parsed?.success) {
      throw new Error("Synthetic account self-delete did not return success=true.");
    }
    return {
      status: "deleted" as const,
      purgedCounts: parsed.purgedCounts ?? {},
    };
  }

  if (currentSessionDelete.status !== 401 && currentSessionDelete.status !== 403) {
    throw new Error(
      `Synthetic account self-delete returned HTTP ${currentSessionDelete.status}: ${extractErrorMessage(currentSessionDelete.raw)}`,
    );
  }

  await api.json(AUTH_WORKFLOW_ENDPOINTS.login, {
    method: "POST",
    body: {
      email: config.email,
      password: config.password,
    },
  });

  const result = await api.json<DeleteAccountResponse>(AUTH_WORKFLOW_ENDPOINTS.deleteAccount, {
    method: "POST",
    body: deleteBody,
  });
  if (!result.success) {
    throw new Error("Synthetic account self-delete did not return success=true.");
  }
  return {
    status: "deleted" as const,
    purgedCounts: result.purgedCounts ?? {},
  };
}

export async function runSmoke(config: Extract<SmokeConfig, { status: "ready" }>) {
  const api = new ApiClient(config.baseUrl, config.origin);
  const actors: SmokeActor[] = [];
  let registeredUserId: number | null = null;
  let cleanupStatus: { status: string; purgedCounts?: Record<string, number> } = { status: "not needed" };

  try {
    const user = await registerSyntheticUser(api, config);
    registeredUserId = user.id;
    actors.push({ label: "owner", api, config, userId: user.id, cleanupStatus });

    const session = await ensureLoginRoundTrip(api, config);
    await updateSyntheticProfile(api);

    const upload = await uploadSyntheticReport(api, config.runId);
    const artifact = await verifyArtifactOwnership(api, upload.artifactId, session.user.id);
    if (isCompletedIngestPhase2Response(upload.phase2)) {
      if (upload.phase2.tradelinesCount < 2) {
        throw new Error(`Ingest phase 2 returned ${upload.phase2.tradelinesCount} tradelines, expected at least 2.`);
      }
      if (upload.phase2.parserQuality?.requiresManualReview) {
        throw new Error("Synthetic parser result required manual review; expected packet-ready parser quality.");
      }
    }

    const parserReview = await reviewParserResults(api, upload.artifactId);
    const nonOwnerConfig = buildSecondarySmokeConfig(config);
    const nonOwnerApi = new ApiClient(config.baseUrl, config.origin);
    const nonOwnerUser = await registerSyntheticUser(nonOwnerApi, nonOwnerConfig);
    actors.push({
      label: "non-owner",
      api: nonOwnerApi,
      config: nonOwnerConfig,
      userId: nonOwnerUser.id,
      cleanupStatus: { status: "not needed" },
    });
    await ensureLoginRoundTrip(nonOwnerApi, nonOwnerConfig);
    await updateSyntheticProfile(nonOwnerApi);
    const nonOwnerDenial = await assertNonOwnerUploadResultsDenied(nonOwnerApi, upload.artifactId);

    const packetReview = config.includePacket
      ? await (async () => {
          const candidate = await selectPacketReadyFinding(api);
          const packet = await validateBuildCreateAndDownloadPacket(api, candidate.issueId);
          const nonOwnerPacketPdfDenial = await assertNonOwnerPacketPdfDenied(nonOwnerApi, packet.packetId);
          return { candidate, packet, nonOwnerPacketPdfDenial, skipped: false as const };
        })()
      : {
          candidate: null,
          packet: null,
          nonOwnerPacketPdfDenial: null,
          skipped: true as const,
          reason: "CRP_AUTH_WORKFLOW_SMOKE_INCLUDE_PACKET=true was not set.",
        };

    if (api.apiServerErrors.length > 0) {
      throw new Error(`API 5xx responses observed: ${api.apiServerErrors.join(", ")}.`);
    }

    if (config.cleanup) {
      for (const actor of [...actors].reverse()) {
        actor.cleanupStatus = await cleanupSyntheticAccount(actor.api, actor.config);
      }
      cleanupStatus = actors.find((actor) => actor.label === "owner")?.cleanupStatus ?? cleanupStatus;
    } else {
      for (const actor of actors) {
        actor.cleanupStatus = { status: "skipped by config" };
      }
      cleanupStatus = { status: "skipped by config" };
    }

    const completedPhase2 = isCompletedIngestPhase2Response(upload.phase2) ? upload.phase2 : null;
    return {
      status: "passed" as const,
      baseUrl: config.baseUrl,
      host: config.host,
      authMode: config.authMode,
      runId: config.runId,
      registeredUserId,
      sessionUserId: session.user.id,
      artifact: {
        artifactId: upload.artifactId,
        ownerUserId: artifact.userId ?? null,
        organizationId: artifact.organizationId ?? null,
        processingStatus: artifact.processingStatus ?? null,
        sha256Present: Boolean(artifact.sha256),
      },
      ingestStatus: {
        terminalStatus: upload.terminalStatus.status,
        queueStatus: upload.terminalStatus.queueStatus,
        processingStatus: upload.terminalStatus.processingStatus,
        jobId: upload.terminalStatus.jobId,
        diagnosticCode: upload.terminalStatus.diagnosticCode,
        pollCount: upload.statusPolls.length,
        polls: upload.statusPolls,
      },
      upload: {
        artifactId: upload.artifactId,
        processOutputMode: completedPhase2 ? "completed-inline-or-duplicate" : "queued-worker-boundary",
        tradelinesCount: completedPhase2 ? completedPhase2.tradelinesCount : parserReview.stats.totalTradelines,
        tradelineIdsCount: completedPhase2 ? completedPhase2.tradelineIds.length : null,
        parserConfidenceScore: completedPhase2 ? completedPhase2.parserQuality?.confidenceScore ?? null : null,
        parserRequiresManualReview: completedPhase2 ? completedPhase2.parserQuality?.requiresManualReview ?? false : null,
      },
      parserReview: {
        bureauName: parserReview.metadata.bureauName,
        region: parserReview.metadata.region,
        platformScope: parserReview.metadata.platformScope,
        totalTradelines: parserReview.stats.totalTradelines,
        actionableCount: parserReview.stats.actionableCount,
      },
      nonOwnerAccess: nonOwnerDenial,
      findingReview: {
        skipped: packetReview.skipped,
        reason: packetReview.skipped ? packetReview.reason : null,
        issueId: packetReview.candidate?.issueId ?? null,
        tradelineId: packetReview.candidate?.tradelineId ?? null,
        bureauName: packetReview.candidate?.bureauName ?? null,
        issueType: packetReview.candidate?.issueType ?? null,
      },
      packet: {
        skipped: packetReview.skipped,
        reason: packetReview.skipped ? packetReview.reason : null,
        packetId: packetReview.packet?.packetId ?? null,
        status: packetReview.packet?.packetStatus ?? null,
        selectedIssueId: packetReview.packet?.selectedIssueId ?? null,
        buildSelectedIssueIds: packetReview.packet?.buildSelectedIssueIds ?? [],
        pdfHttpStatus: packetReview.packet?.pdfStatus ?? null,
        pdfContentType: packetReview.packet?.pdfContentType ?? null,
        pdfByteLength: packetReview.packet?.pdfByteLength ?? null,
        pdfStartsWithPdf: packetReview.packet?.pdfStartsWithPdf ?? null,
        packetReady: packetReview.packet?.readiness.packetReady ?? null,
        eligibleFindingIds: packetReview.packet?.readiness.eligibleFindingIds ?? [],
        nonOwnerAccess: packetReview.nonOwnerPacketPdfDenial,
      },
      cleanupStatus,
      actorCleanup: actors.map((actor) => ({
        label: actor.label,
        userId: actor.userId,
        cleanupStatus: actor.cleanupStatus.status,
      })),
      safety: {
        productionHostRefusedByConfig: true,
        syntheticUserSelfDeleted: actors.every((actor) => actor.cleanupStatus.status === "deleted"),
        noAdminOverrideUsed: true,
        noRuntimeReferenceActivationUsed: true,
        noDirectFurnisherPacketUsed: true,
      },
    };
  } catch (error) {
    if (registeredUserId && config.cleanup) {
      for (const actor of [...actors].reverse()) {
        if (actor.cleanupStatus.status !== "not needed") continue;
        try {
          actor.cleanupStatus = await cleanupSyntheticAccount(actor.api, actor.config);
        } catch (cleanupError) {
          actor.cleanupStatus = {
            status: `cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
          };
        }
      }
      cleanupStatus = actors.find((actor) => actor.label === "owner")?.cleanupStatus ?? cleanupStatus;
    }
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} Registered user ID: ${
        registeredUserId ?? "none"
      }. Cleanup status: ${cleanupStatus.status}. Actor cleanup: ${actors
        .map((actor) => `${actor.label}:${actor.cleanupStatus.status}`)
        .join(", ") || "none"}.`,
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
