import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ADMIN_PROBE_SKIPPED_CREDENTIALS_MISSING,
  buildE2eOperationalAuditEnv,
  classifyE2eFailureStage,
  evaluateOperationalAudit,
  parseE2eOperationalAuditArgs,
  resolveAdminAuthInputs,
} from "../../scripts/e2e-operational-audit";
import { AUTH_WORKFLOW_SMOKE_ENV } from "../../scripts/staging-auth-workflow-smoke";

function mockSmokeResult(overrides: Record<string, unknown> = {}) {
  return {
    status: "passed",
    baseUrl: "https://staging.creditregulatorpro.com",
    host: "staging.creditregulatorpro.com",
    authMode: "self_registered",
    runId: "unit-e2e",
    registeredUserId: 101,
    sessionUserId: 101,
    artifact: {
      artifactId: 16,
      ownerUserId: 101,
      organizationId: null,
      processingStatus: "completed",
      sha256Present: true,
    },
    ingestStatus: {
      terminalStatus: "completed",
      queueStatus: "succeeded",
      processingStatus: "completed",
      jobId: 3,
      diagnosticCode: "INGEST_PROCESSING_COMPLETED",
      pollCount: 5,
      polls: [],
    },
    upload: {
      artifactId: 16,
      processOutputMode: "queued-worker-boundary",
      tradelinesCount: 2,
      tradelineIdsCount: null,
      parserConfidenceScore: null,
      parserRequiresManualReview: null,
    },
    parserReview: {
      bureauName: "TransUnion Canada",
      region: "CA",
      platformScope: "Canadian Credit Bureau Compliance",
      totalTradelines: 2,
      actionableCount: 6,
    },
    nonOwnerAccess: {
      denied: true,
      status: 403,
    },
    findingReview: {
      skipped: false,
      reason: null,
      issueId: 39,
      tradelineId: 20,
      bureauName: "TransUnion Canada",
      issueType: "Balance reported",
    },
    packet: {
      skipped: false,
      reason: null,
      packetId: 4,
      status: "generated",
      selectedIssueId: 39,
      buildSelectedIssueIds: [39],
      pdfHttpStatus: 200,
      pdfContentType: "application/pdf",
      pdfByteLength: 8485,
      pdfStartsWithPdf: true,
      packetReady: true,
      eligibleFindingIds: [39],
      nonOwnerAccess: {
        denied: true,
        status: 403,
      },
    },
    cleanupStatus: {
      status: "deleted",
      purgedCounts: {
        reportArtifacts: 1,
        tradelines: 2,
        storedFiles: 1,
        users: 1,
        packets: 0,
      },
    },
    actorCleanup: [
      { label: "owner", userId: 101, cleanupStatus: "deleted" },
      { label: "non-owner", userId: 102, cleanupStatus: "deleted" },
    ],
    beforeCleanupProbe: {
      ownerReadinessBlocker: {
        status: "passed",
        packetReady: false,
        reasonCodes: ["FINDING_NOT_FOUND"],
        detail: "Readiness endpoint returned a deterministic blocker for a missing finding.",
      },
      adminPacketWorkflow: {
        status: "passed",
        mode: "session_cookie",
        detail: "Admin authenticated, enforced readiness, created a packet from the owner finding, downloaded the PDF, saw it in packet list, and found the packet audit log.",
        adminSessionUserId: 1,
        readinessBypassBlocked: true,
        readinessBypassReasonCodes: ["FINDING_NOT_FOUND"],
        packetId: 5,
        pdfStatus: 200,
        pdfContentType: "application/pdf",
        pdfByteLength: 8500,
        pdfStartsWithPdf: true,
        listTotal: 1,
        createdPacketVisibleInAdminList: true,
        auditLogPacketGenerated: true,
        auditLogStatus: "found",
      },
    },
    safety: {
      productionHostRefusedByConfig: true,
      syntheticUserSelfDeleted: true,
      noAdminOverrideUsed: true,
      noRuntimeReferenceActivationUsed: true,
      noDirectFurnisherPacketUsed: true,
    },
    ...overrides,
  };
}

