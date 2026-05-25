import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = {
  execute?: unknown[];
  first?: unknown;
  firstOrThrow?: unknown;
};

type DbOperation = {
  kind: "select" | "insert" | "update" | "delete";
  table: string;
  method: "where" | "limit" | "offset" | "orderBy" | "values" | "set";
  args: unknown[];
};

const mocks = vi.hoisted(() => {
  process.env.JWT_SECRET = "synthetic-jwt-secret-for-auth-session-tests";
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
      insertInto: vi.fn(),
      updateTable: vi.fn(),
      deleteFrom: vi.fn(),
      transaction: vi.fn(),
    },
    trx: {
      selectFrom: vi.fn(),
      insertInto: vi.fn(),
      updateTable: vi.fn(),
      deleteFrom: vi.fn(),
      fn: {
        countAll: vi.fn(() => ({ as: vi.fn((alias: string) => alias) })),
        max: vi.fn(() => ({ as: vi.fn((alias: string) => alias) })),
      },
      dynamic: {
        ref: vi.fn((name: string) => ({ ref: name })),
      },
    },
    sqlExecute: vi.fn(),
    NotAuthenticatedError: SyntheticNotAuthenticatedError,
    getServerSessionOrThrow: vi.fn(),
    setServerSession: vi.fn(),
    clearServerSession: vi.fn(),
    comparePassword: vi.fn(),
    assertOriginAllowed: vi.fn(),
    getServerUserSession: vi.fn(),
    logLogin: vi.fn(),
    logLoginFailed: vi.fn(),
    logLogout: vi.fn(),
    logAudit: vi.fn(),
    listRegulationReconciliationCandidates: vi.fn(),
    listRuntimeBridgeMappings: vi.fn(),
    loggerInfo: vi.fn(),
  };
});

vi.mock("kysely", () => ({
  sql: vi.fn(() => ({ execute: mocks.sqlExecute })),
}));

vi.mock("../../helpers/getSetServerSession", () => ({
  NotAuthenticatedError: mocks.NotAuthenticatedError,
  SessionExpirationSeconds: 60 * 60 * 24 * 7,
  CleanupProbability: 0.02,
  getServerSessionOrThrow: mocks.getServerSessionOrThrow,
  setServerSession: mocks.setServerSession,
  clearServerSession: mocks.clearServerSession,
}));

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

vi.mock("bcryptjs", () => ({
  compare: mocks.comparePassword,
}));

