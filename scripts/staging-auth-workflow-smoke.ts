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

type SessionResponse =
  | {
      user: {
        id: number;
        email: string;
        displayName: string;
        role: string;
      };
    }
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
  phase2: IngestPhase2Response;
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

async function ensureLoginRoundTrip(api: ApiClient, config: Extract<SmokeConfig, { status: "ready" }>): Promise<SessionResponse> {
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

  const phase2 = await api.sse<IngestPhase2Response>(
    AUTH_WORKFLOW_ENDPOINTS.ingestProcess,
    { artifactId: phase1.artifactId },
  );
  const parsedStorageId = Number(phase2.storageUrl);

  return {
    phase1,
    phase2,
    artifactId: Number.isFinite(parsedStorageId) ? parsedStorageId : phase1.artifactId,
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
  if (!readiness.packetReady || !readiness.eligibleFindingIds.includes(issueId)) {
    throw new Error(`Selected finding was not packet-ready: ${readiness.reasonCodes.join(", ") || "no reason codes"}`);
  }

  const built = await api.json<PacketBuildResponse>(AUTH_WORKFLOW_ENDPOINTS.packetBuild, {
    method: "POST",
    body: packetInput,
  });
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

  const pdfResponse = await api.raw(
    `${AUTH_WORKFLOW_ENDPOINTS.packetPdf}?packetId=${encodeURIComponent(String(created.packetId))}`,
  );
  const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
  const contentType = pdfResponse.headers.get("content-type") ?? "";
  if (!pdfResponse.ok) {
    throw new Error(`Packet PDF returned HTTP ${pdfResponse.status}: ${pdfBytes.toString("utf8")}`);
  }
  if (!contentType.includes("application/pdf")) {
    throw new Error(`Packet PDF content-type was ${contentType || "missing"}, expected application/pdf.`);
  }
  if (pdfBytes.subarray(0, 4).toString("utf8") !== "%PDF") {
    throw new Error("Packet PDF response did not start with %PDF.");
  }
  if (pdfBytes.byteLength < 1000) {
    throw new Error(`Packet PDF was unexpectedly small: ${pdfBytes.byteLength} bytes.`);
  }

  return {
    packetId: created.packetId,
    packetStatus: created.status,
    pdfByteLength: pdfBytes.byteLength,
    readiness,
  };
}

async function cleanupSyntheticAccount(api: ApiClient, config: Extract<SmokeConfig, { status: "ready" }>) {
  let session = await api.request(AUTH_WORKFLOW_ENDPOINTS.session);
  const authenticated =
    session.ok &&
    session.json &&
    typeof session.json === "object" &&
    "user" in (session.json as Record<string, unknown>);

  if (!authenticated) {
    await api.json(AUTH_WORKFLOW_ENDPOINTS.login, {
      method: "POST",
      body: {
        email: config.email,
        password: config.password,
      },
    });
    session = await api.request(AUTH_WORKFLOW_ENDPOINTS.session);
    if (!session.ok) {
      throw new Error(`Could not restore synthetic user session for cleanup; session HTTP ${session.status}.`);
    }
  }

  const result = await api.json<DeleteAccountResponse>(AUTH_WORKFLOW_ENDPOINTS.deleteAccount, {
    method: "POST",
    body: {
      confirmEmail: config.email,
      confirmPhrase: "DELETE MY ACCOUNT",
    },
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
  let registeredUserId: number | null = null;
  let cleanupStatus: { status: string; purgedCounts?: Record<string, number> } = { status: "not needed" };

  try {
    const user = await registerSyntheticUser(api, config);
    registeredUserId = user.id;

    const session = await ensureLoginRoundTrip(api, config);
    await updateSyntheticProfile(api);

    const upload = await uploadSyntheticReport(api, config.runId);
    if (upload.phase2.tradelinesCount < 2) {
      throw new Error(`Ingest phase 2 returned ${upload.phase2.tradelinesCount} tradelines, expected at least 2.`);
    }
    if (upload.phase2.parserQuality?.requiresManualReview) {
      throw new Error("Synthetic parser result required manual review; expected packet-ready parser quality.");
    }

    const parserReview = await reviewParserResults(api, upload.artifactId);
    const candidate = await selectPacketReadyFinding(api);
    const packet = await validateBuildCreateAndDownloadPacket(api, candidate.issueId);

    if (api.apiServerErrors.length > 0) {
      throw new Error(`API 5xx responses observed: ${api.apiServerErrors.join(", ")}.`);
    }

    if (config.cleanup) {
      cleanupStatus = await cleanupSyntheticAccount(api, config);
    } else {
      cleanupStatus = { status: "skipped by config" };
    }

    return {
      status: "passed" as const,
      baseUrl: config.baseUrl,
      host: config.host,
      authMode: config.authMode,
      runId: config.runId,
      registeredUserId,
      sessionUserId: "error" in session ? null : session.user.id,
      upload: {
        artifactId: upload.artifactId,
        tradelinesCount: upload.phase2.tradelinesCount,
        tradelineIdsCount: upload.phase2.tradelineIds.length,
        parserConfidenceScore: upload.phase2.parserQuality?.confidenceScore ?? null,
        parserRequiresManualReview: upload.phase2.parserQuality?.requiresManualReview ?? false,
      },
      parserReview: {
        bureauName: parserReview.metadata.bureauName,
        region: parserReview.metadata.region,
        platformScope: parserReview.metadata.platformScope,
        totalTradelines: parserReview.stats.totalTradelines,
        actionableCount: parserReview.stats.actionableCount,
      },
      findingReview: {
        issueId: candidate.issueId,
        tradelineId: candidate.tradelineId,
        bureauName: candidate.bureauName,
        issueType: candidate.issueType,
      },
      packet: {
        packetId: packet.packetId,
        status: packet.packetStatus,
        pdfByteLength: packet.pdfByteLength,
        packetReady: packet.readiness.packetReady,
        eligibleFindingIds: packet.readiness.eligibleFindingIds,
      },
      cleanupStatus,
      safety: {
        productionHostRefusedByConfig: true,
        syntheticUserSelfDeleted: cleanupStatus.status === "deleted",
        noAdminOverrideUsed: true,
        noRuntimeReferenceActivationUsed: true,
        noDirectFurnisherPacketUsed: true,
      },
    };
  } catch (error) {
    if (registeredUserId && config.cleanup && cleanupStatus.status === "not needed") {
      try {
        cleanupStatus = await cleanupSyntheticAccount(api, config);
      } catch (cleanupError) {
        cleanupStatus = {
          status: `cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        };
      }
    }
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} Registered user ID: ${
        registeredUserId ?? "none"
      }. Cleanup status: ${cleanupStatus.status}.`,
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
