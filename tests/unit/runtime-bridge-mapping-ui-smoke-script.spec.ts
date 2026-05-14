import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  buildSmokeConfig,
  buildSyntheticRuntimeBridgeUiPayload,
  FORBIDDEN_ACTIVATION_LABELS,
  FORBIDDEN_RUNTIME_UI_ENDPOINTS,
  redactSecretText,
  REFUSED_PRODUCTION_HOSTS,
  RUNTIME_BRIDGE_ENDPOINTS,
  runCli,
  SKIPPED_EXIT_CODE,
  SMOKE_GATE_ENV,
  SYNTHETIC_RUNTIME_BRIDGE_UI_MAPPING,
  validateSmokeHost,
} from "../../scripts/staging-runtime-bridge-mapping-ui-smoke";

const smokeSource = () =>
  readFileSync(join(process.cwd(), "scripts", "staging-runtime-bridge-mapping-ui-smoke.ts"), "utf8");

describe("runtime bridge mapping UI smoke harness gating", () => {
  it("refuses to run without CRP_RUNTIME_BRIDGE_MAPPING_UI_SMOKE=true", () => {
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
      CRP_RUNTIME_BRIDGE_MAPPING_UI_SMOKE_RUN_ID: "unit-run",
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

  it("requires synthetic-only payload identifiers", () => {
    const payload = buildSyntheticRuntimeBridgeUiPayload("runtime bridge ui smoke 001");

    expect(payload).toEqual(
      expect.objectContaining({
        bridgeMode: "shadow",
        deterministicRuleId: "UI_SMOKE_RUNTIME_BRIDGE_RULE_runtime_bridge_ui_smoke_001",
        violationCategory: "UI_SMOKE_CATEGORY",
        staticReferenceId: "UI_SMOKE_STATIC_REF_runtime_bridge_ui_smoke_001",
        dbRegulationId: "UI_SMOKE_DB_REF_runtime_bridge_ui_smoke_001",
        referenceClass: "local_procedural",
        consumerWordingMode: "procedural_reference",
        sourceVersion: "ui-smoke",
      }),
    );
    expect(JSON.stringify(SYNTHETIC_RUNTIME_BRIDGE_UI_MAPPING)).not.toMatch(
      /accountNumber|rawExtractedText|creditReport|customer|fullSin|socialInsurance|packetContent|PIPEDA|FCRA|FCBA/i,
    );
    expect(JSON.stringify(payload)).not.toMatch(
      /accountNumber|rawExtractedText|creditReport|customer|fullSin|socialInsurance|packetContent|PIPEDA|FCRA|FCBA/i,
    );
  });

  it("verifies active_limited_runtime is not offered or accepted by the smoke flow", () => {
    const source = smokeSource();

    expect(source).toContain("active_limited_runtime");
    expect(source).toContain("active_limited_runtime rejection");
    expect(source).toContain("was accepted by the runtime bridge mapping UI smoke flow");
    expect(source).toContain("Approve for Limited Runtime Review");
    expect(source).not.toContain("Activate Limited Runtime\" }).click");
  });

  it("verifies no runtime activation or selector endpoint is called", () => {
    expect(RUNTIME_BRIDGE_ENDPOINTS).toEqual({
      create: "/_api/regulation-registry/runtime-bridge/create",
      list: "/_api/regulation-registry/runtime-bridge/list",
      updateStatus: "/_api/regulation-registry/runtime-bridge/update-status",
    });
    expect(FORBIDDEN_RUNTIME_UI_ENDPOINTS).toEqual(
      expect.arrayContaining([
        { method: "GET", path: "/_api/regulation-registry/runtime-bridge/runtime-selector" },
        { method: "POST", path: "/_api/regulation-registry/runtime-bridge/activate" },
        { method: "POST", path: "/_api/regulation-registry/runtime-bridge/activate-limited-runtime" },
      ]),
    );

    const source = smokeSource();
    expect(source).toContain("assertNoForbiddenEndpointCalls");
    expect(source).not.toContain("complianceScanner");
    expect(source).not.toContain("selectRuntimeReference");
    expect(source).not.toContain("approveRegulationCandidate");
    expect(source).not.toContain("upsertRegulationViolationMapping");
  });

  it("verifies forbidden activation-label checks exist", () => {
    expect(FORBIDDEN_ACTIVATION_LABELS).toEqual(
      expect.arrayContaining([
        "Activate",
        "Activate Runtime",
        "Make Runtime Truth",
        "Apply to Runtime",
        "Enforce",
        "Legal Violation",
        "Activate Limited Runtime",
        "Make DB Primary",
        "Replace Static Reference",
      ]),
    );

    const source = smokeSource();
    expect(source).toContain("assertForbiddenActivationLabelsAbsent");
    expect(source).toContain("getByRole(\"button\"");
    expect(source).toContain("FORBIDDEN_ACTIVATION_LABELS");
  });

  it("verifies cleanup/archive behavior is present", () => {
    const source = smokeSource();

    expect(source).toContain("archiveSyntheticMapping");
    expect(source).toContain("activationStatus: \"archived\"");
    expect(source).toContain("Archived after gated runtime bridge mapping UI smoke.");
    expect(source).toContain("Final cleanup status");
  });

  it("verifies selectors target the current run ID so old archived mappings do not create ambiguity", () => {
    const source = smokeSource();

    expect(source).toContain("buildSyntheticRuntimeBridgeUiPayload(runId)");
    expect(source).toContain("Synthetic runtime bridge mapping already exists for this run ID");
    expect(source).toContain("Use a unique UI smoke run ID");
    expect(source).toContain("const mappingCard = page.getByRole(\"article\")");
    expect(source).toContain("hasText: payload.deterministicRuleId");
    expect(source).toContain("hasText: payload.staticReferenceId");
    expect(source).toContain("hasText: payload.dbRegulationId");
    expect(source).toContain("await expect(mappingCard).toHaveCount(1");
  });
});
