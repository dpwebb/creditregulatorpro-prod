import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = {
  execute?: unknown[];
  first?: unknown;
  firstOrThrow?: unknown;
};

type DbOperation = {
  kind: "select" | "insert" | "update";
  table: string;
  method: "where" | "values" | "set" | "limit" | "offset" | "orderBy";
  args: unknown[];
};

const mocks = vi.hoisted(() => ({
  queryQueue: [] as QueryResult[],
  operations: [] as DbOperation[],
  db: {
    selectFrom: vi.fn(),
    insertInto: vi.fn(),
    updateTable: vi.fn(),
  },
  getServerUserSession: vi.fn(),
  logUpload: vi.fn(),
  logAudit: vi.fn(),
  findOrCreateCreditor: vi.fn(),
  validateTradeline: vi.fn(),
  logValidation: vi.fn(),
  getRulesByYear: vi.fn(),
}));

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

vi.mock("../../helpers/auditLogger", () => ({
  logUpload: mocks.logUpload,
  logAudit: mocks.logAudit,
}));

vi.mock("../../helpers/creditorMatcher", () => ({
  findOrCreateCreditor: mocks.findOrCreateCreditor,
}));

vi.mock("../../helpers/metro2", () => ({
  validateTradeline: mocks.validateTradeline,
}));

vi.mock("../../helpers/metro2ValidationLogger", () => ({
  logValidation: mocks.logValidation,
}));

vi.mock("../../helpers/metro2ValidationRules", () => ({
  getRulesByYear: mocks.getRulesByYear,
}));

import { handle as approveReview } from "../../endpoints/review/approve_POST";
import { handle as createReportArtifact } from "../../endpoints/report-artifact/create_POST";
import { handle as getReportArtifact } from "../../endpoints/report-artifact/get_GET";
import { handle as listReportArtifacts } from "../../endpoints/report-artifact/list_GET";
import { handle as updateReportArtifact } from "../../endpoints/report-artifact/update_POST";
import { storeReportArtifactPdf } from "../../helpers/reportArtifactStorage";
import { NotAuthenticatedError } from "../../helpers/getSetServerSession";
import {
  getUploadRequestBodyMaxBytes,
  REPORT_ARTIFACT_UPLOAD_MAX_BYTES,
  REVIEW_APPROVE_REPORT_UPLOAD_MAX_BYTES,
} from "../../helpers/uploadPayloadValidation";

const pdfBase64 = Buffer.from("%PDF-1.4\nsynthetic report artifact bytes\n%%EOF", "utf8").toString("base64");

let storageDir: string;
let previousLocalStoragePath: string | undefined;
let previousDocumentStoragePath: string | undefined;

function currentUser(role: "admin" | "support" | "user" = "user") {
  return {
    id: 42,
    role,
    organizationId: null,
    displayName: "Synthetic User",
    email: "synthetic-storage@example.invalid",
  };
}

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
  builder.as = vi.fn(() => builder);
  builder.execute = vi.fn(async () => result.execute ?? []);
  builder.executeTakeFirst = vi.fn(async () => result.first ?? null);
  builder.executeTakeFirstOrThrow = vi.fn(async () => {
    if (result.firstOrThrow !== undefined) return result.firstOrThrow;
    if (result.first !== undefined) return result.first;
    const latestValues = [...mocks.operations]
      .reverse()
      .find((operation) => operation.kind === kind && operation.table === table && operation.method === "values");
    const latestSet = [...mocks.operations]
      .reverse()
      .find((operation) => operation.kind === kind && operation.table === table && operation.method === "set");
    return {
      id: table === "reportArtifact" ? 9901 : 8801,
      ...((latestValues?.args[0] as Record<string, unknown> | undefined) ?? {}),
      ...((latestSet?.args[0] as Record<string, unknown> | undefined) ?? {}),
    };
  });
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
}

function queueResults(...results: QueryResult[]) {
  mocks.queryQueue.push(...results);
}

