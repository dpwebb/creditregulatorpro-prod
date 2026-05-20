import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = {
  execute?: unknown[];
  first?: unknown;
};

type DbOperation = {
  kind: "select" | "update" | "delete";
  table: string;
  method: "where" | "limit" | "set";
  args: unknown[];
};

const mocks = vi.hoisted(() => {
  class SyntheticNotAuthenticatedError extends Error {
    constructor(message = "Not authenticated") {
      super(message);
      this.name = "NotAuthenticatedError";
    }
  }

  return {
    queryQueue: [] as QueryResult[],
    operations: [] as DbOperation[],
    db: {
      selectFrom: vi.fn(),
      updateTable: vi.fn(),
      deleteFrom: vi.fn(),
    },
    getServerSessionOrThrow: vi.fn(),
    NotAuthenticatedError: SyntheticNotAuthenticatedError,
  };
});

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

vi.mock("../../helpers/getSetServerSession", () => ({
  CleanupProbability: 0.02,
  SessionExpirationSeconds: 60 * 60 * 24 * 7,
  NotAuthenticatedError: mocks.NotAuthenticatedError,
  getServerSessionOrThrow: mocks.getServerSessionOrThrow,
}));

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { NotAuthenticatedError } from "../../helpers/getSetServerSession";

function makeBuilder(table: string, kind: DbOperation["kind"], result: QueryResult = {}) {
  const builder: Record<string, any> = {};
  const chain = (method: DbOperation["method"]) =>
    vi.fn((...args: unknown[]) => {
      mocks.operations.push({ kind, table, method, args });
      return builder;
    });

  for (const method of ["where", "limit"] as const) {
    builder[method] = chain(method);
  }
  builder.set = chain("set");
  builder.select = vi.fn(() => builder);
  builder.innerJoin = vi.fn(() => builder);
  builder.leftJoin = vi.fn(() => builder);
  builder.execute = vi.fn(async () => result.execute ?? []);
  builder.executeTakeFirst = vi.fn(async () => result.first ?? null);
  return builder;
}

function installDbHarness() {
  mocks.db.selectFrom.mockImplementation((table: string) =>
    makeBuilder(table, "select", mocks.queryQueue.shift()),
  );
  mocks.db.updateTable.mockImplementation((table: string) =>
    makeBuilder(table, "update", mocks.queryQueue.shift()),
  );
  mocks.db.deleteFrom.mockImplementation((table: string) =>
    makeBuilder(table, "delete", mocks.queryQueue.shift()),
  );
}

function queueResults(...results: QueryResult[]) {
  mocks.queryQueue.push(...results);
}

function sessionRow(lastAccessed: Date, role = "user") {
  const isAdminOrSupport = role === "admin" || role === "support";
  return {
    sessionId: "synthetic-session-id",
    sessionCreatedAt: new Date("2026-05-19T10:00:00.000Z"),
    sessionLastAccessed: lastAccessed,
    id: role === "admin" ? 50 : role === "support" ? 60 : 10,
    email: `synthetic.${role}@example.invalid`,
    displayName: `Synthetic ${role}`,
    organizationId: 1000,
    role,
    avatarUrl: null,
    emailVerified: true,
    subscriptionPlan: isAdminOrSupport ? null : "basic",
    subscriptionStatus: isAdminOrSupport ? null : "active",
    subscriptionTrialEnd: null,
    termsAcceptedAt: isAdminOrSupport ? null : new Date("2026-01-01T00:00:00.000Z"),
    termsAcceptedVersion: isAdminOrSupport ? null : "terms-v1",
  };
}

function request() {
  return new Request("http://localhost/_api/auth/session", {
    headers: { cookie: "floot_built_app_session=synthetic" },
  });
}

function sessionUpdateOperations() {
  return mocks.operations.filter(
    (operation) => operation.kind === "update" && operation.table === "sessions" && operation.method === "set",
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-20T10:05:00.000Z"));
  vi.clearAllMocks();
  mocks.queryQueue.length = 0;
  mocks.operations.length = 0;
  installDbHarness();
  process.env.CRP_SESSION_TOUCH_INTERVAL_SECONDS = "300";
  vi.spyOn(Math, "random").mockReturnValue(0.99);
  mocks.getServerSessionOrThrow.mockResolvedValue({
    id: "synthetic-session-id",
    createdAt: new Date("2026-05-19T10:00:00.000Z").getTime(),
    lastAccessed: new Date("2026-05-20T09:00:00.000Z").getTime(),
  });
});

afterEach(() => {
  delete process.env.CRP_SESSION_TOUCH_INTERVAL_SECONDS;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("getServerUserSession session touch throttling", () => {
  it("does not update lastAccessed for a fresh authenticated session", async () => {
    queueResults(
      { execute: [sessionRow(new Date("2026-05-20T10:03:00.000Z"), "support")] },
      { first: { value: "terms-v1" } },
    );

    const { user, session } = await getServerUserSession(request());

    expect(user).toMatchObject({
      id: 60,
      role: "support",
      subscriptionPlan: null,
      termsAcceptedAt: new Date(0).toISOString(),
      termsAcceptedVersion: "terms-v1",
    });
    expect(session.lastAccessed).toEqual(new Date("2026-05-20T10:03:00.000Z"));
    expect(sessionUpdateOperations()).toEqual([]);
  });

  it("updates lastAccessed for a stale authenticated session", async () => {
    queueResults(
      { execute: [sessionRow(new Date("2026-05-20T09:59:59.000Z"))] },
      { first: { value: "terms-v1" } },
      {},
    );

    const { user, session } = await getServerUserSession(request());

    expect(user).toMatchObject({
      id: 10,
      role: "user",
      subscriptionPlan: "basic",
      termsAcceptedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(session.lastAccessed).toEqual(new Date("2026-05-20T10:05:00.000Z"));
    expect(sessionUpdateOperations()).toHaveLength(1);
    expect(sessionUpdateOperations()[0].args).toEqual([{ lastAccessed: new Date("2026-05-20T10:05:00.000Z") }]);
    expect(mocks.operations).toContainEqual(
      expect.objectContaining({
        kind: "update",
        table: "sessions",
        method: "where",
        args: ["id", "=", "synthetic-session-id"],
      }),
    );
  });

  it("rejects expired or otherwise invalid cookie sessions before DB lookup", async () => {
    mocks.getServerSessionOrThrow.mockRejectedValueOnce(new NotAuthenticatedError());

    await expect(getServerUserSession(request())).rejects.toThrow(NotAuthenticatedError);

    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
    expect(mocks.db.updateTable).not.toHaveBeenCalled();
  });
});
