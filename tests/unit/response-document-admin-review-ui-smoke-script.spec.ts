import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  assertNoDestructiveCleanupPlanned,
  assertNoForbiddenEndpointCalls,
  assertNoForbiddenVisibleText,
  buildResponseDocumentAdminReviewUiSource,
  buildSmokeConfig,
  FORBIDDEN_RESPONSE_ADMIN_REVIEW_UI_ENDPOINTS,
  redactSecretText,
  RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_ALLOWED_ACTION,
  RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_CLEANUP_POLICY,
  RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_DETAIL_REQUIRED_TEXT,
  RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_FORBIDDEN_VISIBLE_TEXT,
  RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_NOTE,
  RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_PAGE_REQUIRED_TEXT,
  RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_REQUIRED_TEXT,
  runCli,
  SKIPPED_EXIT_CODE,
  SMOKE_GATE_ENV,
} from "../../scripts/staging-response-document-admin-review-ui-smoke";

function readyEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    CRP_RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_SMOKE: "true",
    STAGING_BASE_URL: "https://staging.creditregulatorpro.com",
    STAGING_ADMIN_SESSION_COOKIE: "floot_built_app_session=secret-admin-session-cookie; Path=/",
    STAGING_RESPONSE_ID: "1",
    STAGING_RESPONSE_SYNTHETIC_MARKER: "OUTCOME_SMOKE_RESPONSE_ADMIN_REVIEW_UI_UNIT",
    STAGING_RESPONSE_COMPARISON_RUN_ID: "2",
    STAGING_RESPONSE_FINDING_OUTCOME_ID: "2",
    ...overrides,
  };
}

function smokeSource(): string {
  return readFileSync(join(process.cwd(), "scripts", "staging-response-document-admin-review-ui-smoke.ts"), "utf8");
}

