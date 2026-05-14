import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  buildSmokeConfig,
  buildSyntheticRuntimeBridgePayload,
  FORBIDDEN_RUNTIME_MUTATION_ENDPOINTS,
  redactSecretText,
  REFUSED_PRODUCTION_HOSTS,
  RUNTIME_BRIDGE_ENDPOINTS,
  runCli,
  SKIPPED_EXIT_CODE,
  SMOKE_GATE_ENV,
  SYNTHETIC_RUNTIME_BRIDGE_MAPPING,
  validateSmokeHost,
} from "../../scripts/staging-runtime-bridge-mapping-smoke";

describe("runtime bridge mapping smoke harness gating", () => {
  it("refuses to run without the explicit smoke gate", () => {
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

  it("allows the staging host when required authenticated admin env is present", () => {
    const config = buildSmokeConfig({
      [SMOKE_GATE_ENV]: "true",
      STAGING_BASE_URL: "https://staging.creditregulatorpro.com",
      STAGING_ADMIN_SESSION_COOKIE: "floot_built_app_session=abc123xyz",
      CRP_RUNTIME_BRIDGE_MAPPING_SMOKE_RUN_ID: "unit-run",
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

  it("does not print configured secrets or session cookies", () => {
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

  it("requires synthetic-only runtime bridge identifiers", () => {
    const payload = buildSyntheticRuntimeBridgePayload("runtime bridge smoke 001");

    expect(payload).toEqual(
      expect.objectContaining({
        bridgeMode: "shadow",
        deterministicRuleId: "UI_SMOKE_RUNTIME_BRIDGE_RULE_runtime_bridge_smoke_001",
        violationCategory: "UI_SMOKE_CATEGORY",
        staticReferenceId: "UI_SMOKE_STATIC_REF_runtime_bridge_smoke_001",
        dbRegulationId: "UI_SMOKE_DB_REF_runtime_bridge_smoke_001",
        referenceClass: "local_procedural",
        consumerWordingMode: "procedural_reference",
        sourceVersion: "ui-smoke",
      }),
    );
    expect(JSON.stringify(SYNTHETIC_RUNTIME_BRIDGE_MAPPING)).not.toMatch(
      /accountNumber|rawExtractedText|creditReport|customer|fullSin|socialInsurance|packetContent|PIPEDA|FCRA|FCBA/i,
    );
    expect(JSON.stringify(payload)).not.toMatch(
      /accountNumber|rawExtractedText|creditReport|customer|fullSin|socialInsurance|packetContent|PIPEDA|FCRA|FCBA/i,
    );
  });

  it("verifies active_limited_runtime rejection as part of smoke checks", () => {
    const source = readFileSync(
      join(process.cwd(), "scripts", "staging-runtime-bridge-mapping-smoke.ts"),
      "utf8",
    );

    expect(source).toContain("active_limited_runtime");
    expect(source).toContain("active_limited_runtime rejection");
    expect(source).toContain("expectedRuntimeSource: \"static_runtime\"");
    expect(source).toContain("Synthetic smoke must not activate runtime truth.");
  });

  it("does not define or call a runtime activation endpoint", () => {
    expect(RUNTIME_BRIDGE_ENDPOINTS).toEqual({
      create: "/_api/regulation-registry/runtime-bridge/create",
      list: "/_api/regulation-registry/runtime-bridge/list",
      updateStatus: "/_api/regulation-registry/runtime-bridge/update-status",
    });
    expect(FORBIDDEN_RUNTIME_MUTATION_ENDPOINTS).toEqual(
      expect.arrayContaining([
        { method: "POST", path: "/_api/regulation-registry/runtime-bridge/activate" },
        { method: "POST", path: "/_api/regulation-registry/runtime-bridge/activate-limited-runtime" },
        { method: "GET", path: "/_api/regulation-registry/runtime-bridge/runtime-selector" },
      ]),
    );

    const source = readFileSync(
      join(process.cwd(), "scripts", "staging-runtime-bridge-mapping-smoke.ts"),
      "utf8",
    );
    expect(source).toContain("assertNoForbiddenEndpointCalls");
    expect(source).not.toContain("complianceScanner");
    expect(source).not.toContain("selectRuntimeReference");
    expect(source).not.toContain("approveRegulationCandidate");
    expect(source).not.toContain("upsertRegulationViolationMapping");
  });

  it("contains cleanup archive behavior for the synthetic bridge mapping", () => {
    const source = readFileSync(
      join(process.cwd(), "scripts", "staging-runtime-bridge-mapping-smoke.ts"),
      "utf8",
    );

    expect(source).toContain("archiveSyntheticMapping");
    expect(source).toContain("activationStatus: \"archived\"");
    expect(source).toContain("Archived after gated runtime bridge mapping smoke.");
    expect(source).toContain("Final cleanup status");
  });
});
