import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import {
  ApiClient,
  AUTH_WORKFLOW_ENDPOINTS,
  AUTH_WORKFLOW_SMOKE_ENV,
  buildSmokeConfig,
  redactSecretText,
  runSmoke,
  type SmokeBeforeCleanupContext,
  SKIPPED_EXIT_CODE,
} from "./staging-auth-workflow-smoke";

const DEFAULT_STAGING_BASE_URL = "https://staging.creditregulatorpro.com";
export const ADMIN_PROBE_SKIPPED_CREDENTIALS_MISSING = "ADMIN_PROBE_SKIPPED_CREDENTIALS_MISSING";
export const ADMIN_PROBE_AUTH_FAILED = "ADMIN_PROBE_AUTH_FAILED";

type StageStatus = "PASS" | "FAIL" | "WARN" | "SKIP";
type OperationalAuditStatus = "PASS" | "FAIL" | "INCOMPLETE" | "FAIL_AUTH";

type AuditStage = {
  id: string;
  label: string;
  status: StageStatus;
  details: string;
  evidence?: Record<string, unknown>;
};

type AdminAuthInputs =
  | {
      status: "configured";
      mode: "session_cookie" | "credentials";
      sessionCookie?: string;
      email?: string;
      password?: string;
    }
  | {
      status: "missing";
      reason: string;
    };

type PacketReadinessResponse = {
  packetReady: boolean;
  eligibleFindingIds: number[];
  ineligibleFindingIds: number[];
  reasonCodes: string[];
};

type PacketCreateResponse = {
  success: boolean;
  packetId: number;
  status: string;
};

type SessionResponse =
  | {
      user: {
        id: number;
        email: string;
        role: string;
      };
    }
  | {
      error: string;
    };

type PacketListResponse = {
  packets: Array<{ id: number | string }>;
  total: number;
};

type AdminAuditLogResponse = {
  logs: Array<{
    actionType?: string;
    entityType?: string;
    entityId?: number | string | null;
    status?: string;
  }>;
  total: number;
};

type AdminAuditLogCheck = {
  status: "found" | "not_found" | "unavailable";
  detail: string;
  total?: number;
};

type OwnerReadinessBlockerProbe = {
  status: "passed" | "failed";
  httpStatus?: number;
  packetReady?: boolean;
  reasonCodes?: string[];
  detail?: string;
};

type AdminPacketWorkflowProbe = {
  status: "passed" | "failed" | "skipped" | "auth_failed";
  mode?: "session_cookie" | "credentials";
  skipCode?: typeof ADMIN_PROBE_SKIPPED_CREDENTIALS_MISSING;
  authFailureCode?: typeof ADMIN_PROBE_AUTH_FAILED;
  detail: string;
  adminSessionUserId?: number;
  readinessBypassBlocked?: boolean;
  readinessBypassReasonCodes?: string[];
  packetId?: number;
  pdfStatus?: number;
  pdfContentType?: string;
  pdfByteLength?: number;
  pdfStartsWithPdf?: boolean;
  listTotal?: number;
  createdPacketVisibleInAdminList?: boolean;
  auditLogPacketGenerated?: boolean;
  auditLogStatus?: AdminAuditLogCheck["status"];
  auditLogDetail?: string;
};

type BeforeCleanupProbe = {
  ownerReadinessBlocker: OwnerReadinessBlockerProbe;
  adminPacketWorkflow: AdminPacketWorkflowProbe;
};

type SmokeResult = Awaited<ReturnType<typeof runSmoke>>;

type OperationalAuditReport = {
  status: OperationalAuditStatus;
  certification: string;
  generatedAt: string;
  baseUrl: string | null;
  durationMs: number;
  failureStages: string[];
  incompleteStages: string[];
  metrics: Record<string, unknown>;
  stages: AuditStage[];
};

type E2eOperationalAuditOptions = {
  requireAdmin: boolean;
};

type EvaluateOperationalAuditOptions = Partial<E2eOperationalAuditOptions>;