describe("response document admin-review UI staging smoke harness", () => {
  it("refuses to run without CRP_RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_SMOKE=true", () => {
    expect(buildSmokeConfig({})).toEqual({
      status: "skipped",
      reason: `SKIPPED: ${SMOKE_GATE_ENV}=true is required.`,
    });
  });

  it("refuses production hosts", () => {
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

  it("allows staging host with admin session, credentials, storage state, or autonomous DB bootstrap", () => {
    expect(buildSmokeConfig(readyEnv())).toMatchObject({
      status: "ready",
      authMode: "session_cookie",
      source: {
        mode: "existing_response",
        responseId: 1,
        syntheticMarker: "OUTCOME_SMOKE_RESPONSE_ADMIN_REVIEW_UI_UNIT",
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
    ).toMatchObject({ status: "ready", authMode: "credentials" });

    const tempDir = mkdtempSync(join(tmpdir(), "response-admin-review-ui-smoke-"));
    const statePath = join(tempDir, "state.json");
    writeFileSync(statePath, JSON.stringify({ cookies: [], origins: [] }));
    try {
      expect(
        buildSmokeConfig(
          readyEnv({
            STAGING_ADMIN_SESSION_COOKIE: "",
            STAGING_ADMIN_STORAGE_STATE_PATH: statePath,
          }),
        ),
      ).toMatchObject({ status: "ready", authMode: "storage_state", adminStorageStatePath: statePath });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }

    expect(
      buildSmokeConfig(
        readyEnv({
          STAGING_ADMIN_SESSION_COOKIE: "",
          STAGING_ADMIN_EMAIL: "",
          STAGING_ADMIN_PASSWORD: "",
          STAGING_DATABASE_URL: "postgres://smoke:secret@staging-db.example.test/creditregulatorpro_staging",
        }),
      ),
    ).toMatchObject({
      status: "ready",
      authMode: "autonomous_db",
      autonomousDatabaseUrlSource: "STAGING_DATABASE_URL",
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
      reason: expect.stringContaining("autonomous admin smoke requires"),
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const code = await runCli({
      [SMOKE_GATE_ENV]: "true",
      STAGING_BASE_URL: "https://staging.creditregulatorpro.com",
      STAGING_RESPONSE_ID: "1",
      STAGING_RESPONSE_SYNTHETIC_MARKER: "OUTCOME_SMOKE_RESPONSE_ADMIN_REVIEW_UI_UNIT",
    });

    expect(code).toBe(SKIPPED_EXIT_CODE);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("SKIPPED: autonomous admin smoke requires"));
    logSpy.mockRestore();
  });

  it("falls back to autonomous synthetic response discovery when no response ID or marker exists", () => {
    expect(
      buildSmokeConfig(
        readyEnv({
          STAGING_RESPONSE_ID: "",
          STAGING_RESPONSE_SYNTHETIC_MARKER: "",
          STAGING_RESPONSE_COMPARISON_RUN_ID: "",
          STAGING_RESPONSE_FINDING_OUTCOME_ID: "",
        }),
      ),
    ).toMatchObject(
      expect.objectContaining({
        status: "ready",
        source: { mode: "auto_existing_response" },
      }),
    );
  });

  it("supports existing response, find-by-marker, and auto-discovery source modes", () => {
    expect(buildResponseDocumentAdminReviewUiSource(readyEnv(), "STAGING")).toEqual({
      mode: "existing_response",
      syntheticMarker: "OUTCOME_SMOKE_RESPONSE_ADMIN_REVIEW_UI_UNIT",
      responseId: 1,
      comparisonRunId: 2,
      findingOutcomeId: 2,
      packetId: undefined,
      disputePacketFindingId: undefined,
    });

    expect(
      buildResponseDocumentAdminReviewUiSource(
        readyEnv({
          STAGING_RESPONSE_ID: "",
          STAGING_RESPONSE_COMPARISON_RUN_ID: "",
          STAGING_RESPONSE_FINDING_OUTCOME_ID: "",
        }),
        "STAGING",
      ),
    ).toEqual({
      mode: "find_by_marker",
      syntheticMarker: "OUTCOME_SMOKE_RESPONSE_ADMIN_REVIEW_UI_UNIT",
    });

    expect(
      buildResponseDocumentAdminReviewUiSource(
        readyEnv({
          STAGING_RESPONSE_ID: "",
          STAGING_RESPONSE_SYNTHETIC_MARKER: "",
          STAGING_RESPONSE_COMPARISON_RUN_ID: "",
          STAGING_RESPONSE_FINDING_OUTCOME_ID: "",
        }),
        "STAGING",
      ),
    ).toEqual({ mode: "auto_existing_response" });
  });

  it("does not print secrets/session cookie/password/database URL", () => {
    const env = readyEnv({
      STAGING_ADMIN_PASSWORD: "synthetic-admin-password",
      STAGING_DATABASE_URL: "postgres://smoke:secret@staging-db.example.test/creditregulatorpro_staging",
    });
    const raw = "failure floot_built_app_session=secret-admin-session-cookie synthetic-admin-password postgres://smoke:secret@staging-db.example.test/creditregulatorpro_staging";

    const redacted = redactSecretText(raw, env);

    expect(redacted).toContain("[REDACTED]");
    expect(redacted).not.toContain("secret-admin-session-cookie");
    expect(redacted).not.toContain("synthetic-admin-password");
    expect(redacted).not.toContain("smoke:secret");
  });

  it("verifies marker and response preflight are required", () => {
    const source = smokeSource();

    expect(source).toContain("verifyResponseSource");
    expect(source).toContain("fetchResponseById");
    expect(source).toContain("responseMatchesMarker");
    expect(source).toContain("auto_existing_response");
    expect(source).toContain("extractSyntheticMarker");
    expect(source).toContain("did not include required synthetic marker");
  });

  it("verifies autonomous admin bootstrap is present without weakening auth", () => {
    const source = smokeSource();

    expect(source).toContain("bootstrapAutonomousAdmin");
    expect(source).toContain("validateDatabaseUrlForTarget");
    expect(source).toContain("authMode: \"autonomous_db\"");
    expect(source).toContain("loginWithCredentials(page, config.adminEmail!, config.adminPassword!)");
    expect(source).toContain("Configured authenticated context resolved to role");
  });

  it("verifies UI route, controls, and safety checks are present", () => {
    expect(RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_PAGE_REQUIRED_TEXT).toEqual(
      expect.arrayContaining([
        "Response Documents",
        "Response documents are evidence and metadata only.",
        "No mailbox, Gmail, IMAP, or inbox integration is used.",
      ]),
    );
    expect(RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_DETAIL_REQUIRED_TEXT).toEqual(
      expect.arrayContaining([
        "Admin Metadata Review",
        "Admin review updates response metadata only.",
        "Save Metadata Review",
      ]),
    );
    expect(RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_REQUIRED_TEXT).toEqual(
      expect.arrayContaining([
        "Response Documents",
        "Admin Metadata Review",
        "Admin review updates response metadata only.",
        "Save Metadata Review",
      ]),
    );

    const source = smokeSource();
    expect(source).toContain("page.goto(RESPONSE_DOCUMENT_UI_PATH)");
    expect(source).toContain("submitAdminReviewUiAction");
    expect(source).toContain("Save Metadata Review");
    expect(source).toContain("Response review metadata saved.");
  });

  it("waits for the selected response detail panel before checking admin-review controls", () => {
    const source = smokeSource();

    expect(source).toContain("RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_PAGE_REQUIRED_TEXT");
    expect(source).toContain("responseDetailPanelLocator");
    expect(source).toContain("assertAdminReviewDetailSection");
    expect(source).toContain("detailPanel.getByRole(\"heading\", { name: /Admin Metadata Review/i })");
    expect(source).toContain("detailPanel.getByRole(\"button\", { name: /Save Metadata Review/i })");
    expect(source).toContain("submitAdminReviewUiAction(detailPanel)");
  });

  it("reports redacted diagnostics when the admin-review section is missing", () => {
    const source = smokeSource();

    expect(source).toContain("buildAdminReviewUiDiagnostics");
    expect(source).toContain("currentUrl=");
    expect(source).toContain("adminRouteRendered=");
    expect(source).toContain("responseListLoaded=");
    expect(source).toContain("syntheticResponseVisible=");
    expect(source).toContain("detailPanelVisible=");
    expect(source).toContain("adminMetadataReviewVisible=");
    expect(source).toContain("saveMetadataReviewVisible=");
    expect(source).toContain("redactSecretText");
  });

  it("verifies only the safe add-review-note action is submitted through the UI", () => {
    expect(RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_ALLOWED_ACTION).toBe("add_review_note");
    expect(RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_NOTE).toContain("later report comparison required");

    const source = smokeSource();
    expect(source).toContain("RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_ALLOWED_ACTION");
    expect(source).toContain("reviewMetadataChanged: true");
    expect(source).toContain("laterReportComparisonStillRequired: true");
    expect(source).toContain("noCorrectedRemovedUnchangedClassification: true");
  });

  it("verifies unsupported corrected/removed/legal/override and inbox controls are absent", () => {
    expect(RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_FORBIDDEN_VISIBLE_TEXT).toEqual(
      expect.arrayContaining([
        "Mark Corrected",
        "Mark Removed",
        "Mark Unchanged",
        "Override Outcome",
        "Legal Violation",
        "Demand",
        "Enforce",
        "Connect Gmail",
        "Connect IMAP",
        "Inbox Sync",
        "Parse Response",
      ]),
    );
    expect(() => assertNoForbiddenVisibleText("Response documents are evidence and metadata only.")).not.toThrow();
    expect(() => assertNoForbiddenVisibleText("Enforcement mechanisms")).not.toThrow();
    expect(() => assertNoForbiddenVisibleText("Mark Corrected")).toThrow(/Forbidden response admin-review UI text/);
  });

  it("verifies runtime-safety checks are present and admin-review is the only mutation allowed", () => {
    expect(FORBIDDEN_RESPONSE_ADMIN_REVIEW_UI_ENDPOINTS).toEqual(
      expect.arrayContaining([
        { method: "POST", path: "/_api/responses/capture" },
        { method: "POST", path: "/_api/parser/run" },
        { method: "POST", path: "/_api/ocr/run" },
        { method: "POST", path: "/_api/canonical/update" },
        { method: "GET", path: "/_api/packet/readiness" },
        { method: "POST", path: "/_api/violations/run" },
        { method: "POST", path: "/_api/admin/override" },
        { method: "POST", path: "/_api/furnisher/packet" },
        { method: "POST", path: "/_api/gmail/sync" },
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
      /Forbidden response admin-review UI smoke endpoint/,
    );
  });

  it("verifies no destructive cleanup is attempted", () => {
    expect(RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_CLEANUP_POLICY).toContain("append-only");
    expect(RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_CLEANUP_POLICY).toContain("review metadata");
    expect(RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_CLEANUP_POLICY).toContain("audit rows");
    expect(() => assertNoDestructiveCleanupPlanned()).not.toThrow();
    expect(() => assertNoDestructiveCleanupPlanned("delete response rows")).toThrow(/append-only/);
  });
});