describe("e2e operational audit script", () => {
  it("builds an explicit packet-included staging smoke environment by default", () => {
    const env = buildE2eOperationalAuditEnv({});

    expect(env.STAGING_BASE_URL).toBe("https://staging.creditregulatorpro.com");
    expect(env[AUTH_WORKFLOW_SMOKE_ENV]).toBe("true");
    expect(env.CRP_AUTH_WORKFLOW_SMOKE_INCLUDE_PACKET).toBe("true");
    expect(env.CRP_AUTH_WORKFLOW_SMOKE_RUN_ID).toMatch(/^e2e-operational-audit-/);
  });

  it("respects a local smoke URL while still enabling the e2e packet audit gate", () => {
    const env = buildE2eOperationalAuditEnv({
      LOCAL_SMOKE_BASE_URL: "http://localhost:3333",
      CRP_AUTH_WORKFLOW_SMOKE_RUN_ID: "unit",
    });

    expect(env.STAGING_BASE_URL).toBeUndefined();
    expect(env.LOCAL_SMOKE_BASE_URL).toBe("http://localhost:3333");
    expect(env[AUTH_WORKFLOW_SMOKE_ENV]).toBe("true");
    expect(env.CRP_AUTH_WORKFLOW_SMOKE_INCLUDE_PACKET).toBe("true");
    expect(env.CRP_AUTH_WORKFLOW_SMOKE_RUN_ID).toBe("unit");
  });

  it("detects admin auth inputs without exposing secret values in the report layer", () => {
    expect(
      resolveAdminAuthInputs({
        STAGING_ADMIN_SESSION_COOKIE: "floot_built_app_session=abc; Path=/",
      }, "staging.creditregulatorpro.com"),
    ).toMatchObject({
      status: "configured",
      mode: "session_cookie",
    });

    expect(
      resolveAdminAuthInputs({
        STAGING_ADMIN_EMAIL: "admin@example.test",
        STAGING_ADMIN_PASSWORD: "super-secret-password",
      }, "staging.creditregulatorpro.com"),
    ).toMatchObject({
      status: "configured",
      mode: "credentials",
    });

    expect(resolveAdminAuthInputs({}, "staging.creditregulatorpro.com")).toMatchObject({
      status: "missing",
      reason: expect.stringContaining("STAGING_ADMIN_EMAIL/STAGING_ADMIN_PASSWORD"),
    });

    expect(
      resolveAdminAuthInputs({
        LOCAL_SMOKE_ADMIN_EMAIL: "admin@example.test",
        LOCAL_SMOKE_ADMIN_PASSWORD: "local-secret-password",
      }, "localhost"),
    ).toMatchObject({
      status: "configured",
      mode: "credentials",
    });
  });

  it("parses the explicit require-admin audit mode", () => {
    expect(parseE2eOperationalAuditArgs([])).toEqual({ requireAdmin: false });
    expect(parseE2eOperationalAuditArgs(["--require-admin"])).toEqual({ requireAdmin: true });
    expect(() => parseE2eOperationalAuditArgs(["--unknown"])).toThrow(/Unknown audit:e2e option/);
  });

  it("classifies operational failures by the broken workflow stage", () => {
    expect(classifyE2eFailureStage("Timed out after 240000ms waiting for ingest terminal status")).toBe(
      "ocr_ingest_processing",
    );
    expect(classifyE2eFailureStage("Selected finding was not packet-ready: NEEDS_USER_REVIEW")).toBe(
      "readiness_gating",
    );
    expect(classifyE2eFailureStage("Packet PDF response did not start with %PDF")).toBe("pdf_retrieval");
    expect(classifyE2eFailureStage("Synthetic account self-delete returned HTTP 500")).toBe("cleanup_lifecycle");
  });

  it("certifies the full workflow when packet, admin, authorization, and cleanup checks pass", () => {
    const report = evaluateOperationalAudit(mockSmokeResult() as never, 90_000);

    expect(report.status).toBe("PASS");
    expect(report.failureStages).toEqual([]);
    expect(report.incompleteStages).toEqual([]);
    expect(report.metrics).toMatchObject({
      requireAdmin: false,
      ingestPollCount: 5,
      totalTradelines: 2,
      actionableFindings: 6,
      ownerPacketPdfByteLength: 8485,
      adminProbeStatus: "passed",
      adminPacketPdfByteLength: 8500,
    });
  });

  it("reports incomplete when admin credentials are missing and admin is not required", () => {
    const report = evaluateOperationalAudit(mockSmokeResult({
      beforeCleanupProbe: {
        ownerReadinessBlocker: {
          status: "passed",
          packetReady: false,
          reasonCodes: ["FINDING_NOT_FOUND"],
          detail: "Readiness endpoint returned a deterministic blocker for a missing finding.",
        },
        adminPacketWorkflow: {
          status: "skipped",
          skipCode: ADMIN_PROBE_SKIPPED_CREDENTIALS_MISSING,
          detail: "STAGING_ADMIN_EMAIL/STAGING_ADMIN_PASSWORD or STAGING_ADMIN_SESSION_COOKIE is required for the admin packet workflow stage.",
        },
      },
    }) as never, 90_000);

    expect(report.status).toBe("INCOMPLETE");
    expect(report.failureStages).toEqual([]);
    expect(report.incompleteStages).toContain("admin_packet_workflow");
    expect(report.certification).toContain("Operational INCOMPLETE");
    expect(report.stages.find((stage) => stage.id === "admin_packet_workflow")).toMatchObject({
      status: "SKIP",
      details: expect.stringContaining(ADMIN_PROBE_SKIPPED_CREDENTIALS_MISSING),
      evidence: expect.objectContaining({
        skipCode: ADMIN_PROBE_SKIPPED_CREDENTIALS_MISSING,
        requireAdmin: false,
      }),
    });
  });

  it("fails when --require-admin is set and admin credentials are missing", () => {
    const report = evaluateOperationalAudit(mockSmokeResult({
      beforeCleanupProbe: {
        ownerReadinessBlocker: {
          status: "passed",
          packetReady: false,
          reasonCodes: ["FINDING_NOT_FOUND"],
          detail: "Readiness endpoint returned a deterministic blocker for a missing finding.",
        },
        adminPacketWorkflow: {
          status: "skipped",
          skipCode: ADMIN_PROBE_SKIPPED_CREDENTIALS_MISSING,
          detail: "STAGING_ADMIN_EMAIL/STAGING_ADMIN_PASSWORD or STAGING_ADMIN_SESSION_COOKIE is required for the admin packet workflow stage.",
        },
      },
    }) as never, 90_000, { requireAdmin: true });

    expect(report.status).toBe("FAIL");
    expect(report.failureStages).toContain("admin_packet_workflow");
    expect(report.incompleteStages).toEqual([]);
    expect(report.stages.find((stage) => stage.id === "admin_packet_workflow")).toMatchObject({
      status: "FAIL",
      details: expect.stringContaining(ADMIN_PROBE_SKIPPED_CREDENTIALS_MISSING),
      evidence: expect.objectContaining({
        requireAdmin: true,
      }),
    });
  });

  it("keeps audit:e2e wired as a package script", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts["audit:e2e"]).toBe("tsx scripts/e2e-operational-audit.ts");
  });
});
