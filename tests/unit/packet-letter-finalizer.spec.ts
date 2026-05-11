import { afterEach, describe, expect, it, vi } from "vitest";

import { finalizePacketLetterContent } from "../../helpers/packetLetterFinalizer";
import type { LetterContent } from "../../helpers/pdfGenerator";

function basePacketLetter(): LetterContent {
  return {
    consumerName: "Test Consumer",
    consumerAddress: ["123 Main St", "Toronto, ON M5V 1A1"],
    consumerDOB: "1977-04-11",
    consumerPhone: "555-0100",
    consumerEmail: "test@example.com",
    consumerFileReference: {
      creditReportReferenceNumber: "L121322",
      reportDate: "April 16, 2026",
    },
    letterDate: "May 10, 2026",
    recipientName: "Equifax Canada Co.",
    recipientAddress: ["Consumer Relations"],
    subject: "Formal Dispute and Reinvestigation Request",
    introduction: "Please review this account.",
    accountIdentification: "Creditor/Furnisher: Sample Bank\nAccount Number: 123456789",
    disputedItems: "The reported balance is wrong.",
    statutoryGrounds:
      "Statutory grounds relied on for this dispute:\n\n1. PIPEDA, Schedule 1, Principle 4.6. Relevant statutory text or authority excerpt: \"Personal information shall be as accurate, complete, and up-to-date as is necessary for the purposes for which it is to be used.\"",
    requestedAction: "Please correct the reported balance.",
    certification:
      "I certify that I am submitting this dispute in good faith and that the information provided is accurate to the best of my knowledge.",
    closing: "Sincerely,",
  };
}

describe("packet letter finalizer", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("re-applies evidentiary layout after humanization", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    const finalized = await finalizePacketLetterContent(basePacketLetter(), {
      violationCategory: "BALANCE_CALCULATION_VIOLATION",
      violationDetails: {
        violationCategory: "BALANCE_CALCULATION_VIOLATION",
        fieldName: "balance",
        detectedValue: "$250.00",
        expectedValue: "$100.00",
      },
      consumerFileReference: {
        creditReportReferenceNumber: "L121322",
        reportDate: "April 16, 2026",
      },
    });

    expect(finalized.accountIdentification).toContain("Exact Field(s) Disputed: Balance");
    expect(finalized.disputedItems).toContain("Disputed field/value: Balance = $250.00");
    expect(finalized.disputedItems).toContain("Exact disputed fields: Balance");
    expect(finalized.applicationToAccount).toContain("itemized source records");
    expect(finalized.supportingDocumentation).toContain("Supporting evidence and attachments");
    expect(finalized.supportingDocumentation).toContain("Final creditor statement");
    expect(finalized.requestedAction).toContain("Field-specific remedy");
  });
});
