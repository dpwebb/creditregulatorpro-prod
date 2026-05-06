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

    expect(letter.supportingDocumentation).toBe("TransUnion Case ID: L121322");
  });
});