vi.mock("../../helpers/assertOriginAllowed", () => ({
  assertOriginAllowed: mocks.assertOriginAllowed,
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

vi.mock("../../helpers/auditLogger", () => ({
  logLogin: mocks.logLogin,
  logLoginFailed: mocks.logLoginFailed,
  logLogout: mocks.logLogout,
  logAudit: mocks.logAudit,
}));

vi.mock("../../helpers/regulationReconciliationCandidateService", () => ({
  listRegulationReconciliationCandidates: mocks.listRegulationReconciliationCandidates,
}));

vi.mock("../../helpers/regulationRuntimeBridgeMappingService", () => ({
  listRuntimeBridgeMappings: mocks.listRuntimeBridgeMappings,
}));

vi.mock("../../helpers/logger", () => ({
  logger: {
    info: mocks.loggerInfo,
  },
}));

import { handle as loginWithPassword } from "../../endpoints/auth/login_with_password_POST";
import { handle as getSession } from "../../endpoints/auth/session_GET";
import { handle as logout } from "../../endpoints/auth/logout_POST";
import { handle as listReconciliationCandidates } from "../../endpoints/regulation-registry/reconciliation-candidates/list_GET";
import { handle as listRuntimeBridgeMappings } from "../../endpoints/regulation-registry/runtime-bridge/list_GET";
import { NotAuthenticatedError } from "../../helpers/getSetServerSession";

function makeBuilder(table: string, kind: DbOperation["kind"], result: QueryResult = {}) {
  const builder: Record<string, any> = {};
  const chain = (method: DbOperation["method"]) =>
    vi.fn((...args: unknown[]) => {
      mocks.operations.push({ kind, table, method, args });
      return builder;
    });

  for (const method of ["where", "limit", "offset", "orderBy"] as const) {
    builder[method] = chain(method);
  }
  builder.values = chain("values");
  builder.set = chain("set");
  builder.select = vi.fn(() => builder);
  builder.selectAll = vi.fn(() => builder);
  builder.leftJoin = vi.fn(() => builder);
  builder.innerJoin = vi.fn(() => builder);
  builder.returning = vi.fn(() => builder);
  builder.returningAll = vi.fn(() => builder);
  builder.execute = vi.fn(async () => result.execute ?? []);
  builder.executeTakeFirst = vi.fn(async () => result.first ?? null);
  builder.executeTakeFirstOrThrow = vi.fn(async () => result.firstOrThrow ?? result.first ?? {});
  return builder;
}

function installDbHarness() {
  mocks.db.selectFrom.mockImplementation((table: string) =>
    makeBuilder(table, "select", mocks.queryQueue.shift()),
  );
  mocks.db.insertInto.mockImplementation((table: string) =>
    makeBuilder(table, "insert", mocks.queryQueue.shift()),
  );
  mocks.db.updateTable.mockImplementation((table: string) =>
    makeBuilder(table, "update", mocks.queryQueue.shift()),
  );
  mocks.db.deleteFrom.mockImplementation((table: string) =>
    makeBuilder(table, "delete", mocks.queryQueue.shift()),
  );

  mocks.trx.selectFrom.mockImplementation((table: string) =>
    makeBuilder(table, "select", mocks.queryQueue.shift()),
  );
  mocks.trx.insertInto.mockImplementation((table: string) =>
    makeBuilder(table, "insert", mocks.queryQueue.shift()),
  );
  mocks.trx.updateTable.mockImplementation((table: string) =>
    makeBuilder(table, "update", mocks.queryQueue.shift()),
  );
  mocks.trx.deleteFrom.mockImplementation((table: string) =>
    makeBuilder(table, "delete", mocks.queryQueue.shift()),
  );

  mocks.db.transaction.mockReturnValue({
    execute: vi.fn(async (callback: (trx: typeof mocks.trx) => unknown) => callback(mocks.trx)),
  });
}

function queueResults(...results: QueryResult[]) {
  mocks.queryQueue.push(...results);
}

function postRequest(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "synthetic-auth-session-test",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function getRequest(path: string, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: {
      "user-agent": "synthetic-auth-session-test",
      ...headers,
    },
  });
}

function syntheticDbUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    email: "synthetic.user@example.invalid",
    displayName: "Synthetic User",
    avatarUrl: null,
    organizationId: 1000,
    role: "user",
    emailVerified: true,
    passwordHash: "$2b$12$SYNTHETIC_PASSWORD_HASH_SHOULD_NOT_APPEAR",
    subscriptionPlan: "basic",
    subscriptionStatus: "active",
    subscriptionTrialEnd: null,
    termsAcceptedAt: new Date("2026-01-01T00:00:00.000Z"),
    termsAcceptedVersion: "terms-v1",
    ...overrides,
  };
}

function syntheticSessionUser(role = "user") {
  const isAdminOrSupport = role === "admin" || role === "support";
  return {
    id: role === "admin" ? 50 : role === "support" ? 60 : 10,
    email: `synthetic.${role}@example.invalid`,
    displayName: `Synthetic ${role}`,
    avatarUrl: null,
    organizationId: 1000,
    emailVerified: true,
    role,
    subscriptionPlan: isAdminOrSupport ? null : "basic",
    subscriptionStatus: isAdminOrSupport ? null : "active",
    trialEnd: null,
    termsAcceptedAt: isAdminOrSupport ? new Date(0).toISOString() : "2026-01-01T00:00:00.000Z",
    termsAcceptedVersion: "terms-v1",
    currentTermsVersion: "terms-v1",
  };
}

function valuesFor(table: string) {
  return mocks.operations
    .filter((operation) => operation.table === table && operation.method === "values")
    .map((operation) => operation.args[0]);
}

function setFor(table: string) {
  return mocks.operations
    .filter((operation) => operation.table === table && operation.method === "set")
    .map((operation) => operation.args[0]);
}

function whereValues(column: string) {
  return mocks.operations
    .filter((operation) => operation.method === "where" && operation.args[0] === column)
    .map((operation) => operation.args);
}

