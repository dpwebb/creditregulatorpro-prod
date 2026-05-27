import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotAuthenticatedError } from "../../helpers/getSetServerSession";

type QueryResult = {
  execute?: unknown[];
  first?: unknown;
};

const mocks = vi.hoisted(() => ({
  getServerUserSession: vi.fn(),
  queryQueue: [] as QueryResult[],
  selectTables: [] as string[],
  db: {
    selectFrom: vi.fn(),
    fn: {
      count: vi.fn(() => ({ as: vi.fn((alias: string) => alias) })),
    },
  },
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

import { handle as getAdminUserDetail } from "../../endpoints/admin/user-detail_GET";
import { handle as getAdminUsers } from "../../endpoints/admin/users_GET";

function currentUser(role: "admin" | "support" | "user" = "admin") {
  return {
    id: role === "admin" ? 101 : role === "support" ? 202 : 303,
    role,
    email: `synthetic.${role}@example.invalid`,
  };
}

function getRequest(path: string) {
  return new Request(`http://localhost${path}`, { method: "GET" });
}

function queueResults(...results: QueryResult[]) {
  mocks.queryQueue.push(...results);
}

function makeSelectBuilder(table: string, result: QueryResult = {}) {
  const builder: Record<string, any> = {};
  for (const method of ["select", "selectAll", "leftJoin", "innerJoin", "where", "orderBy", "limit", "offset"] as const) {
    builder[method] = vi.fn(() => builder);
  }
  builder.execute = vi.fn(async () => result.execute ?? []);
  builder.executeTakeFirst = vi.fn(async () => result.first ?? null);
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queryQueue.length = 0;
  mocks.selectTables.length = 0;
  mocks.getServerUserSession.mockResolvedValue({ user: currentUser("admin") });
  mocks.db.selectFrom.mockImplementation((table: string) => {
    mocks.selectTables.push(table);
    return makeSelectBuilder(table, mocks.queryQueue.shift());
  });
});

describe("admin users read endpoints", () => {
  it("rejects unauthenticated admin users list requests before DB work", async () => {
    mocks.getServerUserSession.mockRejectedValueOnce(new NotAuthenticatedError());

    const response = await getAdminUsers(getRequest("/_api/admin/users"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Not authenticated" });
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
  });

  it("rejects non-admin admin users list requests before DB work", async () => {
    mocks.getServerUserSession.mockResolvedValueOnce({ user: currentUser("support") });

    const response = await getAdminUsers(getRequest("/_api/admin/users"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Admin privileges required" });
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
  });

  it("allows admins to list users with the existing response shape", async () => {
    queueResults(
      {
        execute: [
          {
            id: 501,
            email: "consumer@example.invalid",
            displayName: "Synthetic Consumer",
            role: "user",
            createdAt: new Date("2026-05-01T10:00:00.000Z"),
            emailVerified: true,
            avatarUrl: null,
            fullName: "Synthetic Consumer",
            tradelinesCount: "2",
            packetsCount: "3",
            evidenceEventsCount: "4",
            reportArtifactsCount: "1",
            subscriptionPlan: "monthly",
            subscriptionStatus: "active",
          },
        ],
      },
      { first: { count: "1" } },
    );

    const response = await getAdminUsers(getRequest("/_api/admin/users?limit=10&offset=0"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      users: [
        {
          id: 501,
          email: "consumer@example.invalid",
          displayName: "Synthetic Consumer",
          role: "user",
          createdAt: "2026-05-01T10:00:00.000Z",
          emailVerified: true,
          avatarUrl: null,
          fullName: "Synthetic Consumer",
          tradelinesCount: 2,
          packetsCount: 3,
          evidenceEventsCount: 4,
          reportArtifactsCount: 1,
          subscriptionPlan: "monthly",
          subscriptionStatus: "active",
        },
      ],
      total: 1,
    });
    expect(mocks.selectTables).toEqual(["users", "users"]);
  });

  it("rejects unauthenticated user-detail requests before DB work", async () => {
    mocks.getServerUserSession.mockRejectedValueOnce(new NotAuthenticatedError());

    const response = await getAdminUserDetail(getRequest("/_api/admin/user-detail?userId=501"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Not authenticated" });
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
  });

  it("rejects non-admin user-detail requests before DB work", async () => {
    mocks.getServerUserSession.mockResolvedValueOnce({ user: currentUser("user") });

    const response = await getAdminUserDetail(getRequest("/_api/admin/user-detail?userId=501"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Admin privileges required" });
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
  });

  it("allows admins to access an existing user detail", async () => {
    queueResults(
      {
        first: {
          id: 501,
          email: "consumer@example.invalid",
          displayName: "Synthetic Consumer",
          role: "user",
          emailVerified: true,
          avatarUrl: null,
          createdAt: new Date("2026-05-01T10:00:00.000Z"),
        },
      },
      {
        first: {
          plan: "monthly",
          status: "active",
          trialStart: new Date("2026-05-01T10:00:00.000Z"),
          trialEnd: new Date("2026-05-08T10:00:00.000Z"),
          currentPeriodStart: null,
          currentPeriodEnd: null,
          priceCad: "29.00",
          stripeCustomerId: "cus_synthetic",
        },
      },
      {
        execute: [
          {
            id: 701,
            accountNumber: "1234",
            linkedCreditorName: "Synthetic Bank",
            originalCreditorName: null,
            status: "open",
            bureauName: "Equifax",
            balance: "100.00",
            openedDate: null,
            lastReportedDate: null,
          },
        ],
      },
      {
        execute: [
          {
            id: 801,
            status: "draft",
            type: "direct",
            createdAt: null,
            tradelineAccountNumber: "1234",
            creditorName: "Synthetic Bank",
            originalCreditorName: null,
            terminalLabel: null,
            deliveryMethod: null,
            violationCategory: "INACCURATE_BALANCE",
            obligationType: "DISPUTE",
          },
        ],
      },
      {
        execute: [
          {
            id: 901,
            artifactType: "credit_report",
            createdAt: null,
            reportDate: null,
            region: "CA",
          },
        ],
      },
      {
        execute: [
          {
            id: 1001,
            actionType: "UPDATE",
            entityType: "USER_ACCOUNT",
            entityId: 501,
            timestamp: new Date("2026-05-02T10:00:00.000Z"),
            status: "SUCCESS",
            details: { action: "synthetic" },
          },
        ],
      },
    );

    const response = await getAdminUserDetail(getRequest("/_api/admin/user-detail?userId=501"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      user: {
        id: 501,
        email: "consumer@example.invalid",
        displayName: "Synthetic Consumer",
        role: "user",
      },
      subscription: {
        plan: "monthly",
        status: "active",
      },
      tradelines: [
        {
          id: 701,
          creditorName: "Synthetic Bank",
          bureauName: "Equifax",
        },
      ],
      packets: [
        {
          id: 801,
          violationCategory: "INACCURATE_BALANCE",
        },
      ],
      reportArtifacts: [{ id: 901, artifactType: "credit_report" }],
      recentActivity: [{ id: 1001, actionType: "UPDATE" }],
    });
    expect(mocks.selectTables).toEqual([
      "users",
      "subscriptions",
      "tradeline",
      "packet",
      "reportArtifact",
      "auditLog",
    ]);
  });

  it("keeps missing user-detail requests returning 404 for admins", async () => {
    queueResults({ first: null });

    const response = await getAdminUserDetail(getRequest("/_api/admin/user-detail?userId=999"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "User not found" });
    expect(mocks.selectTables).toEqual(["users"]);
  });
});
