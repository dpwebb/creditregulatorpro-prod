import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  assertNoDestructiveCleanupPlanned,
  assertNoForbiddenEndpointCalls,
  assertNoForbiddenLegalConclusionText,
  assertResponseDocumentUiPrivacySafe,
  buildResponseDocumentUiSource,
  buildSmokeConfig,
  FORBIDDEN_RESPONSE_DOCUMENT_UI_ENDPOINTS,
  redactSecretText,
  RESPONSE_DOCUMENT_UI_CLEANUP_POLICY,
  RESPONSE_DOCUMENT_UI_DETAIL_NOTICE,
  RESPONSE_DOCUMENT_UI_FORBIDDEN_CONTROLS,
  RESPONSE_DOCUMENT_UI_PATH,
  RESPONSE_DOCUMENT_UI_REQUIRED_TEXT,
  runCli,
  SKIPPED_EXIT_CODE,
  SMOKE_GATE_ENV,
} from "../../scripts/staging-response-document-ui-smoke";

function readyEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    CRP_RESPONSE_DOCUMENT_UI_SMOKE: "true",
    STAGING_BASE_URL: "https://staging.creditregulatorpro.com",
    STAGING_ADMIN_SESSION_COOKIE: "floot_built_app_session=secret-admin-session-cookie; Path=/",
    STAGING_RESPONSE_ID: "1",
    STAGING_RESPONSE_SYNTHETIC_MARKER: "OUTCOME_SMOKE_RESPONSE_DOCUMENT_UI_UNIT",
    STAGING_RESPONSE_COMPARISON_RUN_ID: "2",
    STAGING_RESPONSE_FINDING_OUTCOME_ID: "2",
    ...overrides,
  };
}

function smokeSource(): string {
  return readFileSync(join(process.cwd(), "scripts", "staging-response-document-ui-smoke.ts"), "utf8");
}

