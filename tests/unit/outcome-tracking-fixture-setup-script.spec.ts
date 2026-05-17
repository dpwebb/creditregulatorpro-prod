import { describe, expect, it } from "vitest";

import {
  assertSyntheticPayloadSafe,
  buildFixtureSetupConfig,
  buildSyntheticReportData,
  buildSyntheticTradelineValues,
  FIXTURE_CLEANUP_POSTURE,
  FIXTURE_SETUP_CREATES_PACKET_FIXTURES,
  FORBIDDEN_FIXTURE_SETUP_ENDPOINTS,
  markerIsSynthetic,
  outputForRows,
  redactSecretText,
  validateDatabaseUrlForTarget,
  validateFixtureHost,
} from "../../scripts/staging-outcome-tracking-fixture-setup";

function stagingEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    CRP_OUTCOME_TRACKING_FIXTURE_SETUP: "true",
    CRP_OUTCOME_TRACKING_FIXTURE_TARGET: "staging",
    STAGING_BASE_URL: "https://staging.creditregulatorpro.com",
    STAGING_DATABASE_URL: "postgres://fixture:staging-secret-pass@staging-db.internal:5432/creditregulatorpro_staging",
    CRP_OUTCOME_TRACKING_FIXTURE_MARKER: "OUTCOME_SMOKE_UNIT_20260517",
    ...overrides,
  };
}

function localEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    CRP_OUTCOME_TRACKING_FIXTURE_SETUP: "true",
    CRP_OUTCOME_TRACKING_FIXTURE_TARGET: "local",
    CRP_LOCAL_DEV: "true",
    LOCAL_SMOKE_BASE_URL: "http://localhost:3333",
    LOCAL_DATABASE_URL: "postgres://fixture:local-secret-pass@127.0.0.1:5432/creditregulatorpro_local",
    CRP_OUTCOME_TRACKING_FIXTURE_MARKER: "OUTCOME_SMOKE_LOCAL_UNIT_20260517",
    ...overrides,
  };
}

