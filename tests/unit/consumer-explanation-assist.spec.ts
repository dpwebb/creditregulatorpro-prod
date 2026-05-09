import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildConsumerExplanationAssistInput,
  buildDeterministicConsumerFindingExplanation,
  validateAiConsumerFindingExplanation,
} from "../../helpers/consumerExplanationAssist";

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("consumer explanation AI assist guardrails", () => {
  it("keeps the deterministic fallback clear for duplicate collection reporting", () => {
    const explanation = buildDeterministicConsumerFindingExplanation({
      violationCategory: "COLLECTOR_DUPLICATE_REPORTING",
      technicalDetails: {
        otherAgencyName: "NCRI CAPITAL ASSET INC",
        sameAccountNumber: true,
        accountNumber: "***1234",
      },
      userExplanation: "Duplicate collection detected.",
      recommendedAction: "Ask the collection agency to prove the debt.",
    });

    expect(explanation.summary).toContain("same debt");
    expect(explanation.summary).toContain("NCRI CAPITAL ASSET INC");
    expect(explanation.whyItMatters).toContain("same debt");
    expect(explanation.nextStep).toContain("collection agency");
  });

  it("rejects AI wording that states legal conclusions or guarantees", () => {
    expect(() =>
      validateAiConsumerFindingExplanation({
        summary: "This is definitely illegal and you will win.",
        whyItMatters: "The agency made a confirmed legal violation.",
        nextStep: "You must sue them immediately.",
      }),
    ).toThrow("ai_consumer_explanation_unsafe_claim");
  });

  it("rejects AI wording that invents money or date facts", () => {
    const allowedFacts = JSON.stringify({
      deterministicExplanation: {
        summary: "This account has a balance of $248 and was opened 2023/04/25.",
      },
    });

    expect(() =>
      validateAiConsumerFindingExplanation(
        {
          summary: "This account has a balance of $999.",
          whyItMatters: "The date 2024/01/01 is important.",
          nextStep: "Ask them to fix it.",
        },
        allowedFacts,
      ),
    ).toThrow("ai_consumer_explanation_new_fact");
  });

  it("minimizes account identifiers before building an AI prompt", () => {
    const input = buildConsumerExplanationAssistInput(
      {
        violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
        technicalDetails: { missingField: "originalCreditorName" },
      },
      {
        creditorName: "NATIONAL LEGAL GROUP",
        bureauName: "Equifax",
        accountNumber: "1234567890",
      },
    );

    const serialized = JSON.stringify(input);
    expect(serialized).toContain("ending in 7890");
    expect(serialized).not.toContain("1234567890");
  });

  it("keeps the endpoint authenticated and scoped to the finding owner", () => {
    const endpoint = source("endpoints/ai-assist/consumer-finding-explanation_POST.ts");

    expect(endpoint).toContain("getServerUserSession");
    expect(endpoint).toContain("tradeline.userId as tradelineUserId");
    expect(endpoint).toContain("row.tradelineUserId !== user.id");
  });
});
