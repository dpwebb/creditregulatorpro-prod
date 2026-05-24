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

  it("keeps closed-date documentation issues in review status without mapped field authority", () => {
    const refs = getFederalRegulationsForViolation({
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      technicalDetails: {
        fieldName: "dateClosed",
        accountType: "INSTALLMENT",
        accountStatus: "Closed",
      },
    });

    expect(refs.length).toBeGreaterThan(0);
    expect(refs.some((ref) => ref.specificApplication?.includes("closing date"))).toBe(true);
    expect(refs.every((ref) => ref.specificApplication?.includes("field-specific legal or reporting-standard requirement"))).toBe(true);
    expect(refs.every((ref) => !ref.specificApplication?.includes("requires that date"))).toBe(true);
  });

  it("does not call missing collection assignment date required without a mapped field requirement", () => {
    const refs = getFederalRegulationsForViolation({
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      technicalDetails: {
        fieldName: "dateAssignedToCollection",
        regulationIds: ["PIPEDA_4_6"],
        specificFieldRequirementMapped: false,
      },
    });

    expect(refs.map((ref) => ref.regulationId)).toEqual(["PIPEDA_4_6"]);
    expect(refs.some((ref) => ref.specificApplication?.includes("field-specific legal or reporting-standard requirement"))).toBe(true);
    expect(refs.every((ref) => !ref.specificApplication?.includes("which is required"))).toBe(true);
  });

  it("does not call generic field-level documentation-chain issues required without local field authority", () => {
    const refs = getFederalRegulationsForViolation({
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      technicalDetails: {
        fieldName: "creditorId",
        regulationIds: ["PIPEDA_4_6", "METRO2_BASE_SEGMENT"],
      },
    });

    expect(refs.length).toBeGreaterThan(0);
    expect(refs.every((ref) => !ref.specificApplication?.includes("which is required"))).toBe(true);
    expect(refs.every((ref) => ref.specificApplication?.includes("field-specific legal or reporting-standard requirement"))).toBe(true);
  });

  it("labels statute authority separately from private reporting-standard authority", () => {
    const refs = getFederalRegulationsForViolation({
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      technicalDetails: {
        fieldName: "dateAssignedToCollection",
        regulationIds: ["PIPEDA_4_6", "METRO2_BASE_SEGMENT"],
      },
    });

    expect(refs.find((ref) => ref.regulationId === "PIPEDA_4_6")).toEqual(
      expect.objectContaining({
        authorityIssueClassification: "mapped_legal_authority_issue",
        authorityIssueLabel: "Mapped legal authority issue",
      }),
    );
    expect(refs.find((ref) => ref.regulationId === "METRO2_BASE_SEGMENT")).toEqual(
      expect.objectContaining({
        authorityIssueClassification: "mapped_reporting_standard_issue",
        authorityIssueLabel: "Mapped reporting-standard issue",
      }),
    );
  });

  it("uses investigatory language for non-explicit dispute signals", () => {
    const paymentRefs = getFederalRegulationsForViolation({
      violationCategory: "PAYMENT_HISTORY_MANIPULATION",
      technicalDetails: {
        message: "Payment history differs between reports.",
        regulationIds: ["PIPEDA_4_6"],
      },
    });
    const statuteRefs = getFederalRegulationsForViolation({
      violationCategory: "STATUTE_OF_LIMITATIONS",
      technicalDetails: {
        referenceDate: "2013-01-01",
        reportingLimitDate: "2020-01-01",
        retentionYears: 7,
        regulationIds: ["PIPEDA_4_5"],
      },
    });

    const text = [...paymentRefs, ...statuteRefs]
      .map((ref) => ref.specificApplication)
      .join(" ");

    expect(text).toMatch(/review/i);
    expect(text).not.toMatch(/illegal|unlawful|violates reporting law|manipulat|unfairly|misrepresents|exceeded the maximum allowed reporting period|must be removed/i);
  });
});
