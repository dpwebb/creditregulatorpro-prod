import { describe, expect, it } from "vitest";

import {
  ADMIN_ONLY_SYNTHETIC_ROUTES,
  OWNER_SCOPED_SYNTHETIC_RECORDS,
  buildStagingOwnerDenialSmokeReport,
  detectProductionLikeEnvironment,
  renderStagingOwnerDenialSmokeMarkdown,
  scanEvidenceTextForForbiddenContent,
} from "../../scripts/staging-owner-denial-smoke.mjs";

describe("staging owner-denial smoke evidence", () => {
  it("covers owner-scoped case, evidence, report artifact, packet, packet PDF, and response records", () => {
    const report = buildStagingOwnerDenialSmokeReport({
      generatedAt: "2026-05-20T00:00:00.000Z",
      env: { NODE_ENV: "test" },
    });

    expect(OWNER_SCOPED_SYNTHETIC_RECORDS.map((record) => record.domain)).toEqual([
      "case",
      "evidence",
      "report artifact",
      "packet",
      "packet PDF",
      "response document",
    ]);
    expect(report.summary.ownerBDeniedOwnerARecords).toBe(true);
    expect(report.ownerDenialChecks.filter((check) => check.name.startsWith("owner B denied")).every((check) => check.actual === "DENY")).toBe(true);
    expect(report.summary.failedChecks).toBe(0);
  });

  it("keeps admin-only routes denied to non-admin synthetic actors", () => {
    const report = buildStagingOwnerDenialSmokeReport({
      generatedAt: "2026-05-20T00:00:00.000Z",
      env: { NODE_ENV: "test" },
    });

    expect(ADMIN_ONLY_SYNTHETIC_ROUTES).toEqual(
      expect.arrayContaining([
        "/_api/admin/users",
        "/_api/admin/ingest-queue",
        "/_api/responses/queue",
      ]),
    );
    expect(report.summary.adminOnlyRoutesDeniedForNonAdmins).toBe(true);
    expect(report.adminOnlyChecks.filter((check) => !check.name.startsWith("admin can access")).every((check) => check.actual === "DENY")).toBe(true);
  });

  it("labels output as local/staging synthetic only and not production proof", () => {
    const report = buildStagingOwnerDenialSmokeReport({
      generatedAt: "2026-05-20T00:00:00.000Z",
      env: { NODE_ENV: "test" },
    });
    const markdown = renderStagingOwnerDenialSmokeMarkdown(report);

    expect(report.label).toBe("LOCAL/STAGING SYNTHETIC ONLY");
    expect(report.productionProof).toBe(false);
    expect(report.productionDataMutated).toBe(false);
    expect(report.productionFixturesCreated).toBe(false);
    expect(markdown).toContain("not production proof");
    expect(markdown).toContain("Production fixtures created: no");
  });

  it("refuses production-like environments", () => {
    expect(detectProductionLikeEnvironment({ NODE_ENV: "production" })).toEqual({
      productionLike: true,
      reason: "NODE_ENV indicates a production environment.",
    });
    expect(() =>
      buildStagingOwnerDenialSmokeReport({
        generatedAt: "2026-05-20T00:00:00.000Z",
        env: { DATABASE_URL: "postgres://example.invalid/creditregulatorpro-prod" },
      }),
    ).toThrow("Refusing synthetic owner-denial smoke in a production-like environment");
  });

  it("does not render PII, raw reports, secrets, or credential URLs", () => {
    const report = buildStagingOwnerDenialSmokeReport({
      generatedAt: "2026-05-20T00:00:00.000Z",
      env: { NODE_ENV: "test" },
    });
    const rendered = `${renderStagingOwnerDenialSmokeMarkdown(report)}\n${JSON.stringify(report)}`;

    expect(scanEvidenceTextForForbiddenContent(rendered)).toEqual([]);
  });
});
