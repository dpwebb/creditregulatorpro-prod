import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = {
  execute?: unknown[];
  first?: unknown;
  firstOrThrow?: unknown;
};

type DbOperation = {
  scope: "db" | "trx";
  kind: "select" | "insert" | "update" | "delete";
  table: string;
  method: "where" | "limit" | "values" | "set";
  args: unknown[];
};

const mocks = vi.hoisted(() => ({
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
  },
  assertOriginAllowed: vi.fn(),
  checkRateLimit: vi.fn(),
  generatePasswordHash: vi.fn(),
  getSubscriptionDefaults: vi.fn(),
  setServerSession: vi.fn(),
  sendGridEmail: vi.fn(),
  getAppBaseUrl: vi.fn(),
  saveConsumerIdentificationDocument: vi.fn(),
  getServerUserSession: vi.fn(),
  logAudit: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

vi.mock("../../helpers/assertOriginAllowed", () => ({
  assertOriginAllowed: mocks.assertOriginAllowed,
}));

vi.mock("../../helpers/rateLimiter", () => ({
  checkRateLimit: mocks.checkRateLimit,
  RateLimitConfig: {
    REGISTRATION: {
      maxAttempts: 5,
      windowMinutes: 60,
    },
  },
}));

vi.mock("../../helpers/generatePasswordHash", () => ({
  generatePasswordHash: mocks.generatePasswordHash,
}));

vi.mock("../../helpers/getSubscriptionDefaults", () => ({
  getSubscriptionDefaults: mocks.getSubscriptionDefaults,
}));

vi.mock("../../helpers/getSetServerSession", () => ({
  SessionExpirationSeconds: 60 * 60 * 24 * 7,
  setServerSession: mocks.setServerSession,
}));

vi.mock("../../helpers/sendGridEmail", () => ({
  sendGridEmail: mocks.sendGridEmail,
}));

vi.mock("../../helpers/getAppBaseUrl", () => ({
  getAppBaseUrl: mocks.getAppBaseUrl,
}));

vi.mock("../../helpers/consumerIdentification", () => ({
  saveConsumerIdentificationDocument: mocks.saveConsumerIdentificationDocument,
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

vi.mock("../../helpers/auditLogger", () => ({
  logAudit: mocks.logAudit,
}));

vi.mock("../../helpers/logger", () => ({
  logger: {
    info: mocks.loggerInfo,
    error: mocks.loggerError,
  },
}));

import { handle as registerWithPassword } from "../../endpoints/auth/register_with_password_POST";
import { handle as requestVerificationEmail } from "../../endpoints/auth/request_verification_email_POST";
import { handle as verifyEmail } from "../../endpoints/auth/verify_email_POST";

function makeBuilder(
  scope: DbOperation["scope"],
  table: string,
  kind: DbOperation["kind"],
  result: QueryResult = {},
) {
  const builder: Record<string, any> = {};
  const chain = (method: DbOperation["method"]) =>
    vi.fn((...args: unknown[]) => {
      mocks.operations.push({ scope, kind, table, method, args });
      return builder;
    });

  for (const method of ["where", "limit"] as const) {
    builder[method] = chain(method);
  }
  builder.values = chain("values");
  builder.set = chain("set");
  builder.select = vi.fn(() => builder);
  builder.selectAll = vi.fn(() => builder);
  builder.leftJoin = vi.fn(() => builder);
  builder.innerJoin = vi.fn(() => builder);
  builder.returning = vi.fn(() => builder);
  builder.execute = vi.fn(async () => result.execute ?? []);
  builder.executeTakeFirst = vi.fn(async () => result.first ?? null);
  builder.executeTakeFirstOrThrow = vi.fn(async () => result.firstOrThrow ?? result.first ?? {});
  return builder;
}

function installDbHarness() {
  mocks.db.selectFrom.mockImplementation((table: string) =>
    makeBuilder("db", table, "select", mocks.queryQueue.shift()),
  );
  mocks.db.insertInto.mockImplementation((table: string) =>
    makeBuilder("db", table, "insert", mocks.queryQueue.shift()),
  );
  mocks.db.updateTable.mockImplementation((table: string) =>
    makeBuilder("db", table, "update", mocks.queryQueue.shift()),
  );
  mocks.db.deleteFrom.mockImplementation((table: string) =>
    makeBuilder("db", table, "delete", mocks.queryQueue.shift()),
  );

  mocks.trx.selectFrom.mockImplementation((table: string) =>
    makeBuilder("trx", table, "select", mocks.queryQueue.shift()),
  );
  mocks.trx.insertInto.mockImplementation((table: string) =>
    makeBuilder("trx", table, "insert", mocks.queryQueue.shift()),
  );
  mocks.trx.updateTable.mockImplementation((table: string) =>
    makeBuilder("trx", table, "update", mocks.queryQueue.shift()),
  );
  mocks.trx.deleteFrom.mockImplementation((table: string) =>
    makeBuilder("trx", table, "delete", mocks.queryQueue.shift()),
  );

  mocks.db.transaction.mockReturnValue({
    execute: vi.fn(async (callback: (trx: typeof mocks.trx) => unknown) => callback(mocks.trx)),
  });
}

function queueResults(...results: QueryResult[]) {
  mocks.queryQueue.push(...results);
}

function postRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "synthetic-email-verification-test",
    },
    body: JSON.stringify(body),
  });
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

function currentUser(emailVerified = false) {
  return {
    id: 10,
    email: "synthetic.user@example.invalid",
    displayName: "Synthetic User",
    avatarUrl: null,
    organizationId: null,
    emailVerified,
    role: "user",
    subscriptionPlan: "basic",
    subscriptionStatus: "active",
    trialEnd: null,
    termsAcceptedAt: "2026-01-01T00:00:00.000Z",
    termsAcceptedVersion: "terms-v1",
    currentTermsVersion: "terms-v1",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queryQueue.length = 0;
  mocks.operations.length = 0;
  installDbHarness();

  mocks.assertOriginAllowed.mockResolvedValue(undefined);
  mocks.checkRateLimit.mockResolvedValue({ allowed: true, resetAt: null });
  mocks.generatePasswordHash.mockResolvedValue("SYNTHETIC_PASSWORD_HASH_SHOULD_NOT_APPEAR");
  mocks.getSubscriptionDefaults.mockResolvedValue({
    plan: "basic",
    status: "active",
    trialStart: new Date("2026-01-01T00:00:00.000Z"),
    trialEnd: new Date("2026-01-08T00:00:00.000Z"),
  });
  mocks.setServerSession.mockResolvedValue(undefined);
  mocks.sendGridEmail.mockResolvedValue({ success: true });
  mocks.getAppBaseUrl.mockReturnValue("http://localhost");
  mocks.saveConsumerIdentificationDocument.mockResolvedValue({ id: 1 });
  mocks.getServerUserSession.mockResolvedValue({
    user: currentUser(false),
    session: {
      id: "synthetic-session-id",
      createdAt: Date.parse("2026-01-01T00:00:00.000Z"),
      lastAccessed: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  mocks.logAudit.mockResolvedValue({ success: true });
});

describe("email verification auth flow", () => {
  it("starts new password signups unverified and creates an unverified confirmation token", async () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    queueResults(
      { execute: [] },
      { first: { value: "terms-v1" } },
      {
        execute: [{
          id: 10,
          email: "synthetic.user@example.invalid",
          displayName: "Synthetic User",
          organizationId: null,
          emailVerified: false,
          createdAt,
        }],
      },
      {},
      {},
      { execute: [] },
      {},
      {},
      {},
    );

    const response = await registerWithPassword(
      postRequest("/_api/auth/register_with_password", {
        email: "synthetic.user@example.invalid",
        password: "ValidPass1",
        displayName: "Synthetic User",
        termsAccepted: true,
        dataConsentAccepted: true,
        legalNameSignature: "Synthetic User",
        identificationFileName: "id.png",
        identificationFileType: "image/png",
        identificationFileDataBase64: "data:image/png;base64,SYNTHETIC",
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user.emailVerified).toBe(false);
    expect(valuesFor("users")[0]).toMatchObject({
      email: "synthetic.user@example.invalid",
      role: "user",
      emailVerified: false,
    });
    expect(valuesFor("emailVerificationTokens")[0]).toMatchObject({
      userId: 10,
      verified: false,
    });
    expect(mocks.sendGridEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "synthetic.user@example.invalid",
        subject: "Verify your email for Credit Regulator Pro",
      }),
    );
  });

  it("marks the canonical user state verified when a fresh confirmation token is completed", async () => {
    queueResults(
      {
        first: {
          id: 200,
          userId: 10,
          token: "synthetic-token",
          verified: false,
          expiresAt: new Date("2999-01-01T00:00:00.000Z"),
        },
      },
      {},
      {},
    );

    const response = await verifyEmail(
      postRequest("/_api/auth/verify_email", { token: "synthetic-token" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
    expect(setFor("emailVerificationTokens")).toContainEqual({ verified: true });
    expect(setFor("users")).toContainEqual({ emailVerified: true });
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "UPDATE",
        entityType: "USER_ACCOUNT",
        entityId: 10,
        details: expect.objectContaining({
          event: "email_verified",
          source: "verification_token",
          canonicalField: "users.emailVerified",
        }),
      }),
    );
  });

  it("repairs stale canonical state when an already completed token is replayed", async () => {
    queueResults(
      {
        first: {
          id: 200,
          userId: 10,
          token: "synthetic-token",
          verified: true,
          expiresAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      },
      { first: { id: 200 } },
      { execute: [{ id: 10 }] },
    );

    const response = await verifyEmail(
      postRequest("/_api/auth/verify_email", { token: "synthetic-token" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
    expect(setFor("users")).toContainEqual({ emailVerified: true });
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          event: "email_verification_reconciled",
          source: "verify_email_token_replay",
        }),
      }),
    );
  });

  it("still sends resend verification email for genuinely unverified users", async () => {
    queueResults(
      { first: null },
      {},
    );

    const response = await requestVerificationEmail(
      postRequest("/_api/auth/request_verification_email", {}),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      message: "Verification email sent.",
    });
    expect(valuesFor("emailVerificationTokens")[0]).toMatchObject({
      userId: 10,
      verified: false,
    });
    expect(mocks.sendGridEmail).toHaveBeenCalledTimes(1);
  });

  it("does not send another verification email when stale state can be reconciled from a completed token", async () => {
    queueResults(
      { first: { id: 200 } },
      { execute: [{ id: 10 }] },
    );

    const response = await requestVerificationEmail(
      postRequest("/_api/auth/request_verification_email", {}),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      message: "Email is already verified.",
    });
    expect(valuesFor("emailVerificationTokens")).toEqual([]);
    expect(mocks.sendGridEmail).not.toHaveBeenCalled();
    expect(setFor("users")).toContainEqual({ emailVerified: true });
  });
});
