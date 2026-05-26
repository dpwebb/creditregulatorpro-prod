import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotAuthenticatedError } from "../../helpers/getSetServerSession";

const mocks = vi.hoisted(() => ({
  getServerUserSession: vi.fn(),
  deleteUserDataCategories: vi.fn(),
  deleteUserAccountCascade: vi.fn(),
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

vi.mock("../../helpers/userDataDeletion", () => ({
  deleteUserDataCategories: mocks.deleteUserDataCategories,
  deleteUserAccountCascade: mocks.deleteUserAccountCascade,
}));

import { handle as deleteUserData } from "../../endpoints/user/delete-data_POST";
import { handle as deleteUserAccount } from "../../endpoints/user/delete-account_POST";
import { ACCOUNT_DELETE_CONFIRM_PHRASE } from "../../endpoints/user/delete-account_POST.schema";

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("self-service user data deletion endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerUserSession.mockResolvedValue({
      user: { id: 42, role: "user", email: "owner@example.test" },
    });
    mocks.deleteUserDataCategories.mockResolvedValue({
      success: true,
      purgedCounts: { reportArtifacts: 1, storedFiles: 1 },
    });
    mocks.deleteUserAccountCascade.mockResolvedValue({
      success: true,
      purgedCounts: { users: 1, sessions: 1 },
    });
  });

  it("denies unauthenticated self-service user data deletion", async () => {
    mocks.getServerUserSession.mockRejectedValueOnce(new NotAuthenticatedError("Not authenticated"));

    const response = await deleteUserData(jsonRequest("/_api/user/delete-data", {
      categories: ["creditData"],
      confirm: true,
    }));

    expect(response.status).toBe(401);
    expect(mocks.deleteUserDataCategories).not.toHaveBeenCalled();
  });

  it("deletes only categories for the authenticated user", async () => {
    const response = await deleteUserData(jsonRequest("/_api/user/delete-data", {
      categories: ["creditData"],
      confirm: true,
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
    expect(mocks.deleteUserDataCategories).toHaveBeenCalledWith({
      userId: 42,
      actorUserId: 42,
      categories: ["creditData"],
      request: expect.any(Request),
    });
  });

  it("blocks support and admin roles from consumer self-service deletion", async () => {
    mocks.getServerUserSession.mockResolvedValueOnce({
      user: { id: 7, role: "admin", email: "admin@example.test" },
    });

    const response = await deleteUserAccount(jsonRequest("/_api/user/delete-account", {
      confirmEmail: "admin@example.test",
      confirmPhrase: ACCOUNT_DELETE_CONFIRM_PHRASE,
    }));

    expect(response.status).toBe(403);
    expect(mocks.deleteUserAccountCascade).not.toHaveBeenCalled();
  });

  it("deletes only the authenticated account when confirmation matches", async () => {
    const response = await deleteUserAccount(jsonRequest("/_api/user/delete-account", {
      confirmEmail: "OWNER@example.test",
      confirmPhrase: ACCOUNT_DELETE_CONFIRM_PHRASE,
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
    expect(mocks.deleteUserAccountCascade).toHaveBeenCalledWith({
      userId: 42,
      email: "owner@example.test",
      request: expect.any(Request),
    });
  });

  it("rejects account deletion when the confirmation email is not the current user", async () => {
    const response = await deleteUserAccount(jsonRequest("/_api/user/delete-account", {
      confirmEmail: "other@example.test",
      confirmPhrase: ACCOUNT_DELETE_CONFIRM_PHRASE,
    }));

    expect(response.status).toBe(400);
    expect(mocks.deleteUserAccountCascade).not.toHaveBeenCalled();
  });
});
