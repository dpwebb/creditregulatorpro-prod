import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const selectQuery: Record<string, any> = {};
  selectQuery.select = vi.fn(() => selectQuery);
  selectQuery.where = vi.fn(() => selectQuery);
  selectQuery.executeTakeFirst = vi.fn();

  const insertQuery: Record<string, any> = {};
  insertQuery.values = vi.fn(() => insertQuery);
  insertQuery.execute = vi.fn();

  return {
    db: {
      selectFrom: vi.fn(() => selectQuery),
      insertInto: vi.fn(() => insertQuery),
    },
    selectQuery,
    insertQuery,
    getServerSessionOrThrow: vi.fn(),
  };
});

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

vi.mock("../../helpers/getSetServerSession", () => ({
  getServerSessionOrThrow: mocks.getServerSessionOrThrow,
}));

import { validateOrigin } from "../../helpers/domainGuard";

function requestWithOrigin(origin: string) {
  return new Request("https://api.creditregulatorpro.com/_api/test", {
    headers: {
      origin,
      "user-agent": "vitest",
      "x-forwarded-for": "203.0.113.10",
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.selectQuery.executeTakeFirst.mockResolvedValue({ value: "enforce" });
  mocks.insertQuery.execute.mockResolvedValue(undefined);
});

describe("domain guard mode", () => {
  it("uses the configured DB enforce mode instead of forcing log-only", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DOMAIN_GUARD_FORCE_LOG_ONLY", "true");
    mocks.selectQuery.executeTakeFirst.mockResolvedValue({ value: "enforce" });

    const result = await validateOrigin(requestWithOrigin("https://evil.example"));

    expect(result).toMatchObject({
      valid: false,
      origin: "https://evil.example",
      mode: "enforce",
    });
    expect(mocks.db.selectFrom).toHaveBeenCalledWith("systemSettings");
    expect(mocks.insertQuery.values).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "ORIGIN_VIOLATION: https://evil.example",
        blocked: true,
      }),
    );
  });

  it("uses the configured DB log-only mode when staging is intentionally observing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.selectQuery.executeTakeFirst.mockResolvedValue({ value: "log_only" });

    const result = await validateOrigin(requestWithOrigin("https://evil.example"));

    expect(result.mode).toBe("log_only");
    expect(mocks.insertQuery.values).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "ORIGIN_VIOLATION: https://evil.example",
        blocked: false,
      }),
    );
  });

  it("honors an explicit env mode override before DB settings", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DOMAIN_GUARD_MODE", "log_only");

    const result = await validateOrigin(requestWithOrigin("https://evil.example"));

    expect(result.mode).toBe("log_only");
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
  });
});
