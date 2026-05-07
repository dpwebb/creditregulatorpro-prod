import { describe, expect, it } from "vitest";

import {
  shouldFlagMissingAssignmentDocumentation,
  shouldTreatOriginalCreditorSelfReferenceAsFake,
} from "./complianceDetectorCrossEntity";

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

describe("assignment documentation chain detection", () => {
  it("does not flag pending obligations that have no response yet", () => {
    expect(
      shouldFlagMissingAssignmentDocumentation({
        assignmentDocsFound: 0,
        obligationInstances: [
          {
            responseDocumentationProvided: null,
            responseDocumentationTypes: [],
          },
        ],
      })
    ).toBe(false);
  });

  it("flags a response that explicitly says documentation was not provided", () => {
    expect(
      shouldFlagMissingAssignmentDocumentation({
        assignmentDocsFound: 0,
        obligationInstances: [
          {
            responseDocumentationProvided: false,
            responseDocumentationTypes: [],
          },
        ],
      })
    ).toBe(true);
  });

  it("does not flag when assignment evidence is already linked", () => {
    expect(
      shouldFlagMissingAssignmentDocumentation({
        assignmentDocsFound: 1,
        obligationInstances: [
          {
            responseDocumentationProvided: false,
            responseDocumentationTypes: [],
          },
        ],
      })
    ).toBe(false);
  });

  it("flags provided response documents when none identify assignment or ownership proof", () => {
    expect(
      shouldFlagMissingAssignmentDocumentation({
        assignmentDocsFound: 0,
        obligationInstances: [
          {
            responseDocumentationProvided: true,
            responseDocumentationTypes: ["account statement", "payment history"],
          },
        ],
      })
    ).toBe(true);
  });
});
