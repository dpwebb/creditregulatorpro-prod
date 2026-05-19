import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotAuthenticatedError } from "../../helpers/getSetServerSession";
import {
  BUREAU_COMMUNICATION_UPLOAD_MAX_BYTES,
  EVIDENCE_ATTACHMENT_UPLOAD_MAX_BYTES,
} from "../../helpers/uploadPayloadValidation";

type QueryResult = {
  execute?: unknown[];
  first?: unknown;
  firstOrThrow?: unknown;
};

type DbOperation = {
  kind: "select" | "insert" | "update" | "delete";
  table: string;
  method: "where" | "limit" | "offset" | "orderBy" | "values" | "set";
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
  getServerUserSession: vi.fn(),
  checkRateLimit: vi.fn(),
  getEvidenceAttachments: vi.fn(),
  uploadEvidence: vi.fn(),
  generateEvidencePackage: vi.fn(),
  uploadFile: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

vi.mock("../../helpers/rateLimiter", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock("../../helpers/evidenceManager", () => ({
  getEvidenceAttachments: mocks.getEvidenceAttachments,
  uploadEvidence: mocks.uploadEvidence,
  generateEvidencePackage: mocks.generateEvidencePackage,
}));

vi.mock("../../helpers/gcsStorage", () => ({
  uploadFile: mocks.uploadFile,
}));

vi.mock("../../helpers/auditLogger", () => ({
  logAudit: mocks.logAudit,
}));

import { handle as listEvidence } from "../../endpoints/evidence/list_GET";
import { handle as createEvidence } from "../../endpoints/evidence/create_POST";
import { handle as updateEvidence } from "../../endpoints/evidence/update_POST";
import { handle as deleteEvidenceEvent } from "../../endpoints/evidence/delete_POST";
import { handle as recordBureauCommunication } from "../../endpoints/evidence/bureau-communication_POST";
import { handle as listAttachments } from "../../endpoints/evidence-attachment/list_GET";
import { handle as uploadAttachment } from "../../endpoints/evidence-attachment/upload_POST";
import { handle as packageEvidence } from "../../endpoints/evidence-attachment/package_POST";
import { handle as getPacket } from "../../endpoints/packet/get_GET";
import { handle as listViolations } from "../../endpoints/creditor-validation/list_GET";

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
  builder.forUpdate = vi.fn(() => builder);
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
  mocks.db.transaction.mockReturnValue({
    execute: vi.fn(async (callback: (trx: typeof mocks.db) => unknown) => callback(mocks.db)),
  });
}

function queueResults(...results: QueryResult[]) {
  mocks.queryQueue.push(...results);
}

function getRequest(path: string) {
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: { "user-agent": "synthetic-evidence-privacy-test" },
  });
}

function postRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "synthetic-evidence-privacy-test" },
    body: JSON.stringify(body),
  });
}

function currentUser(role = "user") {
  return {
    id: 10,
    role,
    organizationId: 1000,
    displayName: "Synthetic User",
    email: "synthetic@example.invalid",
  };
}

function evidenceEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 501,
    packetId: 601,
    eventType: "SYNTHETIC_EVIDENCE_EVENT",
    description: "Synthetic evidence event with compact metadata only.",
    statuteVersionId: null,
    previousHash: "a".repeat(64),
    currentHash: "b".repeat(64),
    organizationId: 1000,
    region: "CA",
    at: new Date("2026-01-01T00:00:00.000Z"),
    packetStatus: "generated",
    tradelineId: 701,
    tradelineAccountNumber: "SYN-****-0001",
    ...overrides,
  };
}