function postRequest(pathname: string, body: unknown): Request {
  return new Request(`http://localhost${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function oversizedRawPostRequest(pathname: string, maxDecodedBytes: number): Request {
  return new Request(`http://localhost${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(getUploadRequestBodyMaxBytes(maxDecodedBytes) + 1),
    },
    body: "{",
  });
}

function getRequest(pathname: string): Request {
  return new Request(`http://localhost${pathname}`, { method: "GET" });
}

function insertedReportArtifactStorageUrl(): string | null {
  const operation = mocks.operations.find((entry) =>
    entry.kind === "insert" && entry.table === "reportArtifact" && entry.method === "values"
  );
  const values = operation?.args[0] as Record<string, unknown> | undefined;
  return typeof values?.storageUrl === "string" ? values.storageUrl : null;
}

function oversizedBase64For(limitBytes: number): string {
  return "A".repeat(Math.ceil((limitBytes + 1) / 3) * 4);
}

function createArtifactBody(overrides: Record<string, unknown> = {}) {
  return {
    reportDate: "2026-05-20T00:00:00.000Z",
    artifactType: "application/pdf",
    data: { fileName: "manual-report.pdf", mimeType: "application/pdf" },
    storageUrl: pdfBase64,
    sha256: null,
    expiresAt: null,
    ...overrides,
  };
}

function updateArtifactBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 9901,
    artifactType: "application/pdf",
    data: { fileName: "updated-report.pdf", mimeType: "application/pdf" },
    storageUrl: pdfBase64,
    ...overrides,
  };
}

function reviewApproveBody(overrides: Record<string, unknown> = {}) {
  return {
    reviewSessionId: randomUUID(),
    region: "CA",
    fileName: "review-report.pdf",
    mimeType: "application/pdf",
    bytesBase64: pdfBase64,
    tradelines: [],
    ...overrides,
  };
}

function updatedReportArtifactStorageUrl(): string | null {
  const operation = mocks.operations.find((entry) =>
    entry.kind === "update" && entry.table === "reportArtifact" && entry.method === "set"
  );
  const values = operation?.args[0] as Record<string, unknown> | undefined;
  return typeof values?.storageUrl === "string" ? values.storageUrl : null;
}

async function removeStorageDir() {
  if (storageDir) {
    await rm(storageDir, { recursive: true, force: true });
  }
}

