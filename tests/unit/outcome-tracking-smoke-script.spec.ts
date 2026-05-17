import { describe, expect, it } from "vitest";

import {
  assertNoForbiddenEndpointCalls,
  assertPrivacySafe,
  buildSmokeConfig,
  buildSyntheticOutcomeFixture,
  FORBIDDEN_OUTCOME_SMOKE_ENDPOINTS,
  OUTCOME_CLEANUP_POLICY,
  OUTCOME_ENDPOINTS,
  redactSecretText,
  validateSmokeHost,
} from "../../scripts/staging-outcome-tracking-smoke";

function readyEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    CRP_OUTCOME_TRACKING_SMOKE: "true",
    STAGING_BASE_URL: "https://staging.creditregulatorpro.com",
    STAGING_ADMIN_SESSION_COOKIE: "floot_built_app_session=secret-session-cookie; Path=/",
    STAGING_OUTCOME_PREVIOUS_REPORT_ARTIFACT_ID: "101",
    STAGING_OUTCOME_LATER_REPORT_ARTIFACT_ID: "102",
    STAGING_OUTCOME_SYNTHETIC_MARKER: "OUTCOME_SMOKE_CREDITOR",
    ...overrides,
  };
}

describe("outcome tracking staging smoke harness", () => {
  it("refuses to run without CRP_OUTCOME_TRACKING_SMOKE=true", () => {
    const config = buildSmokeConfig({});

    expect(config).toEqual({
      status: "skipped",
      reason: "SKIPPED: CRP_OUTCOME_TRACKING_SMOKE=true is required.",
    });
  });

  it("refuses production hosts", () => {
    expect(validateSmokeHost("https://creditregulatorpro.com")).toEqual({
      ok: false,
      reason: "Refusing to run against production host creditregulatorpro.com.",
    });
    expect(buildSmokeConfig(readyEnv({ STAGING_BASE_URL: "https://www.creditregulatorpro.com" }))).toEqual(
      expect.objectContaining({ status: "error" }),
    );
  });

  it("allows staging host with required auth env and synthetic fixture IDs", () => {
    const config = buildSmokeConfig(readyEnv());

    expect(config).toMatchObject({
      status: "ready",
      baseUrl: "https://staging.creditregulatorpro.com",
      host: "staging.creditregulatorpro.com",
      authMode: "session_cookie",
      authRole: "admin",
      fixture: {
        previousReportArtifactId: 101,
        laterReportArtifactId: 102,
        syntheticMarker: "OUTCOME_SMOKE_CREDITOR",
      },
    });
  });

  it("exits skipped when no safe authenticated context exists", () => {
    const config = buildSmokeConfig(
      readyEnv({
        STAGING_ADMIN_SESSION_COOKIE: "",
        STAGING_USER_SESSION_COOKIE: "",
        STAGING_ADMIN_EMAIL: "",
        STAGING_ADMIN_PASSWORD: "",
        STAGING_USER_EMAIL: "",
        STAGING_USER_PASSWORD: "",
      }),
    );

    expect(config).toEqual(
      expect.objectContaining({
        status: "skipped",
        reason: expect.stringContaining("STAGING_ADMIN_EMAIL/STAGING_ADMIN_PASSWORD"),
      }),
    );
  });

  it("does not expose secrets/session cookies/passwords through redaction", () => {
    const env = readyEnv({
      STAGING_ADMIN_PASSWORD: "super-secret-password",
      STAGING_USER_SESSION_COOKIE: "floot_built_app_session=user-secret-cookie",
    });
    const message =
      "failure super-secret-password floot_built_app_session=secret-session-cookie user-secret-cookie";

    const redacted = redactSecretText(message, env);

    expect(redacted).not.toContain("super-secret-password");
    expect(redacted).not.toContain("secret-session-cookie");
    expect(redacted).not.toContain("user-secret-cookie");
    expect(redacted).toContain("[REDACTED]");
  });

  it("requires synthetic-only identifiers and marker naming", () => {
    expect(buildSyntheticOutcomeFixture(readyEnv({ STAGING_OUTCOME_SYNTHETIC_MARKER: "REAL_CONSUMER" }), "STAGING")).toBeNull();
    expect(buildSyntheticOutcomeFixture(readyEnv({ STAGING_OUTCOME_PREVIOUS_REPORT_ARTIFACT_ID: "" }), "STAGING")).toBeNull();
    expect(buildSyntheticOutcomeFixture(readyEnv(), "STAGING")).toEqual(
      expect.objectContaining({
        previousReportArtifactId: 101,
        laterReportArtifactId: 102,
        expectedOutcomeTypes: ["unchanged", "corrected"],
      }),
    );
  });

  it("supports response-only fixture mode without a packet ID for API-created artifacts", () => {
    expect(
      buildSyntheticOutcomeFixture(
        readyEnv({
          STAGING_OUTCOME_EXPECTED_OUTCOME_TYPES: "response_received",
          STAGING_OUTCOME_RUN_RESPONSE_ONLY: "true",
          STAGING_OUTCOME_PACKET_ID: "",
        }),
        "STAGING",
      ),
    ).toEqual(
      expect.objectContaining({
        packetId: undefined,
        runResponseOnly: true,
        expectedOutcomeTypes: ["response_received"],
      }),
    );
  });

  it("verifies outcome compare/list/get checks are present", () => {
    expect(OUTCOME_ENDPOINTS).toEqual({
      compare: "/_api/outcomes/compare",
      list: "/_api/outcomes/list",
      get: "/_api/outcomes/get",
    });
  });

  it("verifies runtime-safety checks and forbidden endpoint detection are present", () => {
    expect(FORBIDDEN_OUTCOME_SMOKE_ENDPOINTS).toEqual(
      expect.arrayContaining([
        { method: "POST", path: "/_api/parser/run" },
        { method: "POST", path: "/_api/ocr/run" },
        { method: "GET", path: "/_api/packet/readiness" },
        { method: "POST", path: "/_api/packet/create" },
        { method: "POST", path: "/_api/violations/run" },
        { method: "POST", path: "/_api/regulation-registry/runtime-bridge/activate" },
        { method: "POST", path: "/_api/admin/override" },
        { method: "POST", path: "/_api/furnisher/packet" },
      ]),
    );
    expect(() => assertNoForbiddenEndpointCalls(["GET /_api/outcomes/list"])).not.toThrow();
    expect(() => assertNoForbiddenEndpointCalls(["POST /_api/packet/create"])).toThrow(/Forbidden outcome smoke endpoint/);
  });

  it("verifies privacy/no-overexposure checks are present", () => {
    expect(() => assertPrivacySafe({ maskedAccountNumber: "****1234", marker: "OUTCOME_SMOKE_CREDITOR" })).not.toThrow();
    expect(() => assertPrivacySafe({ sin: "123-456-789" })).toThrow(/privacy check/);
    expect(() => assertPrivacySafe({ account: "4111111111111111" })).toThrow(/privacy check/);
    expect(() => assertPrivacySafe({ storageUrl: "bucket://private/path?X-Goog-Signature=secret" })).toThrow(/privacy check/);
    expect(() => assertPrivacySafe({ token: "sk-synthetic-secret" })).toThrow(/privacy check/);
  });

  it("verifies cleanup/archive behavior is explicit", () => {
    expect(OUTCOME_CLEANUP_POLICY).toContain("No safe outcome archive/delete endpoint exists");
    expect(OUTCOME_CLEANUP_POLICY).toContain("append-only synthetic outcome rows");
  });
});