function expectNoSecretLeak(value: unknown, options: { allowGenericPasswordWord?: boolean } = {}) {
  const text = JSON.stringify(value);
  if (!options.allowGenericPasswordWord) {
    expect(text).not.toMatch(/password/i);
  }
  expect(text).not.toMatch(/passwordHash|\$2[aby]\$/i);
  expect(text).not.toMatch(/JWT_SIGNING_SECRET|SYNTHETIC_JWT_SECRET|rawSessionSecret|sessionSecret/i);
  expect(text).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----|postgres(?:ql)?:\/\/|DATABASE_URL/i);
  expect(text).not.toMatch(/sk-[A-Za-z0-9]|api[_-]?key|token=|session=/i);
  expect(text).not.toContain("SYNTHETIC_PASSWORD_INPUT_SHOULD_NOT_APPEAR");
  expect(text).not.toContain("SYNTHETIC_PASSWORD_HASH_SHOULD_NOT_APPEAR");
  expect(text).not.toContain("SYNTHETIC_SESSION_COOKIE_SHOULD_NOT_APPEAR");
}

async function makeSessionCookie(id = "synthetic-session-id") {
  return `floot_built_app_session=valid.synthetic.session.${id}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queryQueue.length = 0;
  mocks.operations.length = 0;
  installDbHarness();

  vi.spyOn(Math, "random").mockReturnValue(0.99);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);

  mocks.sqlExecute.mockResolvedValue({ rows: [] });
  mocks.getServerSessionOrThrow.mockImplementation(async (request: Request) => {
    const cookie = request.headers.get("cookie") ?? "";
    const match = cookie.match(/floot_built_app_session=valid\.synthetic\.session\.([^;\s]+)/);
    if (!match) {
      throw new NotAuthenticatedError();
    }
    return {
      id: match[1],
      createdAt: new Date("2026-01-01T00:00:00.000Z").getTime(),
      lastAccessed: new Date("2026-01-01T00:00:00.000Z").getTime(),
    };
  });
  mocks.setServerSession.mockImplementation(async (response: Response, session: { id: string }) => {
    response.headers.set(
      "Set-Cookie",
      `floot_built_app_session=valid.synthetic.session.${session.id}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`,
    );
  });
  mocks.clearServerSession.mockImplementation((response: Response) => {
    response.headers.set(
      "Set-Cookie",
      "floot_built_app_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
    );
  });
  mocks.assertOriginAllowed.mockResolvedValue(undefined);
  mocks.comparePassword.mockResolvedValue(true);
  mocks.getServerUserSession.mockResolvedValue({
    user: syntheticSessionUser(),
    session: {
      id: "synthetic-session-id",
      createdAt: new Date("2026-01-01T00:00:00.000Z").getTime(),
      lastAccessed: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  mocks.logLogin.mockResolvedValue({ success: true });
  mocks.logLoginFailed.mockResolvedValue({ success: true });
  mocks.logLogout.mockResolvedValue({ success: true });
  mocks.logAudit.mockResolvedValue({ success: true });
  mocks.listRegulationReconciliationCandidates.mockResolvedValue([]);
  mocks.listRuntimeBridgeMappings.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("auth/session/logout lifecycle endpoints", () => {
  it("logs in valid synthetic credentials with a safe response and server-derived role", async () => {
    queueResults(
      { first: { failedCount: 0, lastFailedAt: null } },
      { execute: [syntheticDbUser()] },
      {},
      {},
      {},
      { first: { id: 7001 } },
      { first: { value: "terms-v1" } },
    );

    const response = await loginWithPassword(
      postRequest("/_api/auth/login_with_password", {
        email: "SYNTHETIC.USER@EXAMPLE.INVALID",
        password: "SYNTHETIC_PASSWORD_INPUT_SHOULD_NOT_APPEAR",
        role: "admin",
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user).toMatchObject({
      id: 10,
      email: "synthetic.user@example.invalid",
      displayName: "Synthetic User",
      role: "user",
      currentTermsVersion: "terms-v1",
    });
    expect(body.user).not.toHaveProperty("passwordHash");
    expect(body.user).not.toHaveProperty("sessionId");
    expect(body.user).not.toHaveProperty("token");
    expect(mocks.comparePassword).toHaveBeenCalledWith(
      "SYNTHETIC_PASSWORD_INPUT_SHOULD_NOT_APPEAR",
      "$2b$12$SYNTHETIC_PASSWORD_HASH_SHOULD_NOT_APPEAR",
    );
    expect(valuesFor("sessions")[0]).toMatchObject({ userId: 10 });
    expect(mocks.logLogin).toHaveBeenCalledWith(10, expect.any(Request));
    expect(mocks.logLoginFailed).not.toHaveBeenCalled();
    expect(mocks.assertOriginAllowed).toHaveBeenCalled();

    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toMatch(/^floot_built_app_session=/);
    expect(setCookie).toContain("HttpOnly");
    const rawCookieValue = setCookie?.split(";")[0]?.split("=")[1] ?? "";
    expect(JSON.stringify(body)).not.toContain(rawCookieValue);
    expectNoSecretLeak(body);
  });

  it("reconciles stale unverified password-login state when a completed verification token exists", async () => {
    queueResults(
      { first: { failedCount: 0, lastFailedAt: null } },
      { execute: [syntheticDbUser({ emailVerified: false })] },
      {},
      {},
      {},
      { first: { id: 7001 } },
      { first: { id: 9001 } },
      { execute: [{ id: 10 }] },
      { first: { value: "terms-v1" } },
    );

    const response = await loginWithPassword(
      postRequest("/_api/auth/login_with_password", {
        email: "synthetic.user@example.invalid",
        password: "SYNTHETIC_PASSWORD_INPUT_SHOULD_NOT_APPEAR",
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user.emailVerified).toBe(true);
    expect(setFor("users")).toContainEqual({ emailVerified: true });
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "UPDATE",
        entityType: "USER_ACCOUNT",
        entityId: 10,
        details: expect.objectContaining({
          event: "email_verification_reconciled",
          source: "password_login",
          canonicalField: "users.emailVerified",
        }),
      }),
    );
    expectNoSecretLeak(body);
  });

  it("keeps unverified password-login users unverified when no completed verification exists", async () => {
    queueResults(
      { first: { failedCount: 0, lastFailedAt: null } },
      { execute: [syntheticDbUser({ emailVerified: false })] },
      {},
      {},
      {},
      { first: { id: 7001 } },
      { first: null },
      { first: { value: "terms-v1" } },
    );

    const response = await loginWithPassword(
      postRequest("/_api/auth/login_with_password", {
        email: "synthetic.user@example.invalid",
        password: "SYNTHETIC_PASSWORD_INPUT_SHOULD_NOT_APPEAR",
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user.emailVerified).toBe(false);
    expect(setFor("users")).toEqual([]);
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expectNoSecretLeak(body);
  });

  it("rejects invalid passwords and unknown users without creating sessions or exposing hashes", async () => {
    mocks.comparePassword.mockResolvedValueOnce(false);
    queueResults(
      { first: { failedCount: 0, lastFailedAt: null } },
      { execute: [syntheticDbUser()] },
      {},
    );

    const invalidPassword = await loginWithPassword(
      postRequest("/_api/auth/login_with_password", {
        email: "synthetic.user@example.invalid",
        password: "SYNTHETIC_PASSWORD_INPUT_SHOULD_NOT_APPEAR",
      }),
    );

    expect(invalidPassword.status).toBe(401);
    const invalidBody = await invalidPassword.json();
    expect(invalidBody).toEqual({
      error: "Invalid email or password",
      message: "Invalid email or password",
    });
    expect(valuesFor("sessions")).toEqual([]);
    expect(mocks.logLoginFailed).toHaveBeenCalledWith(
      "synthetic.user@example.invalid",
      expect.any(Request),
      "Invalid password",
    );
    expectNoSecretLeak(invalidBody, { allowGenericPasswordWord: true });

    mocks.operations.length = 0;
    mocks.logLoginFailed.mockClear();
    queueResults(
      { first: { failedCount: 0, lastFailedAt: null } },
      { execute: [] },
      {},
    );

    const unknownUser = await loginWithPassword(
      postRequest("/_api/auth/login_with_password", {
        email: "unknown.synthetic@example.invalid",
        password: "SYNTHETIC_PASSWORD_INPUT_SHOULD_NOT_APPEAR",
      }),
    );

    expect(unknownUser.status).toBe(401);
    const unknownBody = await unknownUser.json();
    expect(unknownBody).toEqual({
      error: "Invalid email or password",
      message: "Invalid email or password",
    });
    expect(mocks.comparePassword).toHaveBeenCalledTimes(1);
    expect(valuesFor("sessions")).toEqual([]);
    expect(mocks.logLoginFailed).toHaveBeenCalledWith(
      "unknown.synthetic@example.invalid",
      expect.any(Request),
      "User not found",
    );
    expectNoSecretLeak(unknownBody, { allowGenericPasswordWord: true });
  });

  it("handles login lockout safely without writing a new session", async () => {
    queueResults({
      first: {
        failedCount: 5,
        lastFailedAt: new Date(Date.now() - 60 * 1000),
      },
    });

    const response = await loginWithPassword(
      postRequest("/_api/auth/login_with_password", {
        email: "locked.synthetic@example.invalid",
        password: "SYNTHETIC_PASSWORD_INPUT_SHOULD_NOT_APPEAR",
      }),
    );

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toContain("Too many failed login attempts.");
    expect(mocks.comparePassword).not.toHaveBeenCalled();
    expect(valuesFor("sessions")).toEqual([]);
    expect(mocks.logLoginFailed).toHaveBeenCalledWith(
      "locked.synthetic@example.invalid",
      expect.any(Request),
      "Account locked due to too many failed attempts",
    );
    expectNoSecretLeak(body, { allowGenericPasswordWord: true });
  });

  it("returns authenticated session summaries from server session state and refreshes the cookie", async () => {
    mocks.getServerUserSession.mockResolvedValueOnce({
      user: syntheticSessionUser("support"),
      session: {
        id: "synthetic-session-get-id",
        createdAt: new Date("2026-01-01T00:00:00.000Z").getTime(),
        lastAccessed: new Date("2026-01-02T00:00:00.000Z"),
      },
    });

    const response = await getSession(
      getRequest("/_api/auth/session", {
        cookie: "floot_built_app_session=SYNTHETIC_SESSION_COOKIE_SHOULD_NOT_APPEAR",
        "x-user-role": "admin",
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user).toMatchObject({
      id: 60,
      email: "synthetic.support@example.invalid",
      role: "support",
      subscriptionPlan: null,
      subscriptionStatus: null,
    });
    expect(body.user).not.toHaveProperty("passwordHash");
    expect(body.user).not.toHaveProperty("sessionId");
    expect(body.user).not.toHaveProperty("token");
    expect(response.headers.get("Set-Cookie")).toMatch(/^floot_built_app_session=/);
    expectNoSecretLeak(body);
  });

  it("returns safe unauthenticated responses for missing, invalid, or expired sessions", async () => {
    mocks.getServerUserSession.mockRejectedValueOnce(new NotAuthenticatedError());

    const missing = await getSession(getRequest("/_api/auth/session"));

    expect(missing.status).toBe(401);
    await expect(missing.json()).resolves.toEqual({ error: "Not authenticated" });
    expect(missing.headers.get("Set-Cookie")).toBeNull();

    mocks.getServerUserSession.mockRejectedValueOnce(new NotAuthenticatedError());
    const malformed = await getSession(
      getRequest("/_api/auth/session", {
        cookie: "floot_built_app_session=not-a-valid-session; unrelated=SYNTHETIC_SESSION_COOKIE_SHOULD_NOT_APPEAR",
      }),
    );

    expect(malformed.status).toBe(401);
    const body = await malformed.json();
    expect(body).toEqual({ error: "Not authenticated" });
    expectNoSecretLeak(body);
  });

  it("logs out a valid synthetic session, clears the cookie, and leaves user roles untouched", async () => {
    const sessionCookie = await makeSessionCookie("synthetic-logout-session-id");
    queueResults({ first: { userId: 10 } }, {});

    const response = await logout(
      postRequest("/_api/auth/logout", {}, {
        cookie: `${sessionCookie}; unrelated=synthetic`,
        "x-user-role": "admin",
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, message: "Logged out successfully" });
    expect(whereValues("id")).toContainEqual(["id", "=", "synthetic-logout-session-id"]);
    expect(mocks.db.deleteFrom).toHaveBeenCalledWith("sessions");
    expect(mocks.db.updateTable).not.toHaveBeenCalledWith("users");
    expect(mocks.logLogout).toHaveBeenCalledWith(10, expect.any(Request));
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expectNoSecretLeak(body);

    mocks.getServerUserSession.mockRejectedValueOnce(new NotAuthenticatedError());
    const subsequentSession = await getSession(
      getRequest("/_api/auth/session", {
        cookie: response.headers.get("Set-Cookie") ?? "",
      }),
    );
    expect(subsequentSession.status).toBe(401);
  });

  it("does not let malformed cookies, unrelated cookies, or client role headers bypass logout auth", async () => {
    const malformed = await logout(
      postRequest("/_api/auth/logout", {}, {
        cookie:
          "unrelated=SYNTHETIC_SESSION_COOKIE_SHOULD_NOT_APPEAR; floot_built_app_session=not-a-valid-jwt",
        "x-user-role": "admin",
      }),
    );

    expect(malformed.status).toBe(401);
    const malformedBody = await malformed.json();
    expect(malformedBody).toEqual({ error: "Not authenticated" });
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
    expect(mocks.logLogout).not.toHaveBeenCalled();
    expectNoSecretLeak(malformedBody);

    const unrelatedOnly = await logout(
      postRequest("/_api/auth/logout", {}, {
        cookie: "unrelated=SYNTHETIC_SESSION_COOKIE_SHOULD_NOT_APPEAR",
      }),
    );

    expect(unrelatedOnly.status).toBe(401);
    await expect(unrelatedOnly.json()).resolves.toEqual({ error: "Not authenticated" });
  });

  it("samples admin-only endpoint guards without allowing support, user, unauthenticated, or client-supplied role escalation", async () => {
    mocks.getServerUserSession.mockRejectedValueOnce(new NotAuthenticatedError());
    const unauthenticated = await listReconciliationCandidates(
      getRequest("/_api/regulation-registry/reconciliation-candidates/list"),
    );
    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toEqual({ error: "Not authenticated" });

    mocks.getServerUserSession.mockResolvedValueOnce({ user: syntheticSessionUser("support") });
    const support = await listReconciliationCandidates(
      getRequest("/_api/regulation-registry/reconciliation-candidates/list"),
    );
    expect(support.status).toBe(403);
    await expect(support.json()).resolves.toEqual({ error: "Forbidden: Admin access required" });

    mocks.getServerUserSession.mockResolvedValueOnce({ user: syntheticSessionUser("user") });
    const clientEscalationAttempt = await listRuntimeBridgeMappings(
      getRequest("/_api/regulation-registry/runtime-bridge/list?limit=5", {
        "x-user-role": "admin",
        "x-client-requested-role": "admin",
      }),
    );
    expect(clientEscalationAttempt.status).toBe(403);
    await expect(clientEscalationAttempt.json()).resolves.toEqual({ error: "Forbidden: Admin access required" });

    mocks.getServerUserSession.mockResolvedValueOnce({ user: syntheticSessionUser("admin") });
    mocks.listRegulationReconciliationCandidates.mockResolvedValueOnce([
      { id: 1, candidateType: "synthetic", reviewStatus: "pending" },
    ]);
    const adminCandidates = await listReconciliationCandidates(
      getRequest("/_api/regulation-registry/reconciliation-candidates/list?includeSnapshotData=false"),
    );
    expect(adminCandidates.status).toBe(200);
    await expect(adminCandidates.json()).resolves.toMatchObject({
      candidates: [expect.objectContaining({ id: 1 })],
    });

    mocks.getServerUserSession.mockResolvedValueOnce({ user: syntheticSessionUser("admin") });
    mocks.listRuntimeBridgeMappings.mockResolvedValueOnce([
      { id: 2, bridgeMode: "shadow", activationStatus: "rejected" },
    ]);
    const adminRuntimeBridge = await listRuntimeBridgeMappings(
      getRequest("/_api/regulation-registry/runtime-bridge/list?limit=5"),
    );
    expect(adminRuntimeBridge.status).toBe(200);
    await expect(adminRuntimeBridge.json()).resolves.toMatchObject({
      mappings: [expect.objectContaining({ id: 2 })],
    });

    expect(mocks.listRegulationReconciliationCandidates).toHaveBeenCalledTimes(1);
    expect(mocks.listRuntimeBridgeMappings).toHaveBeenCalledTimes(1);
  });

  it("keeps auth endpoint source boundaries away from parser, packet, regulation runtime, and override paths", () => {
    const authSources = [
      "endpoints/auth/login_with_password_POST.ts",
      "endpoints/auth/session_GET.ts",
      "endpoints/auth/logout_POST.ts",
      "helpers/getServerUserSession.tsx",
      "helpers/getSetServerSession.tsx",
      "components/ProtectedRoute.tsx",
    ]
      .map((path) => readFileSync(resolve(path), "utf8"))
      .join("\n");

    expect(authSources).not.toMatch(
      /\b(canonicalCreditReport|deterministicCreditReportPipeline|pdfTextExtractor|ocrEvidence|extractCanonical|parseCreditReport|ingestCorePipeline)\b/i,
    );
    expect(authSources).not.toMatch(
      /\b(validateDisputePacketReadiness|evaluatePacketReadiness|buildDisputePacketPreview|packetWording|directFurnisher)\b/i,
    );
    expect(authSources).not.toMatch(
      /\b(activateRuntime|activateRegistry|regulationRuntimeTruth|adminOverride)\b/i,
    );
  });
});
