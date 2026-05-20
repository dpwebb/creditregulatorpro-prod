import { describe, expect, it } from "vitest";

import {
  buildSensitiveListEndpointEvidenceReport,
  detectProductionLikeEnvironment,
  evaluateSensitiveListEndpointSources,
  renderSensitiveListEndpointEvidenceMarkdown,
} from "../../scripts/sensitive-list-endpoints-evidence.mjs";

describe("sensitive list endpoint evidence", () => {
  it("proves sensitive list fields moved to controlled detail/export paths", () => {
    const evaluation = evaluateSensitiveListEndpointSources();

    expect(evaluation.parserTestCase.listMetadataOnly).toBe(true);
    expect(evaluation.parserTestCase.detailIncludesRawText).toBe(true);
    expect(evaluation.parserTestCase.detailAdminOnly).toBe(true);
    expect(evaluation.parserTestCase.exportIncludesRawText).toBe(true);
    expect(evaluation.parserTestCase.exportAdminOnly).toBe(true);
    expect(evaluation.consumerSignature.listMetadataOnly).toBe(true);
    expect(evaluation.consumerSignature.detailIncludesSignatureData).toBe(true);
    expect(evaluation.consumerSignature.detailOwnerOrAdminControlled).toBe(true);
  });

  it("generates the hidden-risk partial design artifact without a blind limit claim", () => {
    const report = buildSensitiveListEndpointEvidenceReport({
      generatedAt: "2026-05-20T00:00:00.000Z",
      env: { NODE_ENV: "test" },
    });
    const markdown = renderSensitiveListEndpointEvidenceMarkdown(report);

    expect(report.status).toBe("passed");
    expect(report.evaluations.hiddenRisk.designArtifactGenerated).toBe(true);
    expect(report.evaluations.hiddenRisk.status).toBe("partial-design-only");
    expect(report.evaluations.hiddenRisk.blindLimitApplied).toBe(false);
    expect(markdown).toContain("Hidden-risk semantics remain partial/design-only");
    expect(markdown).toContain("Split aggregate counts into a dedicated aggregate query");
  });

  it("refuses production-like environments", () => {
    expect(detectProductionLikeEnvironment({ NODE_ENV: "production" })).toEqual({
      productionLike: true,
      reason: "NODE_ENV indicates a production environment.",
    });
    expect(() =>
      buildSensitiveListEndpointEvidenceReport({
        generatedAt: "2026-05-20T00:00:00.000Z",
        env: { DATABASE_URL: "postgres://example.invalid/creditregulatorpro-prod" },
      }),
    ).toThrow("Refusing sensitive list evidence in a production-like environment");
  });
});
