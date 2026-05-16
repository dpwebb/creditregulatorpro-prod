import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  ADVISORY_BRIDGE_REPORT_ENDPOINT,
  buildNoMatchAdvisoryReportPath,
  buildSmokeConfig,
  FORBIDDEN_ADVISORY_BRIDGE_SMOKE_ENDPOINTS,
  REQUIRED_ADVISORY_BRIDGE_SAFETY_MESSAGES,
  redactSecretText,
  REFUSED_PRODUCTION_HOSTS,
  runCli,
  SKIPPED_EXIT_CODE,
  SMOKE_GATE_ENV,
  validateSmokeHost,
} from "../../scripts/staging-advisory-bridge-report-smoke";

const smokeSource = () =>
  readFileSync(join(process.cwd(), "scripts", "staging-advisory-bridge-report-smoke.ts"), "utf8");

describe("advisory bridge report smoke harness gating", () => {
  it("refuses to run without CRP_ADVISORY_BRIDGE_REPORT_SMOKE=true", () => {
    const config = buildSmokeConfig({
      STAGING_BASE_URL: "https://staging.creditregulatorpro.com",
      STAGING_ADMIN_EMAIL: "admin@example.test",
      STAGING_ADMIN_PASSWORD: "SecretAdminPass123",
    });

    expect(config).toEqual({
      status: "skipped",
      reason: `SKIPPED: ${SMOKE_GATE_ENV}=true is required.`,
    });
  });

  it("refuses production hosts", () => {
    for (const host of REFUSED_PRODUCTION_HOSTS) {
      expect(validateSmokeHost(`https://${host}`)).toEqual({
        ok: false,
        reason: `Refusing to run against production host ${host}.`,
      });
    }

    const config = buildSmokeConfig({
      [SMOKE_GATE_ENV]: "true",
      STAGING_BASE_URL: "https://creditregulatorpro.com",
      STAGING_ADMIN_EMAIL: "admin@example.test",
      STAGING_ADMIN_PASSWORD: "SecretAdminPass123",
    });

    expect(config.status).toBe("error");
    expect(config.reason).toContain("Refusing to run against production host");
  });

  it("allows staging host with required auth env", () => {
    const config = buildSmokeConfig({
      [SMOKE_GATE_ENV]: "true",
      STAGING_BASE_URL: "https://staging.creditregulatorpro.com",
      STAGING_ADMIN_SESSION_COOKIE: "floot_built_app_session=abc123xyz",
      CRP_ADVISORY_BRIDGE_REPORT_SMOKE_RUN_ID: "unit-run",
    });

    expect(config).toEqual(
      expect.objectContaining({
        status: "ready",
        baseUrl: "https://staging.creditregulatorpro.com",
        host: "staging.creditregulatorpro.com",
        authMode: "session_cookie",
        runId: "unit-run",
      }),
    );
  });

  it("exits skipped when no safe authenticated context exists", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const code = await runCli({
      [SMOKE_GATE_ENV]: "true",
    });

    expect(code).toBe(SKIPPED_EXIT_CODE);
    expect(logSpy).toHaveBeenCalledWith("SKIPPED: no safe authenticated admin context configured.");
    logSpy.mockRestore();
  });

  it("does not print secrets/session cookie/password", () => {
    const redacted = redactSecretText(
      "password=SecretAdminPass123 cookie=floot_built_app_session=abc123xyz",
      {
        STAGING_ADMIN_PASSWORD: "SecretAdminPass123",
        STAGING_ADMIN_SESSION_COOKIE: "floot_built_app_session=abc123xyz",
      },
    );

    expect(redacted).not.toContain("SecretAdminPass123");
    expect(redacted).not.toContain("abc123xyz");
    expect(redacted).toContain("[REDACTED]");
  });

  it("uses a synthetic no-match query tied to the current run ID", () => {
    const path = buildNoMatchAdvisoryReportPath("advisory bridge smoke 001");

    expect(path).toContain(ADVISORY_BRIDGE_REPORT_ENDPOINT);
    expect(path).toContain("deterministicRuleId=ADVISORY_BRIDGE_SMOKE_NO_MATCH_advisory_bridge_smoke_001");
    expect(path).toContain("bridgeMode=advisory");
    expect(path).toContain("activationStatus=approved_for_advisory");
    expect(path).not.toMatch(/accountNumber|rawExtractedText|creditReport|customer|fullSin|socialInsurance|packetContent|PIPEDA|FCRA|FCBA/i);
  });

  it("requires advisory report safety messaging", () => {
    expect(REQUIRED_ADVISORY_BRIDGE_SAFETY_MESSAGES).toEqual([
      "This is an advisory diagnostic only.",
      "Static runtime references remain active consumer-facing truth.",
      "DB advisory references are admin/internal only.",
      "This endpoint does not change packet wording, packet readiness, or violation firing.",
      "Runtime activation requires a separate approved implementation, tests, rollback plan, and explicit activation task.",
    ]);

    const source = smokeSource();
    expect(source).toContain("assertAdvisoryReportShape");
    expect(source).toContain("runtimeSourceUsed");
    expect(source).toContain("static_runtime");
    expect(source).toContain("admin_internal_only");
  });

  it("does not define or call runtime mutation, selector, packet, parser, or violation endpoints", () => {
    expect(FORBIDDEN_ADVISORY_BRIDGE_SMOKE_ENDPOINTS).toEqual(
      expect.arrayContaining([
        { method: "POST", path: "/_api/regulation-registry/runtime-bridge/create" },
        { method: "POST", path: "/_api/regulation-registry/runtime-bridge/update-status" },
        { method: "GET", path: "/_api/regulation-registry/runtime-bridge/runtime-selector" },
        { method: "GET", path: "/_api/packet/readiness" },
        { method: "POST", path: "/_api/violations/run" },
        { method: "POST", path: "/_api/parser/run" },
        { method: "POST", path: "/_api/ocr/run" },
      ]),
    );

    const source = smokeSource();
    expect(source).toContain("assertNoForbiddenEndpointCalls");
    expect(source).not.toContain("archiveSynthetic");
    expect(source).not.toContain("createSynthetic");
    expect(source).not.toContain("client.json(\"POST\"");
    expect(source).not.toContain("complianceScanner");
    expect(source).not.toContain("selectRuntimeReference");
    expect(source).not.toContain("approveRegulationCandidate");
    expect(source).not.toContain("upsertRegulationViolationMapping");
  });

  it("verifies read-only before/after runtime safety snapshots", () => {
    const source = smokeSource();

    expect(source).toContain("beforeRegistry");
    expect(source).toContain("afterRegistry");
    expect(source).toContain("beforeMappings");
    expect(source).toContain("afterMappings");
    expect(source).toContain("beforeBridgeMappings");
    expect(source).toContain("afterBridgeMappings");
    expect(source).toContain("beforeCandidates");
    expect(source).toContain("afterCandidates");
    expect(source).toContain("assertSnapshotUnchanged");
    expect(source).toContain("advisoryDiagnosticsOnly: true");
  });

  it("verifies authenticated smoke remains gated and docs-safe when no admin context is configured", () => {
    const source = smokeSource();

    expect(source).toContain("SKIPPED: no safe authenticated admin context configured.");
    expect(source).toContain("verifyNonAdminIfConfigured");
    expect(source).toContain("skipped: no safe non-admin context configured");
    expect(source).not.toMatch(/docs\/future-build-plan\.md|future-build-plan/i);
  });
});
