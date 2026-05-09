import { describe, expect, it } from "vitest";

import {
  buildCrossBureauFieldDifferences,
  formatCrossBureauUserExplanation,
  shouldFlagMissingAssignmentDocumentation,
  shouldTreatOriginalCreditorSelfReferenceAsFake,
} from "./complianceDetectorCrossEntity";
import { getSameCollectionDebtMatch } from "./complianceDetectorCollector";
import { resolveCreditorEntity } from "./creditorEntityResolver";

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

describe("collection agency debt identity", () => {
  it("classifies NCRI and National Legal as collection entities", () => {
    expect(resolveCreditorEntity("NCRI INC").entityType).toBe("collection");
    expect(resolveCreditorEntity("NCRI CAPITAL ASSET INC").entityType).toBe("collection");
    expect(resolveCreditorEntity("NATIONAL LEGAL GROUP").entityType).toBe("collection");
  });

  it("matches duplicate collection accounts by account number and bureau even when DOFD is missing", () => {
    const match = getSameCollectionDebtMatch(
      {
        id: 1,
        userId: 24,
        bureauId: 2,
        creditorId: 10,
        accountNumber: "***672",
        accountType: "Collection",
        isCollectionAccount: true,
        collectionAgencyName: "NCRI CAPITAL ASSET INC",
        originalCreditorName: null,
        dateOfFirstDelinquency: null,
        dateAssignedToCollection: new Date("2023-12-01"),
      } as any,
      {
        id: 2,
        userId: 24,
        bureauId: 2,
        creditorId: 11,
        accountNumber: "***672",
        accountType: "Collection",
        isCollectionAccount: true,
        collectionAgencyName: "NATIONAL LEGAL GROUP",
        originalCreditorName: null,
        dateOfFirstDelinquency: null,
        dateAssignedToCollection: new Date("2024-01-01"),
      } as any
    );

    expect(match.matched).toBe(true);
    expect(match.accountNumberMatch).toBe(true);
    expect(match.matchedOn).toBe("account_number_same_bureau");
  });
});

describe("cross-bureau field differences", () => {
  it("creates consumer-readable field-level differences instead of a generic mismatch", () => {
    const differences = buildCrossBureauFieldDifferences(
      {
        id: 1,
        creditorId: 7,
        bureauId: 2,
        accountNumber: "Unknown",
        status: "Open - Bad debt",
        accountType: "Charge",
        balance: 341,
        currentBalance: 341,
        openedDate: new Date("2020-02-25"),
        paymentHistoryProfile: "30 0 / 60 0 / 90 0",
      },
      {
        id: 2,
        creditorId: 7,
        bureauId: 1,
        accountNumber: "Unknown",
        status: "Cancelled by Credit Grantor",
        accountType: "Open",
        balance: null,
        currentBalance: null,
        openedDate: new Date("2020-02-25"),
        paymentHistoryProfile: null,
      }
    );

    expect(differences.map((difference) => difference.fieldName)).toEqual(
      expect.arrayContaining(["balance", "status", "accountType", "paymentHistoryProfile"])
    );

    const explanation = formatCrossBureauUserExplanation({
      creditorName: "FIDO",
      baseBureauName: "Equifax Canada",
      otherBureauName: "TransUnion Canada",
      differences,
    });

    expect(explanation).toContain("Equifax Canada and TransUnion Canada show different details for FIDO");
    expect(explanation).toContain("Balance: Equifax Canada shows $341.00; TransUnion Canada shows not reported");
    expect(explanation).toContain("Payment history summary");
  });
});
