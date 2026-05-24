import { describe, expect, it } from "vitest";

import {
  PLAIN_DISPUTE_LETTER_REASONS,
  plainDisputeLetterReasonFor,
} from "../../helpers/disputeLetterReason";
import {
  buildConsumerDisputePacketLetterText,
  buildSimpleDisputePacketContent,
} from "../../helpers/disputePacketTemplate";

const forbiddenLegalBriefLanguage =
  /\b(?:PIPEDA|FCRA|statute|statutory|section\s+\d|subsection|illegal|time-barred|lawsuit|sue|damages|legal action|violation of law)\b/i;

describe("plain dispute letter reason mapping", () => {
  it("maps exceeded reporting period issues to plain language", () => {
    expect(plainDisputeLetterReasonFor({
      issueType: "STATUTE_OF_LIMITATIONS_REPORTING",
      disputedField: "Date last reported",
    })).toBe(PLAIN_DISPUTE_LETTER_REASONS.EXCEEDED_REPORTING_PERIOD);
  });

  it("maps incorrect balance issues to plain language", () => {
    expect(plainDisputeLetterReasonFor({
      issueType: "BALANCE_CALCULATION_VIOLATION",
      requestedAction: "correct balance",
      disputedField: "balance",
    })).toBe(PLAIN_DISPUTE_LETTER_REASONS.INCORRECT_BALANCE);
  });

  it("maps duplicate account issues to plain language", () => {
    expect(plainDisputeLetterReasonFor({
      issueType: "DUPLICATE_TRADELINE",
      disputedField: "account",
    })).toBe(PLAIN_DISPUTE_LETTER_REASONS.DUPLICATE_ACCOUNT);
  });

  it("falls back for unknown issue types", () => {
    expect(plainDisputeLetterReasonFor({
      issueType: "SYNTHETIC_UNKNOWN_FINDING",
      disputedField: "account information",
    })).toBe(PLAIN_DISPUTE_LETTER_REASONS.FALLBACK);
  });

  it("keeps default reason text free of citations and legal-threat wording", () => {
    for (const reason of Object.values(PLAIN_DISPUTE_LETTER_REASONS)) {
      expect(reason).not.toMatch(forbiddenLegalBriefLanguage);
    }
  });

  it("keeps statute-style issue codes out of the external bureau letter", () => {
    const packet = buildSimpleDisputePacketContent({
      packetType: "credit_bureau",
      reportType: "Synthetic credit report",
      reportDate: "2026-01-10",
      dateGenerated: "2026-05-24",
      recipient: {
        type: "credit_bureau",
        name: "TransUnion Canada",
        address: ["Consumer Relations"],
      },
      consumer: {
        name: "TEST CONSUMER",
        address: ["123 Test Street", "Halifax, NS B3H 0A1"],
      },
      disputedItems: [
        {
          creditorCollectorName: "Telecom Provider",
          accountNumber: null,
          disputedField: "Date last reported",
          reportedValue: "2012-08-21",
          expectedValue: "Not known",
          issueType: "STATUTE_OF_LIMITATIONS_REPORTING",
          explanation: "PIPEDA_4_5 legal action statute section 9",
          evidenceReference: "Synthetic credit report page 1",
        },
      ],
    });
    const letter = buildConsumerDisputePacketLetterText(packet);

    expect(letter).toContain(PLAIN_DISPUTE_LETTER_REASONS.EXCEEDED_REPORTING_PERIOD);
    expect(letter).not.toMatch(forbiddenLegalBriefLanguage);
    expect(letter).not.toMatch(/PIPEDA_4_5|STATUTE_OF_LIMITATIONS_REPORTING/i);
  });
});
