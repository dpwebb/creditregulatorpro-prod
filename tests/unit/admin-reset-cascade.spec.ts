import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(filePath: string): string {
  return readFileSync(path.resolve(process.cwd(), filePath), "utf8");
}

describe("admin reset cascade", () => {
  it("deletes tradelines directly instead of relying on report artifact deletion", () => {
    const helper = source("helpers/deleteReportArtifactCascade.tsx");

    expect(helper).toContain("export async function deleteUserReportDataCascade");
    expect(helper).toContain('selectFrom("tradeline")');
    expect(helper).toContain('where("userId", "=", targetUserId)');
    expect(helper).toContain("relying on the report artifact delete can leave stale accounts behind");
    expect(helper).not.toContain("deleteTradeline(trx, tradelineId, userId, reportArtifactId, true)");
  });

  it("routes admin reset through the broad user report-data cascade", () => {
    const endpoint = source("endpoints/admin/reset-user_POST.ts");
    const schema = source("endpoints/admin/reset-user_POST.schema.ts");

    expect(endpoint).toContain("deleteUserReportDataCascade");
    expect(endpoint).toContain("...resetCounts");
    expect(schema).toContain("deletedTradelines: number");
    expect(schema).toContain("deletedPackets: number");
  });
});
