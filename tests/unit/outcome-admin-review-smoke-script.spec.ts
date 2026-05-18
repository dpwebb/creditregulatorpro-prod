import { describe, expect, it } from "vitest";

import {
  assertAdminReviewFixturePreflightVerified,
  assertAdminReviewPrivacySafe,
  assertDeterministicOutcomePreserved,
  assertNoForbiddenEndpointCalls,
  buildOutcomeRunSource,
  buildSmokeConfig,
  FORBIDDEN_ADMIN_REVIEW_SMOKE_ENDPOINTS,
  OUTCOME_ADMIN_REVIEW_CLEANUP_POLICY,
  OUTCOME_ADMIN_REVIEW_ENDPOINTS,
  redactSecretText,
  SMOKE_GATE_ENV,
  UNSUPPORTED_ADMIN_REVIEW_ACTIONS,
} from "../../scripts/staging-outcome-admin-review-smoke";

function readyEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    CRP_OUTCOME_ADMIN_REVIEW_SMOKE: "true",
    STAGING_BASE_URL: "https://staging.creditregulatorpro.com",
    STAGING_ADMIN_SESSION_COOKIE: "floot_built_app_session=secret-admin-session-cookie; Path=/",
    STAGING_OUTCOME_COMPARISON_RUN_ID: "2001",
    STAGING_OUTCOME_SYNTHETIC_MARKER: "OUTCOME_SMOKE_ADMIN_REVIEW_UNIT",
    ...overrides,
  };
}

