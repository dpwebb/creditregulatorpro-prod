import { describe, expect, it } from "vitest";
import { extractCreditorName } from "../../helpers/tradelineBasicInfoExtractors";

describe("tradeline basic info extraction", () => {
  it("does not include concatenated TransUnion section labels in creditor names", () => {
    expect(
      extractCreditorName(`
Creditor Name
BANK OF NOVA SCOTIAPayment History
30
0
60
0
Reported DateOct 31, 2013
StatusAccount Closed
`)
    ).toBe("BANK OF NOVA SCOTIA");
  });
});