function normalizeEnv(value: string | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isLocalHost(host: string | undefined): boolean {
  return host === "localhost" || host === "127.0.0.1";
}

function envValue(env: NodeJS.ProcessEnv, keys: string[]): string | null {
  for (const key of keys) {
    const value = normalizeEnv(env[key]);
    if (value) return value;
  }
  return null;
}

export function parseE2eOperationalAuditArgs(argv: string[] = process.argv.slice(2)): E2eOperationalAuditOptions {
  const unknownArgs = argv.filter((arg) => arg !== "--require-admin");
  if (unknownArgs.length > 0) {
    throw new Error(`Unknown audit:e2e option(s): ${unknownArgs.join(", ")}`);
  }

  return {
    requireAdmin: argv.includes("--require-admin"),
  };
}

export function buildE2eOperationalAuditEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const output = { ...env };
  const configuredBaseUrl =
    normalizeEnv(output.STAGING_BASE_URL) ??
    normalizeEnv(output.STAGING_APP_URL) ??
    normalizeEnv(output.LOCAL_SMOKE_BASE_URL);

  if (!configuredBaseUrl) {
    output.STAGING_BASE_URL = DEFAULT_STAGING_BASE_URL;
  }

  output[AUTH_WORKFLOW_SMOKE_ENV] = "true";
  output.CRP_AUTH_WORKFLOW_SMOKE_INCLUDE_PACKET = "true";
  output.CRP_AUTH_WORKFLOW_SMOKE_RUN_ID =
    normalizeEnv(output.CRP_AUTH_WORKFLOW_SMOKE_RUN_ID) ?? `e2e-operational-audit-${Date.now()}`;

  return output;
}

export function resolveAdminAuthInputs(env: NodeJS.ProcessEnv, host?: string): AdminAuthInputs {
  const prefix = isLocalHost(host) ? "LOCAL_SMOKE" : "STAGING";
  const fallbackPrefix = prefix === "STAGING" ? "LOCAL_SMOKE" : "STAGING";
  const sessionCookie = envValue(env, [
    `${prefix}_ADMIN_SESSION_COOKIE`,
    `${fallbackPrefix}_ADMIN_SESSION_COOKIE`,
    "E2E_ADMIN_SESSION_COOKIE",
  ]);
  if (sessionCookie) {
    return {
      status: "configured",
      mode: "session_cookie",
      sessionCookie,
    };
  }

  const email = envValue(env, [`${prefix}_ADMIN_EMAIL`, `${fallbackPrefix}_ADMIN_EMAIL`, "E2E_ADMIN_EMAIL"]);
  const password = envValue(env, [`${prefix}_ADMIN_PASSWORD`, `${fallbackPrefix}_ADMIN_PASSWORD`, "E2E_ADMIN_PASSWORD"]);
  if (email && password) {
    return {
      status: "configured",
      mode: "credentials",
      email,
      password,
    };
  }

  return {
    status: "missing",
    reason:
      prefix === "STAGING"
        ? "STAGING_ADMIN_EMAIL/STAGING_ADMIN_PASSWORD or STAGING_ADMIN_SESSION_COOKIE is required for the admin packet workflow stage."
        : "LOCAL_SMOKE_ADMIN_EMAIL/LOCAL_SMOKE_ADMIN_PASSWORD or LOCAL_SMOKE_ADMIN_SESSION_COOKIE is required for the admin packet workflow stage.",
  };
}

export function classifyE2eFailureStage(message: string): string {
  const lower = message.toLowerCase();
  if (/register|registration|termsaccepted|identification/.test(lower)) return "signup";
  if (/login|session|authenticated|role/.test(lower)) return "auth_session";
  if (/upload failed|phase 1|ingest\/report|report artifact/.test(lower)) return "upload";
  if (/ingest processing|ingest-status|worker|ocr|stalled|timed out/.test(lower)) return "ocr_ingest_processing";
  if (/upload result|parser|tradeline|bureau|canonical/.test(lower)) return "parsing_canonical_mapping";
  if (/recommend|finding|packet-ready|readiness|manual review|needs_user_review/.test(lower)) return "readiness_gating";
  if (/packet create|packet-created|built packet|selectedissueids/.test(lower)) return "packet_generation";
  if (/packet pdf|pdf retrieval|content-type|%pdf|pdf was unexpectedly small/.test(lower)) return "pdf_retrieval";
  if (/non-owner|unauthorized access|403|404/.test(lower)) return "authorization";
  if (/self-delete|cleanup|delete account|purged/.test(lower)) return "cleanup_lifecycle";
  return "runtime";
}