describe("outcome admin-review staging smoke harness", () => {
  it("refuses to run without CRP_OUTCOME_ADMIN_REVIEW_SMOKE=true", () => {
    expect(buildSmokeConfig({})).toEqual({
      status: "skipped",
      reason: `SKIPPED: ${SMOKE_GATE_ENV}=true is required.`,
    });
  });

  it("refuses production host", () => {
    expect(buildSmokeConfig(readyEnv({ STAGING_BASE_URL: "https://creditregulatorpro.com" }))).toEqual(
      expect.objectContaining({
        status: "error",
        reason: "Refusing to run against production host creditregulatorpro.com.",
      }),
    );
    expect(buildSmokeConfig(readyEnv({ STAGING_BASE_URL: "https://www.creditregulatorpro.com" }))).toEqual(
      expect.objectContaining({ status: "error" }),
    );
  });

  it("allows staging host with required admin auth env", () => {
    expect(buildSmokeConfig(readyEnv())).toMatchObject({
      status: "ready",
      baseUrl: "https://staging.creditregulatorpro.com",
      host: "staging.creditregulatorpro.com",
      authMode: "session_cookie",
      source: {
        mode: "existing_run",
        comparisonRunId: 2001,
        syntheticMarker: "OUTCOME_SMOKE_ADMIN_REVIEW_UNIT",
      },
    });

    expect(
      buildSmokeConfig(
        readyEnv({
          STAGING_ADMIN_SESSION_COOKIE: "",
          STAGING_ADMIN_EMAIL: "admin@example.test",
          STAGING_ADMIN_PASSWORD: "synthetic-admin-password",
        }),
      ),
    ).toMatchObject({
      status: "ready",
      authMode: "credentials",
    });
  });

  it("exits skipped when no safe authenticated admin context exists", () => {
    expect(
      buildSmokeConfig(
        readyEnv({
          STAGING_ADMIN_SESSION_COOKIE: "",
          STAGING_ADMIN_EMAIL: "",
          STAGING_ADMIN_PASSWORD: "",
        }),
      ),
    ).toEqual({
      status: "skipped",
      reason: "SKIPPED: no safe authenticated admin context configured.",
    });
  });

  it("exits skipped when no verified outcome run or fixture IDs exist", () => {
    expect(
      buildSmokeConfig(
        readyEnv({
          STAGING_OUTCOME_COMPARISON_RUN_ID: "",
          STAGING_OUTCOME_PREVIOUS_REPORT_ARTIFACT_ID: "",
          STAGING_OUTCOME_LATER_REPORT_ARTIFACT_ID: "",
        }),
      ),
    ).toEqual(
      expect.objectContaining({
        status: "skipped",
        reason: expect.stringContaining("no verified outcome run or fixture IDs configured"),
      }),
    );
  });

  it("supports existing-run and create-from-fixture source modes", () => {
    expect(buildOutcomeRunSource(readyEnv(), "STAGING")).toEqual({
      mode: "existing_run",
      comparisonRunId: 2001,
      syntheticMarker: "OUTCOME_SMOKE_ADMIN_REVIEW_UNIT",
    });

    expect(
      buildOutcomeRunSource(
        readyEnv({
          STAGING_OUTCOME_COMPARISON_RUN_ID: "",
          STAGING_OUTCOME_PREVIOUS_REPORT_ARTIFACT_ID: "275",
          STAGING_OUTCOME_LATER_REPORT_ARTIFACT_ID: "276",
          STAGING_OUTCOME_EXPECTED_OUTCOME_TYPES: "response_received",
          STAGING_OUTCOME_RUN_RESPONSE_ONLY: "true",
        }),
        "STAGING",
      ),
    ).toEqual({
      mode: "create_from_fixture",
      previousReportArtifactId: 275,
      laterReportArtifactId: 276,
      syntheticMarker: "OUTCOME_SMOKE_ADMIN_REVIEW_UNIT",
      expectedOutcomeTypes: ["response_received"],
      runResponseOnly: true,
    });

    expect(buildOutcomeRunSource(readyEnv({ STAGING_OUTCOME_SYNTHETIC_MARKER: "REAL_CONSUMER" }), "STAGING")).toBeNull();
  });

  it("does not print secrets/session cookie/password", () => {
    const env = readyEnv({
      STAGING_ADMIN_PASSWORD: "synthetic-admin-password",
    });
    const raw = "failure floot_built_app_session=secret-admin-session-cookie synthetic-admin-password";

    const redacted = redactSecretText(raw, env);

    expect(redacted).toContain("[REDACTED]");
    expect(redacted).not.toContain("secret-admin-session-cookie");
    expect(redacted).not.toContain("synthetic-admin-password");
  });

  it("verifies marker preflight is required", () => {
    expect(() =>
      assertAdminReviewFixturePreflightVerified({
        syntheticMarker: "OUTCOME_SMOKE_ADMIN_REVIEW_UNIT",
        previousReportArtifactId: 275,
        previousReportHash: "a".repeat(64),
        laterReportArtifactId: 276,
        laterReportHash: "b".repeat(64),
      }),
    ).not.toThrow();

    expect(() =>
      assertAdminReviewFixturePreflightVerified({
        syntheticMarker: "OUTCOME_SMOKE_ADMIN_REVIEW_UNIT",
        previousReportArtifactId: 275,
      }),
    ).toThrow(/safe verification surface/);
  });

  it("verifies admin-review endpoint checks are present", () => {
    expect(OUTCOME_ADMIN_REVIEW_ENDPOINTS).toEqual({
      compare: "/_api/outcomes/compare",
      get: "/_api/outcomes/get",
      adminReview: "/_api/outcomes/admin-review",
    });
  });

  it("verifies unsupported override actions are rejected by the harness contract", () => {
    expect(UNSUPPORTED_ADMIN_REVIEW_ACTIONS).toEqual([
      "override_to_corrected",
      "override_to_removed",
      "force_outcome",
      "make_final_truth",
      "legal_violation",
      "activate",
    ]);
  });

  it("verifies deterministic outcomeType preservation is checked", () => {
    const before = {
      outcomeType: "response_received",
      confidenceLevel: "none",
      matchingMethod: "response_only",
      outcomeReasonCodes: ["response_received_without_later_report"],
      previousSnapshot: { maskedAccountNumber: "****1234" },
      laterSnapshot: null,
    };

    expect(() => assertDeterministicOutcomePreserved(before, { ...before })).not.toThrow();
    expect(() => assertDeterministicOutcomePreserved(before, { ...before, outcomeType: "corrected" })).toThrow(
      /deterministic outcome field/,
    );
  });

  it("verifies runtime-safety checks are present", () => {
    expect(FORBIDDEN_ADMIN_REVIEW_SMOKE_ENDPOINTS).toEqual(
      expect.arrayContaining([
        { method: "POST", path: "/_api/parser/run" },
        { method: "POST", path: "/_api/ocr/run" },
        { method: "POST", path: "/_api/report-artifact/create" },
        { method: "POST", path: "/_api/tradelines/update" },
        { method: "GET", path: "/_api/packet/readiness" },
        { method: "POST", path: "/_api/packet/create" },
        { method: "POST", path: "/_api/packet/update-status" },
        { method: "POST", path: "/_api/violations/run" },
        { method: "POST", path: "/_api/regulation-registry/runtime-bridge/activate" },
        { method: "POST", path: "/_api/admin/override" },
        { method: "POST", path: "/_api/furnisher/packet" },
      ]),
    );
    expect(() => assertNoForbiddenEndpointCalls(["POST /_api/outcomes/admin-review"])).not.toThrow();
    expect(() => assertNoForbiddenEndpointCalls(["POST /_api/packet/update-status"])).toThrow(/Forbidden outcome admin-review/);
  });

  it("verifies privacy/no-overexposure checks are present", () => {
    expect(() => assertAdminReviewPrivacySafe({ review: "Confirmed for admin review.", account: "****1234" })).not.toThrow();
    expect(() => assertAdminReviewPrivacySafe({ sin: "123-456-789" })).toThrow(/privacy check/);
    expect(() => assertAdminReviewPrivacySafe({ account: "4111111111111111" })).toThrow(/privacy check/);
    expect(() => assertAdminReviewPrivacySafe({ storageUrl: "bucket://private/path?X-Goog-Signature=secret" })).toThrow(
      /privacy check/,
    );
    expect(() => assertAdminReviewPrivacySafe({ token: "sk-synthetic-secret" })).toThrow(/privacy check/);
    expect(() => assertAdminReviewPrivacySafe({ text: "The bureau violated the law." })).toThrow(/legal-language check/);
  });

  it("verifies no destructive cleanup is attempted", () => {
    expect(OUTCOME_ADMIN_REVIEW_CLEANUP_POLICY).toContain("append-only");
    expect(OUTCOME_ADMIN_REVIEW_CLEANUP_POLICY).toContain("review metadata");
    expect(OUTCOME_ADMIN_REVIEW_CLEANUP_POLICY).toContain("audit rows");
  });
});
