import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = {
  execute?: unknown[];
  first?: unknown;
  firstOrThrow?: unknown;
};

type DbOperation = {
  kind: "select" | "insert" | "update" | "delete";
  table: string;
  method: "where" | "limit" | "offset" | "orderBy" | "select" | "selectAll" | "leftJoin";
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
  },
  getServerUserSession: vi.fn(),
  ensureParserTestAdjudicationSchema: vi.fn(),
  logRead: vi.fn(),
}));

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

vi.mock("../../helpers/parserTestAdjudicationSchema", () => ({
  ensureParserTestAdjudicationSchema: mocks.ensureParserTestAdjudicationSchema,
}));

vi.mock("../../helpers/auditLogger", () => ({
  logRead: mocks.logRead,
}));

import { handle as getConsumerSignature } from "../../endpoints/consumer-signature/get_GET";
import { handle as listConsumerSignatures } from "../../endpoints/consumer-signature/list_GET";
import { handle as exportParserTestCases } from "../../endpoints/parser-test-case/export_POST";
import { handle as getParserTestCase } from "../../endpoints/parser-test-case/get_GET";
import { handle as listParserTestCases } from "../../endpoints/parser-test-case/list_GET";

function makeBuilder(table: string, kind: DbOperation["kind"], result: QueryResult = {}) {
  const builder: Record<string, any> = {};
  const chain = (method: DbOperation["method"]) =>
    vi.fn((...args: unknown[]) => {
      mocks.operations.push({ kind, table, method, args });
      return builder;
    });

  for (const method of ["where", "limit", "offset", "orderBy", "select", "selectAll", "leftJoin"] as const) {
    builder[method] = chain(method);
  }
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
}

function queueResults(...results: QueryResult[]) {
  mocks.queryQueue.push(...results);
}

function currentUser(role: "admin" | "user" = "user", id = role === "admin" ? 1 : 10) {
  return {
    id,
    role,
    organizationId: 1000,
    displayName: `Synthetic ${role}`,
    email: `synthetic.${role}@example.invalid`,
  };
}

function getRequest(path: string) {
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: { "user-agent": "synthetic-sensitive-list-test" },
  });
}

function postRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "synthetic-sensitive-list-test",
    },
    body: JSON.stringify(body),
  });
}

function parserTestCaseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    name: "Synthetic parser case",
    description: "Synthetic metadata only.",
    expectedConsumerInfo: { fullName: "Synthetic Consumer" },
    expectedTradelines: [],
    rawExtractedText: "SYNTHETIC_RAW_EXTRACTED_TEXT_SHOULD_NOT_BE_IN_LIST",
    bureau: "TransUnion Canada",
    parserMode: "deterministic",
    allowAiFallback: false,
    stageVersion: "parser-lab-shadow",
    extractionSource: "pdf_text",
    parserContext: { sourceFileName: "synthetic.pdf" },
    adminReviewStatus: "needs_review",
    approvedConsumerInfo: null,
    approvedTradelines: null,
    adjudicationDecisions: null,
    lastRunPassed: null,
    lastRunAt: null,
    totalRuns: 0,
    createdAt: new Date("2026-05-20T00:00:00.000Z"),
    updatedAt: new Date("2026-05-20T00:00:00.000Z"),
    ...overrides,
  };
}

function signatureRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 88,
    userId: 10,
    signatureData: "data:image/png;base64,U0VOU0lUSVZFX1NJR05BVFVSRV9EQVRB",
    signatureType: "document_signing",
    isVerified: true,
    verifiedAt: new Date("2026-05-20T00:00:00.000Z"),
    verifiedBy: null,
    associatedFreezeId: null,
    metadata: { synthetic: true },
    createdAt: new Date("2026-05-20T00:00:00.000Z"),
    freezeType: null,
    freezeStatus: null,
    freezeBureauId: null,
    ...overrides,
  };
}

function expectNoRawParserText(value: unknown) {
  expect(JSON.stringify(value)).not.toContain("rawExtractedText");
  expect(JSON.stringify(value)).not.toContain("SYNTHETIC_RAW_EXTRACTED_TEXT_SHOULD_NOT_BE_IN_LIST");
}

function expectNoSignatureData(value: unknown) {
  expect(JSON.stringify(value)).not.toContain("signatureData");
  expect(JSON.stringify(value)).not.toContain("U0VOU0lUSVZFX1NJR05BVFVSRV9EQVRB");
}

