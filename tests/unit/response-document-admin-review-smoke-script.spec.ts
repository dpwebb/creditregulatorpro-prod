import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  assertNoDestructiveCleanupPlanned,
  assertNoForbiddenEndpointCalls,
  assertResponseAdminReviewEvidenceOnly,
  assertResponseAdminReviewPrivacySafe,
  buildResponseDocumentAdminReviewSource,
  buildSmokeConfig,
  FORBIDDEN_RESPONSE_ADMIN_REVIEW_SMOKE_ENDPOINTS,
  redactSecretText,
  RESPONSE_DOCUMENT_ADMIN_REVIEW_CLEANUP_POLICY,
  RESPONSE_DOCUMENT_ADMIN_REVIEW_ENDPOINTS,
  runCli,
  SKIPPED_EXIT_CODE,
  SMOKE_GATE_ENV,
  UNSUPPORTED_RESPONSE_ADMIN_REVIEW_ACTIONS,
} from "../../scripts/staging-response-document-admin-review-smoke";

function readyEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    CRP_RESPONSE_DOCUMENT_ADMIN_REVIEW_SMOKE: "true",
    STAGING_BASE_URL: "https://staging.creditregulatorpro.com",
    STAGING_ADMIN_SESSION_COOKIE: "floot_built_app_session=secret-admin-session-cookie; Path=/",
    STAGING_RESPONSE_ID: "1",
    STAGING_RESPONSE_SYNTHETIC_MARKER: "OUTCOME_SMOKE_RESPONSE_ADMIN_REVIEW_UNIT",
    STAGING_RESPONSE_COMPARISON_RUN_ID: "2",
    STAGING_RESPONSE_FINDING_OUTCOME_ID: "2",
    ...overrides,
  };
}

function smokeSource(): string {
  return readFileSync(join(process.cwd(), "scripts", "staging-response-document-admin-review-smoke.ts"), "utf8");
}

