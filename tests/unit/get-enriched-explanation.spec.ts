import { describe, expect, it } from "vitest";

import {
  getEnrichedExplanation,
  getEnrichedRecommendedAction,
  simplifyForUser,
} from "../../helpers/getEnrichedExplanation";

describe("enriched violation explanation copy", () => {
  it("removes internal review details from user-facing text", () => {
    const text = simplifyForUser(
      'This collection account doesn\'t say when it was sent to collections. That date is required. Review basis: tradeline 515; field "date Assigned To Collection"; reference ids METRO2_BASE_SEGMENT, PIPEDA_4_6.',
    );

    expect(text).toBe("This collection account doesn't say when it was sent to collections. That date is required.");
    expect(text).not.toContain("Review basis");
    expect(text).not.toContain("reference ids");
    expect(text).not.toContain("METRO2");
    expect(text).not.toContain("PIPEDA");
  });

  it("explains missing collection dates at an eighth-grade reading level", () => {
    const explanation = getEnrichedExplanation({
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      userExplanation:
        'This collection account does not say when it was sent to collections. Review basis: tradeline 515; field "date Assigned To Collection"; reference ids METRO2_BASE_SEGMENT.',
      technicalDetails: {
        fieldName: "dateAssignedToCollection",
        responsibleEntity: "CREDITOR",
      },
    });

    expect(explanation).toBe(
      "This collection account is missing the date it was sent to collections. That date helps show whether the account is being reported correctly.",
    );
  });

  it("keeps recommended actions plain", () => {
    expect(
      getEnrichedRecommendedAction({
        responsibleEntity: "COLLECTOR",
        recommendedAction: "Challenge the collection agency by demanding debt validation.",
      }),
    ).toBe(
      "Send a letter asking the collection agency to prove the debt and fix any missing or wrong information.",
    );
  });
});
