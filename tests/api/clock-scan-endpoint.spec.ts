import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = {
  execute?: unknown[];
  first?: unknown;
};

type DbOperation = {
  kind: "select" | "insert";
  table: string;
  method: "where" | "limit" | "orderBy" | "values";
  args: unknown[];
};

const mocks = vi.hoisted(() => {
  const cronToken = "test-clock-scan-token";
  return {
    cronToken,
    queryQueue: [] as QueryResult[],
    operations: [] as DbOperation[],
    db: {
      selectFrom: vi.fn(),
      insertInto: vi.fn(),
    },
    deriveCronSecret: vi.fn(() => cronToken),
    chain: vi.fn(() => "silence-window-hash"),
  };
});

const CRON_TOKEN = mocks.cronToken;

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

vi.mock("../../helpers/cronSecret", () => ({
  deriveCronSecret: mocks.deriveCronSecret,
}));

vi.mock("../../helpers/hashChain", () => ({
  chain: mocks.chain,
}));

import {
  CLOCK_SCAN_BATCH_LIMIT,
  CLOCK_SCAN_PACKET_STATUS,
} from "../../helpers/clockScanConfig";
import {
  handle,
} from "../../endpoints/clock/scan_POST";

function makeBuilder(table: string, kind: DbOperation["kind"], result: QueryResult = {}) {
  const builder: Record<string, any> = {};
  const chain = (method: DbOperation["method"]) =>
    vi.fn((...args: unknown[]) => {
      mocks.operations.push({ kind, table, method, args });
      return builder;
    });

  for (const method of ["where", "limit", "orderBy"] as const) {
    builder[method] = chain(method);
  }
  builder.values = chain("values");
  builder.select = vi.fn(() => builder);
  builder.selectAll = vi.fn(() => builder);
  builder.execute = vi.fn(async () => result.execute ?? []);
  builder.executeTakeFirst = vi.fn(async () => result.first ?? null);
  return builder;
}

function installDbHarness() {
  mocks.db.selectFrom.mockImplementation((table: string) =>
    makeBuilder(table, "select", mocks.queryQueue.shift()),
  );
  mocks.db.insertInto.mockImplementation((table: string) =>
    makeBuilder(table, "insert", mocks.queryQueue.shift()),
  );
}

function queueResults(...results: QueryResult[]) {
  mocks.queryQueue.push(...results);
}

function authorizedRequest(path = "/_api/clock/scan"): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CRON_TOKEN}`,
    },
  });
}

describe("clock scan endpoint", () => {
  beforeEach(() => {
    mocks.queryQueue.length = 0;
    mocks.operations.length = 0;
    mocks.db.selectFrom.mockReset();
    mocks.db.insertInto.mockReset();
    mocks.deriveCronSecret.mockClear();
    mocks.chain.mockClear();
    mocks.chain.mockReturnValue("silence-window-hash");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-19T12:00:00.000Z"));
    installDbHarness();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("picks up lowercase generated packets and records expired silence windows", async () => {
    queueResults(
      {
        execute: [
          {
            id: 501,
            status: "generated",
            statuteVersionId: null,
          },
        ],
      },
      {
        execute: [
          {
            id: 9001,
            packetId: 501,
            eventType: "SENT",
            at: new Date("2026-04-01T12:00:00.000Z"),
            currentHash: "sent-event-hash",
          },
        ],
      },
      { execute: [] },
    );

    const response = await handle(authorizedRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, packetsProcessed: 1 });
    expect(mocks.operations).toContainEqual({
      kind: "select",
      table: "packet",
      method: "where",
      args: ["status", "=", CLOCK_SCAN_PACKET_STATUS],
    });

    const insertValues = mocks.operations.find(
      (operation) =>
        operation.kind === "insert" &&
        operation.table === "evidenceEvent" &&
        operation.method === "values",
    )?.args[0] as Record<string, unknown>;

    expect(insertValues).toMatchObject({
      packetId: 501,
      eventType: "SILENCE_WINDOW_END",
      region: "CA",
      previousHash: "sent-event-hash",
      currentHash: "silence-window-hash",
      description: "Response window expired",
    });
    expect(mocks.chain).toHaveBeenCalledWith("sent-event-hash", {
      packetId: 501,
      eventType: "SILENCE_WINDOW_END",
      at: new Date("2026-05-19T12:00:00.000Z"),
    });
  });

  it("accepts bearer-token cron authorization and bounds the packet scan", async () => {
    queueResults({ execute: [] });

    const response = await handle(authorizedRequest());

    expect(response.status).toBe(200);
    expect(mocks.operations).toContainEqual({
      kind: "select",
      table: "packet",
      method: "orderBy",
      args: ["id", "asc"],
    });
    expect(mocks.operations).toContainEqual({
      kind: "select",
      table: "packet",
      method: "limit",
      args: [CLOCK_SCAN_BATCH_LIMIT],
    });
    expect(mocks.db.selectFrom).toHaveBeenCalledWith("packet");
  });

  it("rejects query-token cron authorization", async () => {
    const response = await handle(
      new Request(`http://localhost/_api/clock/scan?token=${CRON_TOKEN}`, {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
    expect(mocks.db.insertInto).not.toHaveBeenCalled();
  });
});
