import { describe, expect, it } from "vitest";

import {
  getEnrichedExplanation,
  getEnrichedRecommendedAction,
  simplifyForUser,
} from "../../helpers/getEnrichedExplanation";

describe("enriched violation explanation copy", () => {
  it("removes internal review details from user-facing text", () => {
    const text = simplifyForUser(
      'This collection account doesn\'t say when it was sent to collections. Review whether the company can verify the collection turnover date. Review basis: tradeline 515; field "date Assigned To Collection"; reference ids PIPEDA_4_6.',
    );

    expect(text).toBe("This collection account doesn't say when it was sent to collections. Review whether the company can verify the collection turnover date.");
    expect(text).not.toContain("Review basis");
    expect(text).not.toContain("reference ids");
    expect(text).not.toContain("METRO2");
    expect(text).not.toContain("PIPEDA");
    expect(text).not.toContain("required");
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
      "This collection account does not show the date it was sent to collections. That date can help verify whether the collection reporting is accurate.",
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

  it("uses direct wording for deterministic expired reporting findings", () => {
    const explanation = getEnrichedExplanation({
      violationCategory: "STATUTE_OF_LIMITATIONS",
      technicalDetails: {
        province: "NS",
        referenceDate: "2019-01-01T00:00:00.000Z",
        reportingLimitDate: "2025-01-01T00:00:00.000Z",
        isPastLimit: true,
      },
    });

    expect(explanation).toBe(
      "This account is reported beyond Nova Scotia's allowed reporting period. Reporting limit date: 2025-01-01. Date used for the check: 2019-01-01.",
    );
    expect(explanation).not.toMatch(/\b(may|might|appears to|could|suggest)\b/i);
    expect(explanation).not.toContain("NS");
  });

  it("uses current-date framing for upcoming reporting limits", () => {
    const explanation = getEnrichedExplanation({
      violationCategory: "STATUTE_APPROACHING",
      technicalDetails: {
        province: "BC",
        reportingLimitDate: "2026-08-27T00:00:00.000Z",
        daysRemaining: 92,
        monthsRemaining: 3,
        isPastLimit: false,
      },
    });

    expect(explanation).toBe(
      "This account reaches British Columbia's reporting limit on 2026-08-27. Time remaining from today: 4 months.",
    );
    expect(explanation).not.toMatch(/\b(Expiring soon|is expected to|may|might|appears to|could|suggest)\b/i);
  });
});
