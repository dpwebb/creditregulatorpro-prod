import { afterEach, describe, expect, it, vi } from "vitest";

import { buildSpecificStatutoryGrounds } from "../../helpers/disputeLetterStatutoryGrounds";
import { letterHumanizer } from "../../helpers/letterHumanizer";
import { lintLetterContentForRegulatorSafety } from "../../helpers/letterSafetyLinter";
import type { LetterContent } from "../../helpers/pdfGenerator";

function baseLetter(overrides: Partial<LetterContent> = {}): LetterContent {
  return {
    consumerName: "Test Consumer",
    consumerAddress: ["123 Main St", "Toronto, ON M5V 1A1"],
    letterDate: "2026-05-10",
    recipientName: "Equifax Canada Co.",
    recipientAddress: ["Consumer Relations"],
    subject: "Dispute of inaccurate credit reporting",
    introduction: "I am writing to dispute information in my consumer report.",
    disputedItems: "The reported balance is wrong.",
    statutoryGrounds: "Statutory grounds relied on for this dispute:\n\n1. PIPEDA, Schedule 1, Principle 4.6.\n   Relevant statutory text or authority excerpt: \"Personal information shall be as accurate, complete, and up-to-date as is necessary for the purposes for which it is to be used.\"",
    requestedAction: "Please investigate this dispute and provide written confirmation.",
    certification: "I certify that the information provided in this letter is true and accurate to the best of my knowledge.",
    closing: "Sincerely,",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("dispute letter statutory grounds", () => {
  it("builds explicit statutory grounds with relevant authority text and application", () => {
    const grounds = buildSpecificStatutoryGrounds({
      province: "Ontario",
      violationCategory: "BALANCE_CALCULATION_VIOLATION",
      violationDetails: {
        violationCategory: "BALANCE_CALCULATION_VIOLATION",
        fieldName: "balance",
        detectedValue: "$250.00",
        expectedValue: "$100.00",
        technicalDetails: {
          balance: "$250.00",
          expectedBalance: "$100.00",
        },
      },
    });

    expect(grounds).toContain("Statutory grounds relied on for this dispute");
    expect(grounds).toContain("Ontario Consumer Reporting Act");
    expect(grounds).toContain("PIPEDA");
    expect(grounds).toContain("Schedule 1, Principle 4.6");
    expect(grounds).toContain("Relevant statutory text or authority excerpt");
    expect(grounds).toContain("Personal information shall be as accurate, complete, and up-to-date");
    expect(grounds).toContain("Application to this account");
    expect(grounds).toContain("Source:");
  });

  it("does not present private reporting standards as statutory grounds", () => {
    const grounds = buildSpecificStatutoryGrounds({
      province: "ON",
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      violationDetails: {
        violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
        fieldName: "dateClosed",
        technicalDetails: {
          regulationIds: ["METRO2_BASE_SEGMENT", "PIPEDA_4_6", "ON_CRA_ACCURACY"],
          ruleName: "BASE_SEGMENT_REQUIRED",
        },
      },
    });

    expect(grounds).toContain("PIPEDA");
    expect(grounds).toContain("Ontario Consumer Reporting Act");
    expect(grounds).not.toContain("Metro2 CRRG");
  });
});

describe("dispute letter wording cleanup", () => {
  it("preserves dispute wording and keeps requested action specifics idempotently", () => {
    const letter = baseLetter({
      requestedAction:
        "Please investigate this dispute and provide the original creditor documents. You have 30 days to complete this.",
    });

    const once = lintLetterContentForRegulatorSafety(letter);
    const twice = lintLetterContentForRegulatorSafety(once);

    expect(once.requestedAction).toContain("investigate this dispute");
    expect(once.requestedAction).toContain("original creditor documents");
    expect(once.requestedAction).toContain("source documentation");
    expect(once.requestedAction).toContain("written findings");
    expect(once.requestedAction).not.toContain("clarification request");
    expect(twice.requestedAction).toBe(once.requestedAction);
  });

  it("does not send statutory grounds to the AI rewrite path", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const statutoryGrounds =
      "Statutory grounds relied on for this dispute:\n\n1. PIPEDA, Schedule 1, Principle 4.6.\n   Relevant statutory text or authority excerpt: \"Personal information shall be as accurate, complete, and up-to-date as is necessary for the purposes for which it is to be used.\"";

    const humanized = await letterHumanizer(baseLetter({ statutoryGrounds }));

    expect(humanized.statutoryGrounds).toBe(statutoryGrounds);
  });
});
