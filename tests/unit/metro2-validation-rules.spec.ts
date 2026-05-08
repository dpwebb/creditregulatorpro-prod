import { describe, expect, it } from "vitest";

import { validateTradeline, type TL } from "../../helpers/metro2";

function baseTradeline(overrides: Partial<TL> = {}): TL {
  return {
    amounts: {
      high: 6120,
      current: 6120,
      pastDue: 730,
    },
    dates: {
      opened: new Date(Date.UTC(2021, 3, 13)),
      reported: new Date(Date.UTC(2025, 11, 16)),
      closed: null,
      dofd: new Date(Date.UTC(2025, 8, 14)),
      chargeOff: null,
    },
    status: "Account Closed",
    remarkCodes: ["XR"],
    payment: { scheduledMonthly: 0 },
    creditorName: "MAPLE FINANCIAL VISA",
    creditLimit: 5000,
    accountType: "REVOLVING / INDIVIDUAL",
    portfolioType: "R",
    paymentPattern: "30:3 60:1 90:0 #M:44",
    isCollectionAccount: false,
    lastPaymentDate: new Date(Date.UTC(2027, 0, 14)),
    reportDate: new Date(Date.UTC(2026, 0, 10)),
    ...overrides,
  };
}

describe("metro2 validation rules", () => {
  it("detects the synthetic balance and future payment assertions", () => {
    const invalidRules = validateTradeline(baseTradeline(), "2026")
      .filter((result) => !result.valid)
      .map((result) => result.ruleName);

    expect(invalidRules).toContain("BALANCE_EXCEEDS_CREDIT_LIMIT");
    expect(invalidRules).toContain("DATE_LAST_PAYMENT_AFTER_REPORT_DATE");
  });

  it("does not apply balance-over-limit to installment accounts", () => {
    const invalidRules = validateTradeline(
      baseTradeline({
        accountType: "INSTALLMENT / INDIVIDUAL",
        portfolioType: "I",
      }),
      "2026",
    )
      .filter((result) => !result.valid)
      .map((result) => result.ruleName);

    expect(invalidRules).not.toContain("BALANCE_EXCEEDS_CREDIT_LIMIT");
  });
});
