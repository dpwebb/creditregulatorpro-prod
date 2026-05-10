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
      },
    });

    expect(structured.consumerFileReference?.sinLastDigits).toBe("6789");
    expect(structured.introduction).toContain("formal dispute and reinvestigation request");
    expect(structured.accountIdentification).toContain("Exact Field(s) Disputed: Balance");
    expect(structured.accountIdentification).toContain("Date of Report Being Disputed: April 16, 2026");
    expect(structured.disputedItems).toContain("Factual basis:");
    expect(structured.supportingDocumentation).toContain("Supporting evidence and attachments index");
    expect(structured.requestedAction).toContain("Delete or suppress");
    expect(structured.statutoryTimeframe).toContain("results of your reinvestigation in writing");
    expect(structured.deliveryConfirmation).toContain("Delivery and audit record");
  });
});
