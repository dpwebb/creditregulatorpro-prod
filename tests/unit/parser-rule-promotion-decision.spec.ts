import { describe, expect, it } from "vitest";
import {
  acceptDecisionCoveredByExistingRule,
  EXISTING_ACTIVE_RULE_COVERAGE_MESSAGE,
} from "../../helpers/parserRulePromotionDecision";

describe("parser rule promotion decision acceptance", () => {
  it("marks a correction accepted when an existing rule already covers it", () => {
    const result = acceptDecisionCoveredByExistingRule(
      [
        {
          id: "decision-1",
          decision: "missing",
          fieldPath: "tradelines[0].remarkCodes",
          parsedValue: null,
          correctValue: ["AC-Account closed/rating non derogatory"],
        },
      ],
      "decision-1",
      17,
      99,
      "2026-05-06T12:00:00.000Z",
    );

    expect(result.changed).toBe(true);
    expect(result.hasRemainingPromotableDecisions).toBe(false);
    expect(result.decisions).toEqual([
      expect.objectContaining({
        id: "decision-1",
        decision: "accepted",
        correctValue: ["AC-Account closed/rating non derogatory"],
        acceptedByExistingParserRule: true,
        acceptedByExistingParserRuleId: 17,
        parserRulePromotionStatus: "existing_rule_reused",
        parserRulePromotionMessage: EXISTING_ACTIVE_RULE_COVERAGE_MESSAGE,
        promotedBy: 99,
        promotedAt: "2026-05-06T12:00:00.000Z",
      }),
    ]);
  });

  it("keeps parser-rule review status when other promotable decisions remain", () => {
    const result = acceptDecisionCoveredByExistingRule(
      [
        { id: "decision-1", decision: "corrected", fieldPath: "tradelines[0].accountNumber" },
        { id: "decision-2", decision: "missing", fieldPath: "tradelines[0].remarkCodes" },
      ],
      "decision-1",
      17,
      99,
      "2026-05-06T12:00:00.000Z",
    );

    expect(result.changed).toBe(true);
    expect(result.hasRemainingPromotableDecisions).toBe(true);
    expect(result.decisions).toEqual([
      expect.objectContaining({ id: "decision-1", decision: "accepted" }),
      expect.objectContaining({ id: "decision-2", decision: "missing" }),
    ]);
  });
});
