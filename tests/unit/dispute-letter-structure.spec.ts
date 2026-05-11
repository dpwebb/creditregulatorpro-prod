import { describe, expect, it } from "vitest";

import { applyEvidentiaryDisputeStructure } from "../../helpers/disputeLetterStructure";
import type { LetterContent } from "../../helpers/pdfGenerator";

function baseLetter(): LetterContent {
  return {
    consumerName: "Test Consumer",
    consumerAddress: ["123 Main St", "Toronto, ON M5V 1A1"],
    consumerDOB: "1977-04-11",
    consumerPhone: "555-0100",
    consumerEmail: "test@example.com",
    consumerFileReference: {
      previousNames: ["Prior Consumer"],
      previousAddresses: ["456 Prior Ave, Ottawa, ON K1A 0B1"],
      creditReportReferenceNumber: "L121322",
      reportDate: "April 16, 2026",
      sinLastDigits: "123456789",
    },
    letterDate: "May 10, 2026",
    recipientName: "Equifax Canada Co.",
    recipientAddress: ["Consumer Relations"],
    subject: "Accuracy and completeness dispute",
    introduction: "The account information appears inaccurate.",
    accountIdentification: "Creditor/Furnisher: Sample Bank\nAccount Number: 123456789",
    disputedItems: "The reported balance is $250.00, but the final statement shows $100.00.",
    statutoryGrounds:
      "Statutory grounds relied on for this dispute:\n\n1. PIPEDA, Schedule 1, Principle 4.6. Relevant statutory text or authority excerpt: \"Personal information shall be as accurate, complete, and up-to-date as is necessary for the purposes for which it is to be used.\"",
    requestedAction: "Please correct the reported balance.",
    certification: "I certify this dispute is accurate to the best of my knowledge.",
    closing: "Sincerely,",
  };
}

describe("evidentiary dispute letter structure", () => {
  it("adds controlled dispute sections and masks SIN to last four digits", () => {
    const structured = applyEvidentiaryDisputeStructure(baseLetter(), {
      violationCategory: "BALANCE_CALCULATION_VIOLATION",
      violationDetails: {
        violationCategory: "BALANCE_CALCULATION_VIOLATION",
        fieldName: "balance",
        detectedValue: "$250.00",
        expectedValue: "$100.00",
      },
    });

    expect(structured.consumerFileReference?.sinLastDigits).toBe("6789");
    expect(structured.introduction).toContain("formal dispute and reinvestigation request");
    expect(structured.accountIdentification).toContain("Exact Field(s) Disputed: Balance");
    expect(structured.accountIdentification).toContain("Reported Field Value: $250.00");
    expect(structured.accountIdentification).toContain("Expected / Source-Supported Value: $100.00");
    expect(structured.accountIdentification).toContain("Date of Report Being Disputed: April 16, 2026");
    expect(structured.disputedItems).toContain("Disputed field/value: Balance = $250.00");
    expect(structured.disputedItems).toContain("Specific issue: Balance is reported as $250.00; expected/source-supported value is $100.00.");
    expect(structured.disputedItems).toContain("Exact disputed fields: Balance");
    expect(structured.disputedItems).toContain("Factual basis:");
    expect(structured.applicationToAccount).toContain("reported as $250.00");
    expect(structured.applicationToAccount).toContain("itemized source records");
    expect(structured.supportingDocumentation).toContain("Supporting evidence and attachments");
    expect(structured.supportingDocumentation).toContain("Final creditor statement");
    expect(structured.requestedAction).toContain("Delete or suppress");
    expect(structured.requestedAction).toContain("Field-specific remedy");
    expect(structured.statutoryTimeframe).toContain("results of your reinvestigation in writing");
    expect(structured.deliveryConfirmation).toContain("Delivery and audit record");
  });

  it("builds SOL-style particulars, application, and evidence from tradeline chronology", () => {
    const structured = applyEvidentiaryDisputeStructure(baseLetter(), {
      violationCategory: "STATUTE_OF_LIMITATIONS",
      violationDetails: {
        violationCategory: "STATUTE_OF_LIMITATIONS",
        fieldName: "dateOfLastPayment",
        detectedValue: "2012-08-20",
        expectedValue: "outside reportable retention period",
      },
      tradelineDetails: {
        openedDate: new Date("2011-11-02T00:00:00.000Z"),
        dateOfLastPayment: new Date("2012-08-20T00:00:00.000Z"),
        lastActivityDate: new Date("2012-08-20T00:00:00.000Z"),
        dateOfFirstDelinquency: new Date("2012-09-20T00:00:00.000Z"),
      },
    });

    expect(structured.accountIdentification).toContain("date of last payment");
    expect(structured.disputedItems).toContain("opened on 2011-11-02");
    expect(structured.disputedItems).toContain("last payment reported as 2012-08-20");
    expect(structured.disputedItems).toContain("continued reporting of this tradeline");
    expect(structured.applicationToAccount).toContain("date of last payment");
    expect(structured.applicationToAccount).toContain("deletion or suppression of the tradeline");
    expect(structured.supportingDocumentation).toContain("date of last payment");
    expect(structured.supportingDocumentation).toContain("source chronology");
  });
});