function whereValues(column: string) {
  return mocks.operations
    .filter((operation) => operation.method === "where" && operation.args[0] === column)
    .map((operation) => operation.args);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queryQueue.length = 0;
  mocks.operations.length = 0;
  installDbHarness();
  mocks.getServerUserSession.mockResolvedValue({ user: currentUser("admin") });
  mocks.ensureParserTestAdjudicationSchema.mockResolvedValue(undefined);
  mocks.logRead.mockResolvedValue(undefined);
});

describe("sensitive list endpoint boundaries", () => {
  it("keeps parser-test list metadata-only while detail and export remain admin controlled", async () => {
    queueResults({ execute: [parserTestCaseRow()] }, { execute: [] });

    const list = await listParserTestCases(getRequest("/_api/parser-test-case/list"));
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.testCases).toHaveLength(1);
    expectNoRawParserText(listBody);

    mocks.operations.length = 0;
    queueResults({ first: parserTestCaseRow() });
    const detail = await getParserTestCase(getRequest("/_api/parser-test-case/get?id=42"));
    expect(detail.status).toBe(200);
    await expect(detail.json()).resolves.toMatchObject({
      testCase: expect.objectContaining({
        id: 42,
        rawExtractedText: "SYNTHETIC_RAW_EXTRACTED_TEXT_SHOULD_NOT_BE_IN_LIST",
      }),
    });

    mocks.getServerUserSession.mockResolvedValueOnce({ user: currentUser("user") });
    const deniedDetail = await getParserTestCase(getRequest("/_api/parser-test-case/get?id=42"));
    expect(deniedDetail.status).toBe(403);

    mocks.getServerUserSession.mockResolvedValueOnce({ user: currentUser("user") });
    const deniedExport = await exportParserTestCases(postRequest("/_api/parser-test-case/export", { testCaseIds: [42] }));
    expect(deniedExport.status).toBe(403);

    mocks.getServerUserSession.mockResolvedValueOnce({ user: currentUser("admin") });
    queueResults({ execute: [parserTestCaseRow({ pdfBase64: "SYNTHETIC_PDF_BASE64" })] });
    const exported = await exportParserTestCases(postRequest("/_api/parser-test-case/export", { testCaseIds: [42] }));
    expect(exported.status).toBe(200);
    await expect(exported.json()).resolves.toMatchObject({
      testCases: [expect.objectContaining({ rawExtractedText: "SYNTHETIC_RAW_EXTRACTED_TEXT_SHOULD_NOT_BE_IN_LIST" })],
    });
  });

  it("keeps consumer-signature list metadata-only and detail owner/admin controlled", async () => {
    mocks.getServerUserSession.mockResolvedValue({ user: currentUser("user", 10) });
    queueResults({ execute: [signatureRow()] });

    const list = await listConsumerSignatures(getRequest("/_api/consumer-signature/list?signatureType=document_signing"));
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.signatures).toHaveLength(1);
    expectNoSignatureData(listBody);
    expect(whereValues("consumerSignature.userId")).toContainEqual(["consumerSignature.userId", "=", 10]);

    mocks.operations.length = 0;
    queueResults({ first: signatureRow() });
    const ownerDetail = await getConsumerSignature(getRequest("/_api/consumer-signature/get?id=88"));
    expect(ownerDetail.status).toBe(200);
    await expect(ownerDetail.json()).resolves.toMatchObject({
      signature: expect.objectContaining({
        id: 88,
        signatureData: "data:image/png;base64,U0VOU0lUSVZFX1NJR05BVFVSRV9EQVRB",
      }),
    });
    expect(whereValues("consumerSignature.userId")).toContainEqual(["consumerSignature.userId", "=", 10]);

    mocks.operations.length = 0;
    mocks.getServerUserSession.mockResolvedValueOnce({ user: currentUser("user", 20) });
    queueResults({ first: null });
    const nonOwnerDetail = await getConsumerSignature(getRequest("/_api/consumer-signature/get?id=88"));
    expect(nonOwnerDetail.status).toBe(404);
    await expect(nonOwnerDetail.json()).resolves.toEqual({ error: "Signature not found" });
    expect(whereValues("consumerSignature.userId")).toContainEqual(["consumerSignature.userId", "=", 20]);

    mocks.operations.length = 0;
    mocks.getServerUserSession.mockResolvedValueOnce({ user: currentUser("admin", 1) });
    queueResults({ first: signatureRow({ userId: 10 }) });
    const adminDetail = await getConsumerSignature(getRequest("/_api/consumer-signature/get?id=88"));
    expect(adminDetail.status).toBe(200);
    await expect(adminDetail.json()).resolves.toMatchObject({
      signature: expect.objectContaining({ userId: 10 }),
    });
    expect(whereValues("consumerSignature.userId")).toEqual([]);
  });
});
