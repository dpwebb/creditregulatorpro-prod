import { describe, expect, it } from "vitest";

import {
  buildScanningRuleUpdateData,
  validateScanningRuleActivation,
} from "../../endpoints/scanning-rule/update_POST";
import { RuleDefinitionSchema } from "../../helpers/dynamicRuleGenerator";

describe("scanning rule update", () => {
  it("stores rule definitions as JSON objects instead of JSON strings", () => {
    const ruleDefinition = {
      conditions: [
        {
          field: "lastReportedDate",
          operator: "olderThanDays" as const,
          value: 365,
        },
      ],
      logic: "AND" as const,
      regulationIds: ["PIPEDA_4_6"],
    };

    const updateData = buildScanningRuleUpdateData(
      {
        id: 1,
        ruleDefinition,
      },
      new Date("2026-01-01T00:00:00.000Z"),
    );

    expect(typeof updateData.ruleDefinition).toBe("object");
    expect(updateData.ruleDefinition).toEqual(ruleDefinition);
    expect(updateData.ruleDefinition).not.toBe(JSON.stringify(ruleDefinition));
    expect(RuleDefinitionSchema.safeParse(updateData.ruleDefinition).success).toBe(true);
  });

  it("rejects activation for rules without locally resolvable authority ids", () => {
    expect(
      validateScanningRuleActivation({
        conditions: [
          {
            field: "lastReportedDate",
            operator: "olderThanDays" as const,
            value: 365,
          },
        ],
        logic: "AND" as const,
      }).error,
    ).toContain("regulationIds");

    expect(
      validateScanningRuleActivation({
        conditions: [
          {
            field: "lastReportedDate",
            operator: "olderThanDays" as const,
            value: 365,
          },
        ],
        logic: "AND" as const,
        regulationIds: ["NOT_A_LOCAL_AUTHORITY"],
      }).error,
    ).toContain("locally resolved");
  });

  it("accepts legacy JSON-string rule definitions with authority ids during activation", () => {
    const activation = validateScanningRuleActivation(JSON.stringify({
      conditions: [
        {
          field: "lastReportedDate",
          operator: "olderThanDays",
          value: 365,
        },
      ],
      logic: "AND",
      regulationIds: ["PIPEDA_4_6"],
    }));

    expect(activation.error).toBeNull();
    expect(activation.ruleDefinition).toEqual(
      expect.objectContaining({
        regulationIds: ["PIPEDA_4_6"],
      }),
    );
  });
});
