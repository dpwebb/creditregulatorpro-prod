import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  assertNoDestructiveCleanupPlanned,
  assertNoForbiddenEndpointCalls,
  assertOutcomeAdminReviewUiPrivacySafe,
  buildSmokeConfig,
  FORBIDDEN_OUTCOME_ADMIN_REVIEW_UI_ENDPOINTS,
  OUTCOME_ADMIN_REVIEW_UI_CLEANUP_POLICY,
  OUTCOME_ADMIN_REVIEW_UI_PATH,
  OUTCOME_ADMIN_REVIEW_UI_PRESERVATION_TEXT,
  OUTCOME_ADMIN_REVIEW_UI_REQUIRED_TEXT,
  OUTCOME_ADMIN_REVIEW_UI_VALIDATION_CHECKS,
  redactSecretText,
  runCli,
  SKIPPED_EXIT_CODE,
  SMOKE_GATE_ENV,
  UNSUPPORTED_OUTCOME_ADMIN_REVIEW_UI_CONTROLS,
} from "../../scripts/staging-outcome-admin-review-ui-smoke";

function readyEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    CRP_OUTCOME_ADMIN_REVIEW_UI_SMOKE: "true",
    STAGING_BASE_URL: "https://staging.creditregulatorpro.com",
    STAGING_ADMIN_SESSION_COOKIE: "floot_built_app_session=secret-admin-session-cookie; Path=/",
    STAGING_OUTCOME_COMPARISON_RUN_ID: "2",
    STAGING_OUTCOME_SYNTHETIC_MARKER: "OUTCOME_SMOKE_ADMIN_REVIEW_UI_UNIT",
    ...overrides,
  };
}

function smokeSource(): string {
  return readFileSync(join(process.cwd(), "scripts", "staging-outcome-admin-review-ui-smoke.ts"), "utf8");
}

