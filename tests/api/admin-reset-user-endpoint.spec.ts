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
  CRP_LOCAL_DEV: process.env.CRP_LOCAL_DEV,
  CRP_ENV: process.env.CRP_ENV,
  NODE_ENV: process.env.NODE_ENV,
  FLOOT_DATABASE_URL: process.env.FLOOT_DATABASE_URL,
  LOCAL_DATABASE_NAME: process.env.LOCAL_DATABASE_NAME,
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

function setSafeLocalEnv(): void {
  process.env.CRP_LOCAL_DEV = "true";
  process.env.CRP_ENV = "local";
  process.env.NODE_ENV = "test";
  process.env.FLOOT_DATABASE_URL = "postgres://local:local@127.0.0.1:5432/creditregulatorpro_local";
  process.env.LOCAL_DATABASE_NAME = "creditregulatorpro_local";
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
  setSafeLocalEnv();
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
  it("resets a local non-admin user with explicit email confirmation", async () => {
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

  it("blocks unsafe production-like database targets before any reset work", async () => {
    process.env.FLOOT_DATABASE_URL = "postgres://app:app@db.example.invalid:5432/creditregulatorpro_prod";
    process.env.LOCAL_DATABASE_NAME = "creditregulatorpro_prod";

    const response = await resetUser(resetRequest({
      userId: 22,
      confirmEmail: "user@example.invalid",
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("non-local database hosts"),
    });
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
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
