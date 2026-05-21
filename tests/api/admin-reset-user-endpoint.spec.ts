import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotAuthenticatedError } from "../../helpers/getSetServerSession";

type QueryResult = Record<string, unknown> | null;

const mocks = vi.hoisted(() => ({
  getServerUserSession: vi.fn(),
  deleteUserReportDataCascade: vi.fn(),
  logAudit: vi.fn(),
  selectQueue: [] as QueryResult[],
  deleteQueue: [] as QueryResult[],
  selectTables: [] as string[],
  deleteTables: [] as string[],
  db: {
    selectFrom: vi.fn(),
    deleteFrom: vi.fn(),
  },
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

vi.mock("../../helpers/deleteReportArtifactCascade", () => ({
  deleteUserReportDataCascade: mocks.deleteUserReportDataCascade,
}));

vi.mock("../../helpers/auditLogger", () => ({
  logAudit: mocks.logAudit,
}));

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

import { handle as resetUser } from "../../endpoints/admin/reset-user_POST";

const originalEnv = {
  CRP_ENV: process.env.CRP_ENV,
  NODE_ENV: process.env.NODE_ENV,
  FLOOT_DATABASE_URL: process.env.FLOOT_DATABASE_URL,
};

const resetCounts = {
  deletedReportArtifacts: 1,
  deletedTradelines: 2,
  deletedPackets: 3,
  deletedObligationInstances: 4,
  deletedBankruptcyRecords: 5,
  deletedPostalTransactions: 6,
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function resetRequest(body: unknown): Request {
  return new Request("http://localhost/_api/admin/reset-user", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeBuilder(result: QueryResult) {
  const builder: Record<string, any> = {};
  for (const method of ["select", "where"] as const) {
    builder[method] = vi.fn(() => builder);
  }
  builder.executeTakeFirst = vi.fn(async () => result);
  return builder;
}

beforeEach(() => {
  restoreEnv();
  vi.clearAllMocks();
  mocks.selectQueue.length = 0;
  mocks.deleteQueue.length = 0;
  mocks.selectTables.length = 0;
  mocks.deleteTables.length = 0;
  mocks.getServerUserSession.mockResolvedValue({
    user: { id: 100, role: "admin", email: "admin@example.invalid" },
  });
  mocks.deleteUserReportDataCascade.mockResolvedValue(resetCounts);
  mocks.logAudit.mockResolvedValue({ success: true });
  mocks.db.selectFrom.mockImplementation((table: string) => {
    mocks.selectTables.push(table);
    return makeBuilder(mocks.selectQueue.shift() ?? null);
  });
  mocks.db.deleteFrom.mockImplementation((table: string) => {
    mocks.deleteTables.push(table);
    return makeBuilder(mocks.deleteQueue.shift() ?? { numDeletedRows: 0n });
  });
});

afterEach(() => {
  restoreEnv();
});

describe("admin reset-user endpoint", () => {
  it("resets a non-admin user with explicit email confirmation", async () => {
    mocks.selectQueue.push({ id: 22, email: "user@example.invalid", role: "user" });
    mocks.deleteQueue.push({ numDeletedRows: 1n });

    const response = await resetUser(resetRequest({
      userId: 22,
      confirmEmail: "user@example.invalid",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      userEmail: "user@example.invalid",
      deletedFreezeRecords: 1,
      ...resetCounts,
    });
    expect(mocks.deleteUserReportDataCascade).toHaveBeenCalledWith(22, 100, expect.any(Request));
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "UPDATE",
        entityType: "USER_ACCOUNT",
        entityId: 22,
        userId: 100,
        status: "SUCCESS",
        details: expect.objectContaining({
          action: "ACCOUNT_DATA_RESET",
          targetEmail: "user@example.invalid",
        }),
      }),
    );
  });

  it("allows admin reset outside local development when admin and confirmation checks pass", async () => {
    process.env.CRP_ENV = "staging";
    process.env.NODE_ENV = "production";
    process.env.FLOOT_DATABASE_URL = "postgres://app:app@staging-db.example.invalid:5432/creditregulatorpro_staging";
    mocks.selectQueue.push({ id: 22, email: "user@example.invalid", role: "user" });
    mocks.deleteQueue.push({ numDeletedRows: 0n });

    const response = await resetUser(resetRequest({
      userId: 22,
      confirmEmail: "user@example.invalid",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      userEmail: "user@example.invalid",
      ...resetCounts,
    });
    expect(mocks.deleteUserReportDataCascade).toHaveBeenCalledWith(22, 100, expect.any(Request));
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      status: "SUCCESS",
      details: expect.objectContaining({ action: "ACCOUNT_DATA_RESET" }),
    }));
  });

  it("returns 400 for missing or invalid confirmation email before mutation", async () => {
    const response = await resetUser(resetRequest({ userId: 22 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.any(String),
    });
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
    expect(mocks.deleteUserReportDataCascade).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid user identifiers before mutation", async () => {
    const response = await resetUser(resetRequest({
      userId: 0,
      confirmEmail: "user@example.invalid",
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.any(String),
    });
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
    expect(mocks.deleteUserReportDataCascade).not.toHaveBeenCalled();
  });

  it("returns 404 when the target user is missing", async () => {
    mocks.selectQueue.push(null);

    const response = await resetUser(resetRequest({
      userId: 22,
      confirmEmail: "missing@example.invalid",
    }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("not found"),
    });
    expect(mocks.deleteUserReportDataCascade).not.toHaveBeenCalled();
  });

  it("blocks target admin accounts before mutation", async () => {
    mocks.selectQueue.push({ id: 22, email: "admin-target@example.invalid", role: "admin" });

    const response = await resetUser(resetRequest({
      userId: 22,
      confirmEmail: "admin-target@example.invalid",
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Cannot reset an admin account",
    });
    expect(mocks.deleteUserReportDataCascade).not.toHaveBeenCalled();
  });

  it("blocks current admin self-reset before mutation", async () => {
    mocks.selectQueue.push({ id: 100, email: "admin@example.invalid", role: "admin" });

    const response = await resetUser(resetRequest({
      userId: 100,
      confirmEmail: "admin@example.invalid",
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Cannot reset an admin account",
    });
    expect(mocks.deleteUserReportDataCascade).not.toHaveBeenCalled();
  });

  it("blocks confirmation email mismatches before mutation", async () => {
    mocks.selectQueue.push({ id: 22, email: "user@example.invalid", role: "user" });

    const response = await resetUser(resetRequest({
      userId: 22,
      confirmEmail: "other@example.invalid",
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Confirmation email does not match the target user's email",
    });
    expect(mocks.deleteUserReportDataCascade).not.toHaveBeenCalled();
  });

  it("is idempotent when the local user has no remaining resettable data", async () => {
    mocks.selectQueue.push({ id: 22, email: "user@example.invalid", role: "user" });
    mocks.deleteQueue.push({ numDeletedRows: 0n });
    mocks.deleteUserReportDataCascade.mockResolvedValueOnce({
      deletedReportArtifacts: 0,
      deletedTradelines: 0,
      deletedPackets: 0,
      deletedObligationInstances: 0,
      deletedBankruptcyRecords: 0,
      deletedPostalTransactions: 0,
    });

    const response = await resetUser(resetRequest({
      userId: 22,
      confirmEmail: "USER@example.invalid",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      deletedReportArtifacts: 0,
      deletedTradelines: 0,
      deletedPackets: 0,
      deletedObligationInstances: 0,
      deletedBankruptcyRecords: 0,
      deletedPostalTransactions: 0,
      deletedFreezeRecords: 0,
    });
  });

  it("keeps non-admin callers blocked", async () => {
    mocks.getServerUserSession.mockResolvedValueOnce({
      user: { id: 200, role: "user", email: "ordinary@example.invalid" },
    });

    const response = await resetUser(resetRequest({
      userId: 22,
      confirmEmail: "user@example.invalid",
    }));

    expect(response.status).toBe(403);
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
    expect(mocks.deleteUserReportDataCascade).not.toHaveBeenCalled();
  });

  it("keeps unauthenticated callers blocked", async () => {
    mocks.getServerUserSession.mockRejectedValueOnce(new NotAuthenticatedError("Not authenticated"));

    const response = await resetUser(resetRequest({
      userId: 22,
      confirmEmail: "user@example.invalid",
    }));

    expect(response.status).toBe(401);
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
    expect(mocks.deleteUserReportDataCascade).not.toHaveBeenCalled();
  });
});
