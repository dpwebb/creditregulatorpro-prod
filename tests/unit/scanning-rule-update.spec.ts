import { describe, expect, it } from "vitest";

import { buildScanningRuleUpdateData } from "../../endpoints/scanning-rule/update_POST";
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
});
