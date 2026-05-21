import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  AUTH_WORKFLOW_ENDPOINTS,
  AUTH_WORKFLOW_SMOKE_ENV,
  buildSmokeConfig,
  buildSyntheticCreditReportPdfBase64,
  buildSyntheticEmail,
  isCompletedIngestPhase2Response,
  isFailedTerminalIngestStatus,
  isSuccessfulTerminalIngestStatus,
  redactSecretText,
  REFUSED_PRODUCTION_HOSTS,
  runCli,
  SKIPPED_EXIT_CODE,
  smokeRunIdentifier,
  summarizeIngestStatus,
  validateSmokeHost,
} from "../../scripts/staging-auth-workflow-smoke";
import { buildPacketWorkflowSmokeEnv } from "../../scripts/staging-auth-packet-workflow-smoke";

const smokeSource = () =>
  readFileSync(join(process.cwd(), "scripts", "staging-auth-workflow-smoke.ts"), "utf8");

describe("authenticated workflow smoke harness", () => {
  it("requires an explicit gate env var", () => {
    expect(
      buildSmokeConfig({
        STAGING_BASE_URL: "https://staging.creditregulatorpro.com",
      }),
    ).toEqual({
      status: "skipped",
      reason: `SKIPPED: ${AUTH_WORKFLOW_SMOKE_ENV}=true is required.`,
    });
  });

  it("exits skipped when no smoke base URL is configured", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const code = await runCli({
      [AUTH_WORKFLOW_SMOKE_ENV]: "true",
    });

    expect(code).toBe(SKIPPED_EXIT_CODE);
    expect(logSpy).toHaveBeenCalledWith(
      "SKIPPED: STAGING_BASE_URL, STAGING_APP_URL, or LOCAL_SMOKE_BASE_URL is required.",
    );
    logSpy.mockRestore();
  });

  it("refuses production and unapproved hosts", () => {
    for (const host of REFUSED_PRODUCTION_HOSTS) {
      expect(validateSmokeHost(`https://${host}`)).toEqual({
        ok: false,
        reason: `Refusing to run authenticated workflow smoke against production host ${host}.`,
      });
    }

    expect(validateSmokeHost("https://example.com").ok).toBe(false);
  });

  it("allows staging and builds a self-registering config", () => {
    const config = buildSmokeConfig({
      [AUTH_WORKFLOW_SMOKE_ENV]: "true",
      STAGING_BASE_URL: "https://staging.creditregulatorpro.com",
      CRP_AUTH_WORKFLOW_SMOKE_RUN_ID: "unit auth flow",
    });

    expect(config).toEqual(
      expect.objectContaining({
        status: "ready",
        baseUrl: "https://staging.creditregulatorpro.com",
        origin: "https://staging.creditregulatorpro.com",
        host: "staging.creditregulatorpro.com",
        authMode: "self_registered",
        runId: "unit auth flow",
        cleanup: true,
        includePacket: false,
      }),
    );
    expect(config.status === "ready" ? config.email : "").toMatch(/^auth\.workflow\.unit_auth_flow\.\d+@example\.com$/);
  });

  it("keeps packet checks explicit so upload-to-results certification is not masked by packet PDF failures", () => {
    const config = buildSmokeConfig({
      [AUTH_WORKFLOW_SMOKE_ENV]: "true",
      STAGING_BASE_URL: "https://staging.creditregulatorpro.com",
      CRP_AUTH_WORKFLOW_SMOKE_INCLUDE_PACKET: "true",
    });

    expect(config).toEqual(expect.objectContaining({
      status: "ready",
      includePacket: true,
    }));
  });

  it("provides a dedicated packet-included authenticated workflow smoke entrypoint", () => {
    expect(
      buildPacketWorkflowSmokeEnv({
        STAGING_BASE_URL: "https://staging.creditregulatorpro.com",
      }),
    ).toEqual(
      expect.objectContaining({
        [AUTH_WORKFLOW_SMOKE_ENV]: "true",
        CRP_AUTH_WORKFLOW_SMOKE_INCLUDE_PACKET: "true",
      }),
    );
  });

  it("refuses staging runs when cleanup is disabled", () => {
    const config = buildSmokeConfig({
      [AUTH_WORKFLOW_SMOKE_ENV]: "true",
      STAGING_BASE_URL: "https://staging.creditregulatorpro.com",
      CRP_AUTH_WORKFLOW_SMOKE_SKIP_CLEANUP: "true",
    });

    expect(config).toEqual({
      status: "error",
      reason: "Refusing to run staging authenticated workflow smoke without cleanup.",
    });
  });

  it("generates stable synthetic identifiers", () => {
    expect(smokeRunIdentifier("auth flow 001")).toBe("auth_flow_001");
    expect(buildSyntheticEmail("auth flow 001", 123)).toBe("auth.workflow.auth_flow_001.123@example.com");
  });

  it("does not print configured secrets", () => {
    const redacted = redactSecretText("password=SecretSmoke123 session=floot_built_app_session=abc", {
      CRP_AUTH_WORKFLOW_SMOKE_PASSWORD: "SecretSmoke123",
      STAGING_ADMIN_SESSION_COOKIE: "floot_built_app_session=abc",
    });

    expect(redacted).not.toContain("SecretSmoke123");
    expect(redacted).not.toContain("floot_built_app_session=abc");
    expect(redacted).toContain("[REDACTED]");
  });

  it("generates a text-based synthetic PDF payload", async () => {
    const pdfBase64 = await buildSyntheticCreditReportPdfBase64();
    const bytes = Buffer.from(pdfBase64, "base64");

    expect(bytes.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("covers authenticated upload-to-results endpoints and keeps packet checks opt-in", () => {
    expect(AUTH_WORKFLOW_ENDPOINTS).toMatchObject({
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
    });

    const source = smokeSource();
    expect(source).toContain("pollIngestStatus");
    expect(source).toContain("stalled_no_worker_heartbeat");
    expect(source).toContain("verifyArtifactOwnership");
    expect(source).toContain("assertNonOwnerUploadResultsDenied");
    expect(source).toContain("assertNonOwnerPacketPdfDenied");
    expect(source).toContain("[auth-smoke] packet-pdf");
    expect(source).toContain("CRP_AUTH_WORKFLOW_SMOKE_INCLUDE_PACKET");
    expect(source).toContain("No packet-ready synthetic credit bureau finding");
    expect(source).toContain("confirmPhrase: \"DELETE MY ACCOUNT\"");
    expect(source).not.toContain("/_api/admin/delete-user");
    expect(source).not.toContain("/_api/regulation-registry/runtime-bridge/activate");
    expect(source).not.toContain("packetType: \"furnisher\"");
  });

  it("does not treat queued worker-bound ingest output as completed parser output", () => {
    expect(
      isCompletedIngestPhase2Response({
        ok: true,
        queued: true,
        artifactId: 42,
        storageUrl: "42",
        jobId: 7,
        queueStatus: "queued",
        processingStatus: "queued",
        uploadStatus: "queued_waiting_for_worker",
      }),
    ).toBe(false);

    expect(
      isCompletedIngestPhase2Response({
        ok: true,
        storageUrl: "42",
        tradelinesCount: 2,
        tradelineIds: [10, 11],
      }),
    ).toBe(true);
  });

  it("classifies ingest status terminal states without accepting stalls as success", () => {
    const completed = {
      ok: true,
      artifactId: 42,
      jobId: 7,
      status: "completed" as const,
      queueStatus: "succeeded",
      processingStatus: "completed",
      nextAction: "review_results",
      userMessage: "done",
      diagnosticCode: "INGEST_PROCESSING_COMPLETED",
      workerRequired: false,
      canLeavePage: true,
      canCheckStatus: false,
      retryAt: null,
      checkedAt: "2026-05-21T12:00:00.000Z",
    };
    const stalled = {
      ...completed,
      ok: false,
      status: "stalled_no_worker_heartbeat" as const,
      queueStatus: "queued",
      processingStatus: "stalled/no-worker-heartbeat",
      nextAction: "contact_support",
      diagnosticCode: "INGEST_NO_WORKER_HEARTBEAT",
      workerRequired: true,
      canCheckStatus: true,
    };

    expect(isSuccessfulTerminalIngestStatus(completed)).toBe(true);
    expect(isFailedTerminalIngestStatus(completed)).toBe(false);
    expect(isSuccessfulTerminalIngestStatus(stalled)).toBe(false);
    expect(isFailedTerminalIngestStatus(stalled)).toBe(true);
    expect(summarizeIngestStatus(stalled)).toEqual({
      artifactId: 42,
      jobId: 7,
      status: "stalled_no_worker_heartbeat",
      queueStatus: "queued",
      processingStatus: "stalled/no-worker-heartbeat",
      nextAction: "contact_support",
      diagnosticCode: "INGEST_NO_WORKER_HEARTBEAT",
      workerRequired: true,
      retryAt: null,
      checkedAt: "2026-05-21T12:00:00.000Z",
    });
  });
});
