import { describe, expect, it } from "vitest";

import {
  evaluateDocumentRulePack,
  extractDocumentRulePackFacts,
} from "../../helpers/documentRulePacks";

function factMap(result: ReturnType<typeof extractDocumentRulePackFacts>[number]) {
  return Object.fromEntries(result.facts.map((fact) => [fact.fieldKey, fact]));
}

describe("deterministic document rule packs", () => {
  it("extracts creditor statement facts into an isolated non-canonical rule-pack result", () => {
    const [statement] = extractDocumentRulePackFacts(`
Account Statement
Creditor: MAPLE CARD SERVICES
Account: ending in 1111
Statement Date: 2026-04-16
Payment Due Date: 2026-05-10
Amount Due: $187.65
Minimum Payment Due: $35.00
`);
    const facts = factMap(statement);

    expect(statement).toMatchObject({
      version: "document-rule-packs-v1",
      documentType: "creditor_statement",
      rulePackId: "creditor-statement-v1",
      matched: true,
    });
    expect(statement.matchedIndicators).toEqual(
      expect.arrayContaining(["account_statement", "amount_due", "minimum_payment", "payment_due_date", "statement_date"]),
    );
    expect(facts["creditorStatements[0].creditorName"]).toMatchObject({
      value: "MAPLE CARD SERVICES",
      normalizedValue: "MAPLE CARD SERVICES",
      canonicalEligible: false,
      evidence: {
        sourceMethod: "deterministic_document_rule_pack",
        rulePackId: "creditor-statement-v1",
        ruleId: "creditor-statement-creditor-name-v1",
        pageNumber: 1,
      },
    });
    expect(facts["creditorStatements[0].statementDate"].normalizedValue).toBe("2026-04-16");
    expect(facts["creditorStatements[0].paymentDueDate"].normalizedValue).toBe("2026-05-10");
    expect(facts["creditorStatements[0].amountDue"].normalizedValue).toBe(187.65);
    expect(facts["creditorStatements[0].minimumPaymentDue"].normalizedValue).toBe(35);
    expect(facts["creditorStatements[0].accountReferenceMasked"].normalizedValue).toBe("ending in 1111");
    expect(statement.facts.every((fact) => fact.factId.startsWith("docfact-"))).toBe(true);
    expect(statement.facts.every((fact) => fact.canonicalEligible === false)).toBe(true);
  });

  it("extracts collection letter facts separately from creditor statement facts", () => {
    const [letter] = extractDocumentRulePackFacts(`
Collection Notice
Debt Collector: ATLANTIC RECOVERY SERVICES INC
Original Creditor: NORTHERN PHONE CO
Notice Date: Apr 17, 2026
Amount Owing: $500.00
Reference: 1234567890124455
`);
    const facts = factMap(letter);

    expect(letter).toMatchObject({
      version: "document-rule-packs-v1",
      documentType: "collection_letter",
      rulePackId: "collection-letter-v1",
      matched: true,
    });
    expect(letter.matchedIndicators).toEqual(
      expect.arrayContaining(["amount_owing", "collection_notice", "debt_collector", "original_creditor"]),
    );
    expect(facts["collectionLetters[0].collectionAgencyName"].normalizedValue).toBe(
      "ATLANTIC RECOVERY SERVICES INC",
    );
    expect(facts["collectionLetters[0].originalCreditorName"].normalizedValue).toBe("NORTHERN PHONE CO");
    expect(facts["collectionLetters[0].noticeDate"].normalizedValue).toBe("2026-04-17");
    expect(facts["collectionLetters[0].amountOwing"].normalizedValue).toBe(500);
    expect(facts["collectionLetters[0].accountReferenceMasked"].normalizedValue).toBe("ending in 4455");
    expect(facts["collectionLetters[0].accountReferenceMasked"].evidence.textSnippet).toContain("********4455");
    expect(facts["collectionLetters[0].accountReferenceMasked"].evidence.textSnippet).not.toContain(
      "1234567890124455",
    );
    expect(letter.facts.some((fact) => fact.fieldKey.startsWith("creditorStatements"))).toBe(false);
  });

  it("fails closed when document-type indicators are insufficient", () => {
    const statement = evaluateDocumentRulePack(
      `
Statement Date: 2026-04-16
Thank you for your business.
`,
      "creditor_statement",
    );
    const letter = evaluateDocumentRulePack(
      `
Original Creditor: NORTHERN PHONE CO
Please contact our office.
`,
      "collection_letter",
    );

    expect(statement.matched).toBe(false);
    expect(statement.facts).toEqual([]);
    expect(statement.diagnostics[0]).toContain("Requires at least 2 deterministic document-type indicators");
    expect(letter.matched).toBe(false);
    expect(letter.facts).toEqual([]);
  });

  it("does not apply statement or letter rule packs to bureau credit report text", () => {
    const results = extractDocumentRulePackFacts(`
TransUnion Canada Consumer Disclosure
Credit Report
Personal Information
Name TEST CONSUMER
Account Information
Creditor Name MAPLE FINANCIAL VISA
Collection Accounts
Amount Due $123.45
`);

    expect(results).toEqual([]);
    expect(
      evaluateDocumentRulePack(
        `
Equifax Canada Credit Report
Personal Information
Name TEST CONSUMER
Account Information
Collection Agency: SAMPLE COLLECTIONS
Original Creditor: SAMPLE BANK
Amount Owing: $200.00
`,
        "collection_letter",
      ),
    ).toMatchObject({
      matched: false,
      facts: [],
      diagnostics: ["Document rule packs are isolated from bureau credit-report parser inputs."],
    });
  });
});
