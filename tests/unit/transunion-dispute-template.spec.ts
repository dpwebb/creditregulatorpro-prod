import { describe, expect, it, vi } from "vitest";

vi.mock("../../helpers/letterTemplateQueries", () => ({
  applyTemplateOverrides: async (content: unknown) => content,
}));

import { buildTransUnionDispute } from "../../helpers/transunionDisputeTemplate";

describe("TransUnion dispute template", () => {
  it("includes the TransUnion Case ID as bureau correspondence support", async () => {
    const letter = await buildTransUnionDispute({
      consumerName: "TEST CONSUMER",
      consumerAddress: ["123 MAIN ST", "HALIFAX NS B3J 1A1"],
      creditorName: "BANK OF NOVA SCOTIA",
      accountNumber: "123456789",
      transunionCaseId: "L121322",
      disputeReasonCode: "ACCOUNT_NOT_MINE",
    });

    expect(letter.supportingDocumentation).toContain("Supporting evidence and attachments");
    expect(letter.supportingDocumentation).toContain("TransUnion Case ID: L121322");
    expect(letter.accountIdentification).toContain("Exact Field(s) Disputed");
    expect(letter.applicationToAccount).toContain("tradeline");
    expect(letter.requestedAction).toContain("Requested correction by disputed field");
    expect(letter.closing).toBe("Sincerely,");
  });

  it("includes specific statutory text for mapped dispute violations", async () => {
    const letter = await buildTransUnionDispute(
      {
        consumerName: "TEST CONSUMER",
        consumerAddress: ["123 MAIN ST", "TORONTO ON M5V 1A1"],
        creditorName: "BANK OF NOVA SCOTIA",
        accountNumber: "123456789",
        disputeReasonCode: "INCORRECT_BALANCE",
        violationCategory: "BALANCE_CALCULATION_VIOLATION",
        violationDetails: {
          violationCategory: "BALANCE_CALCULATION_VIOLATION",
          fieldName: "balance",
          detectedValue: "$250.00",
          expectedValue: "$100.00",
          technicalDetails: {
            balance: "$250.00",
            expectedBalance: "$100.00",
          },
        },
      },
      "Ontario"
    );

    expect(letter.statutoryGrounds).toContain("Ontario Consumer Reporting Act");
    expect(letter.statutoryGrounds).toContain("PIPEDA");
    expect(letter.statutoryGrounds).toContain("Relevant statutory text or authority excerpt");
    expect(letter.statutoryGrounds).toContain("Personal information shall be as accurate, complete, and up-to-date");
  });
});
