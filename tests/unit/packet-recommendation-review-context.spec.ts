import { describe, expect, it } from "vitest";

import { buildPacketRecommendationReviewContext } from "../../helpers/packetRecommendationReviewContext";

describe("packet recommendation review context", () => {
  it("summarizes parser review evidence and source report links", () => {
    const context = buildPacketRecommendationReviewContext({
      tradelineId: 321,
      violationId: 654,
      reportArtifactId: 999,
      packetConfidenceGate: {
        deterministic: true,
        ruleId: "violation-packet-confidence-gate-v1",
        status: "needs_user_review",
        packetReady: false,
        blockerCode: "violation_needs_review",
        confidenceScore: 78,
        message: "Review and verify this finding before creating a dispute packet.",
      },
      technicalDetails: {
        sourceReportArtifactId: 123,
        fieldName: "balance",
        detectedValue: "418",
        expectedValue: "0",
        extractionConfidenceGate: {
          reasonCodes: ["PARSER_CONFIDENCE_NEEDS_USER_REVIEW"],
        },
      },
    });

    expect(context).toMatchObject({
      required: true,
      blockerCode: "violation_needs_review",
      parserStatus: "needs_user_review",
      confidenceScore: 78,
      reportArtifactId: 123,
      reviewUrl: "/tradelines/321?tab=compliance&reviewViolationId=654",
      reasonCodes: ["PARSER_CONFIDENCE_NEEDS_USER_REVIEW"],
    });
    expect(context.evidenceSummary).toEqual([
      "Reviewed field: balance",
      "Detected value: 418",
      "Expected value: 0",
      "Source artifact: 123",
    ]);
  });
});
