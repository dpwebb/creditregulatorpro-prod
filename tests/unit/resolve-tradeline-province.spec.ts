import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDbState = vi.hoisted(() => ({
  results: [] as Array<any>,
  queries: [] as Array<{ table: string; whereCalls: Array<[string, string, unknown]> }>,
}));

vi.mock("../../helpers/db", () => ({
  db: {
    selectFrom: vi.fn((table: string) => {
      const record = { table, whereCalls: [] as Array<[string, string, unknown]> };
      mockDbState.queries.push(record);

      const query: any = {
        select: vi.fn(() => query),
        innerJoin: vi.fn(() => query),
        where: vi.fn((column: string, operator: string, value: unknown) => {
          record.whereCalls.push([column, operator, value]);
          return query;
        }),
        orderBy: vi.fn(() => query),
        executeTakeFirst: vi.fn(async () => mockDbState.results.shift() ?? undefined),
      };

      return query;
    }),
  },
}));

import { resolveProvinceByIds } from "../../helpers/resolveTradelineProvince";

describe("resolveProvinceByIds", () => {
  beforeEach(() => {
    mockDbState.results.length = 0;
    mockDbState.queries.length = 0;
  });

  it("resolves userAccount province by auth userId before legacy row id", async () => {
    mockDbState.results.push({ province: "ON" });

    await expect(resolveProvinceByIds(101, 202)).resolves.toBe("ON");
    expect(mockDbState.queries[0]).toEqual({
      table: "userAccount",
      whereCalls: [["userId", "=", 101]],
    });
  });

  it("falls back to legacy userAccount id lookup for older local rows", async () => {
    mockDbState.results.push(undefined, { province: "BC" });

    await expect(resolveProvinceByIds(101, 202)).resolves.toBe("BC");
    expect(mockDbState.queries[0].whereCalls).toEqual([["userId", "=", 101]]);
    expect(mockDbState.queries[1].whereCalls).toEqual([["id", "=", 101]]);
  });

  it("falls back to report artifact consumer province when account province is missing", async () => {
    mockDbState.results.push(undefined, undefined, { province: "MB" });

    await expect(resolveProvinceByIds(101, 202)).resolves.toBe("MB");
    expect(mockDbState.queries[2]).toEqual({
      table: "reportConsumerInfo",
      whereCalls: [["reportArtifactId", "=", 202]],
    });
  });
});
