import { beforeEach, describe, expect, it, vi } from "vitest";

import { BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { NotAuthenticatedError } from "../../helpers/getSetServerSession";

type SqlResult = { rows: unknown[] };

const mocks = vi.hoisted(() => {
  const sqlExecuteQueue: SqlResult[] = [];

  return {
    db: {},
    ensureAiAssistRunSchema: vi.fn(),
    getServerUserSession: vi.fn(),
    sqlExecuteQueue,
    sql: vi.fn(() => ({
      execute: vi.fn(async () => sqlExecuteQueue.shift() ?? { rows: [] }),
    })),
  };
});

vi.mock("kysely", () => ({
  sql: mocks.sql,
}));

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

vi.mock("../../helpers/aiAssistRunStore", () => ({
  ensureAiAssistRunSchema: mocks.ensureAiAssistRunSchema,
}));

import { handle as listAiAssistFindings } from "../../endpoints/admin/ai-assist/findings_GET";
import { handle as listAiAssistRuns } from "../../endpoints/admin/ai-assist/runs_GET";
import { requireAdminUser } from "../../helpers/requireAdminUser";

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

function queueSqlResults(...results: SqlResult[]) {
  mocks.sqlExecuteQueue.push(...results);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sqlExecuteQueue.length = 0;
  mocks.getServerUserSession.mockResolvedValue({ user: currentUser("admin") });
  mocks.ensureAiAssistRunSchema.mockResolvedValue(undefined);
});

describe("requireAdminUser", () => {
  it("returns the canonical server session for admin users", async () => {
    const session = {
      user: currentUser("admin"),
      session: { id: "session-admin", createdAt: 1, lastAccessed: 1 },
    };
    mocks.getServerUserSession.mockResolvedValueOnce(session);

    await expect(requireAdminUser(getRequest("/_api/admin/ai-assist/runs"))).resolves.toBe(session);
  });

  it("rejects non-admin users with the existing admin privilege status and message", async () => {
    mocks.getServerUserSession.mockResolvedValueOnce({ user: currentUser("support") });

    await expect(requireAdminUser(getRequest("/_api/admin/ai-assist/runs"))).rejects.toMatchObject({
      name: "BusinessRuleError",
      message: "Admin privileges required",
      statusCode: 403,
    } satisfies Partial<BusinessRuleError>);
  });

  it("preserves canonical unauthenticated session failures", async () => {
    const unauthenticated = new NotAuthenticatedError();
    mocks.getServerUserSession.mockRejectedValueOnce(unauthenticated);

    await expect(requireAdminUser(getRequest("/_api/admin/ai-assist/runs"))).rejects.toBe(unauthenticated);
  });
});

describe("admin AI assist endpoint authorization", () => {
  it("keeps migrated read-only endpoints closed to unauthenticated users before SQL work", async () => {
    mocks.getServerUserSession.mockRejectedValueOnce(new NotAuthenticatedError());

    const response = await listAiAssistRuns(getRequest("/_api/admin/ai-assist/runs"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Not authenticated" });
    expect(mocks.ensureAiAssistRunSchema).not.toHaveBeenCalled();
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("keeps migrated read-only endpoints closed to non-admin users before SQL work", async () => {
    mocks.getServerUserSession.mockResolvedValueOnce({ user: currentUser("user") });

    const response = await listAiAssistFindings(getRequest("/_api/admin/ai-assist/findings"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Admin privileges required" });
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("allows admins to list recent AI assist runs with the existing response shape", async () => {
    queueSqlResults(
      {
        rows: [
          {
            id: 9001,
            featureKey: "ai.consumer_explanation_assist",
            subjectType: "finding",
            subjectId: 7001,
            userId: 101,
            provider: "disabled",
            model: null,
            status: "disabled",
            inputHash: "hash-001",
            outputJson: null,
            errorCode: null,
            createdAt: new Date("2026-05-01T12:00:00.000Z"),
          },
        ],
      },
      { rows: [{ total: 1 }] },
    );

    const response = await listAiAssistRuns(getRequest("/_api/admin/ai-assist/runs?limit=5&offset=0"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.ensureAiAssistRunSchema).toHaveBeenCalledTimes(1);
    expect(body).toEqual({
      runs: [
        {
          id: 9001,
          featureKey: "ai.consumer_explanation_assist",
          subjectType: "finding",
          subjectId: 7001,
          userId: 101,
          provider: "disabled",
          model: null,
          status: "disabled",
          inputHash: "hash-001",
          outputJson: null,
          errorCode: null,
          createdAt: "2026-05-01T12:00:00.000Z",
        },
      ],
      total: 1,
    });
  });

  it("allows admins to look up findings with existing masking and pagination shape", async () => {
    queueSqlResults(
      {
        rows: [
          {
            id: 8001,
            tradelineId: 7001,
            userId: 101,
            userEmail: "consumer@example.invalid",
            userDisplayName: "Synthetic Consumer",
            creditorName: "Synthetic Bank",
            bureauName: "Equifax",
            accountType: "Credit Card",
            accountNumber: "4111 2222 3333 6789",
            violationCategory: "INACCURATE_BALANCE",
            userStatus: "NEEDS_REVIEW",
            detectedAt: new Date("2026-05-02T12:00:00.000Z"),
          },
        ],
      },
      { rows: [{ total: 1 }] },
    );

    const response = await listAiAssistFindings(
      getRequest("/_api/admin/ai-assist/findings?q=consumer&limit=5&offset=0"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      findings: [
        {
          id: 8001,
          tradelineId: 7001,
          userId: 101,
          userEmail: "consumer@example.invalid",
          userDisplayName: "Synthetic Consumer",
          creditorName: "Synthetic Bank",
          bureauName: "Equifax",
          accountType: "Credit Card",
          accountNumberMasked: "ending in 6789",
          violationCategory: "INACCURATE_BALANCE",
          userStatus: "NEEDS_REVIEW",
          detectedAt: "2026-05-02T12:00:00.000Z",
        },
      ],
      total: 1,
    });
    expect(typeof body.findings[0].displayLabel).toBe("string");
  });
});
