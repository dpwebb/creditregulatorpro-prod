import { extractBalance } from "./tradelineAmountExtractors";
import {
  extractLatestTransUnionPaymentGridBalance,
  extractTransUnionPaymentGridRows,
  extractTransUnionPaymentSummary,
} from "./transunionTextParsing";
import { extractPaymentPattern } from "./tradelineOtherExtractors";

describe("transunion payment-grid extraction", () => {
  const sampleTradeline = `
Creditor Name CAPITAL ONE BANK
Reported Date Dec 16, 2025 Last Payment Date Oct 27, 2023 Terms: 0/M
Opened Date Apr 25, 2023 Posted Date Dec 18, 2025 Account Type: REVOLVING / INDIVIDUAL
Closed Date Jun 17, 2024 Charge Off Date Jan 10, 2024
First Delinquency Date Dec 16, 2023
Date Balance Payment Past Due MOP Terms High Credit Credit Limit Balloon Payment Charge Off Narrative
Jul 2024 248 248 9 0 358 300 0 0 WO / CG
Jun 2024 247 0 0 X 358 300 0 0 WO / CG
May 2024 242 50 50 5 11 358 300 0 0
Apr 2024 179 50 40 5 10 358 300 0 0
Mar 2024 176 50 30 4 10 358 300 0 0
Legend: CG-Account cancelled by credit grantor
`;

  it("uses latest payment-grid row as authoritative balance", () => {
    const rows = extractTransUnionPaymentGridRows(sampleTradeline);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].dateLabel).toBe("Jul 2024");
    expect(rows[0].balance).toBe(248);
    expect(rows[0].mop).toBe("0");
    expect(rows[0].highCredit).toBe(358);
    expect(rows[0].creditLimit).toBe(300);
    expect(rows[1].mop).toBe("X");
    expect(rows[1].highCredit).toBe(358);
    expect(extractLatestTransUnionPaymentGridBalance(sampleTradeline)).toBe(248);
    expect(extractBalance(sampleTradeline)).toBe(248);
  });

  it("does not read balances from outside the payment grid window", () => {
    const noisyTradeline = `
${sampleTradeline}
Account(s): unrelated section
Date Opened Jan 01, 2019
Balance 19
`;
    expect(extractLatestTransUnionPaymentGridBalance(noisyTradeline)).toBe(248);
  });

  it("keeps compact TransUnion rows aligned to visible payment-grid columns", () => {
    const bankOfNovaScotia = `
Creditor Name
BANK OF NOVA SCOTIA
DateBalancePaymentPast DueMOPTermsHigh CreditCredit Limit
Balloon
Payment
Charge Off
Narrative
1 / 2
Oct 20130015223132000AC /
Legend:AC-Account closed/rating non derogatory
`;

    const rows = extractTransUnionPaymentGridRows(bankOfNovaScotia);
    expect(rows[0]).toMatchObject({
      balance: 0,
      payment: 0,
      pastDue: 1,
      terms: "522",
      highCredit: 31320,
      creditLimit: null,
      balloonPayment: 0,
      chargeOff: 0,
    });
  });
});

describe("payment pattern summary parsing", () => {
  it("parses TransUnion 30/60/90/#M summary table style", () => {
    const text = `
Payment History
30 60 90 #M
1 1 21 32
`;
    expect(extractPaymentPattern(text)).toBe("30d:1 60d:1 90d:21 months:32");
    expect(extractTransUnionPaymentSummary(text)).toEqual({
      "30": 1,
      "60": 1,
      "90": 21,
      "#M": 32,
    });
  });
});
