import { describe, expect, it, vi } from "vitest";

const executeTakeFirst = vi.fn(async () => ({
  reportDate: new Date("2026-01-10T00:00:00.000Z"),
}));

vi.mock("../../helpers/db", () => ({
  db: {
    selectFrom: vi.fn(() => ({
      select: vi.fn(() => ({
        where: vi.fn(() => ({
          executeTakeFirst,
        })),
      })),
    })),
  },
}));

import { detectMetro2RulesetViolations } from "../../helpers/complianceDetectorMetro2Ruleset";

describe("detectMetro2RulesetViolations", () => {
  it("formats DB date-only values without local timezone drift", async () => {
    const violations = await detectMetro2RulesetViolations(
      {
        id: 523,
        reportArtifactId: 275,
        creditorId: null,
        accountNumber: "Not Provided by Bureau",
        accountType: "REVOLVING",
        paymentPattern: null,
        status: "Unknown",
        openedDate: new Date("2021-04-13T00:00:00.000Z"),
        lastReportedDate: new Date("2025-12-16T00:00:00.000Z"),
        currentBalance: "6120.00",
        balance: "6120.00",
        amountPastDue: "730.00",
        creditLimit: "5000.00",
        dateOfFirstDelinquency: new Date("2025-09-14T00:00:00.000Z"),
        dateClosed: null,
        dateOfLastPayment: new Date("2027-01-14T00:00:00.000Z"),
        highCredit: "6120.00",
        scheduledMonthlyPayment: null,
        ecoaCode: null,
        hasJ1Segment: false,
        hasJ2Segment: false,
        isCollectionAccount: false,
      } as any,
      "2026",
    );

    const dateViolation = violations.find(
      (violation) =>
        violation.technicalDetails?.ruleName === "DATE_LAST_PAYMENT_AFTER_REPORT_DATE",
    );

    expect(dateViolation?.technicalDetails?.expectedValue).toBe("<= 2026-01-10");
    expect(dateViolation?.technicalDetails?.actualValue).toBe("2027-01-14");

    const balanceViolation = violations.find(
      (violation) =>
        violation.technicalDetails?.ruleName === "BALANCE_EXCEEDS_CREDIT_LIMIT",
    );

    expect(balanceViolation?.technicalDetails?.fieldName).toBe("currentBalance");
  });
});
