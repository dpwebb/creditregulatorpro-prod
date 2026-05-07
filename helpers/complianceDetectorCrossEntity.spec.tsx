import { describe, expect, it } from "vitest";

import { shouldTreatOriginalCreditorSelfReferenceAsFake } from "./complianceDetectorCrossEntity";

describe("original creditor self-reference classification", () => {
  it("does not treat a telecom creditor as a fake original creditor on TC turnover rows", () => {
    const result = shouldTreatOriginalCreditorSelfReferenceAsFake({
      originalCreditorName: "FIDO",
      creditorName: "FIDO",
      collectionAgencyName: null,
    });

    expect(result.isFake).toBe(false);
  });

  it("treats original creditor matching a collection-agency creditor as fake", () => {
    const result = shouldTreatOriginalCreditorSelfReferenceAsFake({
      originalCreditorName: "CBV Collections",
      creditorName: "CBV Collection Services",
      collectionAgencyName: null,
    });

    expect(result.isFake).toBe(true);
    expect(result.matchReason).toContain("collection-agency creditor");
  });

  it("treats original creditor matching a separate collection agency as fake", () => {
    const result = shouldTreatOriginalCreditorSelfReferenceAsFake({
      originalCreditorName: "EOS Canada",
      creditorName: "Capital One Bank",
      collectionAgencyName: "EOS Canada Inc",
    });

    expect(result.isFake).toBe(true);
    expect(result.matchReason).toContain("collection agency name");
  });
});