describe("response document admin-review staging smoke harness", () => {
  it("refuses to run without CRP_RESPONSE_DOCUMENT_ADMIN_REVIEW_SMOKE=true", () => {
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
        mode: "existing_response",
        responseId: 1,
        syntheticMarker: "OUTCOME_SMOKE_RESPONSE_ADMIN_REVIEW_UNIT",
        comparisonRunId: 2,
        findingOutcomeId: 2,
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
      STAGING_BASE_URL: "https://staging.creditregulatorpro.com",
      STAGING_RESPONSE_ID: "1",
      STAGING_RESPONSE_SYNTHETIC_MARKER: "OUTCOME_SMOKE_RESPONSE_ADMIN_REVIEW_UNIT",
    });

    expect(code).toBe(SKIPPED_EXIT_CODE);
    expect(logSpy).toHaveBeenCalledWith("SKIPPED: no safe authenticated admin context configured.");
    logSpy.mockRestore();
  });

  it("exits skipped when no verified response ID or marker exists", () => {
    expect(
      buildSmokeConfig(
        readyEnv({
          STAGING_RESPONSE_ID: "",
          STAGING_RESPONSE_SYNTHETIC_MARKER: "",
          STAGING_RESPONSE_COMPARISON_RUN_ID: "",
          STAGING_RESPONSE_FINDING_OUTCOME_ID: "",
        }),
      ),
    ).toEqual(
      expect.objectContaining({
        status: "skipped",
        reason: expect.stringContaining("no verified response ID or marker configured"),
      }),
    );
  });

  it("supports existing response and find-by-marker source modes", () => {
    expect(buildResponseDocumentAdminReviewSource(readyEnv(), "STAGING")).toEqual({
      mode: "existing_response",
      syntheticMarker: "OUTCOME_SMOKE_RESPONSE_ADMIN_REVIEW_UNIT",
      responseId: 1,
      comparisonRunId: 2,
      findingOutcomeId: 2,
      packetId: undefined,
      disputePacketFindingId: undefined,
    });

    expect(
      buildResponseDocumentAdminReviewSource(
        readyEnv({
          STAGING_RESPONSE_ID: "",
          STAGING_RESPONSE_COMPARISON_RUN_ID: "",
          STAGING_RESPONSE_FINDING_OUTCOME_ID: "",
        }),
        "STAGING",
      ),
    ).toEqual({
      mode: "find_by_marker",
      syntheticMarker: "OUTCOME_SMOKE_RESPONSE_ADMIN_REVIEW_UNIT",
    });
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

  it("verifies marker and response preflight are required", () => {
    const source = smokeSource();

    expect(source).toContain("verifyResponseSource");
    expect(source).toContain("fetchResponseById");
    expect(source).toContain("findResponseByMarker");
    expect(source).toContain("responseMatchesMarker");
    expect(source).toContain("did not include required synthetic marker");
    expect(source).toContain("Response document list did not include a synthetic response with marker");
  });

  it("verifies admin-review endpoint checks are present", () => {
    expect(RESPONSE_DOCUMENT_ADMIN_REVIEW_ENDPOINTS).toEqual({
      list: "/_api/responses/list",
      get: "/_api/responses/get",
      adminReview: "/_api/responses/admin-review",
    });

    const source = smokeSource();
    expect(source).toContain("assertUnauthenticatedAdminReviewDenied");
    expect(source).toContain("RESPONSE_DOCUMENT_ADMIN_REVIEW_ENDPOINTS.adminReview");
    expect(source).toContain("link_to_outcome");
    expect(source).toContain("add_review_note");
    expect(source).toContain("Response admin-review");
  });

  it("verifies required-notes validation checks are present", () => {
    const source = smokeSource();

    expect(source).toContain("markNeedsReviewRequiresNotes");
    expect(source).toContain("markRelatedRequiresNotes");
    expect(source).toContain("markUnrelatedRequiresNotes");
    expect(source).toContain("archiveRequiresNotesOrConfirmation");
    expect(source).toContain("expected safe validation failure");
  });

  it("verifies unsupported corrected/removed/unchanged/legal/override actions are rejected", () => {
    expect(UNSUPPORTED_RESPONSE_ADMIN_REVIEW_ACTIONS).toEqual(
      expect.arrayContaining([
        "mark_corrected",
        "mark_removed",
        "mark_unchanged",
        "override_outcome",
        "legal_violation",
        "admitted_fault",
        "activate",
        "make_final_truth",
        "force_outcome",
        "demand",
        "enforce",
      ]),
    );

    const source = smokeSource();
    expect(source).toContain("unsupportedActionStatuses");
    expect(source).toContain("UNSUPPORTED_RESPONSE_ADMIN_REVIEW_ACTIONS");
    expect(() => assertResponseAdminReviewEvidenceOnly({ reviewAction: "mark_corrected" })).toThrow(
      /forbidden canonical\/outcome action/,
    );
  });

  it("verifies response remains evidence/metadata only", () => {
    expect(() =>
      assertResponseAdminReviewEvidenceOnly({
        response: {
          responseChannel: "email",
          responseDocumentType: "bureau_email_response",
          responseStatus: "linked_to_outcome",
          reviewNotes: "response reviewed; captured as evidence; later report comparison required",
        },
      }),
    ).not.toThrow();
    expect(() => assertResponseAdminReviewEvidenceOnly({ outcomeType: "corrected" })).toThrow(
      /forbidden outcome\/canonical classification/,
    );
    expect(() => assertResponseAdminReviewEvidenceOnly({ canonicalFactsMutated: true })).toThrow(
      /forbidden canonical\/outcome action/,
    );
  });

  it("verifies later report comparison remains required", () => {
    const source = smokeSource();

    expect(source).toContain("laterReportComparisonStillRequired: true");
    expect(source).toContain("later report comparison required");
    expect(source).toContain("noCorrectedRemovedUnchangedClassification: true");
  });

  it("verifies runtime-safety checks are present", () => {
    expect(FORBIDDEN_RESPONSE_ADMIN_REVIEW_SMOKE_ENDPOINTS).toEqual(
      expect.arrayContaining([
        { method: "POST", path: "/_api/responses/capture" },
        { method: "POST", path: "/_api/parser/run" },
        { method: "POST", path: "/_api/ocr/run" },
        { method: "POST", path: "/_api/canonical/update" },
        { method: "GET", path: "/_api/packet/readiness" },
        { method: "POST", path: "/_api/packet/build" },
        { method: "POST", path: "/_api/packet/update-status" },
        { method: "POST", path: "/_api/violations/run" },
        { method: "POST", path: "/_api/regulation-registry/runtime-bridge/activate" },
        { method: "POST", path: "/_api/admin/override" },
        { method: "POST", path: "/_api/furnisher/packet" },
        { method: "GET", path: "/_api/gmail/list" },
        { method: "POST", path: "/_api/imap/sync" },
        { method: "POST", path: "/_api/inbox/scrape" },
      ]),
    );
    expect(() =>
      assertNoForbiddenEndpointCalls([
        "GET /_api/responses/list",
        "GET /_api/responses/get",
        "POST /_api/responses/admin-review",
      ]),
    ).not.toThrow();
    expect(() => assertNoForbiddenEndpointCalls(["POST /_api/responses/capture"])).toThrow(
      /Forbidden response admin-review smoke endpoint/,
    );
  });

  it("verifies privacy/no-overexposure checks are present", () => {
    expect(() =>
      assertResponseAdminReviewPrivacySafe({
        reviewNotes: "response reviewed; captured as evidence; later report comparison required",
        maskedAccountNumber: "****1234",
      }),
    ).not.toThrow();
    expect(() => assertResponseAdminReviewPrivacySafe({ reviewNotes: "SIN 123-456-789" })).toThrow(/privacy check/);
    expect(() => assertResponseAdminReviewPrivacySafe({ reviewNotes: "Account 4111111111111111" })).toThrow(
      /privacy check/,
    );
    expect(() => assertResponseAdminReviewPrivacySafe({ reviewNotes: "raw report text" })).toThrow(/privacy check/);
    expect(() => assertResponseAdminReviewPrivacySafe({ reviewNotes: "raw pdf text" })).toThrow(/privacy check/);
    expect(() => assertResponseAdminReviewPrivacySafe({ reviewNotes: "full email body" })).toThrow(/privacy check/);
    expect(() => assertResponseAdminReviewPrivacySafe({ reviewNotes: "packet body" })).toThrow(/privacy check/);
    expect(() => assertResponseAdminReviewPrivacySafe({ storageUrl: "bucket://private/path" })).toThrow(/privacy check/);
    expect(() => assertResponseAdminReviewPrivacySafe({ signedUrl: "https://example.test/file?X-Goog-Signature=secret" })).toThrow(
      /privacy check/,
    );
    expect(() => assertResponseAdminReviewPrivacySafe({ token: "sk-synthetic-secret" })).toThrow(/privacy check/);
    expect(() => assertResponseAdminReviewPrivacySafe({ databaseUrl: "postgres://secret" })).toThrow(/privacy check/);
    expect(() => assertResponseAdminReviewPrivacySafe({ reviewNotes: "mailbox password secret" })).toThrow(
      /privacy check/,
    );
    expect(() => assertResponseAdminReviewPrivacySafe({ reviewNotes: "email auth token secret" })).toThrow(
      /privacy check/,
    );
  });

  it("verifies forbidden legal-conclusion phrases are checked", () => {
    for (const reviewNotes of [
      "Equifax admitted fault.",
      "The bureau corrected the item.",
      "The bureau violated the law.",
      "You won.",
      "You are entitled to damages.",
      "This proves correction.",
      "This is legal proof.",
      "The agency must pay.",
      "demand",
      "enforce",
      "mark corrected",
      "mark removed",
      "mark unchanged",
    ]) {
      expect(() => assertResponseAdminReviewPrivacySafe({ reviewNotes })).toThrow(/legal-language check|privacy check/);
    }
  });

  it("verifies no destructive cleanup is attempted", () => {
    expect(RESPONSE_DOCUMENT_ADMIN_REVIEW_CLEANUP_POLICY).toContain("append-only");
    expect(RESPONSE_DOCUMENT_ADMIN_REVIEW_CLEANUP_POLICY).toContain("review metadata");
    expect(RESPONSE_DOCUMENT_ADMIN_REVIEW_CLEANUP_POLICY).toContain("audit rows");
    expect(() => assertNoDestructiveCleanupPlanned()).not.toThrow();
    expect(() => assertNoDestructiveCleanupPlanned("delete response review rows")).toThrow(/append-only/);
  });
});