describe("outcome tracking fixture setup harness", () => {
  it("refuses to run without CRP_OUTCOME_TRACKING_FIXTURE_SETUP=true", () => {
    expect(buildFixtureSetupConfig({})).toEqual({
      status: "skipped",
      reason: "SKIPPED: CRP_OUTCOME_TRACKING_FIXTURE_SETUP=true is required.",
    });
  });

  it("refuses production hosts", () => {
    expect(validateFixtureHost("https://creditregulatorpro.com", "staging")).toEqual({
      ok: false,
      reason: "Refusing to run against production host creditregulatorpro.com.",
    });
    expect(buildFixtureSetupConfig(stagingEnv({ STAGING_BASE_URL: "https://www.creditregulatorpro.com" }))).toEqual(
      expect.objectContaining({ status: "error" }),
    );
  });

  it("refuses production-looking DB URLs", () => {
    const result = validateDatabaseUrlForTarget(
      "postgres://fixture:secret@prod-db.internal:5432/creditregulatorpro_prod",
      "staging",
      "STAGING_DATABASE_URL",
      stagingEnv(),
    );

    expect(result).toEqual({
      ok: false,
      reason: "Refusing production-looking database URL from STAGING_DATABASE_URL.",
    });
  });

  it("allows staging host only with explicit staging-safe DB env", () => {
    expect(buildFixtureSetupConfig(stagingEnv())).toEqual(
      expect.objectContaining({
        status: "ready",
        target: "staging",
        host: "staging.creditregulatorpro.com",
        databaseUrlSource: "STAGING_DATABASE_URL",
        outputPrefix: "STAGING",
      }),
    );

    expect(
      buildFixtureSetupConfig(
        stagingEnv({
          STAGING_DATABASE_URL: "",
          FLOOT_DATABASE_URL: "postgres://fixture:secret@staging-db.internal:5432/creditregulatorpro_staging",
        }),
      ),
    ).toEqual(expect.objectContaining({ status: "ready", databaseUrlSource: "FLOOT_DATABASE_URL" }));

    expect(
      buildFixtureSetupConfig(
        stagingEnv({
          STAGING_DATABASE_URL: "postgres://fixture:secret@db.internal:5432/creditregulatorpro",
        }),
      ),
    ).toEqual(expect.objectContaining({ status: "error", reason: expect.stringContaining("staging database") }));
  });

  it("allows localhost with local-safe DB env", () => {
    expect(buildFixtureSetupConfig(localEnv())).toEqual(
      expect.objectContaining({
        status: "ready",
        target: "local",
        host: "localhost",
        databaseUrlSource: "LOCAL_DATABASE_URL",
        outputPrefix: "LOCAL_SMOKE",
      }),
    );
    expect(buildFixtureSetupConfig(localEnv({ CRP_LOCAL_DEV: "" }))).toEqual(
      expect.objectContaining({ status: "error", reason: expect.stringContaining("CRP_LOCAL_DEV=true") }),
    );
    expect(
      buildFixtureSetupConfig(
        localEnv({ LOCAL_DATABASE_URL: "postgres://fixture:secret@staging-db.internal:5432/creditregulatorpro_staging" }),
      ),
    ).toEqual(expect.objectContaining({ status: "error", reason: expect.stringContaining("non-local DB host") }));
  });

  it("does not print DB URLs or secrets when redacting errors", () => {
    const env = stagingEnv();
    const raw = `${env.STAGING_DATABASE_URL} staging-secret-pass postgres://fixture:staging-secret-pass@staging-db.internal`;

    const redacted = redactSecretText(raw, env);

    expect(redacted).not.toContain(String(env.STAGING_DATABASE_URL));
    expect(redacted).not.toContain("staging-secret-pass");
    expect(redacted).toContain("[REDACTED]");
  });

  it("requires OUTCOME_SMOKE synthetic markers", () => {
    expect(markerIsSynthetic("OUTCOME_SMOKE_UNIT_20260517")).toBe(true);
    expect(markerIsSynthetic("REAL_CONSUMER_FIXTURE")).toBe(false);
    expect(buildFixtureSetupConfig(stagingEnv({ CRP_OUTCOME_TRACKING_FIXTURE_MARKER: "REAL_CONSUMER_FIXTURE" }))).toEqual(
      expect.objectContaining({
        status: "error",
        reason: "Synthetic fixture marker must start with OUTCOME_SMOKE_.",
      }),
    );
  });

  it("builds synthetic fixture payloads without SIN-like values", () => {
    const marker = "OUTCOME_SMOKE_UNIT_20260517";
    const report = buildSyntheticReportData(marker, `${marker}_BUREAU`, "previous");
    const tradeline = buildSyntheticTradelineValues({ marker, scenario: "corrected" });

    expect(() => assertSyntheticPayloadSafe({ report, tradeline })).not.toThrow();
    expect(JSON.stringify({ report, tradeline })).not.toMatch(/\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/);
  });

  it("builds synthetic fixture payloads without full unmasked account numbers", () => {
    const tradeline = buildSyntheticTradelineValues({ marker: "OUTCOME_SMOKE_UNIT_20260517", scenario: "corrected" });

    expect(tradeline.accountNumber).toContain("OUTCOME-SMOKE-ACCT-1234");
    expect(JSON.stringify(tradeline)).not.toMatch(/\b(?:\d[ -]?){12,19}\b/);
    expect(() => assertSyntheticPayloadSafe(tradeline)).not.toThrow();
  });

  it("outputs previous/later report artifact IDs and suggested smoke env names", () => {
    const config = buildFixtureSetupConfig(stagingEnv());
    if (config.status !== "ready") throw new Error("Expected ready staging fixture setup config.");

    const output = outputForRows(config, {
      marker: config.marker,
      userId: 10,
      bureauId: 11,
      creditorId: 12,
      previousReportArtifactId: 101,
      laterReportArtifactId: 102,
      previousTradelineId: 201,
      laterTradelineId: 202,
      expectedOutcomeTypes: ["corrected"],
    });

    expect(output).toMatchObject({
      status: "created",
      marker: "OUTCOME_SMOKE_UNIT_20260517",
      previousReportArtifactId: 101,
      laterReportArtifactId: 102,
      suggestedEnv: {
        STAGING_OUTCOME_PREVIOUS_REPORT_ARTIFACT_ID: "101",
        STAGING_OUTCOME_LATER_REPORT_ARTIFACT_ID: "102",
        STAGING_OUTCOME_SYNTHETIC_MARKER: "OUTCOME_SMOKE_UNIT_20260517",
      },
    });
    expect(() => assertSyntheticPayloadSafe(output)).not.toThrow();
  });

  it("does not create packet/finding fixtures unless explicitly required", () => {
    const config = buildFixtureSetupConfig(stagingEnv());
    if (config.status !== "ready") throw new Error("Expected ready staging fixture setup config.");

    expect(FIXTURE_SETUP_CREATES_PACKET_FIXTURES).toBe(false);
    expect(
      outputForRows(config, {
        marker: config.marker,
        userId: 10,
        bureauId: 11,
        creditorId: 12,
        previousReportArtifactId: 101,
        laterReportArtifactId: 102,
        previousTradelineId: 201,
        laterTradelineId: 202,
        expectedOutcomeTypes: ["unchanged"],
      }).packetFindingFixtures,
    ).toBe("deferred");
  });

  it("does not activate regulation runtime truth", () => {
    expect(FORBIDDEN_FIXTURE_SETUP_ENDPOINTS).toEqual(
      expect.arrayContaining([
        { method: "POST", path: "/_api/regulation-registry/runtime-bridge/activate" },
        { method: "POST", path: "/_api/regulation-registry/runtime-bridge/activate-limited-runtime" },
      ]),
    );
  });

  it("does not call parser/OCR/packet/violation endpoints", () => {
    expect(FORBIDDEN_FIXTURE_SETUP_ENDPOINTS).toEqual(
      expect.arrayContaining([
        { method: "POST", path: "/_api/parser/run" },
        { method: "POST", path: "/_api/ocr/run" },
        { method: "POST", path: "/_api/packet/create" },
        { method: "POST", path: "/_api/violations/run" },
        { method: "POST", path: "/_api/admin/override" },
        { method: "POST", path: "/_api/furnisher/packet" },
      ]),
    );
  });

  it("keeps cleanup posture append-only and explicit", () => {
    expect(FIXTURE_CLEANUP_POSTURE).toContain("intentionally remain");
    expect(FIXTURE_CLEANUP_POSTURE).toContain("smoke/audit");
  });
});
