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

type StageStatus = "PASS" | "FAIL" | "WARN" | "SKIP";

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

type OwnerReadinessBlockerProbe = {
  status: "passed" | "failed";
  httpStatus?: number;
  packetReady?: boolean;
  reasonCodes?: string[];
  detail?: string;
};

type AdminPacketWorkflowProbe = {
  status: "passed" | "failed" | "skipped";
  mode?: "session_cookie" | "credentials";
  detail: string;
  packetId?: number;
  pdfStatus?: number;
  pdfContentType?: string;
  pdfByteLength?: number;
  pdfStartsWithPdf?: boolean;
  listTotal?: number;
  createdPacketVisibleInAdminList?: boolean;
};

type BeforeCleanupProbe = {
  ownerReadinessBlocker: OwnerReadinessBlockerProbe;
  adminPacketWorkflow: AdminPacketWorkflowProbe;
};

type SmokeResult = Awaited<ReturnType<typeof runSmoke>>;

type OperationalAuditReport = {
  status: "PASS" | "FAIL";
  certification: string;
  generatedAt: string;
  baseUrl: string | null;
  durationMs: number;
  failureStages: string[];
  metrics: Record<string, unknown>;
  stages: AuditStage[];
};

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
  const sessionCookie = envValue(env, [`${prefix}_ADMIN_SESSION_COOKIE`, `${fallbackPrefix}_ADMIN_SESSION_COOKIE`]);
  if (sessionCookie) {
    return {
      status: "configured",
      mode: "session_cookie",
      sessionCookie,
    };
  }

  const email = envValue(env, [`${prefix}_ADMIN_EMAIL`, `${fallbackPrefix}_ADMIN_EMAIL`]);
  const password = envValue(env, [`${prefix}_ADMIN_PASSWORD`, `${fallbackPrefix}_ADMIN_PASSWORD`]);
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
  if (session.user.role !== "admin") {
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
      detail: auth.reason,
    };
  }

  if (!context.selectedIssueId) {
    return {
      status: "failed",
      detail: "Owner packet workflow did not expose a selected issue ID for admin packet creation.",
    };
  }

  try {
    const { api, mode } = await authenticateAdminApi(context.config, env);
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
        detail: `Admin readiness did not accept the owner finding: ${readiness.reasonCodes.join(", ") || "no reason codes"}`,
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

    return {
      status: createdPacketVisibleInAdminList ? "passed" : "failed",
      mode,
      detail: createdPacketVisibleInAdminList
        ? "Admin authenticated, created a packet from the owner finding, downloaded the PDF, and saw it in packet list."
        : "Admin-created packet was not visible in the admin packet list.",
      packetId: created.packetId,
      pdfStatus: pdfResponse.status,
      pdfContentType,
      pdfByteLength: pdfBytes.byteLength,
      pdfStartsWithPdf,
      listTotal: packetList.total,
      createdPacketVisibleInAdminList,
    };
  } catch (error) {
    return {
      status: "failed",
      mode: auth.mode,
      detail: redactSecretText(error instanceof Error ? error.message : String(error), env),
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
): OperationalAuditReport {
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
  stage(stages, "admin_packet_workflow", "Admin Packet Workflow", adminProbe?.status === "passed" ? "PASS" : "FAIL", adminProbe?.detail ?? "Admin packet workflow probe did not run.", {
    status: adminProbe?.status,
    mode: adminProbe?.mode,
    packetId: adminProbe?.packetId,
    pdfStatus: adminProbe?.pdfStatus,
    pdfContentType: adminProbe?.pdfContentType,
    pdfByteLength: adminProbe?.pdfByteLength,
    createdPacketVisibleInAdminList: adminProbe?.createdPacketVisibleInAdminList,
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
  const status = failureStages.length === 0 ? "PASS" : "FAIL";

  return {
    status,
    certification:
      status === "PASS"
        ? "Operational PASS: staging upload-to-packet workflow, admin packet probe, authorization, PDF retrieval, and cleanup lifecycle passed."
        : "Operational FAIL: one or more required Level 3 audit stages failed.",
    generatedAt: new Date().toISOString(),
    baseUrl: result.baseUrl,
    durationMs,
    failureStages,
    metrics: {
      ingestPollCount: result.ingestStatus.pollCount,
      totalTradelines: result.parserReview.totalTradelines,
      actionableFindings: result.parserReview.actionableCount,
      ownerPacketPdfByteLength: result.packet.pdfByteLength,
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

export async function runE2eOperationalAuditCli(env: NodeJS.ProcessEnv = process.env): Promise<number> {
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
    const report = evaluateOperationalAudit(result, Math.round(performance.now() - startedAt));
    console.log(JSON.stringify(report, null, 2));
    return report.status === "PASS" ? 0 : 1;
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