function adminAuthFailureDetail(error: unknown, env: NodeJS.ProcessEnv): string {
  const message = redactSecretText(error instanceof Error ? error.message : String(error), env);
  return `${ADMIN_PROBE_AUTH_FAILED}: ${message}`;
}

async function authenticateAdminApi(
  config: SmokeBeforeCleanupContext["config"],
  env: NodeJS.ProcessEnv,
): Promise<{ api: ApiClient; mode: "session_cookie" | "credentials"; adminUserId: number }> {
  const auth = resolveAdminAuthInputs(env, config.host);
  if (auth.status === "missing") {
    throw new Error(auth.reason);
  }

  const api = new ApiClient(config.baseUrl, config.origin);
  if (auth.mode === "session_cookie") {
    api.setCookieHeader(auth.sessionCookie ?? "");
  } else {
    await api.json(AUTH_WORKFLOW_ENDPOINTS.login, {
      method: "POST",
      body: {
        email: auth.email,
        password: auth.password,
      },
    });
  }

  const session = await api.json<SessionResponse>(AUTH_WORKFLOW_ENDPOINTS.session);
  if ("error" in session) {
    throw new Error(`Admin authentication did not produce a session: ${session.error}`);
  }
  if (session.user.role !== "admin" && session.user.role !== "super_admin") {
    throw new Error(`Configured admin auth resolved to role ${session.user.role}.`);
  }

  return {
    api,
    mode: auth.mode,
    adminUserId: session.user.id,
  };
}

