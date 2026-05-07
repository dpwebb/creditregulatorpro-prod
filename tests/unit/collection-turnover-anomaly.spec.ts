import { describe, expect, it } from "vitest";

import { extractTradelines } from "../../helpers/transunionPdfExtractor";

describe("collection turnover anomaly parsing", () => {
  it("does not invent a collection agency when TransUnion only reports TC turnover", () => {
    const [tradeline] = extractTradelines(`
Account(s):
Creditor Name
FIDO
Account TypeOPEN / INDIVIDUAL
StatusCancelled by Credit Grantor
Opened DateFeb 25, 2020
Reported DateDec 30, 2025
Last Payment DateAug 09, 2020
Payment History
Mar 202534103419000TC / CG
Legend:CG-Account cancelled by credit grantor with derogatory rating, TC-Third party collection/account turned over to collection agency
`);

    expect(tradeline.creditorName).toBe("FIDO");
    expect(tradeline.isCollectionAccount).toBe(true);
    expect(tradeline.originalCreditorName).toBe("FIDO");
    expect(tradeline.collectionAgencyName).toBeUndefined();
    expect(tradeline.collectionAgencyMissingFromReport).toBe(true);
    expect(tradeline.dateAssignedToCollection).toBeNull();
    expect(tradeline.dateAssignedToCollectionMissingFromReport).toBe(true);
  });
});
