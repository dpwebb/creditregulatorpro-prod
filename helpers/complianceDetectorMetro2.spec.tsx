import { describe, expect, it } from "vitest";

import { detectMetro2FieldViolations } from "./complianceDetectorMetro2";

describe("Metro2 collection date detection", () => {
  it("reports each missing collection turnover field when TransUnion shows TC turnover", async () => {
    const violations = await detectMetro2FieldViolations({
      id: 515,
      amountPastDue: "341.00",
      balance: "341.00",
      status: "Cancelled by Credit Grantor",
      accountType: "OPEN",
      isCollectionAccount: true,
      mop: "9",
      creditorId: 61,
      originalCreditorName: "FIDO",
      collectionAgencyName: null,
      dateAssignedToCollection: null,
      dateOfFirstDelinquency: null,
      chargeOffDate: null,
      dateClosed: null,
      dateOfLastPayment: new Date("2020-08-09T00:00:00.000Z"),
      sourceText:
        "Mar 2025 341 0 341 9 0 0 TC / CG Legend: TC-Third party collection/account turned over to collection agency",
    } as any);

    const fieldNames = violations.map((violation) => violation.technicalDetails.fieldName);
    const assignmentDateViolation = violations.find(
      (violation) => violation.technicalDetails.fieldName === "dateAssignedToCollection"
    );

    expect(fieldNames).toContain("dateAssignedToCollection");
    expect(fieldNames).toContain("dateOfFirstDelinquency");
    expect(fieldNames).toContain("collectionAgencyName");
    expect(assignmentDateViolation?.userExplanation).toContain("marked as turned over to collection");
    expect(assignmentDateViolation?.userExplanation).not.toContain("required");
    expect(assignmentDateViolation?.severity).toBe("WARNING");
    expect(assignmentDateViolation?.confidenceScore).toBe(78);
    expect(assignmentDateViolation?.technicalDetails.specificFieldRequirementMapped).toBe(false);
    expect(assignmentDateViolation?.technicalDetails.ruleName).toBe("BASE_SEGMENT_REQUIRED");
    expect(assignmentDateViolation?.technicalDetails.regulationIds).toEqual(["PIPEDA_4_6", "METRO2_BASE_SEGMENT"]);
  });

  it("uses source narrative codes before trusting a parser-inferred charge-off status", async () => {
    const violations = await detectMetro2FieldViolations({
      id: 516,
      amountPastDue: "0",
      balance: "0",
      status: "Charge Off",
      accountType: "INSTALLMENT",
      isCollectionAccount: false,
      mop: "1",
      creditorId: 10,
      originalCreditorName: null,
      collectionAgencyName: null,
      dateAssignedToCollection: null,
      dateOfFirstDelinquency: null,
      chargeOffDate: null,
      dateClosed: null,
      dateOfLastPayment: new Date("2013-10-03T00:00:00.000Z"),
      sourceText:
        "Narrative 1 / 2 AC / Legend:AC-Account closed/rating non derogatory Terms:522/M Charge Off Date",
    } as any);

    expect(
      violations.some((violation) => violation.technicalDetails.fieldName === "chargeOffDate"),
    ).toBe(false);
    expect(
      violations.some((violation) => violation.technicalDetails.fieldName === "dateOfFirstDelinquency"),
    ).toBe(false);
  });

  it("does not say generic missing fields are required without exact field authority", async () => {
    const violations = await detectMetro2FieldViolations({
      id: 516,
      amountPastDue: "0",
      balance: "0",
      status: "Open",
      accountType: "",
      isCollectionAccount: true,
      creditorId: null,
      originalCreditorName: null,
      collectionAgencyName: "SAMPLE COLLECTIONS",
      dateAssignedToCollection: new Date("2025-01-01T00:00:00.000Z"),
      dateOfFirstDelinquency: null,
      chargeOffDate: null,
      dateClosed: null,
      dateOfLastPayment: new Date("2025-01-01T00:00:00.000Z"),
    } as any);

    const missingFieldTexts = violations
      .filter((violation) =>
        ["accountType", "creditorId", "originalCreditorName"].includes(
          String(violation.technicalDetails.fieldName),
        ),
      )
      .map((violation) => violation.userExplanation);

    expect(missingFieldTexts.length).toBeGreaterThan(0);
    expect(missingFieldTexts.join(" ")).not.toContain("That information is required.");
    expect(missingFieldTexts.join(" ")).toContain("That information can help verify the reporting.");
  });
});
