import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMock = vi.fn();

vi.mock("../../helpers/db", () => ({
  db: {
    selectFrom: vi.fn(() => ({
      selectAll: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: executeMock,
    })),
  },
}));

import { executeActiveRules } from "../../helpers/dynamicRuleExecutor";

function activeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    title: "Dynamic balance rule",
    ruleDefinition: {
      conditions: [{ field: "balance", operator: "greaterThan", value: 100 }],
      logic: "AND",
      regulationIds: ["PIPEDA_4_6"],
    },
    violationCategory: "BALANCE_CALCULATION_VIOLATION",
    severity: "WARNING",
    confidenceScore: "82",
    userExplanationTemplate: "Balance {value} needs review.",
    recommendedActionTemplate: "Review {field}.",
    statutoryBasis: "PIPEDA Schedule 1, Principle 4.6",
    ...overrides,
  };
}

describe("dynamic rule executor authority gating", () => {
  beforeEach(() => {
    executeMock.mockReset();
  });

  it("skips active dynamic rules without explicit local authority ids", async () => {
    executeMock.mockResolvedValueOnce([
      activeRule({
        ruleDefinition: {
          conditions: [{ field: "balance", operator: "greaterThan", value: 100 }],
          logic: "AND",
        },
      }),
    ]);

    const violations = await executeActiveRules({ balance: 125 } as any);

    expect(violations).toEqual([]);
  });

  it("skips active dynamic rules whose authority ids do not resolve locally", async () => {
    executeMock.mockResolvedValueOnce([
      activeRule({
        ruleDefinition: {
          conditions: [{ field: "balance", operator: "greaterThan", value: 100 }],
          logic: "AND",
          regulationIds: ["NOT_A_LOCAL_AUTHORITY"],
        },
      }),
    ]);

    const violations = await executeActiveRules({ balance: 125 } as any);

    expect(violations).toEqual([]);
  });

  it("emits matched dynamic findings only with resolved local authority ids", async () => {
    executeMock.mockResolvedValueOnce([activeRule()]);

    const violations = await executeActiveRules({ balance: 125 } as any);

    expect(violations).toHaveLength(1);
    expect(violations[0].technicalDetails).toEqual(
      expect.objectContaining({
        ruleId: 10,
        fieldName: "balance",
        matchedValue: 125,
        regulationIds: ["PIPEDA_4_6"],
      }),
    );
  });
});
