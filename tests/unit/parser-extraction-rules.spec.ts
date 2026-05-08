import { describe, expect, it } from "vitest";

import {
  applyParserExtractionRules,
  MISSING_TRADELINE_FIELD_RULE,
  SOURCE_LABEL_TO_TRADELINE_FIELD_RULE,
} from "../../helpers/parserExtractionRules";

function makeParseResult(tradelines: any[]) {
  return {
    consumerInfo: null,
    reportMetadata: null,
    sourceBureau: { bureauName: "TransUnion Canada" },
    rawText: "",
    tradelines,
    inquiries: [],
    publicRecords: [],
    employmentInfo: [],
    creditScores: [],
    consumerStatements: [],
    paymentHistories: [],
  } as any;
}

describe("applyParserExtractionRules", () => {
  it("normalizes missing tradeline account numbers without overwriting reported values", () => {
    const parseResult = makeParseResult([
      {
        creditorName: "BANK OF NOVA SCOTIA",
        accountNumber: "Unknown",
        dates: {},
        amounts: {},
        remarkCodes: [],
      },
      {
        creditorName: "CAPITAL ONE BANK",
        accountNumber: "****3583",
        dates: {},
        amounts: {},
        remarkCodes: [],
      },
    ]);

    const applied = applyParserExtractionRules(parseResult, [
      {
        id: 7,
        bureau: "TransUnion Canada",
        ruleType: MISSING_TRADELINE_FIELD_RULE,
        fieldPath: "tradelines[].accountNumber",
        targetField: "accountNumber",
        config: {
          replacementValue: "Not Provided by Bureau",
          missingValues: ["Unknown", "Not Reported", "Not Provided"],
        },
        isActive: true,
        priority: 100,
      },
    ]);

    expect(applied.appliedRuleIds).toEqual([7]);
    expect(applied.parseResult.tradelines[0].accountNumber).toBe("Not Provided by Bureau");
    expect(applied.parseResult.tradelines[1].accountNumber).toBe("****3583");
  });

  it("still maps labeled source text into tradeline fields", () => {
    const parseResult = makeParseResult([
      {
        creditorName: "BANK OF NOVA SCOTIA",
        accountNumber: "Unknown",
        sourceText: "Creditor Name BANK OF NOVA SCOTIA\nLegend: AC-Account closed/rating non derogatory",
        dates: {},
        amounts: {},
        remarkCodes: [],
      },
    ]);

    const applied = applyParserExtractionRules(parseResult, [
      {
        id: 8,
        bureau: "TransUnion Canada",
        ruleType: SOURCE_LABEL_TO_TRADELINE_FIELD_RULE,
        fieldPath: "tradelines[].remarkCodes",
        targetField: "remarkCodes",
        config: {
          sourceLabel: "Legend",
          valueType: "stringArray",
          overwriteExisting: true,
        },
        isActive: true,
        priority: 100,
      },
    ]);

    expect(applied.appliedRuleIds).toEqual([8]);
    expect(applied.parseResult.tradelines[0].remarkCodes).toEqual([
      "AC-Account closed/rating non derogatory",
    ]);
  });

  it("sanitizes creditor labels promoted by dynamic extraction rules", () => {
    const parseResult = makeParseResult([
      {
        creditorName: "Unknown",
        accountNumber: "Not Provided by Bureau",
        sourceText: "Creditor Name NameMAPLE FINANCIAL VISAPayment History\nAccount Number Not Provided by Bureau",
        dates: {},
        amounts: {},
        remarkCodes: [],
      },
    ]);

    const applied = applyParserExtractionRules(parseResult, [
      {
        id: 9,
        bureau: "TransUnion Canada",
        ruleType: SOURCE_LABEL_TO_TRADELINE_FIELD_RULE,
        fieldPath: "tradelines[].creditorName",
        targetField: "creditorName",
        config: {
          sourceLabel: "Creditor Name",
          overwriteExisting: true,
        },
        isActive: true,
        priority: 100,
      },
    ]);

    expect(applied.appliedRuleIds).toEqual([9]);
    expect(applied.parseResult.tradelines[0].creditorName).toBe("MAPLE FINANCIAL VISA");
  });
});
