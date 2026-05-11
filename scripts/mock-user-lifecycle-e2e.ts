import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

type CliOptions = {
  baseUrl: string;
  origin: string;
  initialReportPath: string;
  followupReportPath: string;
  simulateDayGapDays: number;
  packetCount: number;
  email: string;
  password: string;
  displayName: string;
  legalNameSignature: string;
  outputDir: string;
  strict: boolean;
  useDbAssist: boolean;
  allowUncleanRun: boolean;
};

type CoverageStatus = "PASSED" | "FAILED" | "BLOCKED" | "SKIPPED";

type CoverageEntry = {
  status: CoverageStatus;
  label: string;
  details: string;
  evidence?: unknown;
};

type StepLog = {
  name: string;
  status: "PASSED" | "FAILED" | "BLOCKED";
  details: string;
  startedAt: string;
  completedAt: string;
};

type AnonymousPreviewResponse = {
  problemCount: number;
  sampleProblems: Array<{
    type: string;
    title: string;
    detail: string;
    solution: string;
    urgency: string;
  }>;
};

type RegisterResponse = {
  user: {
    id: number;
    email: string;
    displayName: string;
    role?: string;
  };
};

type LoginResponse = {
  user: {
    id: number;
    email: string;
    displayName: string;
    role: string;
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

type ConsumerInfoComparison = {
  extractedInfo: {
    fullName: string | null;
    addressLine1: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
    dateOfBirth: string | null;
    phone: string | null;
  };
};

type IngestPhase2Response = {
  ok: boolean;
  storageUrl: string;
  tradelinesCount: number;
  tradelineIds: number[];
  profileFieldsPopulated: string[];
  consumerInfoComparison?: ConsumerInfoComparison;
};

type UploadResultsResponse = {
  metadata: {
    fileName: string;
    uploadDate: string;
    region: string;
    bureauName: string;
    platformScope: string;
  };
  stats: {
    totalTradelines: number;
    highSeverity: number;
    mediumSeverity: number;
    lowSeverity: number;
    actionableCount: number;
    threatScore: number;
  };
  crossReference?: {
    previousArtifactId: number;
    previousFileName: string;
    previousUploadDate: string;
    matched: Array<{
      tradelineId: number;
      creditorName: string;
      changes: Array<{
        field: string;
        oldValue: string | null;
        newValue: string | null;
      }>;
      disputeActivity?: Array<{
        packetId: number;
        packetType: string | null;
        sentDate: string | null;
        status: string | null;
      }>;
    }>;
    added: Array<{ tradelineId: number; creditorName: string }>;
    removed: Array<{ tradelineId: number; creditorName: string }>;
  };
  disputeOutcomeSummary?: {
    removedAfterDispute: number;
    unchangedAfterDispute: number;
    changedAfterDispute: number;
    removedUnexplained: number;
    totalDisputesSent: number;
  };
};

type UserProfile = {
  fullName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  dateOfBirth: string | null;
  phone: string | null;
  email: string;
};

type PacketRecommendResponse = {
  recommendations: Array<{
    tradelineId: number;
    tradelineName: string;
    bureauId: number | null;
    bureauName: string | null;
    violationId: number;
    violationCategory: string;
    suggestedReasonCode: string;
    score: number;
  }>;
  hasViolations: boolean;
};

type TradelineListResponse = {
  tradelines: Array<{
    id: number;
    bureauId: number | null;
    accountNumber: string | null;
    creditorName: string | null;
    violationCount: number;
  }>;
};

type PacketCreateResponse = {
  packet: {
    id: number | null;
    tradelineId: number | null;
    bureauId: number | null;
    status: string | null;
    processingStatus?: string | null;
    pdfStorageUrl?: string | null;
    content?: string | null;
  };
};

type PacketListResponse = {
  packets: Array<{
    id: number;
    tradelineId: number | null;
    status: string | null;
    processingStatus: string;
  }>;
};

type PacketDeliveryResponse = {
  success: boolean;
  packetId: number;
  message: string;
  obligationInstanceId?: number;
  deadlineEventId?: number;
  deadlineWarning?: string;
};

type ObligationListResponse = {
  instances: Array<{
    id: number;
    tradelineId: number;
    state: string;
    disputeVector: string | null;
    responseDeadline: string | null;
  }>;
  total: number;
};

type RecordResponseOutput = {
  success: boolean;
  obligationInstance: {
    id: number;
    state: string;
    responseStatus: string | null;
    responseReceivedDate: string | null;
  };
  analysisResult?: {
    recommendedPath: string;
    deficiencies: string[];
    nextVector: string | null;
  } | null;
};

type DetectChangesResponse = {
  changes: Array<unknown>;
  obligationsUnlocked: number;
  summary: string;
};

type TimelineResponse = {
  timeline: Array<{
    type: string;
  }>;
};

type EvidenceCreateResponse = {
  event: {
    id: number;
    packetId: number | null;
    eventType: string;
  };
};

type BureauCommunicationResponse = {
  evidenceEvent: {
    id: number;
    eventType: string;
  };
  evidenceAttachment: {
    id: number;
    fileName: string;
  };
  updatedObligationInstance: {
    id: number;
    state: string;
  } | null;
  fileHash: string;
};

type EvidenceAttachmentUploadResponse = {
  attachment: {
    id: number;
    fileName: string;
    packetId: number | null;
  };
};

type EvidenceAttachmentListItem = {
  id: number;
  fileName: string;
  packetId: number | null;
  obligationInstanceId: number | null;
};

type SupportTicketCreateResponse = {
  ticket: {
    id: number;
    status: string;
    subject: string;
  };
};

type SupportTicketListResponse = {
  tickets: Array<{
    id: number;
    subject: string;
    status: string;
  }>;
  total: number;
};

type SupportTicketGetResponse = {
  ticket: {
    id: number;
    subject: string;
    status: string;
    userId: number;
  };
  messages: Array<{
    id: number;
    message: string;
    senderRole: string;
  }>;
};

type SupportTicketReplyResponse = {
  message: {
    id: number;
    ticketId: number;
    senderRole: string;
  };
};

type SubscriptionStatusResponse = {
  plan: string;
  status: string;
  stripeSubscriptionId?: string | null;
};

type ReportArtifactListResponse = {
  artifacts: Array<{
    id: number;
    processingStatus: string;
  }>;
  total: number;
};

type FixtureData = {
  filePath: string;
  fileName: string;
  bytesBase64: string;
  mimeType: string;
};

type UploadRunResult = {
  phase1: IngestPhase1Response;
  phase2: IngestPhase2Response;
  artifactId: number;
};

type PacketCandidate = {
  tradelineId: number;
  bureauId: number | null;
  violationId?: number;
  violationCategory?: string;
  disputeReasonCode?: string;
};

type OptionalDbAssist = {
  enabled: boolean;
  available: boolean;
  error?: string;
  fetchLatestEmailVerificationToken: (userId: number) => Promise<string | null>;
  fetchLatestPasswordResetToken: (userId: number) => Promise<string | null>;
  seedAdminDeletionRegressionData: (
    userId: number,
    runId: string
  ) => Promise<AdminDeletionRegressionSeed | null>;
  fetchAdminDeletionCleanupState: (
    userId: number,
    seed: AdminDeletionRegressionSeed | null
  ) => Promise<AdminDeletionCleanupState | null>;
  cleanupAdminDeletionRegressionData: (seed: AdminDeletionRegressionSeed | null) => Promise<void>;
  close: () => Promise<void>;
};

type HttpResult = {
  ok: boolean;
  status: number;
  raw: string;
  json: unknown | null;
};

type AdminDeleteUserResponse = {
  success: boolean;
  deletedEmail: string;
  purgedCounts: Record<string, number>;
};

type AdminDeletionRegressionSeed = {
  adminUserId: number | null;
  marker: string;
  supportTicketId: number | null;
  supportTicketMessageId: number | null;
  consumerSignatureId: number | null;
  evidenceAttachmentId: number | null;
  complianceConfigId: number | null;
  complianceConfigCategory: string | null;
  systemSettingsKey: string | null;
  parserKnownEntityId: number | null;
  parserFieldMappingId: number | null;
  parserBureauDetectionConfigId: number | null;
  parserMappingVersionId: number | null;
  parserTestCaseId: number | null;
  softwareVersionId: number | null;
  warnings: string[];
};

type AdminDeletionCleanupState = {
  remainingUserRows: number;
  remainingSessions: number;
  remainingUserPasswords: number;
  remainingUserAccounts: number;
  remainingSubscriptions: number;
  remainingReportArtifacts: number;
  remainingTradelines: number;
  remainingPackets: number;
  remainingSupportTicketsOwnedByUser: number;
  remainingSupportMessagesFromUser: number;
  supportTicketAssignedAgentId: number | null | undefined;
  supportTicketMessageExists: boolean | null;
  consumerSignatureVerifiedBy: number | null | undefined;
  evidenceAttachmentUploadedBy: number | null | undefined;
  complianceConfigUpdatedByUserId: number | null | undefined;
  systemSettingsUpdatedByUserId: number | null | undefined;
  parserKnownEntityCreatedBy: number | null | undefined;
  parserFieldMappingCreatedBy: number | null | undefined;
  parserBureauDetectionConfigCreatedBy: number | null | undefined;
  parserMappingVersionChangedBy: number | null | undefined;
  parserTestCaseCreatedBy: number | null | undefined;
  softwareVersionCreatedBy: number | null | undefined;
  warnings: string[];
};

const PLATFORM_SCOPE_EXPECTATION = "Canadian Credit Bureau Compliance";
const PLATFORM_REGION_EXPECTATION = "CA";
const SAMPLE_TEXT_BASE64 = Buffer.from("Mock evidence attachment content", "utf8").toString("base64");
const SAMPLE_PDF_BASE64 = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF", "utf8").toString("base64");

const COVERAGE_LABELS: Record<string, string> = {
  anonymous_preview: "Anonymous preview upload",
  auth_register: "User registration",
  auth_session_get: "Session retrieval",
  auth_verify_email_request: "Verification email request",
  auth_verify_email_confirm: "Email verification confirmation",
  auth_logout: "Logout",
  auth_login: "Login",
  auth_password_reset_request: "Password reset request",
  auth_password_reset_confirm: "Password reset confirmation",
  profile_get: "User profile fetch",
  profile_update: "User profile update",
  upload_initial: "Initial authenticated report upload",
  upload_initial_results: "Initial upload results retrieval",
  packet_recommend: "Packet recommendation",
  packet_preview_create: "Packet preview generation",
  packet_create_draft: "Packet draft creation",
  packet_duplicate_prevention: "Packet duplicate draft prevention",
  packet_update_status: "Packet status update",
  packet_delivery: "Packet delivery recording",
  obligation_list: "Obligation listing",
  obligation_record_response: "Obligation response recording",
  escalation_trigger: "Escalation trigger",
  escalation_exhaustion: "Procedural exhaustion",
  evidence_event_create: "Evidence event creation",
  evidence_bureau_communication: "Bureau communication upload",
  evidence_attachment_upload: "Evidence attachment upload",
  evidence_attachment_list: "Evidence attachment list",
  evidence_package: "Evidence package generation",
  support_ticket_create: "Support ticket creation",
  support_ticket_list: "Support ticket list",
  support_ticket_get: "Support ticket detail",
  support_ticket_reply: "Support ticket reply",
  subscription_status: "Subscription status",
  subscription_create_checkout: "Subscription checkout create",
  subscription_update_plan: "Subscription plan update",
  subscription_cancel: "Subscription cancel",
  subscription_confirm_payment: "Subscription payment confirmation",
  upload_followup: "Follow-up upload",
  upload_followup_results: "Follow-up upload results retrieval",
  change_detection: "Tradeline change detection",
  change_timeline: "Tradeline timeline retrieval",
  report_artifact_list: "Report artifact listing",
  packet_list: "Packet listing",
  packet_delete: "Packet delete",
  packet_save: "Packet save",
  admin_delete_user: "Admin user deletion cascade",
};

class ApiClient {
  private cookies = new Map<string, string>();

  constructor(
    private readonly baseUrl: string,
    private readonly origin: string,
    initialCookieHeader?: string
  ) {
    if (initialCookieHeader) {
      this.loadCookieHeader(initialCookieHeader);
    }
  }

  async json<T>(pathSuffix: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const response = await this.raw(pathSuffix, init);
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${pathSuffix}: ${extractErrorMessage(raw)}`);
    }

    if (!raw.trim()) {
      return {} as T;
    }

    return JSON.parse(raw) as T;
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
    return response;
  }

  async sse<T>(
    pathSuffix: string,
    body: unknown,
    onProgress?: (stage: string, percent: number, message?: string) => void
  ): Promise<T> {
    const response = await this.raw(pathSuffix, { method: "POST", body });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`HTTP ${response.status} ${pathSuffix}: ${extractErrorMessage(raw)}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/event-stream")) {
      const raw = await response.text();
      return JSON.parse(raw) as T;
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
      Referer: `${this.origin}/`,
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

    if (cookieHeaders.length === 0) return;

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

  private loadCookieHeader(cookieHeader: string): void {
    for (const part of cookieHeader.split(";")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) continue;
      const name = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      if (!name || !value) continue;
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseArgs(argv: string[]): CliOptions {
  const defaultRunId = Date.now().toString(36);
  const defaultStagingUrl = process.env.STAGING_APP_URL || "https://staging.creditregulatorpro.com";
  const options: Partial<CliOptions> = {
    baseUrl: defaultStagingUrl,
    origin: defaultStagingUrl,
    simulateDayGapDays: 30,
    packetCount: 2,
    password: "MockUser123A",
    displayName: "Mock Lifecycle User",
    legalNameSignature: "Mock Lifecycle User",
    email: `mock.lifecycle.${defaultRunId}@example.com`,
    outputDir: ".local/test-runs",
    strict: false,
    useDbAssist: true,
    allowUncleanRun: false,
  };

  const positional: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    if (token === "--help" || token === "-h") {
      printHelpAndExit(0);
    }

    if (token === "--strict") {
      options.strict = true;
      continue;
    }

    if (token === "--no-db-assist") {
      options.useDbAssist = false;
      continue;
    }

    if (token === "--allow-unclean-run") {
      options.allowUncleanRun = true;
      continue;
    }

    const next = argv[i + 1];
    if (!next) {
      throw new Error(`Missing value for argument ${token}`);
    }

    switch (token) {
      case "--base-url":
        options.baseUrl = next;
        break;
      case "--origin":
        options.origin = next;
        break;
      case "--initial-report":
        options.initialReportPath = next;
        break;
      case "--followup-report":
        options.followupReportPath = next;
        break;
      case "--simulate-days":
        options.simulateDayGapDays = Number(next);
        break;
      case "--packet-count":
        options.packetCount = Number(next);
        break;
      case "--email":
        options.email = next;
        break;
      case "--password":
        options.password = next;
        break;
      case "--display-name":
        options.displayName = next;
        break;
      case "--legal-name-signature":
        options.legalNameSignature = next;
        break;
      case "--output-dir":
        options.outputDir = next;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }

    i += 1;
  }

  if (!options.initialReportPath && positional[0]) {
    options.initialReportPath = positional[0];
  }
  if (!options.followupReportPath && positional[1]) {
    options.followupReportPath = positional[1];
  }
  if (!options.followupReportPath && options.initialReportPath) {
    options.followupReportPath = options.initialReportPath;
  }

  if (!options.initialReportPath) {
    throw new Error("You must provide --initial-report <path> (or first positional argument).");
  }
  if (!options.followupReportPath) {
    throw new Error("You must provide --followup-report <path> (or second positional argument).");
  }
  if (!options.packetCount || options.packetCount < 1) {
    throw new Error("--packet-count must be a positive integer.");
  }
  if (Number.isNaN(options.simulateDayGapDays)) {
    throw new Error("--simulate-days must be a number.");
  }

  return options as CliOptions;
}

function printHelpAndExit(code: number): never {
  console.log(`
Usage:
  pnpm exec tsx scripts/mock-user-lifecycle-e2e.ts --initial-report <file> --followup-report <file> [options]

Options:
  --base-url <url>                 API base URL (default: https://staging.creditregulatorpro.com or STAGING_APP_URL)
  --origin <origin>                Origin header for requests (default: same as --base-url)
  --initial-report <path>          First uploaded credit report (required)
  --followup-report <path>         Follow-up credit report for 30-day cycle (defaults to first file)
  --simulate-days <n>              Simulated day gap noted in analysis (default: 30)
  --packet-count <n>               Number of dispute packets to create (default: 2)
  --email <email>                  Mock user email (default: generated)
  --password <password>            Mock user password (default: MockUser123A)
  --display-name <name>            Mock user display name
  --legal-name-signature <name>    Signature text used on registration
  --output-dir <dir>               Output directory for JSON and Markdown reports
  --strict                         Exit non-zero when any coverage item is FAILED or BLOCKED
  --no-db-assist                   Disable direct DB assist for token retrieval flows
  --allow-unclean-run              Allow running without admin cleanup access; may leave a test user behind
`);
  process.exit(code);
}

function assertAdminCleanupPreflight(options: CliOptions): void {
  if (options.allowUncleanRun) {
    return;
  }

  if (process.env.CRP_LIFECYCLE_ADMIN_COOKIE?.trim()) {
    return;
  }

  throw new Error(
    "Refusing to run mock lifecycle without admin cleanup access. The suite creates a test user and must be able to delete it. Run through /admin-mock-lifecycle, set CRP_LIFECYCLE_ADMIN_COOKIE, or pass --allow-unclean-run only for a throwaway local database."
  );
}

async function readFixture(filePath: string): Promise<FixtureData> {
  const absolutePath = path.resolve(filePath);
  const bytes = await readFile(absolutePath);
  const extension = path.extname(absolutePath).toLowerCase();
  if (extension !== ".pdf") {
    throw new Error(`Fixture must be a PDF: ${absolutePath}`);
  }

  return {
    filePath: absolutePath,
    fileName: path.basename(absolutePath),
    bytesBase64: bytes.toString("base64"),
    mimeType: "application/pdf",
  };
}

async function uploadAuthenticatedReport(
  api: ApiClient,
  fixture: FixtureData,
  label: string
): Promise<UploadRunResult> {
  const phase1 = await api.json<IngestPhase1Response>("/_api/ingest/report", {
    method: "POST",
    body: {
      region: "CA",
      fileName: fixture.fileName,
      mimeType: fixture.mimeType,
      bytesBase64: fixture.bytesBase64,
    },
  });

  if (phase1.extractionStatus === "failed") {
    throw new Error(`${label} upload failed in phase 1: ${phase1.error ?? "unknown error"}`);
  }

  const phase2 = await api.sse<IngestPhase2Response>(
    "/_api/ingest/process",
    { artifactId: phase1.artifactId },
    (stage, percent) => {
      if (percent % 25 === 0 || stage === "complete") {
        console.log(`[${label}] ${stage} ${percent}%`);
      }
    }
  );

  const parsedStorageId = Number(phase2.storageUrl);
  const artifactId = Number.isFinite(parsedStorageId) ? parsedStorageId : phase1.artifactId;

  return {
    phase1,
    phase2,
    artifactId,
  };
}

function hasRequiredProfileFields(profile: UserProfile): boolean {
  return Boolean(
    profile.fullName &&
      profile.addressLine1 &&
      profile.city &&
      profile.province &&
      profile.postalCode
  );
}

function buildProfilePatch(
  profile: UserProfile,
  extracted: ConsumerInfoComparison["extractedInfo"] | null | undefined,
  fallbackName: string
) {
  return {
    fullName: profile.fullName ?? extracted?.fullName ?? fallbackName,
    addressLine1: profile.addressLine1 ?? extracted?.addressLine1 ?? "100 Test Street",
    addressLine2: profile.addressLine2 ?? null,
    city: profile.city ?? extracted?.city ?? "Halifax",
    province: profile.province ?? extracted?.province ?? "NS",
    postalCode: profile.postalCode ?? extracted?.postalCode ?? "B3H 1A1",
    dateOfBirth: profile.dateOfBirth ?? extracted?.dateOfBirth ?? null,
    phone: profile.phone ?? extracted?.phone ?? null,
  };
}

function ensureScopeExpectation(label: string, uploadResults: UploadResultsResponse): void {
  const region = uploadResults.metadata.region;
  const scope = uploadResults.metadata.platformScope;
  if (region !== PLATFORM_REGION_EXPECTATION) {
    throw new Error(`${label} scope check failed: metadata.region=${region}`);
  }
  if (scope !== PLATFORM_SCOPE_EXPECTATION) {
    throw new Error(`${label} scope check failed: metadata.platformScope=${scope}`);
  }
}

function buildPacketCandidates(
  recommendations: PacketRecommendResponse["recommendations"],
  tradelines: TradelineListResponse["tradelines"],
  packetCount: number
): PacketCandidate[] {
  const byTradelineId = new Map(tradelines.map((item) => [item.id, item]));
  const candidates: PacketCandidate[] = [];

  for (const recommendation of recommendations) {
    if (candidates.length >= packetCount) break;
    const tradeline = byTradelineId.get(recommendation.tradelineId);
    candidates.push({
      tradelineId: recommendation.tradelineId,
      bureauId: recommendation.bureauId ?? tradeline?.bureauId ?? null,
      violationId: recommendation.violationId,
      violationCategory: recommendation.violationCategory,
      disputeReasonCode: recommendation.suggestedReasonCode,
    });
  }

  if (candidates.length > 0) {
    return candidates;
  }

  const fallback = [...tradelines].sort((a, b) => b.violationCount - a.violationCount)[0];
  if (!fallback) {
    return [];
  }

  return [
    {
      tradelineId: fallback.id,
      bureauId: fallback.bureauId,
    },
  ];
}

function summarizeTimelineTypes(timeline: TimelineResponse["timeline"]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of timeline) {
    counts[item.type] = (counts[item.type] ?? 0) + 1;
  }
  return counts;
}

function renderMarkdownReport(report: Record<string, unknown>): string {
  const header = [
    "# Mock User Lifecycle E2E Full Suite Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
  ];

  return `${header.join("\n")}\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`;
}

function isBlockedMessage(message: string): boolean {
  const blockedSignals = [
    "trial setup mode",
    "upgrades are not yet available",
    "do not have a paid subscription",
    "stripe",
    "payment_intent",
    "sendgrid",
    "credential",
    "gcs",
    "bucket",
    "not configured",
  ];

  const lower = message.toLowerCase();
  return blockedSignals.some((signal) => lower.includes(signal));
}

function matchesAny(message: string, patterns: string[]): boolean {
  const lower = message.toLowerCase();
  return patterns.some((pattern) => lower.includes(pattern.toLowerCase()));
}

function toIsoNow() {
  return new Date().toISOString();
}

function isOptionalDbSchemaError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (((error as { code?: unknown }).code === "42P01") ||
      ((error as { code?: unknown }).code === "42703"))
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

async function optionalDbStep<T>(
  warnings: string[],
  stepName: string,
  fallback: T,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!isOptionalDbSchemaError(error) && !isUniqueViolation(error)) {
      throw error;
    }
    warnings.push(`${stepName} skipped: ${getErrorMessage(error)}`);
    return fallback;
  }
}

function numericCount(row: Record<string, unknown> | undefined): number {
  return Number(row?.count ?? 0);
}

async function countRowsBy(db: any, table: string, column: string, value: unknown): Promise<number> {
  const row = await db
    .selectFrom(table)
    .select(({ fn }: any) => fn.countAll().as("count"))
    .where(column, "=", value)
    .executeTakeFirst();
  return numericCount(row);
}

async function seedAdminDeletionRegressionData(
  db: any,
  userId: number,
  runId: string
): Promise<AdminDeletionRegressionSeed> {
  const marker = `lifecycle-delete-${runId}-${userId}`;
  const warnings: string[] = [];
  const adminRow = await db
    .selectFrom("users")
    .select("id")
    .where("role", "=", "admin")
    .orderBy("id", "asc")
    .limit(1)
    .executeTakeFirst();
  const adminUserId = adminRow?.id ? Number(adminRow.id) : null;

  const seed: AdminDeletionRegressionSeed = {
    adminUserId,
    marker,
    supportTicketId: null,
    supportTicketMessageId: null,
    consumerSignatureId: null,
    evidenceAttachmentId: null,
    complianceConfigId: null,
    complianceConfigCategory: null,
    systemSettingsKey: null,
    parserKnownEntityId: null,
    parserFieldMappingId: null,
    parserBureauDetectionConfigId: null,
    parserMappingVersionId: null,
    parserTestCaseId: null,
    softwareVersionId: null,
    warnings,
  };

  if (!adminUserId) {
    warnings.push("No admin user found for survivor-row ownership; seeded admin-owned FK cases were skipped.");
    return seed;
  }

  const supportTicket = await optionalDbStep(warnings, "support ticket survivor seed", null, async () =>
    db
      .insertInto("supportTicket")
      .values({
        userId: adminUserId,
        assignedAgentId: userId,
        subject: `Lifecycle delete regression ${marker}`,
        description: "Admin-owned ticket assigned to the soon-to-be-deleted user.",
        category: "DISPUTE_HELP",
        priority: "MEDIUM",
        status: "OPEN",
        region: "CA",
      })
      .returning("id")
      .executeTakeFirst()
  );
  seed.supportTicketId = supportTicket?.id ? Number(supportTicket.id) : null;

  if (seed.supportTicketId) {
    const supportMessage = await optionalDbStep(warnings, "support message sender cleanup seed", null, async () =>
      db
        .insertInto("supportTicketMessage")
        .values({
          ticketId: seed.supportTicketId,
          senderId: userId,
          senderRole: "user",
          message: `Lifecycle delete regression message ${marker}`,
          isInternalNote: false,
        })
        .returning("id")
        .executeTakeFirst()
    );
    seed.supportTicketMessageId = supportMessage?.id ? Number(supportMessage.id) : null;
  }

  const consumerSignature = await optionalDbStep(warnings, "consumer signature verifier seed", null, async () =>
    db
      .insertInto("consumerSignature")
      .values({
        userId: adminUserId,
        signatureType: "document_signing",
        signatureData: `typed:${marker}`,
        isVerified: true,
        verifiedAt: new Date(),
        verifiedBy: userId,
        metadata: { marker },
      })
      .returning("id")
      .executeTakeFirst()
  );
  seed.consumerSignatureId = consumerSignature?.id ? Number(consumerSignature.id) : null;

  const evidenceAttachment = await optionalDbStep(warnings, "evidence attachment uploader seed", null, async () =>
    db
      .insertInto("evidenceAttachment")
      .values({
        fileName: `${marker}.txt`,
        fileType: "text/plain",
        fileSizeBytes: SAMPLE_TEXT_BASE64.length,
        storageUrl: `memory://${marker}`,
        description: "Unattached evidence row used to verify uploaded_by nullification.",
        uploadedBy: userId,
        region: "CA",
      })
      .returning("id")
      .executeTakeFirst()
  );
  seed.evidenceAttachmentId = evidenceAttachment?.id ? Number(evidenceAttachment.id) : null;

  const complianceCategory = "ZOMBIE_DEBT_RESURRECTION";
  const complianceConfig = await optionalDbStep(warnings, "compliance config updater seed", null, async () =>
    db
      .insertInto("complianceConfig")
      .values({
        violationCategory: complianceCategory,
        enabled: true,
        confidenceThreshold: 75,
        userExplanationTemplate: `Lifecycle delete regression ${marker}`,
        recommendedActionTemplate: "Verify admin delete-user nullifies updated_by_user_id.",
        updatedByUserId: userId,
      })
      .returning("id")
      .executeTakeFirst()
  );
  seed.complianceConfigId = complianceConfig?.id ? Number(complianceConfig.id) : null;
  seed.complianceConfigCategory = seed.complianceConfigId ? complianceCategory : null;

  const systemSettingsKey = `lifecycle_delete_regression_${runId}_${userId}`;
  const systemSetting = await optionalDbStep(warnings, "system settings updater seed", null, async () =>
    db
      .insertInto("systemSettings")
      .values({
        key: systemSettingsKey,
        value: marker,
        description: "Temporary lifecycle delete regression row.",
        updatedByUserId: userId,
      })
      .returning("key")
      .executeTakeFirst()
  );
  seed.systemSettingsKey = systemSetting?.key ? systemSettingsKey : null;

  const parserKnownEntity = await optionalDbStep(warnings, "parser known entity creator seed", null, async () =>
    db
      .insertInto("parserKnownEntity")
      .values({
        entityType: "creditor_name",
        value: marker,
        description: "Lifecycle delete regression row.",
        createdBy: userId,
      })
      .returning("id")
      .executeTakeFirst()
  );
  seed.parserKnownEntityId = parserKnownEntity?.id ? Number(parserKnownEntity.id) : null;

  const parserFieldMapping = await optionalDbStep(warnings, "parser field mapping creator seed", null, async () =>
    db
      .insertInto("parserFieldMapping")
      .values({
        bureau: "Regression Bureau",
        section: "accounts",
        sourcePath: `$.${marker}`,
        targetField: "accountNumber",
        description: "Lifecycle delete regression row.",
        transformType: "identity",
        transformConfig: { marker },
        priority: 9999,
        isActive: false,
        createdBy: userId,
      })
      .returning("id")
      .executeTakeFirst()
  );
  seed.parserFieldMappingId = parserFieldMapping?.id ? Number(parserFieldMapping.id) : null;

  const parserBureauConfig = await optionalDbStep(warnings, "parser bureau config creator seed", null, async () =>
    db
      .insertInto("parserBureauDetectionConfig")
      .values({
        bureau: "Regression Bureau",
        marker,
        weight: 1,
        isActive: false,
        createdBy: userId,
      })
      .returning("id")
      .executeTakeFirst()
  );
  seed.parserBureauDetectionConfigId = parserBureauConfig?.id ? Number(parserBureauConfig.id) : null;

  const parserMappingVersion = await optionalDbStep(warnings, "parser mapping version changer seed", null, async () =>
    db
      .insertInto("parserMappingVersion")
      .values({
        mappingId: seed.parserFieldMappingId,
        versionNumber: 1,
        changeType: "lifecycle_delete_regression",
        previousState: null,
        newState: { marker },
        notes: "Lifecycle delete regression row.",
        changedBy: userId,
      })
      .returning("id")
      .executeTakeFirst()
  );
  seed.parserMappingVersionId = parserMappingVersion?.id ? Number(parserMappingVersion.id) : null;

  const parserTestCase = await optionalDbStep(warnings, "parser test case reassign seed", null, async () =>
    db
      .insertInto("parserTestCase")
      .values({
        name: `Lifecycle delete regression ${marker}`,
        description: "Verifies delete-user reassigns not-null parser test ownership.",
        pdfBase64: SAMPLE_PDF_BASE64,
        rawExtractedText: "Lifecycle delete regression fixture.",
        expectedConsumerInfo: { fullName: "Lifecycle Delete Regression" },
        expectedTradelines: [],
        bureau: "Regression Bureau",
        parserMode: "deterministic",
        allowAiFallback: false,
        stageVersion: "regression",
        extractionSource: "lifecycle-delete-regression",
        parserContext: { marker },
        createdBy: userId,
      })
      .returning("id")
      .executeTakeFirst()
  );
  seed.parserTestCaseId = parserTestCase?.id ? Number(parserTestCase.id) : null;

  const softwareVersion = await optionalDbStep(warnings, "software version creator seed", null, async () =>
    db
      .insertInto("softwareVersion")
      .values({
        version: `delete-regression-${runId}-${userId}`,
        codename: "Delete Regression",
        status: "draft",
        releaseNotes: [{ marker }],
        systemSnapshot: { marker },
        codeLineCount: 0,
        createdBy: userId,
      })
      .returning("id")
      .executeTakeFirst()
  );
  seed.softwareVersionId = softwareVersion?.id ? Number(softwareVersion.id) : null;

  return seed;
}

async function nullableColumnValue(
  db: any,
  table: string,
  column: string,
  idColumn: string,
  idValue: number | string | null
): Promise<number | null | undefined> {
  if (idValue === null) return undefined;
  const row = await db
    .selectFrom(table)
    .select(column)
    .where(idColumn, "=", idValue)
    .executeTakeFirst();
  if (!row) return undefined;
  const value = row[column];
  return value === null || value === undefined ? null : Number(value);
}

async function fetchAdminDeletionCleanupState(
  db: any,
  userId: number,
  seed: AdminDeletionRegressionSeed | null
): Promise<AdminDeletionCleanupState> {
  const warnings: string[] = [];

  const state: AdminDeletionCleanupState = {
    remainingUserRows: await countRowsBy(db, "users", "id", userId),
    remainingSessions: await countRowsBy(db, "sessions", "userId", userId),
    remainingUserPasswords: await countRowsBy(db, "userPasswords", "userId", userId),
    remainingUserAccounts: await countRowsBy(db, "userAccount", "userId", userId),
    remainingSubscriptions: await countRowsBy(db, "subscriptions", "userId", userId),
    remainingReportArtifacts: await countRowsBy(db, "reportArtifact", "userId", userId),
    remainingTradelines: await countRowsBy(db, "tradeline", "userId", userId),
    remainingPackets: await countRowsBy(db, "packet", "userId", userId),
    remainingSupportTicketsOwnedByUser: await countRowsBy(db, "supportTicket", "userId", userId),
    remainingSupportMessagesFromUser: await countRowsBy(db, "supportTicketMessage", "senderId", userId),
    supportTicketAssignedAgentId: undefined,
    supportTicketMessageExists: null,
    consumerSignatureVerifiedBy: undefined,
    evidenceAttachmentUploadedBy: undefined,
    complianceConfigUpdatedByUserId: undefined,
    systemSettingsUpdatedByUserId: undefined,
    parserKnownEntityCreatedBy: undefined,
    parserFieldMappingCreatedBy: undefined,
    parserBureauDetectionConfigCreatedBy: undefined,
    parserMappingVersionChangedBy: undefined,
    parserTestCaseCreatedBy: undefined,
    softwareVersionCreatedBy: undefined,
    warnings,
  };

  if (!seed) return state;

  state.supportTicketAssignedAgentId = await optionalDbStep(
    warnings,
    "support ticket assigned_agent_id survivor check",
    undefined,
    () => nullableColumnValue(db, "supportTicket", "assignedAgentId", "id", seed.supportTicketId)
  );
  if (seed.supportTicketMessageId) {
    const messageCount = await optionalDbStep(warnings, "support message cleanup check", 0, () =>
      countRowsBy(db, "supportTicketMessage", "id", seed.supportTicketMessageId)
    );
    state.supportTicketMessageExists = messageCount > 0;
  }
  state.consumerSignatureVerifiedBy = await optionalDbStep(
    warnings,
    "consumer signature verified_by survivor check",
    undefined,
    () => nullableColumnValue(db, "consumerSignature", "verifiedBy", "id", seed.consumerSignatureId)
  );
  state.evidenceAttachmentUploadedBy = await optionalDbStep(
    warnings,
    "evidence attachment uploaded_by survivor check",
    undefined,
    () => nullableColumnValue(db, "evidenceAttachment", "uploadedBy", "id", seed.evidenceAttachmentId)
  );
  state.complianceConfigUpdatedByUserId = await optionalDbStep(
    warnings,
    "compliance config updated_by_user_id survivor check",
    undefined,
    () => nullableColumnValue(db, "complianceConfig", "updatedByUserId", "id", seed.complianceConfigId)
  );
  state.systemSettingsUpdatedByUserId = await optionalDbStep(
    warnings,
    "system settings updated_by_user_id survivor check",
    undefined,
    () => nullableColumnValue(db, "systemSettings", "updatedByUserId", "key", seed.systemSettingsKey)
  );
  state.parserKnownEntityCreatedBy = await optionalDbStep(
    warnings,
    "parser known entity created_by survivor check",
    undefined,
    () => nullableColumnValue(db, "parserKnownEntity", "createdBy", "id", seed.parserKnownEntityId)
  );
  state.parserFieldMappingCreatedBy = await optionalDbStep(
    warnings,
    "parser field mapping created_by survivor check",
    undefined,
    () => nullableColumnValue(db, "parserFieldMapping", "createdBy", "id", seed.parserFieldMappingId)
  );
  state.parserBureauDetectionConfigCreatedBy = await optionalDbStep(
    warnings,
    "parser bureau config created_by survivor check",
    undefined,
    () =>
      nullableColumnValue(
        db,
        "parserBureauDetectionConfig",
        "createdBy",
        "id",
        seed.parserBureauDetectionConfigId
      )
  );
  state.parserMappingVersionChangedBy = await optionalDbStep(
    warnings,
    "parser mapping version changed_by survivor check",
    undefined,
    () => nullableColumnValue(db, "parserMappingVersion", "changedBy", "id", seed.parserMappingVersionId)
  );
  state.parserTestCaseCreatedBy = await optionalDbStep(
    warnings,
    "parser test case created_by survivor check",
    undefined,
    () => nullableColumnValue(db, "parserTestCase", "createdBy", "id", seed.parserTestCaseId)
  );
  state.softwareVersionCreatedBy = await optionalDbStep(
    warnings,
    "software version created_by survivor check",
    undefined,
    () => nullableColumnValue(db, "softwareVersion", "createdBy", "id", seed.softwareVersionId)
  );

  return state;
}

async function cleanupAdminDeletionRegressionData(
  db: any,
  seed: AdminDeletionRegressionSeed | null
): Promise<void> {
  if (!seed) return;
  const deleteById = async (table: string, id: number | null) => {
    if (!id) return;
    await optionalDbStep(seed.warnings, `${table} regression cleanup`, undefined, async () => {
      await db.deleteFrom(table).where("id", "=", id).executeTakeFirst();
    });
  };

  await deleteById("supportTicketMessage", seed.supportTicketMessageId);
  await deleteById("supportTicket", seed.supportTicketId);
  await deleteById("consumerSignature", seed.consumerSignatureId);
  await deleteById("evidenceAttachment", seed.evidenceAttachmentId);
  await deleteById("parserMappingVersion", seed.parserMappingVersionId);
  await deleteById("parserFieldMapping", seed.parserFieldMappingId);
  await deleteById("parserBureauDetectionConfig", seed.parserBureauDetectionConfigId);
  await deleteById("parserKnownEntity", seed.parserKnownEntityId);
  await deleteById("parserTestCase", seed.parserTestCaseId);
  await deleteById("softwareVersion", seed.softwareVersionId);

  await deleteById("complianceConfig", seed.complianceConfigId);

  if (seed.systemSettingsKey) {
    await optionalDbStep(seed.warnings, "system settings regression cleanup", undefined, async () => {
      await db.deleteFrom("systemSettings").where("key", "=", seed.systemSettingsKey).executeTakeFirst();
    });
  }
}

async function loadDbAssist(enabled: boolean): Promise<OptionalDbAssist> {
  if (!enabled) {
    return {
      enabled: false,
      available: false,
      error: "DB assist disabled by flag",
      fetchLatestEmailVerificationToken: async () => null,
      fetchLatestPasswordResetToken: async () => null,
      seedAdminDeletionRegressionData: async () => null,
      fetchAdminDeletionCleanupState: async () => null,
      cleanupAdminDeletionRegressionData: async () => undefined,
      close: async () => undefined,
    };
  }

  try {
    const mod = await import("../helpers/db");
    const db = (mod as { db: any }).db;

    return {
      enabled: true,
      available: true,
      fetchLatestEmailVerificationToken: async (userId: number) => {
        const row = await db
          .selectFrom("emailVerificationTokens")
          .select(["token", "createdAt"])
          .where("userId", "=", userId)
          .where("verified", "=", false)
          .orderBy("createdAt", "desc")
          .limit(1)
          .executeTakeFirst();
        return row?.token ?? null;
      },
      fetchLatestPasswordResetToken: async (userId: number) => {
        const row = await db
          .selectFrom("passwordResetTokens")
          .select(["token", "createdAt"])
          .where("userId", "=", userId)
          .where("used", "=", false)
          .orderBy("createdAt", "desc")
          .limit(1)
          .executeTakeFirst();
        return row?.token ?? null;
      },
      seedAdminDeletionRegressionData: (userId: number, runId: string) =>
        seedAdminDeletionRegressionData(db, userId, runId),
      fetchAdminDeletionCleanupState: (userId: number, seed: AdminDeletionRegressionSeed | null) =>
        fetchAdminDeletionCleanupState(db, userId, seed),
      cleanupAdminDeletionRegressionData: (seed: AdminDeletionRegressionSeed | null) =>
        cleanupAdminDeletionRegressionData(db, seed),
      close: async () => {
        if (typeof db.destroy === "function") {
          await db.destroy();
        }
      },
    };
  } catch (error) {
    return {
      enabled: true,
      available: false,
      error: getErrorMessage(error),
      fetchLatestEmailVerificationToken: async () => null,
      fetchLatestPasswordResetToken: async () => null,
      seedAdminDeletionRegressionData: async () => null,
      fetchAdminDeletionCleanupState: async () => null,
      cleanupAdminDeletionRegressionData: async () => undefined,
      close: async () => undefined,
    };
  }
}

function requirePurgedCount(
  purgedCounts: Record<string, number>,
  key: string,
  minimum: number,
  failures: string[]
): void {
  const actual = Number(purgedCounts[key] ?? 0);
  if (actual < minimum) {
    failures.push(`Expected purgedCounts.${key} >= ${minimum}, received ${actual}.`);
  }
}

function requireZero(label: string, value: number, failures: string[]): void {
  if (value !== 0) {
    failures.push(`Expected ${label} to be 0, received ${value}.`);
  }
}

function requireNullified(
  label: string,
  value: number | null | undefined,
  failures: string[]
): void {
  if (value !== null) {
    failures.push(`Expected ${label} to survive with its user FK set to null, received ${value}.`);
  }
}

async function exerciseAdminDeletionRegression(input: {
  dbAssist: OptionalDbAssist;
  baseUrl: string;
  origin: string;
  targetUserId: number;
  targetEmail: string;
  runId: string;
  supportTicketId: number | null;
}): Promise<Record<string, unknown>> {
  const adminCookie = process.env.CRP_LIFECYCLE_ADMIN_COOKIE?.trim();
  if (!adminCookie) {
    throw new Error(
      "Admin session cookie unavailable; run through /admin-mock-lifecycle or set CRP_LIFECYCLE_ADMIN_COOKIE."
    );
  }
  if (!input.dbAssist.available) {
    throw new Error(`DB assist unavailable for admin deletion regression: ${input.dbAssist.error ?? "unknown"}`);
  }

  const seed = await input.dbAssist.seedAdminDeletionRegressionData(input.targetUserId, input.runId);
  const adminApi = new ApiClient(input.baseUrl, input.origin, adminCookie);
  let cleanupState: AdminDeletionCleanupState | null = null;
  let shouldCleanupSeed = false;

  try {
    const deleteResponse = await adminApi.request("/_api/admin/delete-user", {
      method: "POST",
      body: {
        userId: input.targetUserId,
        confirmEmail: input.targetEmail,
      },
    });

    if (deleteResponse.status >= 500) {
      throw new Error(
        `Admin delete-user returned HTTP ${deleteResponse.status}: ${extractErrorMessage(deleteResponse.raw)}`
      );
    }
    if (!deleteResponse.ok) {
      throw new Error(
        `Admin delete-user returned HTTP ${deleteResponse.status}: ${extractErrorMessage(deleteResponse.raw)}`
      );
    }

    const payload = deleteResponse.json as AdminDeleteUserResponse | null;
    if (!payload?.success) {
      throw new Error("Admin delete-user response did not include success=true.");
    }
    if (payload.deletedEmail.trim().toLowerCase() !== input.targetEmail.trim().toLowerCase()) {
      throw new Error(`Admin delete-user deletedEmail mismatch: ${payload.deletedEmail}`);
    }

    cleanupState = await input.dbAssist.fetchAdminDeletionCleanupState(input.targetUserId, seed);
    if (!cleanupState) {
      throw new Error("DB assist did not return cleanup state after admin deletion.");
    }

    const failures: string[] = [];
    requirePurgedCount(payload.purgedCounts, "users", 1, failures);
    requirePurgedCount(payload.purgedCounts, "userPasswords", 1, failures);
    requirePurgedCount(payload.purgedCounts, "userAccounts", 1, failures);
    requirePurgedCount(payload.purgedCounts, "subscriptions", 1, failures);
    requirePurgedCount(payload.purgedCounts, "sessions", 1, failures);
    requirePurgedCount(payload.purgedCounts, "reportArtifacts", 2, failures);
    if (input.supportTicketId) {
      requirePurgedCount(payload.purgedCounts, "supportTickets", 1, failures);
    }
    if (seed?.supportTicketMessageId) {
      requirePurgedCount(payload.purgedCounts, "supportTicketMessages", 1, failures);
    }
    if (seed?.supportTicketId) {
      requirePurgedCount(payload.purgedCounts, "supportTicketsReassigned", 1, failures);
      requireNullified("seeded support_ticket.assigned_agent_id", cleanupState.supportTicketAssignedAgentId, failures);
    }
    if (seed?.consumerSignatureId) {
      requirePurgedCount(payload.purgedCounts, "consumerSignaturesVerifiedByNullified", 1, failures);
      requireNullified("seeded consumer_signature.verified_by", cleanupState.consumerSignatureVerifiedBy, failures);
    }
    if (seed?.evidenceAttachmentId) {
      requirePurgedCount(payload.purgedCounts, "evidenceAttachmentsNullified", 1, failures);
      requireNullified("seeded evidence_attachment.uploaded_by", cleanupState.evidenceAttachmentUploadedBy, failures);
    }
    if (seed?.complianceConfigCategory) {
      requirePurgedCount(payload.purgedCounts, "complianceConfigsNullified", 1, failures);
      requireNullified(
        "seeded compliance_config.updated_by_user_id",
        cleanupState.complianceConfigUpdatedByUserId,
        failures
      );
    }
    if (seed?.systemSettingsKey) {
      requirePurgedCount(payload.purgedCounts, "systemSettingsNullified", 1, failures);
      requireNullified("seeded system_settings.updated_by_user_id", cleanupState.systemSettingsUpdatedByUserId, failures);
    }
    if (seed?.parserKnownEntityId) {
      requirePurgedCount(payload.purgedCounts, "parserKnownEntitiesNullified", 1, failures);
      requireNullified("seeded parser_known_entity.created_by", cleanupState.parserKnownEntityCreatedBy, failures);
    }
    if (seed?.parserFieldMappingId) {
      requirePurgedCount(payload.purgedCounts, "parserFieldMappingsNullified", 1, failures);
      requireNullified("seeded parser_field_mapping.created_by", cleanupState.parserFieldMappingCreatedBy, failures);
    }
    if (seed?.parserBureauDetectionConfigId) {
      requirePurgedCount(payload.purgedCounts, "parserBureauConfigsNullified", 1, failures);
      requireNullified(
        "seeded parser_bureau_detection_config.created_by",
        cleanupState.parserBureauDetectionConfigCreatedBy,
        failures
      );
    }
    if (seed?.parserMappingVersionId) {
      requirePurgedCount(payload.purgedCounts, "parserMappingVersionsNullified", 1, failures);
      requireNullified("seeded parser_mapping_version.changed_by", cleanupState.parserMappingVersionChangedBy, failures);
    }
    if (seed?.parserTestCaseId) {
      requirePurgedCount(payload.purgedCounts, "parserTestCasesReassigned", 1, failures);
      if (
        cleanupState.parserTestCaseCreatedBy === null ||
        cleanupState.parserTestCaseCreatedBy === undefined ||
        cleanupState.parserTestCaseCreatedBy === input.targetUserId
      ) {
        failures.push(
          `Expected seeded parser_test_case.created_by to be reassigned away from ${input.targetUserId}, received ${cleanupState.parserTestCaseCreatedBy}.`
        );
      }
    }
    if (seed?.softwareVersionId) {
      requirePurgedCount(payload.purgedCounts, "softwareVersionsNullified", 1, failures);
      requireNullified("seeded software_version.created_by", cleanupState.softwareVersionCreatedBy, failures);
    }

    requireZero("remaining users rows", cleanupState.remainingUserRows, failures);
    requireZero("remaining sessions", cleanupState.remainingSessions, failures);
    requireZero("remaining user passwords", cleanupState.remainingUserPasswords, failures);
    requireZero("remaining user accounts", cleanupState.remainingUserAccounts, failures);
    requireZero("remaining subscriptions", cleanupState.remainingSubscriptions, failures);
    requireZero("remaining report artifacts", cleanupState.remainingReportArtifacts, failures);
    requireZero("remaining tradelines", cleanupState.remainingTradelines, failures);
    requireZero("remaining packets", cleanupState.remainingPackets, failures);
    requireZero("remaining support tickets owned by user", cleanupState.remainingSupportTicketsOwnedByUser, failures);
    requireZero("remaining support messages from user", cleanupState.remainingSupportMessagesFromUser, failures);
    if (seed?.supportTicketMessageId && cleanupState.supportTicketMessageExists !== false) {
      failures.push("Expected seeded support ticket message from deleted user to be removed.");
    }

    if (failures.length > 0) {
      throw new Error(failures.join(" "));
    }

    shouldCleanupSeed = true;
    return {
      deletedEmail: payload.deletedEmail,
      purgedCounts: payload.purgedCounts,
      cleanupState,
      seed: seed
        ? {
            ...seed,
            warnings: seed.warnings,
          }
        : null,
    };
  } finally {
    if (shouldCleanupSeed) {
      await input.dbAssist.cleanupAdminDeletionRegressionData(seed);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertAdminCleanupPreflight(options);
  const runStartedAt = toIsoNow();
  const runId = Date.now().toString(36);
  const api = new ApiClient(options.baseUrl, options.origin);
  const dbAssist = await loadDbAssist(options.useDbAssist);

  const coverage = new Map<string, CoverageEntry>();
  const stepLogs: StepLog[] = [];

  const setCoverage = (key: string, status: CoverageStatus, details: string, evidence?: unknown) => {
    coverage.set(key, {
      status,
      label: COVERAGE_LABELS[key] ?? key,
      details,
      evidence,
    });
  };

  const runStep = async <T>(
    name: string,
    fn: () => Promise<T>,
    opts?: {
      coverageKey?: string;
      critical?: boolean;
      blockedPatterns?: string[];
    }
  ): Promise<T | null> => {
    const startedAt = toIsoNow();

    try {
      const result = await fn();
      if (opts?.coverageKey) {
        setCoverage(opts.coverageKey, "PASSED", `${name} completed.`);
      }
      stepLogs.push({
        name,
        status: "PASSED",
        details: "Completed",
        startedAt,
        completedAt: toIsoNow(),
      });
      return result;
    } catch (error) {
      const message = getErrorMessage(error);
      const blocked = opts?.blockedPatterns ? matchesAny(message, opts.blockedPatterns) : isBlockedMessage(message);
      const status: "FAILED" | "BLOCKED" = blocked ? "BLOCKED" : "FAILED";

      if (opts?.coverageKey) {
        setCoverage(opts.coverageKey, status, message);
      }

      stepLogs.push({
        name,
        status,
        details: message,
        startedAt,
        completedAt: toIsoNow(),
      });

      if (opts?.critical) {
        throw new Error(`${name} failed: ${message}`);
      }

      return null;
    }
  };

  const runExpectedFailure = async (
    name: string,
    coverageKey: string,
    fn: () => Promise<unknown>,
    expectedPatterns: string[]
  ) => {
    const startedAt = toIsoNow();
    try {
      await fn();
      setCoverage(
        coverageKey,
        "FAILED",
        `${name} unexpectedly succeeded; expected a validation/guardrail error.`
      );
      stepLogs.push({
        name,
        status: "FAILED",
        details: "Unexpected success",
        startedAt,
        completedAt: toIsoNow(),
      });
    } catch (error) {
      const message = getErrorMessage(error);
      if (matchesAny(message, expectedPatterns)) {
        setCoverage(coverageKey, "PASSED", `Expected guardrail triggered: ${message}`);
        stepLogs.push({
          name,
          status: "PASSED",
          details: `Expected failure: ${message}`,
          startedAt,
          completedAt: toIsoNow(),
        });
      } else {
        setCoverage(coverageKey, "FAILED", `Unexpected error: ${message}`);
        stepLogs.push({
          name,
          status: "FAILED",
          details: `Unexpected failure: ${message}`,
          startedAt,
          completedAt: toIsoNow(),
        });
      }
    }
  };

  console.log(`Starting full lifecycle suite run ${runId}`);
  console.log(`Initial report: ${options.initialReportPath}`);
  console.log(`Follow-up report: ${options.followupReportPath}`);

  const initialFixture = await readFixture(options.initialReportPath);
  const followupFixture = await readFixture(options.followupReportPath);

  let currentPassword = options.password;
  const newPasswordCandidate = `${options.password}B7`;

  let registeredUserId: number | null = null;
  let firstUpload: UploadRunResult | null = null;
  let firstUploadResults: UploadResultsResponse | null = null;
  let secondUpload: UploadRunResult | null = null;
  let secondUploadResults: UploadResultsResponse | null = null;

  let selectedTradelineId: number | null = null;
  let selectedBureauId: number | null = null;
  let selectedViolationId: number | undefined;
  let selectedViolationCategory: string | undefined;
  let selectedDisputeReasonCode: string | undefined;

  let previewPacket: PacketCreateResponse["packet"] | null = null;
  let draftPacket: PacketCreateResponse["packet"] | null = null;
  let packetForDelete: PacketCreateResponse["packet"] | null = null;
  let deliveredPacketId: number | null = null;
  let obligationInstanceId: number | null = null;
  let supportTicketId: number | null = null;
  let supportMessageId: number | null = null;
  let evidenceEventId: number | null = null;
  let evidenceAttachmentId: number | null = null;
  let adminDeletionRegression: Record<string, unknown> | null = null;
  let verifiedEmail = false;
  let passwordResetCompleted = false;

  const anonymousPreview = await runStep(
    "Anonymous preview",
    () =>
      api.json<AnonymousPreviewResponse>("/_api/ingest/anonymous-report", {
        method: "POST",
        body: {
          bytesBase64: initialFixture.bytesBase64,
          fileName: initialFixture.fileName,
          mimeType: initialFixture.mimeType,
          region: "CA",
        },
      }),
    { coverageKey: "anonymous_preview", critical: true }
  );

  const registration = await runStep(
    "User registration",
    () =>
      api.json<RegisterResponse>("/_api/auth/register_with_password", {
        method: "POST",
        body: {
          email: options.email,
          password: currentPassword,
          displayName: options.displayName,
          termsAccepted: true,
          dataConsentAccepted: true,
          legalNameSignature: options.legalNameSignature,
        },
      }),
    { coverageKey: "auth_register", critical: true }
  );

  if (!registration) {
    throw new Error("Registration did not return a result.");
  }
  registeredUserId = registration.user.id;

  const sessionAfterRegistration = await runStep(
    "Session get after registration",
    () => api.json<SessionResponse>("/_api/auth/session"),
    { coverageKey: "auth_session_get", critical: true }
  );

  if (!sessionAfterRegistration || "error" in sessionAfterRegistration) {
    throw new Error("Session was not established after registration.");
  }

  await runStep(
    "Request verification email",
    () => api.json<{ success: boolean; message?: string }>("/_api/auth/request_verification_email", { method: "POST", body: {} }),
    {
      coverageKey: "auth_verify_email_request",
      blockedPatterns: ["sendgrid", "verification email", "too many requests"],
    }
  );

  if (registeredUserId && dbAssist.available) {
    const token = await runStep(
      "Fetch email verification token via DB assist",
      () => dbAssist.fetchLatestEmailVerificationToken(registeredUserId!),
      { blockedPatterns: ["connect", "database", "authentication"] }
    );

    if (token) {
      const verifyResult = await runStep(
        "Verify email with token",
        () =>
          api.json<{ success: boolean; message?: string }>("/_api/auth/verify_email", {
            method: "POST",
            body: { token },
          }),
        { coverageKey: "auth_verify_email_confirm" }
      );
      verifiedEmail = Boolean(verifyResult?.success);
    } else {
      setCoverage(
        "auth_verify_email_confirm",
        "BLOCKED",
        "No unverified email token found for this user (DB assist available)."
      );
    }
  } else {
    setCoverage(
      "auth_verify_email_confirm",
      "BLOCKED",
      dbAssist.available
        ? "User ID missing before verification check."
        : `DB assist unavailable: ${dbAssist.error ?? "unknown"}`
    );
  }

  await runStep(
    "Logout",
    () => api.json<{ success: boolean; message: string }>("/_api/auth/logout", { method: "POST", body: {} }),
    { coverageKey: "auth_logout" }
  );

  await runStep(
    "Session check after logout",
    async () => {
      const sessionResult = await api.request("/_api/auth/session");
      if (sessionResult.ok && sessionResult.json && typeof sessionResult.json === "object" && "user" in (sessionResult.json as Record<string, unknown>)) {
        throw new Error("Session unexpectedly still authenticated after logout.");
      }
      return sessionResult;
    },
    { blockedPatterns: [] }
  );

  await runStep(
    "Login with current password",
    () =>
      api.json<LoginResponse>("/_api/auth/login_with_password", {
        method: "POST",
        body: {
          email: options.email,
          password: currentPassword,
        },
      }),
    { coverageKey: "auth_login", critical: true }
  );

  await runStep(
    "Request password reset",
    () =>
      api.json<{ success: boolean; message: string }>("/_api/auth/request_password_reset", {
        method: "POST",
        body: {
          email: options.email,
        },
      }),
    {
      coverageKey: "auth_password_reset_request",
      blockedPatterns: ["sendgrid", "too many requests"],
    }
  );

  if (registeredUserId && dbAssist.available) {
    const resetToken = await runStep(
      "Fetch password reset token via DB assist",
      () => dbAssist.fetchLatestPasswordResetToken(registeredUserId!),
      { blockedPatterns: ["connect", "database", "authentication"] }
    );

    if (resetToken) {
      const resetResult = await runStep(
        "Reset password using token",
        () =>
          api.json<{ success: boolean }>("/_api/auth/reset_password", {
            method: "POST",
            body: {
              token: resetToken,
              newPassword: newPasswordCandidate,
            },
          }),
        { coverageKey: "auth_password_reset_confirm" }
      );

      if (resetResult?.success) {
        passwordResetCompleted = true;
        currentPassword = newPasswordCandidate;

        await runExpectedFailure(
          "Login with old password should fail",
          "auth_login",
          () =>
            api.json<LoginResponse>("/_api/auth/login_with_password", {
              method: "POST",
              body: { email: options.email, password: options.password },
            }),
          ["invalid email or password", "401"]
        );

        await runStep(
          "Login with new password",
          () =>
            api.json<LoginResponse>("/_api/auth/login_with_password", {
              method: "POST",
              body: { email: options.email, password: currentPassword },
            }),
          { coverageKey: "auth_login", critical: true }
        );
      }
    } else {
      setCoverage(
        "auth_password_reset_confirm",
        "BLOCKED",
        "No unused password reset token found for this user (DB assist available)."
      );
    }
  } else {
    setCoverage(
      "auth_password_reset_confirm",
      "BLOCKED",
      dbAssist.available
        ? "User ID missing before password reset confirmation check."
        : `DB assist unavailable: ${dbAssist.error ?? "unknown"}`
    );
  }

  let profile = await runStep(
    "Get user profile",
    () => api.json<UserProfile>("/_api/user/profile"),
    { coverageKey: "profile_get", critical: true }
  );

  if (profile && !hasRequiredProfileFields(profile)) {
    const profilePatch = buildProfilePatch(
      profile,
      firstUpload?.phase2.consumerInfoComparison?.extractedInfo,
      options.displayName
    );

    profile = await runStep(
      "Update user profile",
      () =>
        api.json<UserProfile>("/_api/user/profile", {
          method: "POST",
          body: profilePatch,
        }),
      { coverageKey: "profile_update", critical: true }
    );
  } else if (profile) {
    setCoverage("profile_update", "PASSED", "Profile already had required fields; no update needed.");
  }

  firstUpload = await runStep(
    "Initial authenticated upload",
    () => uploadAuthenticatedReport(api, initialFixture, "Upload #1"),
    { coverageKey: "upload_initial", critical: true }
  );

  if (!firstUpload) {
    throw new Error("Initial upload did not complete.");
  }

  firstUploadResults = await runStep(
    "Initial upload results",
    () => api.json<UploadResultsResponse>(`/_api/upload-results/get?artifactId=${firstUpload!.artifactId}`),
    { coverageKey: "upload_initial_results", critical: true }
  );

  if (!firstUploadResults) {
    throw new Error("Initial upload results did not load.");
  }

  ensureScopeExpectation("Upload #1", firstUploadResults);

  const tradelines = await runStep(
    "Tradeline list",
    () => api.json<TradelineListResponse>("/_api/tradeline/list?limit=250"),
    { critical: true }
  );

  if (!tradelines) {
    throw new Error("Could not load tradelines.");
  }

  const firstTradeline = tradelines.tradelines[0];
  selectedTradelineId = firstTradeline?.id ?? null;
  selectedBureauId = firstTradeline?.bureauId ?? null;

  setCoverage("packet_recommend", "BLOCKED", "Packet generation has been reset.");
  setCoverage("packet_preview_create", "BLOCKED", "Packet generation has been reset.");
  setCoverage("packet_create_draft", "BLOCKED", "Packet generation has been reset.");
  setCoverage("packet_duplicate_prevention", "BLOCKED", "Packet generation has been reset.");
  setCoverage("packet_update_status", "BLOCKED", "No generated packet is available for status update.");
  setCoverage("packet_delivery", "BLOCKED", "No generated packet is available for delivery recording.");

  const obligationList = await runStep(
    "List obligations",
    () =>
      api.json<ObligationListResponse>(
        `/_api/obligation-instance/list?tradelineId=${selectedTradelineId}&limit=25`
      ),
    { coverageKey: "obligation_list" }
  );

  if (!obligationInstanceId && obligationList?.instances?.length) {
    obligationInstanceId = obligationList.instances[0].id;
  }

  if (obligationInstanceId) {
    await runStep(
      "Record obligation response",
      () =>
        api.json<RecordResponseOutput>("/_api/obligation-instance/record-response", {
          method: "POST",
          body: {
            obligationInstanceId,
            responseReceivedDate: new Date().toISOString(),
            responseStatus: "insufficient_response",
            responseLetterContent: "Generic response with no substantive verification.",
            responseMovDisclosed: false,
            responseDocumentationProvided: false,
            runAudit: true,
          },
        }),
      { coverageKey: "obligation_record_response" }
    );

    setCoverage(
      "escalation_trigger",
      "BLOCKED",
      "Legacy dispute escalation has been reset pending the new dispute process architecture.",
      { obligationInstanceId }
    );
    setCoverage(
      "escalation_exhaustion",
      "BLOCKED",
      "Legacy procedural exhaustion has been reset pending the new dispute process architecture.",
      { obligationInstanceId }
    );
  } else {
    setCoverage(
      "obligation_record_response",
      "BLOCKED",
      "No obligationInstanceId was available after packet delivery."
    );
    setCoverage(
      "escalation_trigger",
      "BLOCKED",
      "No obligationInstanceId was available to trigger escalation."
    );
    setCoverage(
      "escalation_exhaustion",
      "BLOCKED",
      "No obligationInstanceId was available to drive exhaustion."
    );
  }

  if (deliveredPacketId) {
    const evidenceCreate = await runStep(
      "Create evidence event",
      () =>
        api.json<EvidenceCreateResponse>("/_api/evidence/create", {
          method: "POST",
          body: {
            packetId: deliveredPacketId,
            eventType: "SUITE_MARKER",
            description: `Suite evidence marker for run ${runId}`,
          },
        }),
      { coverageKey: "evidence_event_create" }
    );

    if (evidenceCreate?.event?.id) {
      evidenceEventId = evidenceCreate.event.id;
    }

    await runStep(
      "Upload bureau communication",
      () =>
        api.json<BureauCommunicationResponse>("/_api/evidence/bureau-communication", {
          method: "POST",
          body: {
            fileDataBase64: SAMPLE_PDF_BASE64,
            fileName: `bureau-response-${runId}.pdf`,
            fileType: "application/pdf",
            communicationType: "BUREAU_RESPONSE_RECEIVED",
            packetId: deliveredPacketId,
            obligationInstanceId: obligationInstanceId ?? undefined,
            description: "Mock bureau response uploaded by lifecycle suite",
            responseStatus: "response received",
            responseDocumentationProvided: false,
            runAudit: true,
          },
        }),
      {
        coverageKey: "evidence_bureau_communication",
        blockedPatterns: ["upload", "storage", "bucket", "credential"],
      }
    );

    const evidenceAttachmentUpload = await runStep(
      "Upload evidence attachment",
      () =>
        api.json<EvidenceAttachmentUploadResponse>("/_api/evidence-attachment/upload", {
          method: "POST",
          body: {
            packetId: deliveredPacketId,
            fileName: `attachment-${runId}.txt`,
            fileType: "text/plain",
            fileDataBase64: SAMPLE_TEXT_BASE64,
            description: "Lifecycle suite attachment",
          },
        }),
      {
        coverageKey: "evidence_attachment_upload",
        blockedPatterns: ["storage", "bucket", "credential", "gcs", "upload"],
      }
    );

    if (evidenceAttachmentUpload?.attachment?.id) {
      evidenceAttachmentId = evidenceAttachmentUpload.attachment.id;
    }

    await runStep(
      "List evidence attachments",
      () =>
        api.json<EvidenceAttachmentListItem[]>(`/_api/evidence-attachment/list?packetId=${deliveredPacketId}`),
      { coverageKey: "evidence_attachment_list" }
    );
  } else {
    setCoverage("evidence_event_create", "BLOCKED", "No generated packet is available for evidence event creation.");
    setCoverage("evidence_bureau_communication", "BLOCKED", "No generated packet is available for bureau communication upload.");
    setCoverage("evidence_attachment_upload", "BLOCKED", "No generated packet is available for attachment upload.");
    setCoverage("evidence_attachment_list", "BLOCKED", "No generated packet is available for attachment listing.");
  }

  if (obligationInstanceId) {
    await runStep(
      "Generate evidence package",
      async () => {
        const response = await api.raw("/_api/evidence-attachment/package", {
          method: "POST",
          body: { obligationInstanceId },
        });
        const contentType = response.headers.get("content-type") ?? "";
        const body = await response.arrayBuffer();

        if (!response.ok) {
          const text = Buffer.from(body).toString("utf8");
          throw new Error(`HTTP ${response.status}: ${extractErrorMessage(text)}`);
        }

        if (!contentType.includes("application/pdf")) {
          throw new Error(`Expected application/pdf but received ${contentType}`);
        }

        if (body.byteLength <= 0) {
          throw new Error("Evidence package PDF was empty.");
        }

        return {
          byteLength: body.byteLength,
          contentType,
        };
      },
      { coverageKey: "evidence_package" }
    );
  } else {
    setCoverage("evidence_package", "BLOCKED", "No obligation instance available for evidence package generation.");
  }

  const supportTicket = await runStep(
    "Create support ticket",
    () =>
      api.json<SupportTicketCreateResponse>("/_api/support-ticket/create", {
        method: "POST",
        body: {
          subject: `Lifecycle suite ticket ${runId}`,
          description: "Created by automated lifecycle suite.",
          category: "DISPUTE_HELP",
          priority: "MEDIUM",
        },
      }),
    { coverageKey: "support_ticket_create" }
  );

  if (supportTicket?.ticket?.id) {
    supportTicketId = supportTicket.ticket.id;
  }

  await runStep(
    "List support tickets",
    () => api.json<SupportTicketListResponse>("/_api/support-ticket/list?limit=10&offset=0"),
    { coverageKey: "support_ticket_list" }
  );

  if (supportTicketId) {
    await runStep(
      "Get support ticket",
      () => api.json<SupportTicketGetResponse>(`/_api/support-ticket/get?id=${supportTicketId}`),
      { coverageKey: "support_ticket_get" }
    );

    const supportReply = await runStep(
      "Reply to support ticket",
      () =>
        api.json<SupportTicketReplyResponse>("/_api/support-ticket/reply", {
          method: "POST",
          body: {
            ticketId: supportTicketId,
            message: "Automated follow-up from lifecycle suite.",
          },
        }),
      { coverageKey: "support_ticket_reply" }
    );

    if (supportReply?.message?.id) {
      supportMessageId = supportReply.message.id;
    }
  } else {
    setCoverage("support_ticket_get", "BLOCKED", "Support ticket was not created.");
    setCoverage("support_ticket_reply", "BLOCKED", "Support ticket was not created.");
  }

  const subscriptionStatus = await runStep(
    "Subscription status",
    () => api.json<SubscriptionStatusResponse>("/_api/subscription/status"),
    { coverageKey: "subscription_status" }
  );

  const checkoutAttempt = await runStep(
    "Subscription create checkout",
    () =>
      api.json<{ clientSecret: string; subscriptionId: string; plan: string; amount: number }>(
        "/_api/subscription/create-checkout",
        {
          method: "POST",
          body: { plan: "monthly" },
        }
      ),
    {
      coverageKey: "subscription_create_checkout",
      blockedPatterns: ["trial setup mode", "upgrades are not yet available", "stripe"],
    }
  );

  await runStep(
    "Subscription update plan",
    () =>
      api.json<unknown>("/_api/subscription/update-plan", {
        method: "POST",
        body: { plan: "annual" },
      }),
    {
      coverageKey: "subscription_update_plan",
      blockedPatterns: [
        "trial setup mode",
        "upgrade checkout",
        "no active subscription",
        "stripe",
      ],
    }
  );

  await runStep(
    "Subscription cancel",
    () =>
      api.json<unknown>("/_api/subscription/cancel", {
        method: "POST",
        body: { reason: "Lifecycle suite test" },
      }),
    {
      coverageKey: "subscription_cancel",
      blockedPatterns: ["trial user", "no active subscription", "stripe"],
    }
  );

  if (checkoutAttempt?.subscriptionId) {
    await runStep(
      "Subscription confirm payment",
      () =>
        api.json<unknown>("/_api/subscription/confirm-payment", {
          method: "POST",
          body: {
            stripeSubscriptionId: checkoutAttempt.subscriptionId,
            plan: "monthly",
          },
        }),
      {
        coverageKey: "subscription_confirm_payment",
        blockedPatterns: ["not active", "stripe", "subscription"],
      }
    );
  } else {
    await runExpectedFailure(
      "Subscription confirm payment with fake subscription",
      "subscription_confirm_payment",
      () =>
        api.json<unknown>("/_api/subscription/confirm-payment", {
          method: "POST",
          body: {
            stripeSubscriptionId: "sub_mock_suite_invalid",
            plan: "monthly",
          },
        }),
      ["stripe", "not active", "no such", "subscription"]
    );
  }

  secondUpload = await runStep(
    "Follow-up authenticated upload",
    () => uploadAuthenticatedReport(api, followupFixture, "Upload #2"),
    { coverageKey: "upload_followup", critical: true }
  );

  if (!secondUpload) {
    throw new Error("Follow-up upload did not complete.");
  }

  secondUploadResults = await runStep(
    "Follow-up upload results",
    () => api.json<UploadResultsResponse>(`/_api/upload-results/get?artifactId=${secondUpload!.artifactId}`),
    { coverageKey: "upload_followup_results", critical: true }
  );

  if (!secondUploadResults) {
    throw new Error("Follow-up upload results did not load.");
  }

  ensureScopeExpectation("Upload #2", secondUploadResults);

  const timelineTradelineIds = Array.from(
    new Set(
      secondUploadResults.crossReference?.matched.map((item) => item.tradelineId) ??
        secondUpload.phase2.tradelineIds
    )
  ).slice(0, 5);

  const changeAnalysisByTradeline: Array<Record<string, unknown>> = [];
  for (const tradelineId of timelineTradelineIds) {
    const detectChanges = await runStep(
      `Detect changes for tradeline ${tradelineId}`,
      () =>
        api.json<DetectChangesResponse>("/_api/tradeline/detect-changes", {
          method: "POST",
          body: { tradelineId },
        }),
      { coverageKey: "change_detection" }
    );

    const timeline = await runStep(
      `Get timeline for tradeline ${tradelineId}`,
      () => api.json<TimelineResponse>(`/_api/tradeline/change-timeline?tradelineId=${tradelineId}`),
      { coverageKey: "change_timeline" }
    );

    changeAnalysisByTradeline.push({
      tradelineId,
      detectChangesSummary: detectChanges?.summary ?? null,
      significantChangesLogged: detectChanges?.changes.length ?? 0,
      obligationsUnlocked: detectChanges?.obligationsUnlocked ?? 0,
      timelineEventCounts: timeline ? summarizeTimelineTypes(timeline.timeline) : {},
    });
  }

  const packetList = await runStep(
    "Packet list",
    () => api.json<PacketListResponse>("/_api/packet/list?limit=100"),
    { coverageKey: "packet_list" }
  );

  await runStep(
    "Report artifact list",
    () => api.json<ReportArtifactListResponse>("/_api/report-artifact/list?limit=50"),
    { coverageKey: "report_artifact_list" }
  );

  setCoverage("packet_save", "BLOCKED", "Packet generation has been reset.");
  setCoverage("packet_delete", "BLOCKED", "No generated packet is available for delete validation.");

  if (registeredUserId) {
    adminDeletionRegression = await runStep(
      "Admin delete mock user",
      () =>
        exerciseAdminDeletionRegression({
          dbAssist,
          baseUrl: options.baseUrl,
          origin: options.origin,
          targetUserId: registeredUserId!,
          targetEmail: options.email,
          runId,
          supportTicketId,
        }),
      {
        coverageKey: "admin_delete_user",
        blockedPatterns: ["admin session cookie unavailable", "db assist unavailable"],
      }
    );
  } else {
    setCoverage("admin_delete_user", "BLOCKED", "No registered user ID was available to delete.");
  }

  for (const [key, label] of Object.entries(COVERAGE_LABELS)) {
    if (!coverage.has(key)) {
      coverage.set(key, {
        status: "SKIPPED",
        label,
        details: "Not executed in this run.",
      });
    }
  }

  const coverageEntries = Array.from(coverage.entries()).map(([key, entry]) => ({
    key,
    ...entry,
  }));

  const coverageSummary = {
    passed: coverageEntries.filter((entry) => entry.status === "PASSED").length,
    failed: coverageEntries.filter((entry) => entry.status === "FAILED").length,
    blocked: coverageEntries.filter((entry) => entry.status === "BLOCKED").length,
    skipped: coverageEntries.filter((entry) => entry.status === "SKIPPED").length,
    total: coverageEntries.length,
  };

  const linkedDisputeActivities =
    secondUploadResults?.crossReference?.matched.reduce((total, item) => {
      return total + (item.disputeActivity?.length ?? 0);
    }, 0) ?? 0;

  const disputeOutcome = secondUploadResults?.disputeOutcomeSummary ?? null;
  const disputesWorkedEstimate =
    (disputeOutcome?.removedAfterDispute ?? 0) + (disputeOutcome?.changedAfterDispute ?? 0);
  const unchangedAfterDispute = disputeOutcome?.unchangedAfterDispute ?? 0;

  const runReport = {
    runId,
    runStartedAt,
    runCompletedAt: toIsoNow(),
    config: {
      baseUrl: options.baseUrl,
      origin: options.origin,
      simulateDayGapDays: options.simulateDayGapDays,
      packetCountRequested: options.packetCount,
      platformScopeExpected: PLATFORM_SCOPE_EXPECTATION,
      platformRegionExpected: PLATFORM_REGION_EXPECTATION,
      strict: options.strict,
      dbAssistEnabled: options.useDbAssist,
      dbAssistAvailable: dbAssist.available,
      dbAssistError: dbAssist.error ?? null,
    },
    mockUser: {
      requestedEmail: options.email,
      registeredUserId,
      verifiedEmail,
      passwordResetCompleted,
      activePasswordHint: passwordResetCompleted ? "updated" : "original",
    },
    fixtures: {
      initialReportPath: initialFixture.filePath,
      followupReportPath: followupFixture.filePath,
      initialReportFileName: initialFixture.fileName,
      followupReportFileName: followupFixture.fileName,
    },
    keyEntities: {
      selectedTradelineId,
      selectedBureauId,
      selectedViolationId,
      deliveredPacketId,
      obligationInstanceId,
      supportTicketId,
      supportMessageId,
      evidenceEventId,
      evidenceAttachmentId,
    },
    scenario: {
      anonymousPreview: {
        problemCount: anonymousPreview?.problemCount ?? null,
        sampleProblems:
          anonymousPreview?.sampleProblems.slice(0, 5).map((problem) => ({
            type: problem.type,
            urgency: problem.urgency,
            title: problem.title,
          })) ?? [],
      },
      upload1: firstUpload
        ? {
            artifactId: firstUpload.artifactId,
            tradelinesCount: firstUpload.phase2.tradelinesCount,
            metadata: firstUploadResults?.metadata ?? null,
            stats: firstUploadResults?.stats ?? null,
          }
        : null,
      upload2: secondUpload
        ? {
            artifactId: secondUpload.artifactId,
            tradelinesCount: secondUpload.phase2.tradelinesCount,
            metadata: secondUploadResults?.metadata ?? null,
            stats: secondUploadResults?.stats ?? null,
            crossReference: secondUploadResults?.crossReference
              ? {
                  previousArtifactId: secondUploadResults.crossReference.previousArtifactId,
                  matchedCount: secondUploadResults.crossReference.matched.length,
                  addedCount: secondUploadResults.crossReference.added.length,
                  removedCount: secondUploadResults.crossReference.removed.length,
                }
              : null,
            disputeOutcomeSummary: secondUploadResults?.disputeOutcomeSummary ?? null,
          }
        : null,
      changeTracking: changeAnalysisByTradeline,
      packetListSnapshot: {
        totalVisiblePackets: packetList?.packets.length ?? 0,
        sentPacketCount:
          packetList?.packets.filter((packet) =>
            (packet.status ?? "").toLowerCase().includes("sent")
          ).length ?? 0,
      },
      subscription: {
        status: subscriptionStatus ?? null,
      },
      adminDeletion: adminDeletionRegression,
    },
    analysis: {
      scopeChecksPassed: Boolean(firstUploadResults && secondUploadResults),
      disputeActivitiesLinkedToMatchedTradelines: linkedDisputeActivities,
      disputesWorkedEstimate,
      unchangedAfterDispute,
      potentialBureauObligationFailureSignals:
        unchangedAfterDispute > 0
          ? [
              `${unchangedAfterDispute} disputed tradeline(s) were unchanged on follow-up upload and may require escalation.`,
            ]
          : [],
      summary: {
        completeLifecycleExecuted: Boolean(firstUpload && secondUpload),
        anonymousIssuesDetected: Boolean((anonymousPreview?.problemCount ?? 0) > 0),
        accountCreated: Boolean(registeredUserId),
        disputePacketDelivered: Boolean(deliveredPacketId),
        secondReportUploaded: Boolean(secondUpload),
      },
    },
    coverageSummary,
    coverageMatrix: coverageEntries,
    stepLogs,
  };

  await mkdir(options.outputDir, { recursive: true });
  const outputStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.resolve(options.outputDir, `mock-user-lifecycle-full-suite-${outputStamp}.json`);
  const mdPath = path.resolve(options.outputDir, `mock-user-lifecycle-full-suite-${outputStamp}.md`);

  await writeFile(jsonPath, JSON.stringify(runReport, null, 2), "utf8");
  await writeFile(mdPath, renderMarkdownReport(runReport), "utf8");

  await dbAssist.close();

  console.log(`Full lifecycle suite run complete.`);
  console.log(`JSON report: ${jsonPath}`);
  console.log(`Markdown report: ${mdPath}`);
  console.log(
    `Coverage summary: passed=${coverageSummary.passed}, failed=${coverageSummary.failed}, blocked=${coverageSummary.blocked}, skipped=${coverageSummary.skipped}`
  );

  if (options.strict && (coverageSummary.failed > 0 || coverageSummary.blocked > 0)) {
    throw new Error(
      `Strict mode failed: ${coverageSummary.failed} failed, ${coverageSummary.blocked} blocked coverage items.`
    );
  }
}

main().catch((error) => {
  console.error("Mock lifecycle full suite failed:");
  console.error(getErrorMessage(error));
  process.exit(1);
});
