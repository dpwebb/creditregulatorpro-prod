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

  it("keeps expired admin purge on the report artifact cascade path", () => {
    const endpoint = source("endpoints/admin/purge_POST.ts");

    expect(endpoint).toContain("deleteReportArtifactCascade");
    expect(endpoint).toContain('selectFrom("reportArtifact")');
    expect(endpoint).not.toContain("deleteFrom('reportArtifact')");
    expect(endpoint).not.toContain('deleteFrom("reportArtifact")');
  });
});

describe("admin delete-user lifecycle regression coverage", () => {
  it("keeps the mock lifecycle suite exercising the admin deletion cascade", () => {
    const runner = source("endpoints/admin/mock-lifecycle/jobRunner.ts");
    const endpoint = source("endpoints/admin/mock-lifecycle/run_POST.ts");
    const lifecycle = source("scripts/mock-user-lifecycle-e2e.ts");

    expect(endpoint).toContain("adminSessionCookie: request.headers.get(\"cookie\")");
    expect(runner).toContain("CRP_LIFECYCLE_ADMIN_COOKIE");
    expect(lifecycle).toContain("admin_delete_user");
    expect(lifecycle).toContain("\"/_api/admin/delete-user\"");
    expect(lifecycle).toContain("assertAdminCleanupPreflight(options)");
    expect(lifecycle).toContain("Refusing to run mock lifecycle without admin cleanup access");
    expect(lifecycle).toContain("--allow-unclean-run");
    expect(lifecycle).toContain("seedAdminDeletionRegressionData");
    expect(lifecycle).toContain("requirePurgedCount(payload.purgedCounts, \"users\", 1");
    expect(lifecycle).toContain("requirePurgedCount(payload.purgedCounts, \"reportArtifacts\", 2");
    expect(lifecycle).toContain("parserTestCasesReassigned");
    expect(lifecycle).toContain("softwareVersionsNullified");
    expect(lifecycle).toContain("remainingReportArtifacts");
    expect(lifecycle).toContain("remainingSupportMessagesFromUser");
  });
});
