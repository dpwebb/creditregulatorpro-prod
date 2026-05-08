import { describe, expect, it } from "vitest";

import { detectMetro2FieldViolations } from "./complianceDetectorMetro2";

describe("Metro2 collection date detection", () => {
  it("does not double-count missing collection assignment date as a DOFD fallback", async () => {
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
    } as any);

    const fieldNames = violations.map((violation) => violation.technicalDetails.fieldName);
    const assignmentDateViolation = violations.find(
      (violation) => violation.technicalDetails.fieldName === "dateAssignedToCollection"
    );

    expect(fieldNames).toContain("dateAssignedToCollection");
    expect(fieldNames).not.toContain("dateOfFirstDelinquency");
    expect(assignmentDateViolation?.userExplanation).toContain("marked as turned over to collection");
    expect(assignmentDateViolation?.userExplanation).not.toContain("required");
    expect(assignmentDateViolation?.severity).toBe("WARNING");
    expect(assignmentDateViolation?.confidenceScore).toBe(72);
    expect(assignmentDateViolation?.technicalDetails.specificFieldRequirementMapped).toBe(false);
    expect(assignmentDateViolation?.technicalDetails.regulationIds).toEqual(["PIPEDA_4_6"]);
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
