import { describe, expect, it } from "vitest";
import { extractCreditorName } from "../../helpers/tradelineBasicInfoExtractors";
import { parseAccount } from "../../helpers/transunionAccountParser";

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

  it("removes split TransUnion Name labels and trailing payment-history labels", () => {
    expect(
      extractCreditorName(`
NameMAPLE FINANCIAL VISAPayment History
30
0
60
0
Reported DateMay 01, 2026
Balance341
`)
    ).toBe("MAPLE FINANCIAL VISA");
  });

  it("sanitizes TransUnion HTML account cells before displaying creditor names", () => {
    const account = parseAccount(`
      <table>
        <tr><td>Creditor Name</td></tr>
        <tr><td>NameMAPLE FINANCIAL VISAPayment History</td></tr>
        <tr><td>Balance</td><td>341</td></tr>
        <tr><td>Status</td><td>Open</td></tr>
      </table>
    `);

    expect(account.creditorName).toBe("MAPLE FINANCIAL VISA");
  });
});