describe("response document UI staging smoke harness", () => {
  it("refuses to run without CRP_RESPONSE_DOCUMENT_UI_SMOKE=true", () => {
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
        syntheticMarker: "OUTCOME_SMOKE_RESPONSE_DOCUMENT_UI_UNIT",
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
      STAGING_RESPONSE_SYNTHETIC_MARKER: "OUTCOME_SMOKE_RESPONSE_DOCUMENT_UI_UNIT",
      STAGING_RESPONSE_ID: "1",
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
    expect(buildResponseDocumentUiSource(readyEnv(), "STAGING")).toEqual({
      mode: "existing_response",
      syntheticMarker: "OUTCOME_SMOKE_RESPONSE_DOCUMENT_UI_UNIT",
      responseId: 1,
      comparisonRunId: 2,
      findingOutcomeId: 2,
    });

    expect(
      buildResponseDocumentUiSource(
        readyEnv({
          STAGING_RESPONSE_ID: "",
        }),
        "STAGING",
      ),
    ).toEqual({
      mode: "find_by_marker",
      syntheticMarker: "OUTCOME_SMOKE_RESPONSE_DOCUMENT_UI_UNIT",
      comparisonRunId: 2,
      findingOutcomeId: 2,
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
    expect(source).toContain("responseMatchesMarker");
    expect(source).toContain("did not include required synthetic marker");
    expect(source).toContain("Response document list did not include verified synthetic response");
  });

  it("verifies /admin-response-documents UI checks are present", () => {
    expect(RESPONSE_DOCUMENT_UI_PATH).toBe("/admin-response-documents");
    expect(RESPONSE_DOCUMENT_UI_REQUIRED_TEXT).toEqual(
      expect.arrayContaining([
        "Response Documents",
        "Response documents keep immutable evidence plus append-only deterministic processing.",
        "Deterministic response parsing runs without AI dependency, and fallback extraction is disabled unless explicitly approved.",
        "No mailbox, Gmail, IMAP, or inbox integration is used.",
      ]),
    );

    const source = smokeSource();
    expect(source).toContain("page.goto(RESPONSE_DOCUMENT_UI_PATH)");
    expect(source).toContain("assertUiSafetyText");
    expect(source).toContain("openSyntheticResponseDetail");
    expect(source).toContain("responseListLoaded: true");
    expect(source).toContain("detailPanelOpened: true");
  });

  it("verifies safety, evidence-only, and later-comparison-required checks are present", () => {
    expect(RESPONSE_DOCUMENT_UI_DETAIL_NOTICE).toContain("Later credit-report comparison is still required");
    const source = smokeSource();

    expect(source).toContain("evidenceMetadataOnlyNoticeRendered: true");
    expect(source).toContain("laterReportComparisonNoticeRendered: true");
    expect(source).toContain("responseDocumentsRemainEvidenceMetadataOnly: true");
    expect(source).toContain("laterReportComparisonStillRequired: true");
  });

  it("verifies read-only behavior checks are present", () => {
    expect(RESPONSE_DOCUMENT_UI_CLEANUP_POLICY).toContain("read-only");
    expect(RESPONSE_DOCUMENT_UI_CLEANUP_POLICY).toContain("no cleanup is needed");

    const source = smokeSource();
    expect(source).toContain("readOnlyControlsAbsent: true");
    expect(source).toContain("assertForbiddenControlsAbsent");
    expect(source).not.toContain('jsonRequest(page, "POST"');
    expect(source).not.toContain("createdResponseIds");
  });

  it("verifies corrected/removed/unchanged controls are checked as absent", () => {
    expect(RESPONSE_DOCUMENT_UI_FORBIDDEN_CONTROLS).toEqual(
      expect.arrayContaining(["Mark Corrected", "Mark Removed", "Mark Unchanged", "Prove Correction"]),
    );

    const source = smokeSource();
    expect(source).toContain("correctedRemovedUnchangedControlsAbsent: true");
  });

  it("verifies parser/inbox/mailbox/Gmail/IMAP controls are checked as absent", () => {
    expect(RESPONSE_DOCUMENT_UI_FORBIDDEN_CONTROLS).toEqual(
      expect.arrayContaining(["Parse Response", "Inbox Sync", "Connect Gmail", "Connect IMAP"]),
    );

    const source = smokeSource();
    expect(source).toContain("parserInboxMailboxControlsAbsent: true");
  });

  it("verifies runtime-safety checks are present", () => {
    expect(FORBIDDEN_RESPONSE_DOCUMENT_UI_ENDPOINTS).toEqual(
      expect.arrayContaining([
        { method: "POST", path: "/_api/responses/capture" },
        { method: "POST", path: "/_api/responses/admin-review" },
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

    expect(() => assertNoForbiddenEndpointCalls(["GET /_api/responses/list", "GET /_api/responses/get"])).not.toThrow();
    expect(() => assertNoForbiddenEndpointCalls(["POST /_api/responses/capture"])).toThrow(
      /Forbidden response document UI smoke endpoint/,
    );
  });

  it("verifies privacy/no-overexposure checks are present", () => {
    expect(() =>
      assertResponseDocumentUiPrivacySafe({
        displayText:
          "Response documents keep immutable evidence plus append-only deterministic processing. Later credit-report comparison remains required.",
        maskedAccountNumber: "****1234",
      }),
    ).not.toThrow();
    expect(() => assertResponseDocumentUiPrivacySafe({ sin: "123-456-789" })).toThrow(/privacy check/);
    expect(() => assertResponseDocumentUiPrivacySafe({ account: "4111111111111111" })).toThrow(/privacy check/);
    expect(() => assertResponseDocumentUiPrivacySafe({ rawReportText: "raw report text" })).toThrow(/privacy check/);
    expect(() => assertResponseDocumentUiPrivacySafe({ responseSummary: "full email body" })).toThrow(/privacy check/);
    expect(() => assertResponseDocumentUiPrivacySafe({ storageUrl: "bucket://private/path" })).toThrow(/privacy check/);
    expect(() => assertResponseDocumentUiPrivacySafe({ signedUrl: "https://example.test/file?X-Goog-Signature=secret" })).toThrow(
      /privacy check/,
    );
    expect(() => assertResponseDocumentUiPrivacySafe({ token: "sk-synthetic-secret" })).toThrow(/privacy check/);
    expect(() => assertResponseDocumentUiPrivacySafe({ responseSummary: "mailbox password secret" })).toThrow(
      /privacy check/,
    );
  });

  it("verifies forbidden legal-conclusion phrases are checked", () => {
    for (const text of [
      "Equifax admitted fault.",
      "The bureau corrected the item.",
      "The bureau violated the law.",
      "You won.",
      "You are entitled to damages.",
      "This proves correction.",
      "This is legal proof.",
      "The agency must pay.",
      "confirmed legal violation",
      "demand",
      "enforce",
    ]) {
      expect(() => assertNoForbiddenLegalConclusionText(text)).toThrow(/legal-conclusion phrase/);
    }
  });

  it("verifies no destructive cleanup is attempted", () => {
    expect(RESPONSE_DOCUMENT_UI_CLEANUP_POLICY).toContain("read-only");
    expect(RESPONSE_DOCUMENT_UI_CLEANUP_POLICY).toContain("does not create, mutate, or remove");
    expect(() => assertNoDestructiveCleanupPlanned()).not.toThrow();
    expect(() => assertNoDestructiveCleanupPlanned("capture response row")).toThrow(/read-only/);
  });
});
