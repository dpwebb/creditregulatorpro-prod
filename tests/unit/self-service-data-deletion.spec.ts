import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(filePath: string): string {
  return readFileSync(path.resolve(process.cwd(), filePath), "utf8");
}

describe("self-service data deletion", () => {
  it("exposes user data summary and destructive self-service routes", () => {
    const server = source("server.ts");

    expect(server).toContain("app.get('_api/user/data-summary'");
    expect(server).toContain("app.post('_api/user/delete-data'");
    expect(server).toContain("app.post('_api/user/delete-account'");
    expect(server).toContain("./endpoints/user/data-summary_GET.js");
    expect(server).toContain("./endpoints/user/delete-data_POST.js");
    expect(server).toContain("./endpoints/user/delete-account_POST.js");
  });

  it("limits destructive self-service endpoints to consumer accounts", () => {
    const deleteDataEndpoint = source("endpoints/user/delete-data_POST.ts");
    const deleteAccountEndpoint = source("endpoints/user/delete-account_POST.ts");

    expect(deleteDataEndpoint).toContain('user.role !== "user"');
    expect(deleteDataEndpoint).toContain("deleteUserDataCategories");
    expect(deleteDataEndpoint).toContain('action: "SELF_DATA_DELETION"');
    expect(deleteAccountEndpoint).toContain('user.role !== "user"');
    expect(deleteAccountEndpoint).toContain("deleteUserAccountCascade");
    expect(deleteAccountEndpoint).toContain("clearServerSession(response)");
  });

  it("requires selected-category confirmation and account deletion phrase", () => {
    const deleteDataSchema = source("endpoints/user/delete-data_POST.schema.ts");
    const deleteAccountSchema = source("endpoints/user/delete-account_POST.schema.ts");

    expect(deleteDataSchema).toContain("USER_DATA_DELETION_CATEGORIES");
    expect(deleteDataSchema).toContain("z.literal(true");
    expect(deleteAccountSchema).toContain('ACCOUNT_DELETE_CONFIRM_PHRASE = "DELETE MY ACCOUNT"');
    expect(deleteAccountSchema).toContain("confirmEmail");
    expect(deleteAccountSchema).toContain("confirmPhrase");
  });

  it("deletes all consumer-owned categories and then removes the user row for account deletion", () => {
    const helper = source("helpers/userDataDeletion.ts");
    const types = source("helpers/userDataDeletionTypes.ts");

    expect(types).toContain("export const USER_DATA_DELETION_CATEGORIES");
    expect(helper).toContain("userDataDeletionTypes");
    expect(helper).toContain("deleteConsumerIdentificationDocument");
    expect(helper).toContain("deleteUserReportDataCascade");
    expect(helper).toContain("deleteSupportData");
    expect(helper).toContain("deleteUserAuthAndAccountRows");
    expect(helper).toContain("runDynamicUserFkCleanup");
    expect(helper.indexOf('deleteFrom("users")')).toBeGreaterThan(
      helper.indexOf("deleteUserAuthAndAccountRows")
    );
    expect(helper).toContain('action: "SELF_ACCOUNT_DELETION"');
  });

  it("adds the deletion controls to profile settings", () => {
    const page = source("pages/profile-settings.tsx");
    const component = source("components/UserDataDeletionManager.tsx");

    expect(page).toContain("UserDataDeletionManager");
    expect(component).toContain("Delete selected data");
    expect(component).toContain("Delete my account");
    expect(component).toContain("ACCOUNT_DELETE_CONFIRM_PHRASE");
  });

  it("keeps admin hard-delete deleting saved identification files too", () => {
    const endpoint = source("endpoints/admin/delete-user_POST.ts");

    expect(endpoint).toContain("deleteConsumerIdentificationDocument");
    expect(endpoint).toContain('purgedCounts["consumerIdentificationDocuments"]');
  });
});
