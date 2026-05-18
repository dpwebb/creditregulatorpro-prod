import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  assertNoDestructiveCleanupPlanned,
  assertNoForbiddenEndpointCalls,
  assertResponseDocumentEvidenceOnly,
  assertResponseDocumentPrivacySafe,
  buildResponseDocumentSource,
  buildSmokeConfig,
  FORBIDDEN_RESPONSE_DOCUMENT_SMOKE_ENDPOINTS,
  redactSecretText,
  RESPONSE_DOCUMENT_CLEANUP_POLICY,
  RESPONSE_DOCUMENT_ENDPOINTS,
  runCli,
  SKIPPED_EXIT_CODE,
  SMOKE_GATE_ENV,
} from "../../scripts/staging-response-document-smoke";

function readyEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    CRP_RESPONSE_DOCUMENT_SMOKE: "true",
    STAGING_BASE_URL: "https://staging.creditregulatorpro.com",
    STAGING_USER_SESSION_COOKIE: "floot_built_app_session=secret-user-session-cookie; Path=/",
    STAGING_RESPONSE_COMPARISON_RUN_ID: "2",
    STAGING_RESPONSE_FINDING_OUTCOME_ID: "2",
    STAGING_RESPONSE_SYNTHETIC_MARKER: "OUTCOME_SMOKE_RESPONSE_DOCUMENT_UNIT",
    ...overrides,
  };
}

function smokeSource(): string {
  return readFileSync(join(process.cwd(), "scripts", "staging-response-document-smoke.ts"), "utf8");
}

