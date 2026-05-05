import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    selectFrom: vi.fn(),
    insertInto: vi.fn(),
    updateTable: vi.fn(),
  },
  getServerUserSession: vi.fn(),
}));

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

import { handle as createCreditorValidation } from "../../endpoints/creditor-validation/create_POST";
import { handle as updateCreditorValidation } from "../../endpoints/creditor-validation/update_POST";

function queryBuilder(result: unknown, terminal: "executeTakeFirst" | "executeTakeFirstOrThrow") {
  const builder: Record<string, any> = {};
  ["leftJoin", "select", "selectAll", "where", "orderBy"].forEach((method) => {
    builder[method] = vi.fn(() => builder);
  });
  builder.executeTakeFirst = vi.fn().mockResolvedValue(terminal === "executeTakeFirst" ? result : undefined);
  builder.executeTakeFirstOrThrow = vi
    .fn()
    .mockResolvedValue(terminal === "executeTakeFirstOrThrow" ? result : undefined);
  return builder;
}

function request(body: unknown) {
  return new Request("http://localhost/_api/creditor-validation", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.getServerUserSession.mockResolvedValue({
    user: { id: 10, role: "user" },
  });
});

describe("creditor validation endpoint ownership", () => {
  it("blocks non-admin users from creating tests for another user's tradeline", async () => {
    mocks.db.selectFrom.mockReturnValueOnce(
      queryBuilder(
        {
          id: 123,
          userId: 20,
          highCredit: 0,
          currentBalance: 0,
          amountPastDue: 0,
          openedDate: null,
          createdAt: new Date("2026-01-01"),
          dateClosed: null,
          dateOfFirstDelinquency: null,
          status: "Open",
          scheduledMonthlyPayment: 0,
        },
        "executeTakeFirstOrThrow",
      ),
    );

    const response = await createCreditorValidation(
      request({
        tradelineId: 123,
        creditorId: 456,
        obligationType: "DATA_VALIDATION",
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.db.insertInto).not.toHaveBeenCalled();
  });

  it("blocks non-admin users from updating another user's obligation test", async () => {
    mocks.db.selectFrom.mockReturnValueOnce(
      queryBuilder(
        {
          id: 321,
          tradelineId: 123,
          tradelineUserId: 20,
          creditorId: 456,
          obligationType: "DATA_VALIDATION",
          obligationState: "CHALLENGED",
          disputeVector: "METRO2_ACCURACY",
          obligationSequence: 1,
          responseDeadline: new Date("2026-01-31"),
          responsesReceived: 0,
          escalationPath: null,
        },
        "executeTakeFirst",
      ),
    );

    const response = await updateCreditorValidation(
      request({
        id: 321,
        responseReceived: false,
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.db.updateTable).not.toHaveBeenCalled();
  });
});
