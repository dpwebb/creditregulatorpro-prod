import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    selectFrom: vi.fn(),
    insertInto: vi.fn(),
  },
  getServerUserSession: vi.fn(),
}));

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

import { resolveUserSession } from "../../helpers/ingestSessionResolver";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ingest session resolver authentication", () => {
  it("does not create synthetic users when no authenticated session exists", async () => {
    mocks.getServerUserSession.mockRejectedValue(new Error("Not authenticated"));

    await expect(resolveUserSession(new Request("https://creditregulatorpro.com/_api/ingest/report"), "CA")).rejects.toThrow(
      "Not authenticated",
    );

    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
    expect(mocks.db.insertInto).not.toHaveBeenCalled();
  });
});