function attachment(overrides: Record<string, unknown> = {}) {
  return {
    id: 801,
    obligationInstanceId: 901,
    packetId: 601,
    fileName: "synthetic-evidence.pdf",
    fileType: "application/pdf",
    fileSizeBytes: 128,
    storageUrl:
      "local:evidence/10/SYNTHETIC_PRIVATE_STORAGE_PATH_SHOULD_NOT_APPEAR?X-Goog-Signature=secret",
    description: "Synthetic attachment metadata only.",
    uploadedBy: 10,
    region: "CA",
    uploadedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function attachmentUploadBody(overrides: Record<string, unknown> = {}) {
  return {
    packetId: 601,
    fileName: "synthetic-evidence.pdf",
    fileType: "application/pdf",
    fileDataBase64: "data:application/pdf;base64,U1lOVEhFVElDX0ZJTEVfQllURVM=",
    description: "Synthetic supporting document.",
    ...overrides,
  };
}

function oversizedBase64For(limitBytes: number) {
  return "A".repeat(Math.ceil((limitBytes + 1) / 3) * 4);
}

function violationWithEvidenceLocation(overrides: Record<string, unknown> = {}) {
  return {
    id: 301,
    creditorId: 401,
    obligationType: "SYNTHETIC_OBLIGATION",
    obligationState: "ACTIVE",
    obligationSequence: "synthetic-sequence",
    disputeVector: "SYNTHETIC_VECTOR",
    lastChallengeDate: null,
    responseDeadline: null,
    responsesReceived: 0,
    metro2Version: "synthetic",
    statutoryBasis: "Synthetic reference only",
    severity: "HIGH",
    omissions: [],
    validationStatus: "PENDING",
    escalationPath: "NONE",
    notes: "Synthetic endpoint fixture.",
    lastTestDate: null,
    tradelineId: 701,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    violationCategory: "SYNTHETIC_EVIDENCE_REFERENCE",
    confidenceScore: 0.98,
    autoGenerated: true,
    userExplanation: "Synthetic explanation with compact evidence metadata.",
    technicalDetails: {
      province: "ON",
      evidenceLocation: {
        pageNumber: 2,
        boundingBox: { x: 12, y: 24, width: 36, height: 48 },
        coordinateSource: "pdfjs",
        field: "balance",
        sourceTextHash: "c".repeat(64),
      },
    },
    recommendedAction: "Review the synthetic evidence reference.",
    detectedAt: new Date("2026-01-01T00:00:00.000Z"),
    userStatus: "active",
    userStatusReason: null,
    userStatusUpdatedAt: null,
    creditorName: "Synthetic Creditor",
    tradelineAccountNumber: "SYN-****-0001",
    tradelineDisplayStatus: "open",
    tradelineCurrentBalance: "100.00",
    tradelineBalance: "100.00",
    tradelineBureauName: "Synthetic Bureau",
    tradelineAccountType: "revolving",
    tradelineCollectionAgencyName: null,
    tradelineOriginalCreditorName: null,
    tradelineIsCollectionAccount: false,
    tradelineStatus: "open",
    tradelineDateClosed: null,
    tradelineDatePaidSettled: null,
    ...overrides,
  };
}

function bureauCommunicationBody(overrides: Record<string, unknown> = {}) {
  return {
    tradelineId: 701,
    fileName: "synthetic-bureau-response.pdf",
    fileType: "application/pdf",
    fileDataBase64: "U1lOVEhFVElDX0JVUkVBVV9SRVNQT05TRQ==",
    communicationType: "BUREAU_RESPONSE_RECEIVED",
    description: "Synthetic bureau response.",
    ...overrides,
  };
}

function expectNoSensitiveLeak(value: unknown, options: { allowLocalStorageUrl?: boolean } = {}) {
  const text = JSON.stringify(value);
  expect(text).not.toMatch(/\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/);
  expect(text).not.toMatch(/\b(?:\d[ -]?){12,19}\b/);
  expect(text).not.toMatch(/rawExtractedText|rawReportText|sourceText":|fullSin|socialInsurance/i);
  expect(text).not.toMatch(/X-Goog-|AWSAccessKeyId|Signature=|session=|sk-[A-Za-z0-9]|privateKey/i);
  expect(text).not.toContain("SYNTHETIC_RAW_REPORT_TEXT_SHOULD_NOT_APPEAR");
  expect(text).not.toContain("SYNTHETIC_FULL_ACCOUNT_SHOULD_NOT_APPEAR");
  expect(text).not.toContain("SYNTHETIC_PRIVATE_BUCKET");
  if (!options.allowLocalStorageUrl) {
    expect(text).not.toContain("SYNTHETIC_PRIVATE_STORAGE_PATH_SHOULD_NOT_APPEAR");
    expect(text).not.toContain("local:evidence/");
  }
}

function whereValues(column: string) {
  return mocks.operations
    .filter((operation) => operation.method === "where" && operation.args[0] === column)
    .map((operation) => operation.args);
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queryQueue.length = 0;
  mocks.operations.length = 0;
  installDbHarness();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);

  mocks.getServerUserSession.mockResolvedValue({ user: currentUser() });
  mocks.checkRateLimit.mockResolvedValue({ allowed: true });
  mocks.getEvidenceAttachments.mockResolvedValue([attachment()]);
  mocks.uploadFile.mockResolvedValue("local:evidence/10/1234567890-synthetic-evidence.pdf");
  mocks.uploadEvidence.mockResolvedValue({
    ...attachment({
      storageUrl: "local:evidence/10/1234567890-synthetic-evidence.pdf",
    }),
  });
  mocks.generateEvidencePackage.mockResolvedValue({
    pdfBuffer: Buffer.from("%PDF-synthetic-evidence-package"),
    fileName: "Evidence_Package_901_20260517.pdf",
  });
  mocks.logAudit.mockResolvedValue({ success: true });
});

describe("evidence privacy and ownership endpoints", () => {
  it("denies unauthenticated evidence access before querying evidence records", async () => {
    mocks.getServerUserSession.mockRejectedValueOnce(new NotAuthenticatedError());

    const response = await listEvidence(getRequest("/_api/evidence/list"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Not authenticated" });
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
  });

  it("lists owner-scoped evidence events with supported filters and compact metadata", async () => {
    queueResults({ firstOrThrow: { total: "1" } }, { execute: [evidenceEvent()] });

    const response = await listEvidence(getRequest("/_api/evidence/list?tradelineId=701&limit=5&offset=1"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      total: 1,
      events: [
        expect.objectContaining({
          id: 501,
          packetId: 601,
          eventType: "SYNTHETIC_EVIDENCE_EVENT",
          packetStatus: "generated",
          tradelineId: 701,
          tradelineAccountNumber: "SYN-****-0001",
        }),
      ],
    });
    expect(whereValues("packet.tradelineId")).toContainEqual(["packet.tradelineId", "=", 701]);
    expect(whereValues("packet.userId")).toContainEqual(["packet.userId", "=", 10]);
    expect(mocks.operations).toContainEqual(expect.objectContaining({ method: "limit", args: [5] }));
    expect(mocks.operations).toContainEqual(expect.objectContaining({ method: "offset", args: [1] }));
    expectNoSensitiveLeak(body);
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("treats admin as cross-owner capable and support as non-admin scoped for evidence events", async () => {
    mocks.getServerUserSession.mockResolvedValueOnce({ user: currentUser("admin") });
    queueResults({ firstOrThrow: { total: "1" } }, { execute: [evidenceEvent({ tradelineAccountNumber: "SYN-****-ADMIN" })] });

    const adminResponse = await listEvidence(getRequest("/_api/evidence/list"));

    expect(adminResponse.status).toBe(200);
    await expect(adminResponse.json()).resolves.toMatchObject({ total: 1 });
    expect(whereValues("packet.userId")).toEqual([]);

    mocks.operations.length = 0;
    mocks.getServerUserSession.mockResolvedValueOnce({ user: currentUser("support") });
    queueResults({ firstOrThrow: { total: "0" } }, { execute: [] });

    const supportResponse = await listEvidence(getRequest("/_api/evidence/list"));

    expect(supportResponse.status).toBe(200);
    await expect(supportResponse.json()).resolves.toMatchObject({ total: 0, events: [] });
    expect(whereValues("packet.userId")).toContainEqual(["packet.userId", "=", 10]);
  });

  it("creates evidence only for owned packets and denies non-owner create before writing state", async () => {
    queueResults({ first: { id: 601, userId: 10 } }, { firstOrThrow: evidenceEvent() });

    const response = await createEvidence(
      postRequest("/_api/evidence/create", {
        packetId: 601,
        eventType: "SYNTHETIC_EVIDENCE_EVENT",
        description: "Synthetic evidence record.",
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.event).toMatchObject({ id: 501, packetId: 601 });
    expect(valuesFor("evidenceEvent")[0]).toMatchObject({
      packetId: 601,
      eventType: "SYNTHETIC_EVIDENCE_EVENT",
      description: "Synthetic evidence record.",
      organizationId: 1000,
      region: "CA",
    });
    expectNoSensitiveLeak(body);

    mocks.operations.length = 0;
    queueResults({ first: { id: 602, userId: 99 } });

    const denied = await createEvidence(
      postRequest("/_api/evidence/create", {
        packetId: 602,
        eventType: "SYNTHETIC_EVIDENCE_EVENT",
        description: "Synthetic non-owner attempt.",
      }),
    );

    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toEqual({
      error: "You do not have permission to create evidence for this packet",
    });
    expect(mocks.db.insertInto).toHaveBeenCalledTimes(1);
  });

  it("denies non-owner update/delete and keeps orphan evidence admin-only", async () => {
    queueResults({ first: { id: 501, packetId: 601 } }, { first: { id: 601, userId: 99 } });

    const updateDenied = await updateEvidence(
      postRequest("/_api/evidence/update", {
        id: 501,
        description: "Synthetic update attempt.",
      }),
    );

    expect(updateDenied.status).toBe(403);
    await expect(updateDenied.json()).resolves.toEqual({
      error: "You do not have permission to update this evidence event",
    });
    expect(mocks.db.updateTable).not.toHaveBeenCalled();

    mocks.operations.length = 0;
    queueResults({ first: { id: 502, packetId: null } });
    const orphanUpdate = await updateEvidence(
      postRequest("/_api/evidence/update", {
        id: 502,
        description: "Synthetic orphan update attempt.",
      }),
    );
    expect(orphanUpdate.status).toBe(403);
    await expect(orphanUpdate.json()).resolves.toEqual({
      error: "Only admins can modify evidence events without an associated packet",
    });

    mocks.operations.length = 0;
    queueResults({ first: { id: 501, packetId: 601 } }, { first: { id: 601, userId: 99 } });
    const deleteDenied = await deleteEvidenceEvent(postRequest("/_api/evidence/delete", { id: 501 }));

    expect(deleteDenied.status).toBe(403);
    await expect(deleteDenied.json()).resolves.toEqual({
      error: "You do not have permission to delete this evidence event",
    });
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });

  it("updates and deletes owned evidence without audit-log overexposure under the current contract", async () => {
    queueResults(
      { first: { id: 501, packetId: 601 } },
      { first: { id: 601, userId: 10 } },
      { firstOrThrow: evidenceEvent({ description: "Synthetic updated evidence." }) },
    );

    const updateResponse = await updateEvidence(
      postRequest("/_api/evidence/update", {
        id: 501,
        description: "Synthetic updated evidence.",
      }),
    );

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      event: expect.objectContaining({ id: 501, description: "Synthetic updated evidence." }),
    });
    expect(setFor("evidenceEvent")[0]).toEqual({ description: "Synthetic updated evidence." });
    expect(mocks.logAudit).not.toHaveBeenCalled();

    mocks.operations.length = 0;
    queueResults({ first: { id: 501, packetId: 601 } }, { first: { id: 601, userId: 10 } }, {}, {});
    const deleteResponse = await deleteEvidenceEvent(postRequest("/_api/evidence/delete", { id: 501 }));

    expect(deleteResponse.status).toBe(200);
    await expect(deleteResponse.json()).resolves.toEqual({ success: true });
    expect(mocks.db.transaction).toHaveBeenCalled();
    expect(whereValues("evidenceEventId")).toContainEqual(["evidenceEventId", "=", 501]);
    expect(whereValues("id")).toContainEqual(["id", "=", 501]);
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("lists attachment metadata only after ownership checks and strips storage paths", async () => {
    queueResults({ first: { userId: 10 } });

    const response = await listAttachments(getRequest("/_api/evidence-attachment/list?packetId=601"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([
      expect.not.objectContaining({
        storageUrl: expect.anything(),
      }),
    ]);
    expect(body[0]).toMatchObject({
      id: 801,
      packetId: 601,
      fileName: "synthetic-evidence.pdf",
      fileType: "application/pdf",
      fileSizeBytes: 128,
    });
    expect(mocks.getEvidenceAttachments).toHaveBeenCalledWith({
      obligationInstanceId: undefined,
      packetId: 601,
    });
    expectNoSensitiveLeak(body);

    mocks.operations.length = 0;
    mocks.getEvidenceAttachments.mockClear();
    queueResults({ first: { userId: 99 } });

    const denied = await listAttachments(getRequest("/_api/evidence-attachment/list?packetId=602"));

    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toEqual({ error: "You do not have access to this packet." });
    expect(mocks.getEvidenceAttachments).not.toHaveBeenCalled();

    mocks.operations.length = 0;
    queueResults({ first: null });
    const missing = await listAttachments(getRequest("/_api/evidence-attachment/list?obligationInstanceId=999"));
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toEqual({ error: "Obligation instance not found." });
  });

  it("uploads attachment metadata for owned resources without leaking raw file bytes or signed secrets", async () => {
    queueResults({ first: { userId: 10 } });

    const response = await uploadAttachment(postRequest("/_api/evidence-attachment/upload", attachmentUploadBody()));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.attachment).toMatchObject({
      id: 801,
      packetId: 601,
      fileName: "synthetic-evidence.pdf",
      fileType: "application/pdf",
      storageUrl: "local:evidence/10/1234567890-synthetic-evidence.pdf",
    });
    expect(mocks.uploadFile).toHaveBeenCalledWith(
      "data:application/pdf;base64,U1lOVEhFVElDX0ZJTEVfQllURVM=",
      expect.stringMatching(/^evidence\/10\/\d+-synthetic-evidence\.pdf$/),
      "application/pdf",
    );
    expect(mocks.uploadEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        packetId: 601,
        fileName: "synthetic-evidence.pdf",
        fileType: "application/pdf",
        fileSizeBytes: expect.any(Number),
        uploadedBy: 10,
        region: "CA",
      }),
    );
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "UPLOAD",
        entityType: "EVIDENCE_EVENT",
        entityId: 801,
        userId: 10,
        details: {
          fileName: "synthetic-evidence.pdf",
          fileType: "application/pdf",
          size: expect.any(Number),
        },
        status: "SUCCESS",
      }),
    );
    expectNoSensitiveLeak(body, { allowLocalStorageUrl: true });
    expect(JSON.stringify(body)).not.toContain("U1lOVEhFVElDX0ZJTEVfQllURVM=");
    expectNoSensitiveLeak(mocks.logAudit.mock.calls, { allowLocalStorageUrl: true });
  });

  it("rejects oversized evidence attachment uploads before ownership, storage, or audit work", async () => {
    const response = await uploadAttachment(
      postRequest(
        "/_api/evidence-attachment/upload",
        attachmentUploadBody({
          fileDataBase64: oversizedBase64For(EVIDENCE_ATTACHMENT_UPLOAD_MAX_BYTES),
        }),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Evidence attachment exceeds the 10 MB upload limit",
    });
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
    expect(mocks.uploadFile).not.toHaveBeenCalled();
    expect(mocks.uploadEvidence).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("rejects invalid evidence attachment MIME types before storage work", async () => {
    const response = await uploadAttachment(
      postRequest(
        "/_api/evidence-attachment/upload",
        attachmentUploadBody({
          fileName: "synthetic-evidence.txt",
          fileType: "text/plain",
          fileDataBase64: Buffer.from("SYNTHETIC_TEXT_FILE").toString("base64"),
        }),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "File type must be PDF, PNG, or JPG" });
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
    expect(mocks.uploadFile).not.toHaveBeenCalled();
    expect(mocks.uploadEvidence).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("denies non-owner attachment upload before storage, metadata, or audit writes", async () => {
    queueResults({ first: { userId: 99 } });

    const response = await uploadAttachment(
      postRequest("/_api/evidence-attachment/upload", attachmentUploadBody({ packetId: 602 })),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "You do not have access to this packet." });
    expect(mocks.uploadFile).not.toHaveBeenCalled();
    expect(mocks.uploadEvidence).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("generates evidence packages only for owned obligations and audits safe metadata", async () => {
    queueResults({ first: { tradelineUserId: 10, obligationUserId: 10 } });

    const response = await packageEvidence(
      postRequest("/_api/evidence-attachment/package", { obligationInstanceId: 901 }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="Evidence_Package_901_20260517.pdf"',
    );
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(10);
    expect(mocks.generateEvidencePackage).toHaveBeenCalledWith(901);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "DOWNLOAD",
        entityType: "OBLIGATION_INSTANCE",
        entityId: 901,
        userId: 10,
        details: { fileName: "Evidence_Package_901_20260517.pdf" },
        status: "SUCCESS",
      }),
    );

    mocks.operations.length = 0;
    mocks.generateEvidencePackage.mockClear();
    mocks.logAudit.mockClear();
    queueResults({ first: { tradelineUserId: 99, obligationUserId: 99 } });
    const denied = await packageEvidence(
      postRequest("/_api/evidence-attachment/package", { obligationInstanceId: 902 }),
    );

    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toEqual({ error: "You do not have access to this obligation instance." });
    expect(mocks.generateEvidencePackage).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("returns a safe error when package generation hits a stale or missing attachment reference", async () => {
    queueResults({ first: { tradelineUserId: 10, obligationUserId: 10 } });
    mocks.generateEvidencePackage.mockRejectedValueOnce(
      new Error(
        "Missing synthetic file local:evidence/10/SYNTHETIC_PRIVATE_STORAGE_PATH_SHOULD_NOT_APPEAR?X-Goog-Signature=secret",
      ),
    );

    const response = await packageEvidence(
      postRequest("/_api/evidence-attachment/package", { obligationInstanceId: 901 }),
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "Internal Server Error" });
    expectNoSensitiveLeak(body);
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("denies bureau communication uploads for cross-owner resources before attachment state is returned", async () => {
    queueResults({ first: { id: 701, userId: 99, organizationId: 1000 } });

    const response = await recordBureauCommunication(
      postRequest("/_api/evidence/bureau-communication", bureauCommunicationBody()),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Access denied: this tradeline does not belong to you.",
    });
    expect(mocks.db.transaction).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("rejects oversized bureau communication uploads before ownership, hashing, or transaction work", async () => {
    const response = await recordBureauCommunication(
      postRequest(
        "/_api/evidence/bureau-communication",
        bureauCommunicationBody({
          fileDataBase64: oversizedBase64For(BUREAU_COMMUNICATION_UPLOAD_MAX_BYTES),
        }),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Bureau communication exceeds the 10 MB upload limit",
    });
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
    expect(mocks.db.transaction).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("records a bounded bureau communication upload through the existing evidence path", async () => {
    const body = bureauCommunicationBody();
    queueResults(
      { first: { id: 701, userId: 10, organizationId: 1000 } },
      { first: { currentHash: "previous-synthetic-hash" } },
      { firstOrThrow: evidenceEvent({ id: 502, eventType: "BUREAU_RESPONSE_RECEIVED" }) },
      {
        firstOrThrow: attachment({
          id: 802,
          obligationInstanceId: null,
          packetId: null,
          fileName: "synthetic-bureau-response.pdf",
          storageUrl: body.fileDataBase64,
        }),
      },
      { first: null },
    );

    const response = await recordBureauCommunication(
      postRequest("/_api/evidence/bureau-communication", body),
    );

    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({
      evidenceEvent: expect.objectContaining({ id: 502 }),
      evidenceAttachment: expect.objectContaining({
        id: 802,
        fileName: "synthetic-bureau-response.pdf",
      }),
      updatedObligationInstance: null,
      fileHash: expect.any(String),
      responseClassification: expect.any(Object),
    });
    expect(valuesFor("evidenceAttachment")[0]).toMatchObject({
      fileName: "synthetic-bureau-response.pdf",
      fileType: "application/pdf",
      fileSizeBytes: Buffer.from(body.fileDataBase64, "base64").length,
      storageUrl: body.fileDataBase64,
      uploadedBy: 10,
      region: "CA",
    });
    expect(mocks.db.transaction).toHaveBeenCalled();
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "RESPONSE_RECORDED",
        entityType: "EVIDENCE_EVENT",
        entityId: 502,
        userId: 10,
        status: "SUCCESS",
      }),
    );
  });

  it("keeps packet detail evidence-adjacent metadata masked and storage details on the packet contract only", async () => {
    queueResults({
      first: {
        id: 601,
        status: "generated",
        terminalLabel: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        pdfStorageUrl: null,
        sentDate: null,
        bureauResponseDate: null,
        responseType: null,
        successOutcome: null,
        processingStatus: "completed",
        deliveryMethod: null,
        trackingNumber: null,
        letterDate: new Date("2026-01-01T00:00:00.000Z"),
        consumerCertification: null,
        recipientName: "Synthetic Bureau",
        userId: 10,
        tradelineAccountNumber: "1234567890123456",
        bureauName: "Synthetic Bureau",
        responseClockDays: 30,
      },
    });

    const response = await getPacket(getRequest("/_api/packet/get?packetId=601"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.packet).toMatchObject({
      id: 601,
      tradelineAccountNumber: expect.stringMatching(/^Account ending /),
      pdfStorageUrl: null,
    });
    expect(JSON.stringify(body)).not.toContain("1234567890123456");
    expectNoSensitiveLeak(body);
  });

  it("keeps indirect violation evidenceLocation metadata compact without exposing raw spans or snippets", async () => {
    const violation = violationWithEvidenceLocation();
    queueResults({ execute: [violation] }, { execute: [violation] });

    const response = await listViolations(
      getRequest("/_api/creditor-validation/list?tradelineId=701&limit=10&offset=0"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.obligationTests).toHaveLength(1);
    expect(body.obligationTests[0].technicalDetails.evidenceLocation).toMatchObject({
      pageNumber: 2,
      boundingBox: { x: 12, y: 24, width: 36, height: 48 },
      coordinateSource: "pdfjs",
      field: "balance",
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/textSnippet|tokenIndexes|wordSpanIndexes|itemSpanIndexes|rawText/i);
    expect(whereValues("tradeline.userId")).toContainEqual(["tradeline.userId", "=", 10]);
    expect(whereValues("creditorObligationTest.tradelineId")).toContainEqual([
      "creditorObligationTest.tradelineId",
      "=",
      701,
    ]);
    expectNoSensitiveLeak(body);
  });

  it("keeps evidence endpoint source boundaries away from parser, OCR, runtime activation, and packet mutation paths", () => {
    const evidenceSources = [
      "endpoints/evidence/list_GET.ts",
      "endpoints/evidence/create_POST.ts",
      "endpoints/evidence/update_POST.ts",
      "endpoints/evidence/delete_POST.ts",
      "endpoints/evidence-attachment/list_GET.ts",
      "endpoints/evidence-attachment/upload_POST.ts",
      "endpoints/evidence-attachment/package_POST.ts",
    ]
      .map((path) => readFileSync(resolve(path), "utf8"))
      .join("\n");

    expect(evidenceSources).not.toMatch(
      /\b(canonicalCreditReport|deterministicCreditReportPipeline|pdfTextExtractor|ocrEvidence|extractCanonical|parseCreditReport|ingestCorePipeline)\b/i,
    );
    expect(evidenceSources).not.toMatch(
      /\b(validateDisputePacketReadiness|evaluatePacketReadiness|buildDisputePacketPreview|packetWording|createPacket|directFurnisher)\b/i,
    );
    expect(evidenceSources).not.toMatch(
      /\b(runtimeBridge|activateRuntime|activateRegistry|regulationRuntimeTruth|adminOverride)\b/i,
    );
  });
});
