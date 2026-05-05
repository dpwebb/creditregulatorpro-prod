import { describe, expect, it } from "vitest";
import {
  getFederalRegulationsForViolation,
  getRegulationsForViolation,
} from "../../helpers/violationRegulationMap";

describe("violation regulation mapping", () => {
  it("separates federal/universal references from provincial references", () => {
    const violation = {
      violationCategory: "STATUTE_OF_LIMITATIONS",
      technicalDetails: {
        province: "ON",
        referenceDate: "2013-01-01",
        reportingLimitDate: "2020-01-01",
        retentionYears: 7,
      },
    };

    const federal = getFederalRegulationsForViolation(violation);
    const provincial = getRegulationsForViolation(violation);

    expect(federal.some((ref) => ref.statute.startsWith("PIPEDA"))).toBe(true);
    expect(provincial.every((ref) => !ref.statute.startsWith("PIPEDA") && ref.statute !== "Metro2 CRRG")).toBe(true);
  });

  it("adds field-specific language for documentation-chain issues", () => {
    const refs = getFederalRegulationsForViolation({
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      technicalDetails: {
        fieldName: "dateClosed",
        accountStatus: "Closed",
      },
    });

    expect(refs.length).toBeGreaterThan(0);
    expect(refs.some((ref) => ref.specificApplication?.includes("closing date"))).toBe(true);
  });
});