describe("report artifact raw PDF storage references", () => {
  beforeEach(async () => {
    previousLocalStoragePath = process.env.LOCAL_DOCUMENT_STORAGE_PATH;
    previousDocumentStoragePath = process.env.DOCUMENT_STORAGE_PATH;
    storageDir = await mkdtemp(path.join(os.tmpdir(), "crp-report-artifact-endpoint-"));
    process.env.LOCAL_DOCUMENT_STORAGE_PATH = storageDir;
    delete process.env.DOCUMENT_STORAGE_PATH;

    mocks.queryQueue = [];
    mocks.operations = [];
    vi.clearAllMocks();
    installDbHarness();
    mocks.getServerUserSession.mockResolvedValue({ user: currentUser() });
    mocks.findOrCreateCreditor.mockResolvedValue(701);
    mocks.validateTradeline.mockReturnValue([]);
    mocks.getRulesByYear.mockReturnValue({ rules: [] });
  });

  afterEach(async () => {
    if (previousLocalStoragePath === undefined) {
      delete process.env.LOCAL_DOCUMENT_STORAGE_PATH;
    } else {
      process.env.LOCAL_DOCUMENT_STORAGE_PATH = previousLocalStoragePath;
    }
    if (previousDocumentStoragePath === undefined) {
      delete process.env.DOCUMENT_STORAGE_PATH;
    } else {
      process.env.DOCUMENT_STORAGE_PATH = previousDocumentStoragePath;
    }
    await removeStorageDir();
  });

  it("stores direct report-artifact create PDF bytes as a storage reference", async () => {
    const response = await createReportArtifact(postRequest("/_api/report-artifact/create", createArtifactBody()));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.artifact.storageUrl).toMatch(/^local:report-artifacts\/42\//);
    expect(body.artifact.storageUrl).not.toContain(pdfBase64);
    expect(insertedReportArtifactStorageUrl()).toBe(body.artifact.storageUrl);
  });

  it("rejects oversized report-artifact create bodies before persistence or storage work", async () => {
    const rawOversized = await createReportArtifact(
      oversizedRawPostRequest("/_api/report-artifact/create", REPORT_ARTIFACT_UPLOAD_MAX_BYTES),
    );

    expect(rawOversized.status).toBe(413);
    await expect(rawOversized.json()).resolves.toEqual({
      error: "Report artifact request body exceeds the 15 MB upload limit",
    });
    expect(mocks.db.insertInto).not.toHaveBeenCalled();

    const oversizedPayload = await createReportArtifact(postRequest("/_api/report-artifact/create", createArtifactBody({
      storageUrl: oversizedBase64For(REPORT_ARTIFACT_UPLOAD_MAX_BYTES),
    })));

    expect(oversizedPayload.status).toBe(400);
    await expect(oversizedPayload.json()).resolves.toEqual({
      error: "Report artifact exceeds the 15 MB upload limit",
    });
    expect(mocks.db.insertInto).not.toHaveBeenCalled();
  });

  it("rejects malformed or invalid-MIME report-artifact create uploads before persistence", async () => {
    const malformed = await createReportArtifact(postRequest("/_api/report-artifact/create", createArtifactBody({
      storageUrl: "data:application/pdf;base64,not-valid-base64!",
    })));

    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({
      error: "Report artifact data must be valid base64",
    });
    expect(mocks.db.insertInto).not.toHaveBeenCalled();

    const invalidMime = await createReportArtifact(postRequest("/_api/report-artifact/create", createArtifactBody({
      artifactType: "text/plain",
      data: { fileName: "manual-report.txt", mimeType: "text/plain" },
      storageUrl: `data:text/plain;base64,${Buffer.from("not a pdf", "utf8").toString("base64")}`,
    })));

    expect(invalidMime.status).toBe(400);
    await expect(invalidMime.json()).resolves.toEqual({
      error: "Report artifact upload must be a PDF",
    });
    expect(mocks.db.insertInto).not.toHaveBeenCalled();
  });

  it("stores direct report-artifact update PDF bytes as a storage reference", async () => {
    queueResults({ first: { id: 9901, userId: 42 } });

    const response = await updateReportArtifact(postRequest("/_api/report-artifact/update", updateArtifactBody()));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.artifact.storageUrl).toMatch(/^local:report-artifacts\/42\//);
    expect(body.artifact.storageUrl).not.toContain(pdfBase64);
    expect(updatedReportArtifactStorageUrl()).toBe(body.artifact.storageUrl);
  });

  it("rejects oversized report-artifact update bodies before ownership, persistence, or storage work", async () => {
    const rawOversized = await updateReportArtifact(
      oversizedRawPostRequest("/_api/report-artifact/update", REPORT_ARTIFACT_UPLOAD_MAX_BYTES),
    );

    expect(rawOversized.status).toBe(413);
    await expect(rawOversized.json()).resolves.toEqual({
      error: "Report artifact request body exceeds the 15 MB upload limit",
    });
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
    expect(mocks.db.updateTable).not.toHaveBeenCalled();

    const oversizedPayload = await updateReportArtifact(postRequest("/_api/report-artifact/update", updateArtifactBody({
      storageUrl: oversizedBase64For(REPORT_ARTIFACT_UPLOAD_MAX_BYTES),
    })));

    expect(oversizedPayload.status).toBe(400);
    await expect(oversizedPayload.json()).resolves.toEqual({
      error: "Report artifact exceeds the 15 MB upload limit",
    });
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
    expect(mocks.db.updateTable).not.toHaveBeenCalled();
  });

  it("rejects malformed or invalid-MIME report-artifact update uploads before ownership work", async () => {
    const malformed = await updateReportArtifact(postRequest("/_api/report-artifact/update", updateArtifactBody({
      storageUrl: "data:application/pdf;base64,not-valid-base64!",
    })));

    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({
      error: "Report artifact data must be valid base64",
    });
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
    expect(mocks.db.updateTable).not.toHaveBeenCalled();

    const invalidMime = await updateReportArtifact(postRequest("/_api/report-artifact/update", updateArtifactBody({
      artifactType: "text/plain",
      data: { fileName: "updated-report.txt", mimeType: "text/plain" },
      storageUrl: `data:text/plain;base64,${Buffer.from("not a pdf", "utf8").toString("base64")}`,
    })));

    expect(invalidMime.status).toBe(400);
    await expect(invalidMime.json()).resolves.toEqual({
      error: "Report artifact upload must be a PDF",
    });
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
    expect(mocks.db.updateTable).not.toHaveBeenCalled();
  });

  it("stores review approval report PDF bytes as a storage reference", async () => {
    queueResults({
      first: {
        userId: 42,
        email: "synthetic-storage@example.invalid",
        region: "CA",
        role: "user",
      },
    });

    const response = await approveReview(postRequest("/_api/review/approve", reviewApproveBody()));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, storageUrl: "9901", tradelineIds: [] });
    const storageUrl = insertedReportArtifactStorageUrl();
    expect(storageUrl).toMatch(/^local:report-artifacts\/42\//);
    expect(storageUrl).not.toContain(pdfBase64);
  });

  it("rejects unauthenticated review approval before reading or validating the request body", async () => {
    mocks.getServerUserSession.mockRejectedValueOnce(new NotAuthenticatedError());
    const request = postRequest("/_api/review/approve", "{");
    const textSpy = vi.spyOn(request, "text");

    const response = await approveReview(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Not authenticated" });
    expect(textSpy).not.toHaveBeenCalled();
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
    expect(mocks.db.insertInto).not.toHaveBeenCalled();
  });

  it("rejects oversized review approval payloads before persistence or storage work", async () => {
    const rawOversized = await approveReview(
      oversizedRawPostRequest("/_api/review/approve", REVIEW_APPROVE_REPORT_UPLOAD_MAX_BYTES),
    );

    expect(rawOversized.status).toBe(413);
    await expect(rawOversized.json()).resolves.toEqual({
      error: "Review approval report request body exceeds the 15 MB upload limit",
    });
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
    expect(mocks.db.insertInto).not.toHaveBeenCalled();

    const oversizedPayload = await approveReview(postRequest("/_api/review/approve", reviewApproveBody({
      bytesBase64: oversizedBase64For(REVIEW_APPROVE_REPORT_UPLOAD_MAX_BYTES),
    })));

    expect(oversizedPayload.status).toBe(400);
    await expect(oversizedPayload.json()).resolves.toEqual({
      error: "Review approval report exceeds the 15 MB upload limit",
    });
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
    expect(mocks.db.insertInto).not.toHaveBeenCalled();
  });

  it("rejects malformed or invalid-MIME review approval payloads before persistence", async () => {
    const malformed = await approveReview(postRequest("/_api/review/approve", reviewApproveBody({
      bytesBase64: "data:application/pdf;base64,not-valid-base64!",
    })));

    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({
      error: "Review approval report data must be valid base64",
    });
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
    expect(mocks.db.insertInto).not.toHaveBeenCalled();

    const invalidMime = await approveReview(postRequest("/_api/review/approve", reviewApproveBody({
      fileName: "review-report.txt",
      mimeType: "text/plain",
      bytesBase64: `data:text/plain;base64,${Buffer.from("not a pdf", "utf8").toString("base64")}`,
    })));

    expect(invalidMime.status).toBe(400);
    await expect(invalidMime.json()).resolves.toEqual({
      error: "Review approval upload must be a PDF",
    });
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
    expect(mocks.db.insertInto).not.toHaveBeenCalled();
  });

  it("resolves stored report artifact references for owner/admin get while preserving legacy inline records", async () => {
    const stored = await storeReportArtifactPdf({
      bytesBase64: pdfBase64,
      userId: 42,
      fileName: "owned-report.pdf",
      mimeType: "application/pdf",
    });
    queueResults({
      first: {
        id: 9901,
        artifactType: "credit_report",
        storageUrl: stored.storageUrl,
        reportDate: new Date("2026-05-20T00:00:00.000Z"),
        metro2Version: null,
        sha256: "synthetic-sha",
        createdAt: new Date("2026-05-20T00:00:00.000Z"),
        userId: 42,
        organizationId: null,
      },
    });

    const response = await getReportArtifact(getRequest("/_api/report-artifact/get?id=9901"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      reportArtifact: {
        id: 9901,
        storageUrl: pdfBase64,
      },
    });

    queueResults({
      first: {
        id: 9902,
        artifactType: "credit_report",
        storageUrl: pdfBase64,
        reportDate: new Date("2026-05-20T00:00:00.000Z"),
        metro2Version: null,
        sha256: "legacy-sha",
        createdAt: new Date("2026-05-20T00:00:00.000Z"),
        userId: 42,
        organizationId: null,
      },
    });

    const legacy = await getReportArtifact(getRequest("/_api/report-artifact/get?id=9902"));
    expect(legacy.status).toBe(200);
    await expect(legacy.json()).resolves.toMatchObject({
      reportArtifact: {
        id: 9902,
        storageUrl: pdfBase64,
      },
    });
  });

  it("fails only the requested artifact when stored PDF bytes are missing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    queueResults({
      first: {
        id: 9905,
        artifactType: "credit_report",
        storageUrl: "local:report-artifacts/42/missing-open.pdf",
        reportDate: new Date("2026-05-20T00:00:00.000Z"),
        metro2Version: null,
        sha256: "missing-open-sha",
        createdAt: new Date("2026-05-20T00:00:00.000Z"),
        userId: 42,
        organizationId: null,
      },
    });

    try {
      const response = await getReportArtifact(getRequest("/_api/report-artifact/get?id=9905"));

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: "Report artifact file is unavailable",
        storageStatus: "missing",
      });
      expect(warnSpy).toHaveBeenCalledWith(
        "storage_read_failed:not_found",
        expect.objectContaining({
          artifactId: 9905,
          artifactUserId: 42,
          requestUserId: 42,
          storageKey: "report-artifacts/42/missing-open.pdf",
          failureReason: "not_found",
          endpoint: "report-artifact/get",
        }),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("keeps list metadata-only for raw storage and denies non-owner raw byte retrieval", async () => {
    queueResults(
      { firstOrThrow: { total: "1" } },
      {
        execute: [{
          id: 9901,
          artifactType: "credit_report",
          reportDate: new Date("2026-05-20T00:00:00.000Z"),
          metro2Version: null,
          sha256: "synthetic-sha",
          createdAt: new Date("2026-05-20T00:00:00.000Z"),
          userId: 42,
          organizationId: null,
          region: "CA",
          tradelineId: null,
          crrgYear: null,
          expiresAt: null,
          validationRulesApplied: null,
          data: {
            fileName: "owned-report.pdf",
            parsedTradelines: [{ accountNumber: "1234567890123456", rawText: "RAW_REPORT_TEXT" }],
          },
          storageUrl: pdfBase64,
          has_storage_reference: true,
          storage_object_name: null,
          processingStatus: "completed",
          tradelineAccountNumber: "1234567890123456",
          tradelineAccountType: null,
          linkedAccountCount: "0",
          bureauName: null,
        }],
      },
    );

    const list = await listReportArtifacts(getRequest("/_api/report-artifact/list"));
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.artifacts[0]).not.toHaveProperty("storageUrl");
    expect(listBody.artifacts[0]).not.toHaveProperty("data");
    expect(listBody.artifacts[0]).not.toHaveProperty("has_storage_reference");
    expect(listBody.artifacts[0]).toHaveProperty("storageStatus", "available");
    expect(listBody.artifacts[0].tradelineAccountNumber).toBe("Account ending 3456");
    expect(JSON.stringify(listBody)).not.toContain(pdfBase64);
    expect(JSON.stringify(listBody)).not.toContain("RAW_REPORT_TEXT");
    expect(JSON.stringify(listBody)).not.toContain("1234567890123456");

    queueResults({ first: null });
    const denied = await getReportArtifact(getRequest("/_api/report-artifact/get?id=9901"));
    expect(denied.status).toBe(404);
    await expect(denied.json()).resolves.toEqual({ error: "Report artifact not found or access denied" });
  });

  it("returns an empty list for an authenticated user with no report artifacts", async () => {
    queueResults(
      { firstOrThrow: { total: "0" } },
      { execute: [] },
    );

    const response = await listReportArtifacts(getRequest("/_api/report-artifact/list"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ artifacts: [], total: 0 });
  });

  it("does not mark a listed artifact missing when derived storage aliases are absent", async () => {
    queueResults(
      { firstOrThrow: { total: "1" } },
      {
        execute: [{
          id: 9906,
          artifactType: "credit_report",
          reportDate: new Date("2026-05-20T00:00:00.000Z"),
          metro2Version: null,
          sha256: "alias-fallback-sha",
          createdAt: new Date("2026-05-20T00:00:00.000Z"),
          userId: 42,
          organizationId: null,
          region: "CA",
          tradelineId: null,
          crrgYear: null,
          expiresAt: null,
          validationRulesApplied: null,
          processingStatus: "completed",
          tradelineAccountNumber: null,
          tradelineAccountType: null,
          linkedAccountCount: "0",
          bureauName: null,
        }],
      },
    );

    const response = await listReportArtifacts(getRequest("/_api/report-artifact/list"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.artifacts[0]).toMatchObject({ id: 9906, storageStatus: "available" });
  });

  it("rejects unauthenticated report artifact list requests", async () => {
    mocks.getServerUserSession.mockRejectedValueOnce(new NotAuthenticatedError());

    const response = await listReportArtifacts(getRequest("/_api/report-artifact/list"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Not authenticated" });
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
  });

  it("keeps stale missing storage item-level while listing the user's other artifacts", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    queueResults(
      { firstOrThrow: { total: "2" } },
      {
        execute: [
          {
            id: 9903,
            artifactType: "credit_report",
            reportDate: new Date("2026-05-20T00:00:00.000Z"),
            metro2Version: null,
            sha256: "missing-sha",
            createdAt: new Date("2026-05-20T00:00:00.000Z"),
            userId: 42,
            organizationId: null,
            region: "CA",
            tradelineId: null,
            crrgYear: null,
            expiresAt: null,
            validationRulesApplied: null,
            storageUrl: "local:report-artifacts/42/missing-report.pdf",
            has_storage_reference: true,
            storage_object_name: "report-artifacts/42/missing-report.pdf",
            processingStatus: "completed",
            tradelineAccountNumber: null,
            tradelineAccountType: null,
            linkedAccountCount: "0",
            bureauName: null,
          },
          {
            id: 9904,
            artifactType: "credit_report",
            reportDate: new Date("2026-05-21T00:00:00.000Z"),
            metro2Version: null,
            sha256: "inline-sha",
            createdAt: new Date("2026-05-21T00:00:00.000Z"),
            userId: 42,
            organizationId: null,
            region: "CA",
            tradelineId: null,
            crrgYear: null,
            expiresAt: null,
            validationRulesApplied: null,
            storageUrl: pdfBase64,
            hasStorageReference: true,
            storageObjectName: null,
            processingStatus: "completed",
            tradelineAccountNumber: null,
            tradelineAccountType: null,
            linkedAccountCount: "1",
            bureauName: "TransUnion",
          },
        ],
      },
    );

    try {
      const response = await listReportArtifacts(getRequest("/_api/report-artifact/list"));

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.artifacts).toHaveLength(2);
      expect(body.artifacts[0]).toMatchObject({ id: 9903, storageStatus: "missing" });
      expect(body.artifacts[1]).toMatchObject({ id: 9904, storageStatus: "available", bureauName: "TransUnion" });
      expect(body.artifacts[0]).not.toHaveProperty("storageUrl");
      expect(warnSpy).toHaveBeenCalledWith(
        "storage_read_failed:not_found",
        expect.objectContaining({
          artifactId: 9903,
          artifactUserId: 42,
          requestUserId: 42,
          storageKey: "report-artifacts/42/missing-report.pdf",
          failureReason: "not_found",
          endpoint: "report-artifact/list",
        }),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
