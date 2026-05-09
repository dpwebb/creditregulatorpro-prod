import { describe, expect, it } from "vitest";

import { getAISupportSystemPrompt } from "../../helpers/aiSupportContext";
import { ViolationCategoryArrayValues } from "../../helpers/schema";

describe("AI support context terminology", () => {
  it("uses compliance finding as the umbrella term and keeps confirmed legal violation narrow", () => {
    const prompt = getAISupportSystemPrompt();

    expect(prompt).toContain("Compliance findings:");
    expect(prompt).toContain(
      `The system checks for ${ViolationCategoryArrayValues.length} specific compliance finding categories.`,
    );
    expect(prompt).toContain("It is not always a confirmed legal violation.");
    expect(prompt).toContain(
      'Use "confirmed legal violation" only when the authority label explicitly says that.',
    );
    expect(prompt).not.toContain("The system checks for 45 specific violation categories.");
  });
});