async function runOwnerReadinessBlockerProbe(
  context: SmokeBeforeCleanupContext,
): Promise<OwnerReadinessBlockerProbe> {
  try {
    const missingIssueId = 999_999_999;
    const readiness = await context.api.json<PacketReadinessResponse>(AUTH_WORKFLOW_ENDPOINTS.packetValidateReadiness, {
      method: "POST",
      body: {
        packetType: "credit_bureau",
        selectedIssueIds: [missingIssueId],
      },
    });

    const passed =
      readiness.packetReady === false &&
      readiness.ineligibleFindingIds.includes(missingIssueId) &&
      readiness.reasonCodes.includes("FINDING_NOT_FOUND");

    return {
      status: passed ? "passed" : "failed",
      packetReady: readiness.packetReady,
      reasonCodes: readiness.reasonCodes,
      detail: passed
        ? "Readiness endpoint returned a deterministic blocker for a missing finding."
        : "Readiness endpoint did not return the expected missing-finding blocker.",
    };
  } catch (error) {
    return {
      status: "failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runAdminPacketWorkflowProbe(
  context: SmokeBeforeCleanupContext,
  env: NodeJS.ProcessEnv,
): Promise<AdminPacketWorkflowProbe> {
  const auth = resolveAdminAuthInputs(env, context.config.host);
  if (auth.status === "missing") {
    return {
      status: "skipped",
      skipCode: ADMIN_PROBE_SKIPPED_CREDENTIALS_MISSING,
      detail: auth.reason,
    };
  }

  if (!context.selectedIssueId) {
    return {
      status: "failed",
      detail: "Owner packet workflow did not expose a selected issue ID for admin packet creation.",
    };
  }

  let authenticated: Awaited<ReturnType<typeof authenticateAdminApi>>;
  try {
    authenticated = await authenticateAdminApi(context.config, env);
  } catch (error) {
    return {
      status: "auth_failed",
      mode: auth.mode,
      authFailureCode: ADMIN_PROBE_AUTH_FAILED,
      detail: adminAuthFailureDetail(error, env),
    };
  }

  const { api, mode, adminUserId } = authenticated;
  try {
    const packetInput = {
      packetType: "credit_bureau",
      selectedIssueIds: [context.selectedIssueId],
    };

    const readiness = await api.json<PacketReadinessResponse>(AUTH_WORKFLOW_ENDPOINTS.packetValidateReadiness, {
      method: "POST",
      body: packetInput,
    });
    if (!readiness.packetReady || !readiness.eligibleFindingIds.includes(context.selectedIssueId)) {
      return {
        status: "failed",
        mode,
        adminSessionUserId: adminUserId,
        detail: `Admin readiness did not accept the owner finding: ${readiness.reasonCodes.join(", ") || "no reason codes"}`,
      };
    }

    const missingIssueId = 999_999_998;
    const missingReadiness = await api.json<PacketReadinessResponse>(AUTH_WORKFLOW_ENDPOINTS.packetValidateReadiness, {
      method: "POST",
      body: {
        packetType: "credit_bureau",
        selectedIssueIds: [missingIssueId],
      },
    });
    const readinessBypassBlocked =
      missingReadiness.packetReady === false &&
      missingReadiness.ineligibleFindingIds.includes(missingIssueId) &&
      missingReadiness.reasonCodes.includes("FINDING_NOT_FOUND");
    if (!readinessBypassBlocked) {
      return {
        status: "failed",
        mode,
        adminSessionUserId: adminUserId,
        readinessBypassBlocked,
        readinessBypassReasonCodes: missingReadiness.reasonCodes,
        detail: "Admin readiness check did not block a missing finding reference.",
      };
    }

    const created = await api.json<PacketCreateResponse>(AUTH_WORKFLOW_ENDPOINTS.packetCreate, {
      method: "POST",
      body: packetInput,
    });
    if (!created.success || !Number.isInteger(created.packetId)) {
      return {
        status: "failed",
        mode,
        adminSessionUserId: adminUserId,
        readinessBypassBlocked,
        readinessBypassReasonCodes: missingReadiness.reasonCodes,
        detail: "Admin packet create did not return success and packetId.",
      };
    }

    const pdfResponse = await api.raw(
      `${AUTH_WORKFLOW_ENDPOINTS.packetPdf}?packetId=${encodeURIComponent(String(created.packetId))}`,
    );
    const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
    const pdfContentType = pdfResponse.headers.get("content-type") ?? "";
    const pdfStartsWithPdf = pdfBytes.subarray(0, 4).toString("utf8") === "%PDF";
    if (!pdfResponse.ok || !pdfContentType.includes("application/pdf") || !pdfStartsWithPdf || pdfBytes.byteLength < 1000) {
      return {
        status: "failed",
        mode,
        adminSessionUserId: adminUserId,
        readinessBypassBlocked,
        readinessBypassReasonCodes: missingReadiness.reasonCodes,
        detail: "Admin-created packet PDF did not return a valid PDF.",
        packetId: created.packetId,
        pdfStatus: pdfResponse.status,
        pdfContentType,
        pdfByteLength: pdfBytes.byteLength,
        pdfStartsWithPdf,
      };
    }

    const packetList = await api.json<PacketListResponse>("/_api/packet/list?limit=10");
    const createdPacketVisibleInAdminList = packetList.packets.some((packet) => Number(packet.id) === created.packetId);
    if (!createdPacketVisibleInAdminList) {
      return {
        status: "failed",
        mode,
        adminSessionUserId: adminUserId,
        readinessBypassBlocked,
        readinessBypassReasonCodes: missingReadiness.reasonCodes,
        detail: "Admin-created packet was not visible in the admin packet list.",
        packetId: created.packetId,
        pdfStatus: pdfResponse.status,
        pdfContentType,
        pdfByteLength: pdfBytes.byteLength,
        pdfStartsWithPdf,
        listTotal: packetList.total,
        createdPacketVisibleInAdminList,
      };
    }

    const auditLogCheck = await readAdminPacketGeneratedAuditLog(api, created.packetId);
    if (auditLogCheck.status !== "found") {
      return {
        status: "failed",
        mode,
        adminSessionUserId: adminUserId,
        readinessBypassBlocked,
        readinessBypassReasonCodes: missingReadiness.reasonCodes,
        detail: auditLogCheck.detail,
        packetId: created.packetId,
        pdfStatus: pdfResponse.status,
        pdfContentType,
        pdfByteLength: pdfBytes.byteLength,
        pdfStartsWithPdf,
        listTotal: packetList.total,
        createdPacketVisibleInAdminList,
        auditLogPacketGenerated: false,
        auditLogStatus: auditLogCheck.status,
        auditLogDetail: auditLogCheck.detail,
      };
    }

    return {
      status: "passed",
      mode,
      adminSessionUserId: adminUserId,
      readinessBypassBlocked,
      readinessBypassReasonCodes: missingReadiness.reasonCodes,
      detail: "Admin authenticated, enforced readiness, created a packet from the owner finding, downloaded the PDF, saw it in packet list, and found the packet audit log.",
      packetId: created.packetId,
      pdfStatus: pdfResponse.status,
      pdfContentType,
      pdfByteLength: pdfBytes.byteLength,
      pdfStartsWithPdf,
      listTotal: packetList.total,
      createdPacketVisibleInAdminList,
      auditLogPacketGenerated: true,
      auditLogStatus: auditLogCheck.status,
      auditLogDetail: auditLogCheck.detail,
    };
  } catch (error) {
    return {
      status: "failed",
      mode: auth.mode,
      detail: redactSecretText(error instanceof Error ? error.message : String(error), env),
    };
  }
}

async function readAdminPacketGeneratedAuditLog(
  api: ApiClient,
  packetId: number,
): Promise<AdminAuditLogCheck> {
  try {
    const query = new URLSearchParams({
      actionType: "PACKET_GENERATED",
      entityType: "PACKET",
      status: "SUCCESS",
      limit: "20",
    });
    const response = await api.json<AdminAuditLogResponse>(`/_api/admin/audit-logs?${query.toString()}`);
    const found = response.logs.some((log) => Number(log.entityId) === packetId);

    return found
      ? {
          status: "found",
          detail: "Found PACKET_GENERATED audit log for the admin-created packet.",
          total: response.total,
        }
      : {
          status: "not_found",
          detail: "PACKET_GENERATED audit log was not found for the admin-created packet.",
          total: response.total,
        };
  } catch (error) {
    return {
      status: "unavailable",
      detail: `Could not verify PACKET_GENERATED audit log: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function runBeforeCleanupProbe(
  context: SmokeBeforeCleanupContext,
  env: NodeJS.ProcessEnv,
): Promise<BeforeCleanupProbe> {
  const [ownerReadinessBlocker, adminPacketWorkflow] = await Promise.all([
    runOwnerReadinessBlockerProbe(context),
    runAdminPacketWorkflowProbe(context, env),
  ]);

  return {
    ownerReadinessBlocker,
    adminPacketWorkflow,
  };
}

function stage(
  stages: AuditStage[],
  id: string,
  label: string,
  status: StageStatus,
  details: string,
  evidence?: Record<string, unknown>,
) {
  stages.push({ id, label, status, details, evidence });
}

function probeFromSmoke(result: SmokeResult): BeforeCleanupProbe | null {
  const probe = result.beforeCleanupProbe as BeforeCleanupProbe | null | undefined;
  if (!probe || typeof probe !== "object") return null;
  return probe;
}

export function evaluateOperationalAudit(
  result: SmokeResult,
  durationMs: number,
  options: EvaluateOperationalAuditOptions = {},
): OperationalAuditReport {
  const requireAdmin = options.requireAdmin === true;
  const stages: AuditStage[] = [];
  const probe = probeFromSmoke(result);
  const ownerCounts = result.cleanupStatus?.purgedCounts ?? {};
  const packet = result.packet;
  const selectedIssueId = packet.selectedIssueId;

  stage(stages, "signup_auth_session", "Signup, Login, Session", "PASS", "Synthetic user registered, logged out, logged back in, and hydrated a user session.", {
    registeredUserId: result.registeredUserId,
    sessionUserId: result.sessionUserId,
    authMode: result.authMode,
  });

  stage(stages, "upload_storage", "Upload And Storage", "PASS", "Synthetic PDF upload produced an owned report artifact and storage-backed artifact metadata.", {
    artifactId: result.artifact.artifactId,
    ownerUserId: result.artifact.ownerUserId,
    processingStatus: result.artifact.processingStatus,
    sha256Present: result.artifact.sha256Present,
  });

  stage(stages, "ocr_ingest_processing", "OCR And Ingest Processing", "PASS", "Ingest reached a completed terminal state without a stale or no-worker terminal failure.", {
    processOutputMode: result.upload.processOutputMode,
    terminalStatus: result.ingestStatus.terminalStatus,
    queueStatus: result.ingestStatus.queueStatus,
    diagnosticCode: result.ingestStatus.diagnosticCode,
    pollCount: result.ingestStatus.pollCount,
  });

  stage(stages, "parsing_canonical_mapping", "Parsing And Canonical Mapping", "PASS", "Parser output produced Canadian bureau metadata, tradelines, and actionable findings.", {
    bureauName: result.parserReview.bureauName,
    region: result.parserReview.region,
    platformScope: result.parserReview.platformScope,
    totalTradelines: result.parserReview.totalTradelines,
    actionableCount: result.parserReview.actionableCount,
  });

  stage(stages, "tradeline_violation_evidence", "Tradelines, Findings, Evidence", "PASS", "Packet recommendation found an actionable finding linked to a tradeline and bureau context.", {
    issueId: result.findingReview.issueId,
    tradelineId: result.findingReview.tradelineId,
    bureauName: result.findingReview.bureauName,
    issueType: result.findingReview.issueType,
  });

  stage(stages, "parser_confidence_gate", "Parser Confidence Gate", "PASS", "The live selected finding passed packet readiness; inline parserQuality is only available for non-queued processing output.", {
    processOutputMode: result.upload.processOutputMode,
    parserConfidenceScore: result.upload.parserConfidenceScore,
    parserRequiresManualReview: result.upload.parserRequiresManualReview,
    packetReady: packet.packetReady,
  });

  const readinessStatus =
    packet.packetReady === true &&
    selectedIssueId !== null &&
    packet.eligibleFindingIds.includes(selectedIssueId)
      ? "PASS"
      : "FAIL";
  stage(stages, "readiness_gating", "Readiness Gating", readinessStatus, readinessStatus === "PASS"
    ? "Selected finding was packet-ready and preserved through readiness validation."
    : "Selected finding did not satisfy packet readiness.",
  {
    selectedIssueId,
    packetReady: packet.packetReady,
    eligibleFindingIds: packet.eligibleFindingIds,
  });

  const blockerProbe = probe?.ownerReadinessBlocker;
  stage(stages, "readiness_blocker_negative", "Readiness Blocker Negative Check", blockerProbe?.status === "passed" ? "PASS" : "FAIL", blockerProbe?.detail ?? "Readiness negative blocker probe did not run.", {
    packetReady: blockerProbe?.packetReady,
    reasonCodes: blockerProbe?.reasonCodes,
  });

  const packetStatus =
    packet.packetId &&
    packet.pdfHttpStatus === 200 &&
    String(packet.pdfContentType ?? "").includes("application/pdf") &&
    packet.pdfStartsWithPdf === true &&
    Number(packet.pdfByteLength ?? 0) > 1000
      ? "PASS"
      : "FAIL";
  stage(stages, "packet_pdf_retrieval", "Packet Generation And PDF Retrieval", packetStatus, packetStatus === "PASS"
    ? "Packet record was created and PDF retrieval returned a valid PDF response."
    : "Packet creation or PDF retrieval failed validation.",
  {
    packetId: packet.packetId,
    packetStatus: packet.status,
    pdfHttpStatus: packet.pdfHttpStatus,
    pdfContentType: packet.pdfContentType,
    pdfByteLength: packet.pdfByteLength,
    pdfStartsWithPdf: packet.pdfStartsWithPdf,
  });

  const authzStatus =
    result.nonOwnerAccess?.denied === true &&
    packet.nonOwnerAccess?.denied === true
      ? "PASS"
      : "FAIL";
  stage(stages, "authorization_boundaries", "Authorization Boundaries", authzStatus, authzStatus === "PASS"
    ? "Non-owner upload-results and packet-PDF access were rejected."
    : "Non-owner authorization checks did not reject access as expected.",
  {
    uploadResultsNonOwnerStatus: result.nonOwnerAccess?.status,
    packetPdfNonOwnerStatus: packet.nonOwnerAccess?.status,
  });

  const adminProbe = probe?.adminPacketWorkflow;
  const adminCredentialsMissing =
    adminProbe?.status === "skipped" &&
    adminProbe.skipCode === ADMIN_PROBE_SKIPPED_CREDENTIALS_MISSING;
  const adminAuthFailed = adminProbe?.status === "auth_failed";
  const adminStatus: StageStatus =
    adminProbe?.status === "passed"
      ? "PASS"
      : adminCredentialsMissing && !requireAdmin
        ? "SKIP"
        : "FAIL";
  const adminDetails =
    adminCredentialsMissing
      ? requireAdmin
        ? `${ADMIN_PROBE_SKIPPED_CREDENTIALS_MISSING}: Admin credentials are required because --require-admin was set.`
        : `${ADMIN_PROBE_SKIPPED_CREDENTIALS_MISSING}: Non-admin workflow completed, but admin credentials were not supplied for the admin packet workflow probe.`
      : adminAuthFailed
        ? adminProbe.detail
      : adminProbe?.detail ?? "Admin packet workflow probe did not run.";
  stage(stages, "admin_packet_workflow", "Admin Packet Workflow", adminStatus, adminDetails, {
    status: adminProbe?.status,
    mode: adminProbe?.mode,
    skipCode: adminProbe?.skipCode,
    authFailureCode: adminProbe?.authFailureCode,
    requireAdmin,
    adminSessionUserId: adminProbe?.adminSessionUserId,
    readinessBypassBlocked: adminProbe?.readinessBypassBlocked,
    readinessBypassReasonCodes: adminProbe?.readinessBypassReasonCodes,
    packetId: adminProbe?.packetId,
    pdfStatus: adminProbe?.pdfStatus,
    pdfContentType: adminProbe?.pdfContentType,
    pdfByteLength: adminProbe?.pdfByteLength,
    createdPacketVisibleInAdminList: adminProbe?.createdPacketVisibleInAdminList,
    auditLogPacketGenerated: adminProbe?.auditLogPacketGenerated,
    auditLogStatus: adminProbe?.auditLogStatus,
  });

  const cleanupStatus =
    result.safety.syntheticUserSelfDeleted === true &&
    result.actorCleanup.every((actor) => actor.cleanupStatus === "deleted") &&
    Number(ownerCounts.reportArtifacts ?? 0) >= 1 &&
    Number(ownerCounts.tradelines ?? 0) >= 2 &&
    Number(ownerCounts.storedFiles ?? 0) >= 1 &&
    Number(ownerCounts.users ?? 0) === 1
      ? "PASS"
      : "FAIL";
  stage(stages, "cleanup_lifecycle", "Cleanup Lifecycle", cleanupStatus, cleanupStatus === "PASS"
    ? "Synthetic owner and non-owner accounts self-deleted and reported artifact, tradeline, storage, and user cleanup."
    : "Cleanup did not report all expected synthetic account or artifact lifecycle deletions.",
  {
    ownerPurgedCounts: ownerCounts,
    actorCleanup: result.actorCleanup,
    note: "Tradeline-linked packets are deleted in the report-data cascade before the residual packet counter runs.",
  });

  const failureStages = stages.filter((item) => item.status === "FAIL").map((item) => item.id);
  const incompleteStages = stages.filter((item) => item.status === "SKIP").map((item) => item.id);
  const status: OperationalAuditStatus =
    adminAuthFailed ? "FAIL_AUTH" : failureStages.length > 0 ? "FAIL" : incompleteStages.length > 0 ? "INCOMPLETE" : "PASS";

  return {
    status,
    certification:
      status === "PASS"
        ? "Operational PASS: staging upload-to-packet workflow, admin packet probe, authorization, PDF retrieval, and cleanup lifecycle passed."
        : status === "INCOMPLETE"
          ? "Operational INCOMPLETE: non-admin staging workflow passed, but the admin packet workflow probe was skipped because admin credentials were missing."
          : status === "FAIL_AUTH"
            ? "Operational FAIL_AUTH: configured admin credentials failed authentication, so the admin packet workflow probe could not run."
          : "Operational FAIL: one or more required Level 3 audit stages failed.",
    generatedAt: new Date().toISOString(),
    baseUrl: result.baseUrl,
    durationMs,
    failureStages,
    incompleteStages,
    metrics: {
      requireAdmin,
      ingestPollCount: result.ingestStatus.pollCount,
      totalTradelines: result.parserReview.totalTradelines,
      actionableFindings: result.parserReview.actionableCount,
      ownerPacketPdfByteLength: result.packet.pdfByteLength,
      adminProbeStatus: adminProbe?.status ?? null,
      adminProbeSkipCode: adminProbe?.skipCode ?? null,
      adminProbeAuthFailureCode: adminProbe?.authFailureCode ?? null,
      adminPacketPdfByteLength: adminProbe?.pdfByteLength ?? null,
      cleanupReportArtifacts: ownerCounts.reportArtifacts ?? null,
      cleanupTradelines: ownerCounts.tradelines ?? null,
      cleanupStoredFiles: ownerCounts.storedFiles ?? null,
    },
    stages,
  };
}

function buildStartupFailureReport(
  baseUrl: string | null,
  durationMs: number,
  reason: string,
): OperationalAuditReport {
  const failureStage = classifyE2eFailureStage(reason);
  return {
    status: "FAIL",
    certification: "Operational FAIL: staging workflow did not complete.",
    generatedAt: new Date().toISOString(),
    baseUrl,
    durationMs,
    failureStages: [failureStage],
    incompleteStages: [],
    metrics: {},
    stages: [
      {
        id: failureStage,
        label: "Workflow Failure",
        status: "FAIL",
        details: reason,
      },
    ],
  };
}

export async function runE2eOperationalAuditCli(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv.slice(2),
): Promise<number> {
  let options: E2eOperationalAuditOptions;
  try {
    options = parseE2eOperationalAuditArgs(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const report = buildStartupFailureReport(null, 0, message);
    console.error(JSON.stringify(report, null, 2));
    return 1;
  }

  const auditEnv = buildE2eOperationalAuditEnv(env);
  const config = buildSmokeConfig(auditEnv);
  const startedAt = performance.now();

  if (config.status === "skipped") {
    console.log(config.reason);
    return SKIPPED_EXIT_CODE;
  }

  if (config.status === "error") {
    const report = buildStartupFailureReport(
      normalizeEnv(auditEnv.STAGING_BASE_URL) ?? normalizeEnv(auditEnv.STAGING_APP_URL) ?? normalizeEnv(auditEnv.LOCAL_SMOKE_BASE_URL),
      Math.round(performance.now() - startedAt),
      config.reason,
    );
    console.error(JSON.stringify(report, null, 2));
    return 1;
  }

  try {
    const result = await runSmoke(config, {
      beforeCleanup: (context) => runBeforeCleanupProbe(context, auditEnv),
    });
    const report = evaluateOperationalAudit(result, Math.round(performance.now() - startedAt), options);
    console.log(JSON.stringify(report, null, 2));
    if (report.status === "PASS") return 0;
    if (report.status === "INCOMPLETE") return SKIPPED_EXIT_CODE;
    if (report.status === "FAIL_AUTH") return 3;
    return 1;
  } catch (error) {
    const message = redactSecretText(error instanceof Error ? error.message : String(error), auditEnv);
    const report = buildStartupFailureReport(config.baseUrl, Math.round(performance.now() - startedAt), message);
    console.error(JSON.stringify(report, null, 2));
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runE2eOperationalAuditCli().then((code) => {
    process.exitCode = code;
  });
}