describe("response document staging smoke harness", () => {
  it("refuses to run without CRP_RESPONSE_DOCUMENT_SMOKE=true", () => {
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

  it("allows staging host with required user/admin auth env", () => {
    expect(buildSmokeConfig(readyEnv())).toMatchObject({
      status: "ready",
      baseUrl: "https://staging.creditregulatorpro.com",
      host: "staging.creditregulatorpro.com",
      authMode: "session_cookie",
      authRole: "user",
      source: {
        mode: "existing_outcome_run",
        comparisonRunId: 2,
        findingOutcomeId: 2,
        syntheticMarker: "OUTCOME_SMOKE_RESPONSE_DOCUMENT_UNIT",
      },
    });

    expect(
      buildSmokeConfig(
        readyEnv({
          STAGING_USER_SESSION_COOKIE: "",
          STAGING_ADMIN_SESSION_COOKIE: "floot_built_app_session=secret-admin-session-cookie; Path=/",
        }),
      ),
    ).toMatchObject({
      status: "ready",
      authMode: "session_cookie",
      authRole: "admin",
    });

    expect(
      buildSmokeConfig(
        readyEnv({
          STAGING_USER_SESSION_COOKIE: "",
          STAGING_USER_EMAIL: "user@example.test",
          STAGING_USER_PASSWORD: "synthetic-user-password",
        }),
      ),
    ).toMatchObject({
      status: "ready",
      authMode: "credentials",
      authRole: "user",
    });
  });

  it("exits skipped when no safe authenticated context exists", async () => {
    expect(
      buildSmokeConfig(
        readyEnv({
          STAGING_USER_SESSION_COOKIE: "",
          STAGING_ADMIN_SESSION_COOKIE: "",
          STAGING_USER_EMAIL: "",
          STAGING_USER_PASSWORD: "",
          STAGING_ADMIN_EMAIL: "",
          STAGING_ADMIN_PASSWORD: "",
        }),
      ),
    ).toEqual({
      status: "skipped",
      reason: "SKIPPED: no safe authenticated response smoke context configured.",
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const code = await runCli({
      [SMOKE_GATE_ENV]: "true",
      STAGING_BASE_URL: "https://staging.creditregulatorpro.com",
      STAGING_RESPONSE_SYNTHETIC_MARKER: "OUTCOME_SMOKE_RESPONSE_DOCUMENT_UNIT",
      STAGING_RESPONSE_COMPARISON_RUN_ID: "2",
    });

    expect(code).toBe(SKIPPED_EXIT_CODE);
    expect(logSpy).toHaveBeenCalledWith("SKIPPED: no safe authenticated response smoke context configured.");
    logSpy.mockRestore();
  });

  it("exits skipped when no verified synthetic run, packet, or marker exists", () => {
    expect(
      buildSmokeConfig(
        readyEnv({
          STAGING_RESPONSE_COMPARISON_RUN_ID: "",
          STAGING_RESPONSE_PACKET_ID: "",
          STAGING_RESPONSE_ALLOW_METADATA_ONLY: "",
          STAGING_OUTCOME_COMPARISON_RUN_ID: "",
          STAGING_OUTCOME_SYNTHETIC_MARKER: "",
        }),
      ),
    ).toEqual(
      expect.objectContaining({
        status: "skipped",
        reason: expect.stringContaining("no verified synthetic run, packet, or metadata-only response context configured"),
      }),
    );
  });

  it("supports existing outcome, packet-linked, metadata-only, and outcome-env fallback source modes", () => {
    expect(buildResponseDocumentSource(readyEnv(), "STAGING")).toEqual({
      mode: "existing_outcome_run",
      syntheticMarker: "OUTCOME_SMOKE_RESPONSE_DOCUMENT_UNIT",
      comparisonRunId: 2,
      findingOutcomeId: 2,
    });

    expect(
      buildResponseDocumentSource(
        readyEnv({
          STAGING_RESPONSE_COMPARISON_RUN_ID: "",
          STAGING_RESPONSE_PACKET_ID: "99",
          STAGING_RESPONSE_DISPUTE_PACKET_FINDING_ID: "100",
        }),
        "STAGING",
      ),
    ).toEqual({
      mode: "packet_linked",
      syntheticMarker: "OUTCOME_SMOKE_RESPONSE_DOCUMENT_UNIT",
      packetId: 99,
      disputePacketFindingId: 100,
    });

    expect(
      buildResponseDocumentSource(
        readyEnv({
          STAGING_RESPONSE_COMPARISON_RUN_ID: "",
          STAGING_RESPONSE_PACKET_ID: "",
          STAGING_RESPONSE_ALLOW_METADATA_ONLY: "true",
        }),
        "STAGING",
      ),
    ).toEqual({
      mode: "metadata_only",
      syntheticMarker: "OUTCOME_SMOKE_RESPONSE_DOCUMENT_UNIT",
    });

    expect(
      buildResponseDocumentSource(
        readyEnv({
          STAGING_RESPONSE_SYNTHETIC_MARKER: "",
          STAGING_RESPONSE_COMPARISON_RUN_ID: "",
          STAGING_RESPONSE_FINDING_OUTCOME_ID: "",
          STAGING_OUTCOME_SYNTHETIC_MARKER: "OUTCOME_SMOKE_FALLBACK_UNIT",
          STAGING_OUTCOME_COMPARISON_RUN_ID: "77",
          STAGING_OUTCOME_FINDING_OUTCOME_ID: "78",
        }),
        "STAGING",
      ),
    ).toEqual({
      mode: "existing_outcome_run",
      syntheticMarker: "OUTCOME_SMOKE_FALLBACK_UNIT",
      comparisonRunId: 77,
      findingOutcomeId: 78,
    });
  });

  it("does not print secrets/session cookie/password", () => {
    const env = readyEnv({
      STAGING_ADMIN_PASSWORD: "synthetic-admin-password",
      STAGING_USER_PASSWORD: "synthetic-user-password",
    });
    const raw =
      "failure floot_built_app_session=secret-user-session-cookie synthetic-user-password synthetic-admin-password";

    const redacted = redactSecretText(raw, env);

    expect(redacted).toContain("[REDACTED]");
    expect(redacted).not.toContain("secret-user-session-cookie");
    expect(redacted).not.toContain("synthetic-user-password");
    expect(redacted).not.toContain("synthetic-admin-password");
  });

  it("verifies marker preflight is required", () => {
    const source = smokeSource();

    expect(source).toContain("validateSyntheticReportMarker");
    expect(source).toContain("assertSyntheticMarkerPresent");
    expect(source).toContain("did not include required synthetic marker");
    expect(source).toContain(SUPPORTING_MARKER_SURFACE);
    expect(source).toContain("packet-linked response smoke could not verify the synthetic marker");
  });

  it("verifies response capture/list/get checks are present", () => {
    expect(RESPONSE_DOCUMENT_ENDPOINTS).toEqual({
      capture: "/_api/responses/capture",
      list: "/_api/responses/list",
      get: "/_api/responses/get",
    });

    const source = smokeSource();
    expect(source).toContain("RESPONSE_DOCUMENT_ENDPOINTS.capture");
    expect(source).toContain("RESPONSE_DOCUMENT_ENDPOINTS.list");
    expect(source).toContain("RESPONSE_DOCUMENT_ENDPOINTS.get");
    expect(source).toContain("Response capture did not return a valid response ID");
    expect(source).toContain("Response document list did not include the captured synthetic response");
  });

  it("verifies response metadata remains evidence-only", () => {
    expect(() =>
      assertResponseDocumentEvidenceOnly({
        response: {
          responseChannel: "email",
          responseDocumentType: "bureau_email_response",
          responseStatus: "received",
          responseSummary:
            "Synthetic bureau email response recorded for smoke testing. Later report comparison is still required.",
        },
      }),
    ).not.toThrow();

    expect(() => assertResponseDocumentEvidenceOnly({ outcomeType: "corrected" })).toThrow(
      /forbidden outcome\/canonical classification/,
    );
    expect(() => assertResponseDocumentEvidenceOnly({ successOutcome: "removed" })).toThrow(
      /forbidden outcome\/canonical classification/,
    );
  });

  it("verifies no corrected/removed/unchanged classification is allowed from response capture", () => {
    const source = smokeSource();

    expect(source).toContain("noCorrectedRemovedUnchangedClassification: true");
    expect(source).toContain("laterReportComparisonStillRequired: true");
    expect(source).toContain("assertOutcomeUnchangedAfterCapture");
    expect(source).toContain("Response capture smoke detected deterministic outcome mutation");
    expect(FORBIDDEN_RESPONSE_DOCUMENT_SMOKE_ENDPOINTS).toEqual(
      expect.arrayContaining([
        { method: "POST", path: "/_api/evidence/bureau-communication" },
        { method: "POST", path: "/_api/obligation-instance/record-response" },
      ]),
    );
  });

  it("verifies runtime safety checks are present", () => {
    expect(FORBIDDEN_RESPONSE_DOCUMENT_SMOKE_ENDPOINTS).toEqual(
      expect.arrayContaining([
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
        { method: "POST", path: "/_api/evidence/bureau-communication" },
        { method: "POST", path: "/_api/obligation-instance/record-response" },
      ]),
    );
    expect(() => assertNoForbiddenEndpointCalls(["POST /_api/responses/capture"])).not.toThrow();
    expect(() => assertNoForbiddenEndpointCalls(["POST /_api/packet/update-status"])).toThrow(
      /Forbidden response document smoke endpoint/,
    );
  });

  it("verifies privacy/no-overexposure checks are present", () => {
    expect(() =>
      assertResponseDocumentPrivacySafe({
        responseSummary:
          "A response was recorded. This response was captured as evidence. A later credit report comparison is still needed.",
        maskedAccountNumber: "****1234",
      }),
    ).not.toThrow();
    expect(() => assertResponseDocumentPrivacySafe({ sin: "123-456-789" })).toThrow(/privacy check/);
    expect(() => assertResponseDocumentPrivacySafe({ account: "4111111111111111" })).toThrow(/privacy check/);
    expect(() => assertResponseDocumentPrivacySafe({ rawReportText: "raw report text" })).toThrow(/privacy check/);
    expect(() => assertResponseDocumentPrivacySafe({ responseSummary: "full email body" })).toThrow(/privacy check/);
    expect(() => assertResponseDocumentPrivacySafe({ storageUrl: "bucket://private/path" })).toThrow(/privacy check/);
    expect(() => assertResponseDocumentPrivacySafe({ signedUrl: "https://example.test/file?X-Goog-Signature=secret" })).toThrow(
      /privacy check/,
    );
    expect(() => assertResponseDocumentPrivacySafe({ token: "sk-synthetic-secret" })).toThrow(/privacy check/);
    expect(() => assertResponseDocumentPrivacySafe({ responseSummary: "mailbox password secret" })).toThrow(
      /privacy check/,
    );
  });

  it("verifies forbidden legal-conclusion phrases are checked", () => {
    for (const responseSummary of [
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
    ]) {
      expect(() => assertResponseDocumentPrivacySafe({ responseSummary })).toThrow(/legal-language check/);
    }
  });

  it("verifies no destructive cleanup is attempted", () => {
    expect(RESPONSE_DOCUMENT_CLEANUP_POLICY).toContain("append-only");
    expect(RESPONSE_DOCUMENT_CLEANUP_POLICY).toContain("response metadata");
    expect(RESPONSE_DOCUMENT_CLEANUP_POLICY).toContain("audit rows");
    expect(() => assertNoDestructiveCleanupPlanned()).not.toThrow();
    expect(() => assertNoDestructiveCleanupPlanned("delete synthetic response rows")).toThrow(/append-only/);
  });

  it("verifies mailbox/Gmail/IMAP/inbox scraping is not called", () => {
    expect(FORBIDDEN_RESPONSE_DOCUMENT_SMOKE_ENDPOINTS).toEqual(
      expect.arrayContaining([
        { method: "GET", path: "/_api/gmail/list" },
        { method: "POST", path: "/_api/gmail/sync" },
        { method: "POST", path: "/_api/imap/sync" },
        { method: "POST", path: "/_api/mailbox/sync" },
        { method: "POST", path: "/_api/inbox/scrape" },
      ]),
    );
    expect(() => assertNoForbiddenEndpointCalls(["POST /_api/imap/sync"])).toThrow(
      /Forbidden response document smoke endpoint/,
    );
  });
});

const SUPPORTING_MARKER_SURFACE = "/_api/upload-results/get";
