import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { schema as creditorValidationListSchema } from "../../endpoints/creditor-validation/list_GET.schema";
import { schema as uploadResultsSchema } from "../../endpoints/upload-results/get_GET.schema";

function source(filePath: string): string {
  return readFileSync(path.resolve(process.cwd(), filePath), "utf8");
}

describe("violation search preservation", () => {
  it("preserves upload-results violation lookup joins, fields, and response keys", () => {
    const text = source("endpoints/upload-results/get_GET.ts");

    expect(uploadResultsSchema.safeParse({ artifactId: 1 }).success).toBe(true);
    expect(text).toContain('selectFrom("creditorObligationTest")');
    expect(text).toContain('innerJoin("tradeline", "creditorObligationTest.tradelineId", "tradeline.id")');
    expect(text).toContain('"creditorObligationTest.id"');
    expect(text).toContain('"creditorObligationTest.tradelineId"');
    expect(text).toContain('"creditorObligationTest.violationCategory"');
    expect(text).toContain('"creditorObligationTest.userStatus"');
    expect(text).toContain('"creditorObligationTest.obligationState"');
    expect(text).toContain('"creditorObligationTest.obligationType"');
    expect(text).toContain('"creditorObligationTest.userExplanation"');
    expect(text).toContain('"creditorObligationTest.severity"');
    expect(text).toContain('"tradeline.collectionAgencyName as tradelineCollectionAgencyName"');
    expect(text).toContain('"tradeline.isCollectionAccount as tradelineIsCollectionAccount"');
    expect(text).toContain('"tradeline.accountNumber"');
    expect(text).toContain('"creditor.name as creditorName"');
    expect(text).toContain('"bureau.name as bureauName"');
    expect(text).toContain("topFindings");
    expect(text).toContain("violationCategory");
    expect(text).toContain("equifaxViolations");
    expect(text).toContain("transunionViolations");
  });

  it("preserves creditor-validation filters and searchable response fields", () => {
    const text = source("endpoints/creditor-validation/list_GET.ts");

    expect(
      creditorValidationListSchema.safeParse({
        creditorId: 1,
        obligationState: "OBLIGATION_PENDING",
        tradelineId: 2,
        limit: "25",
        offset: "0",
      }).success,
    ).toBe(true);

    for (const field of [
      "creditorObligationTest.id",
      "creditorObligationTest.tradelineId",
      "creditorObligationTest.creditorId",
      "creditorObligationTest.obligationType",
      "creditorObligationTest.obligationState",
      "creditorObligationTest.violationCategory",
      "creditorObligationTest.statutoryBasis",
      "creditorObligationTest.technicalDetails",
      "creditorObligationTest.userStatus",
      "creditorObligationTest.detectedAt",
      "creditorObligationTest.userExplanation",
      "creditorObligationTest.recommendedAction",
      "tradeline.accountNumber as tradelineAccountNumber",
      "tradeline.currentBalance as tradelineCurrentBalance",
      "tradeline.balance as tradelineBalance",
      "bureau.name as tradelineBureauName",
    ]) {
      expect(text).toContain(field);
    }

    expect(text).toContain("coalesce");
    expect(text).toContain("creditorName");
    expect(text).toContain("input.creditorId");
    expect(text).toContain("input.obligationState");
    expect(text).toContain("input.tradelineId");
    expect(text).toContain("orderBy('creditorObligationTest.detectedAt', 'desc')");
  });
});
