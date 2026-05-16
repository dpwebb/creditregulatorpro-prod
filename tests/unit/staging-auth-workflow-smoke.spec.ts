import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  AUTH_WORKFLOW_ENDPOINTS,
  AUTH_WORKFLOW_SMOKE_ENV,
  buildSmokeConfig,
  buildSyntheticCreditReportPdfBase64,
  buildSyntheticEmail,
  redactSecretText,
  REFUSED_PRODUCTION_HOSTS,
  runCli,
  SKIPPED_EXIT_CODE,
  smokeRunIdentifier,
  validateSmokeHost,
} from "../../scripts/staging-auth-workflow-smoke";

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
      }),
    );
    expect(config.status === "ready" ? config.email : "").toMatch(/^auth\.workflow\.unit_auth_flow\.\d+@example\.com$/);
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

  it("covers the authenticated upload-to-packet workflow endpoints only", () => {
    expect(AUTH_WORKFLOW_ENDPOINTS).toMatchObject({
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
    });

    const source = smokeSource();
    expect(source).toContain("No packet-ready synthetic credit bureau finding");
    expect(source).toContain("confirmPhrase: \"DELETE MY ACCOUNT\"");
    expect(source).not.toContain("/_api/admin/delete-user");
    expect(source).not.toContain("/_api/regulation-registry/runtime-bridge/activate");
    expect(source).not.toContain("packetType: \"furnisher\"");
  });
});
