import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    transaction: vi.fn(),
  },
  getServerUserSession: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

vi.mock("../../helpers/auditLogger", () => ({
  logAudit: mocks.logAudit,
}));

import { handle as updateAdminSettings } from "../../endpoints/admin/settings_POST";

function settingsRequest(settings: Array<{ key: string; value: string }>) {
  return new Request("http://localhost/_api/admin/settings", {
    method: "POST",
    body: JSON.stringify({ settings }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.getServerUserSession.mockResolvedValue({
    user: { id: 10, role: "admin" },
  });
});

describe("admin settings validation", () => {
  it("rejects malformed postal pricing before writing to the database", async () => {
    const invalidBaseCost = await updateAdminSettings(
      settingsRequest([{ key: "postgrid_base_cost", value: "not-a-number" }]),
    );

    expect(invalidBaseCost.status).toBe(400);
    await expect(invalidBaseCost.json()).resolves.toMatchObject({
      error: expect.stringContaining("postgrid_base_cost"),
    });

    const invalidSurcharge = await updateAdminSettings(
      settingsRequest([{ key: "postgrid_surcharge_rate", value: "1.5" }]),
    );

    expect(invalidSurcharge.status).toBe(400);
    await expect(invalidSurcharge.json()).resolves.toMatchObject({
      error: expect.stringContaining("postgrid_surcharge_rate"),
    });
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });
});