describe("outcome admin-review UI staging smoke harness", () => {
  it("refuses to run without CRP_OUTCOME_ADMIN_REVIEW_UI_SMOKE=true", () => {
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
        comparisonRunId: 2,
        syntheticMarker: "OUTCOME_SMOKE_ADMIN_REVIEW_UI_UNIT",
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

  it("exits skipped when no safe authenticated admin context exists", async () => {
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

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const code = await runCli({
      [SMOKE_GATE_ENV]: "true",
    });

    expect(code).toBe(SKIPPED_EXIT_CODE);
    expect(logSpy).toHaveBeenCalledWith("SKIPPED: no safe authenticated admin context configured.");
    logSpy.mockRestore();
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
    const source = smokeSource();

    expect(source).toContain("validateSyntheticReportMarker");
    expect(source).toContain("assertAdminReviewFixturePreflightVerified");
    expect(source).toContain("Outcome admin-review UI fixture marker is not visible through a safe verification surface");
    expect(source).toContain("did not include required synthetic marker");
  });

  it("verifies /admin-outcome-reviews UI checks are present", () => {
    expect(OUTCOME_ADMIN_REVIEW_UI_PATH).toBe("/admin-outcome-reviews");
    expect(OUTCOME_ADMIN_REVIEW_UI_REQUIRED_TEXT).toEqual(
      expect.arrayContaining([
        "Outcome Reviews",
        "Admin review changes review metadata only.",
        "Deterministic outcome fields are preserved.",
        "Response documents remain evidence only",
      ]),
    );

    const source = smokeSource();
    expect(source).toContain("page.goto(OUTCOME_ADMIN_REVIEW_UI_PATH)");
    expect(source).toContain("assertUiSafetyText");
    expect(source).toContain("Outcome list did not include the verified synthetic comparison run");
  });

  it("verifies preservation notice checks are present", () => {
    expect(OUTCOME_ADMIN_REVIEW_UI_PRESERVATION_TEXT).toEqual([
      "Admin review does not rewrite outcomeType, matchingMethod, confidenceLevel, reason codes, snapshots, or source records.",
    ]);

    const source = smokeSource();
    expect(source).toContain("assertDeterministicOutcomePreserved");
    expect(source).toContain("outcomeTypeUnchanged");
    expect(source).toContain("matchingMethodUnchanged");
    expect(source).toContain("confidenceLevelUnchanged");
    expect(source).toContain("snapshotsUnchanged");
  });

  it("scopes Reason codes assertions to the selected finding detail card", () => {
    const source = smokeSource();

    expect(OUTCOME_ADMIN_REVIEW_UI_PRESERVATION_TEXT[0]).toContain("reason codes");
    expect(source).toContain("function outcomeDetailPanel");
    expect(source).toContain("function findingCardFor");
    expect(source).toContain("findingCardFor(page, Number(finding.id))");
    expect(source).toContain('findingCard.getByText("Reason codes", { exact: true })');
    expect(source).toContain('findingCard.getByLabel("Review notes")');
    expect(source).toContain('detailPanel.getByText(`Comparison run #${run.id}`, { exact: true })');
    expect(source).not.toContain('page.getByText("Reason codes")');
  });

  it("ties detail assertions to the current comparisonRunId and findingOutcomeId", () => {
    const source = smokeSource();

    expect(source).toContain("Comparison run #${run.id}");
    expect(source).toContain("Finding outcome #${id}");
    expect(source).toContain("findingOutcomeId = Number(finding.id)");
    expect(source).toContain("Comparison run ID: ${comparisonRunId");
    expect(source).toContain("Finding outcome ID: ${findingOutcomeId");
  });

  it("verifies review action validation checks are present", () => {
    expect(OUTCOME_ADMIN_REVIEW_UI_VALIDATION_CHECKS).toEqual([
      "Mark Needs Review requires notes",
      "Confirm for Admin Review requires notes and confirmations",
      "Reject Match requires notes",
      "Reject Classification requires notes",
    ]);

    const source = smokeSource();
    expect(source).toContain("assertReviewValidation");
    expect(source).toContain("assertReviewValidation(findingCard)");
    expect(source).toContain("Mark Needs Review");
    expect(source).toContain("Confirm for Admin Review");
    expect(source).toContain("Reject Match for Review Purposes");
    expect(source).toContain("Reject Classification for Review Purposes");
    expect(source).toContain("Review Outcome");
    expect(source).toContain("applyMetadataOnlyReview(page, findingCard)");
  });

  it("verifies unsupported override controls are checked as absent", () => {
    expect(UNSUPPORTED_OUTCOME_ADMIN_REVIEW_UI_CONTROLS).toEqual(
      expect.arrayContaining([
        "override_to_corrected",
        "override_to_removed",
        "force_outcome",
        "make_final_truth",
        "legal_violation",
        "activate",
        "override to corrected",
        "force outcome",
        "make final truth",
        "confirmed legal violation",
      ]),
    );

    const source = smokeSource();
    expect(source).toContain("assertUnsupportedControlsAbsent");
    expect(source).toContain("getByRole(\"button\"");
  });

  it("verifies deterministic outcome field preservation is checked", () => {
    const source = smokeSource();

    expect(source).toContain("deterministicFindingSnapshot");
    expect(source).toContain("baselineDeterministic");
    expect(source).toContain("assertDeterministicOutcomePreserved");
    expect(source).toContain("reviewMetadataOnly: true");
  });

  it("verifies runtime-safety checks are present", () => {
    expect(FORBIDDEN_OUTCOME_ADMIN_REVIEW_UI_ENDPOINTS).toEqual(
      expect.arrayContaining([
        { method: "POST", path: "/_api/parser/run" },
        { method: "POST", path: "/_api/ocr/run" },
        { method: "POST", path: "/_api/report-artifact/create" },
        { method: "POST", path: "/_api/report-artifact/update" },
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

    expect(() => assertNoForbiddenEndpointCalls(["GET /_api/outcomes/list"])).not.toThrow();
    expect(() => assertNoForbiddenEndpointCalls(["POST /_api/packet/update-status"])).toThrow(
      /Forbidden outcome admin-review UI smoke endpoint/,
    );
  });

  it("verifies privacy/no-overexposure checks are present", () => {
    expect(() =>
      assertOutcomeAdminReviewUiPrivacySafe({
        displayText: "Admin review changes review metadata only. This does not activate regulation runtime truth.",
        maskedAccountNumber: "****1234",
      }),
    ).not.toThrow();
    expect(() => assertOutcomeAdminReviewUiPrivacySafe({ displayText: "You won." })).toThrow(/legal-language check/);
    expect(() => assertOutcomeAdminReviewUiPrivacySafe({ sin: "123-456-789" })).toThrow(/privacy check/);
    expect(() => assertOutcomeAdminReviewUiPrivacySafe({ account: "4111111111111111" })).toThrow(/privacy check/);
    expect(() => assertOutcomeAdminReviewUiPrivacySafe({ rawReportText: "raw report text" })).toThrow(/privacy check/);
    expect(() => assertOutcomeAdminReviewUiPrivacySafe({ storageUrl: "bucket://private/path" })).toThrow(/privacy check/);
    expect(() => assertOutcomeAdminReviewUiPrivacySafe({ token: "sk-synthetic-secret" })).toThrow(/privacy check/);
  });

  it("verifies no destructive cleanup is attempted", () => {
    expect(OUTCOME_ADMIN_REVIEW_UI_CLEANUP_POLICY).toContain("append-only");
    expect(OUTCOME_ADMIN_REVIEW_UI_CLEANUP_POLICY).toContain("review metadata");
    expect(OUTCOME_ADMIN_REVIEW_UI_CLEANUP_POLICY).toContain("audit rows");
    expect(() => assertNoDestructiveCleanupPlanned()).not.toThrow();
    expect(() => assertNoDestructiveCleanupPlanned("delete synthetic outcome rows")).toThrow(/append-only/);
  });
});
