import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotAuthenticatedError } from "../../helpers/getSetServerSession";

type QueryResult = {
  execute?: unknown[];
  first?: unknown;
  firstOrThrow?: unknown;
  throwOnExecute?: unknown;
};

type DbOperation = {
  kind: "select" | "insert" | "update" | "delete";
  table: string;
  method: "where" | "whereRef" | "limit" | "offset" | "orderBy" | "values" | "set";
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
  resolveUserSession: vi.fn(),
  handleIngestSubmit: vi.fn(),
  handleIngestProcess: vi.fn(),
  enqueueIngestProcessingJob: vi.fn(),
  getLatestIngestProcessingJobByIdempotencyKey: vi.fn(),
  updateArtifactProcessingStatus: vi.fn(),
  validateOrigin: vi.fn(),
  runParserLabStage: vi.fn(),
  isAdmin: vi.fn(),
  shouldSuppressStaleReportingViolation: vi.fn(),
  checkRateLimit: vi.fn(),
  extractCanonicalCreditReport: vi.fn(),
  generateAnonymousPreview: vi.fn(),
}));

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

vi.mock("../../helpers/ingestSessionResolver", () => ({
  resolveUserSession: mocks.resolveUserSession,
}));

vi.mock("../../helpers/ingestReportHandler", () => ({
  handleIngestSubmit: mocks.handleIngestSubmit,
  handleIngestProcess: mocks.handleIngestProcess,
}));

vi.mock("../../helpers/ingestProcessingQueueService", () => ({
  enqueueIngestProcessingJob: mocks.enqueueIngestProcessingJob,
  getLatestIngestProcessingJobByIdempotencyKey: mocks.getLatestIngestProcessingJobByIdempotencyKey,
}));

vi.mock("../../helpers/ingestProcessingStatus", () => ({
  updateArtifactProcessingStatus: mocks.updateArtifactProcessingStatus,
}));

vi.mock("../../helpers/domainGuard", () => ({
  validateOrigin: mocks.validateOrigin,
}));

vi.mock("../../helpers/parserLabStage", () => ({
  runParserLabStage: mocks.runParserLabStage,
}));

vi.mock("../../helpers/userRoleUtils", () => ({
  isAdmin: mocks.isAdmin,
}));

vi.mock("../../helpers/staleReportingGuard", () => ({
  shouldSuppressStaleReportingViolation: mocks.shouldSuppressStaleReportingViolation,
}));

vi.mock("../../helpers/rateLimiter", () => ({
  checkRateLimit: mocks.checkRateLimit,
  RateLimitConfig: {
    UPLOAD: { maxAttempts: 10, windowMinutes: 60 },
    ANONYMOUS_UPLOAD: { maxAttempts: 5, windowMinutes: 22 },
  },
}));

vi.mock("../../helpers/canonicalCreditReportExtractor", () => ({
  extractCanonicalCreditReport: mocks.extractCanonicalCreditReport,
}));

vi.mock("../../helpers/anonymousCompliancePreview", () => ({
  generateAnonymousPreview: mocks.generateAnonymousPreview,
}));

import { handle as submitReport } from "../../endpoints/ingest/report_POST";
import { handle as submitAnonymousReport } from "../../endpoints/ingest/anonymous-report_POST";
import { handle as processReport } from "../../endpoints/ingest/process_POST";
import { handle as listReportArtifacts } from "../../endpoints/report-artifact/list_GET";
import {
  REPORT_ARTIFACT_LIST_DEFAULT_LIMIT,
  REPORT_ARTIFACT_LIST_MAX_LIMIT,
} from "../../endpoints/report-artifact/list_GET.schema";
import { handle as getReportArtifact } from "../../endpoints/report-artifact/get_GET";
import { handle as getUploadResults } from "../../endpoints/upload-results/get_GET";
import { handle as runParserLab } from "../../endpoints/parser-lab/run_POST";
import {
  SCANNED_PDF_UNSUPPORTED_CODE,
  ScannedPdfUnsupportedError,
} from "../../helpers/creditReportPdfEligibility";
import {
  ANONYMOUS_REPORT_UPLOAD_MAX_BYTES,
  AUTHENTICATED_REPORT_UPLOAD_MAX_BYTES,
  getUploadRequestBodyMaxBytes,
} from "../../helpers/uploadPayloadValidation";

function makeBuilder(table: string, kind: DbOperation["kind"], result: QueryResult = {}) {
  const builder: Record<string, any> = {};
  const chain = (method: DbOperation["method"]) =>
    vi.fn((...args: unknown[]) => {
      mocks.operations.push({ kind, table, method, args });
      return builder;
    });

  for (const method of ["where", "whereRef", "limit", "offset", "orderBy"] as const) {
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
  builder.execute = vi.fn(async () => {
    if (result.throwOnExecute) throw result.throwOnExecute;
    return result.execute ?? [];
  });
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

function getRequest(path: string) {
  return new Request(`http://localhost${path}`, { method: "GET" });
}

function postRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "synthetic-report-ingest-test" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function oversizedRawPostRequest(path: string, maxDecodedBytes: number) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(getUploadRequestBodyMaxBytes(maxDecodedBytes) + 1),
      "user-agent": "synthetic-report-ingest-test",
    },
    body: "{",
  });
}

function uploadInput(overrides: Record<string, unknown> = {}) {
  return {
    region: "CA",
    fileName: "synthetic-credit-report.pdf",
    mimeType: "application/pdf",
    bytesBase64: "JVBERi0xLjQKJXN5bnRoZXRpYw==",
    ...overrides,
  };
}

function oversizedBase64For(limitBytes: number) {
  return "A".repeat(Math.ceil((limitBytes + 1) / 3) * 4);
}

function artifactRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 701,
    artifactType: "credit_report",
    reportDate: new Date("2026-01-01T00:00:00.000Z"),
    metro2Version: null,
    sha256: "synthetic-sha-701",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    userId: 10,
    organizationId: null,
    region: "CA",
    tradelineId: null,
    crrgYear: null,
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    validationRulesApplied: null,
    data: {
      fileName: "synthetic-credit-report.pdf",
      parserQuality: {
        confidenceScore: 93,
        requiresManualReview: false,
        sourceBureauName: "Synthetic Bureau",
      },
      evidenceLocationIndex: {
        "synthetic-field": {
          pageNumber: 2,
          sourceTextHash: "a".repeat(64),
        },
      },
    },
    storageUrl: null,
    processingStatus: "completed",
    tradelineAccountNumber: "SYN-****-0001",
    tradelineAccountType: "credit_card",
    linkedAccountCount: "1",
    bureauName: "Synthetic Bureau",
    ...overrides,
  };
}

function ingestJobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 9101,
    jobType: "report_ingest_process",
    status: "queued",
    reportArtifactId: 701,
    userId: 10,
    organizationId: null,
    payload: {
      region: "CA",
      mimeType: "application/pdf",
      artifactSha256: "synthetic-sha-701",
      metadata: {
        uploadChannel: "authenticated_ingest",
        processEndpointCutover: true,
      },
    },
    idempotencyKey: "ingest.process.jh.a",
    actorUserId: 10,
    source: "authenticated_ingest_process",
    runAfter: "2026-01-01T00:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    attemptCount: 0,
    maxAttempts: 3,
    lockedBy: null,
    lockedAt: null,
    lockedUntil: null,
    lastErrorCode: null,
    lastErrorReason: null,
    resultSummary: {},
    ...overrides,
  };
}

function currentUser(role = "user") {
  return {
    id: 10,
    role,
    organizationId: null,
    displayName: "Synthetic User",
    email: "synthetic@example.invalid",
  };
}

function responseTextIsPrivacySafe(value: unknown) {
  const text = JSON.stringify(value);
  expect(text).not.toMatch(/\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/);
  expect(text).not.toMatch(/\b(?:\d[ -]?){12,19}\b/);
  expect(text).not.toMatch(/rawExtractedText|rawReportText|sourceText":|fullSin|socialInsurance|privateKey|secret/i);
  expect(text).not.toContain("SYNTHETIC_RAW_REPORT_TEXT_SHOULD_NOT_APPEAR");
  expect(text).not.toContain("SYNTHETIC_FULL_ACCOUNT_SHOULD_NOT_APPEAR");
}

function whereValues(column: string) {
  return mocks.operations
    .filter((operation) => operation.method === "where" && operation.args[0] === column)
    .map((operation) => operation.args);
}

function limitValuesFor(table: string) {
  return mocks.operations
    .filter((operation) => operation.table === table && operation.method === "limit")
    .map((operation) => operation.args[0]);
}

function offsetValuesFor(table: string) {
  return mocks.operations
    .filter((operation) => operation.table === table && operation.method === "offset")
    .map((operation) => operation.args[0]);
}

async function readSseEvents(response: Response) {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter((entry) => entry.startsWith("data: "))
    .map((entry) => JSON.parse(entry.slice("data: ".length)));
}

const parserLabOutput = {
  stageVersion: "synthetic-parser-lab",
  sideEffects: "none" as const,
  fileName: "synthetic-credit-report.pdf",
  bureauName: "Synthetic Bureau",
  extractionSource: "pdf_text",
  quality: {
    confidenceScore: 95,
    requiresManualReview: false,
    expectedAccountMarkers: 1,
    parsedTradelineCount: 1,
    issues: [],
    fieldCompleteness: {
      averageScore: 1,
      lowCompletenessTradelines: 0,
      missingCoreDates: 0,
      missingReportedDates: 0,
      missingOpenedDates: 0,
    },
  },
  retention: {
    originalDocumentSha256: "synthetic-original-sha",
    canonicalResultSha256: "synthetic-canonical-sha",
    replayHash: "synthetic-replay-hash",
    rawTextCharacters: 128,
    rawHtmlCharacters: 0,
    tradelinesWithSourceText: 1,
    sourceTextCoveragePercent: 100,
    criticalFieldCompletenessPercent: 100,
    reviewQueueCount: 0,
    blockers: [],
  },
  counts: {
    tradelines: 1,
    inquiries: 0,
    publicRecords: 0,
    employments: 0,
    scores: 0,
    consumerStatements: 0,
  },
  reviewQueue: [],
  parsed: {},
  audit: {
    parsedResult: {},
    mappedResult: {},
    fieldReconciliation: {},
    deterministicPipeline: {},
  },
  provenance: {
    parserMode: "deterministic",
    diagnosticOnly: true,
  },
  rawExtractedText: "Synthetic parser-lab diagnostic text only.",
  rawTextPreview: "Synthetic parser-lab diagnostic text only.",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queryQueue.length = 0;
  mocks.operations.length = 0;
  installDbHarness();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);

  mocks.getServerUserSession.mockResolvedValue({ user: currentUser() });
  mocks.resolveUserSession.mockResolvedValue({
    user: currentUser(),
    userAccount: { userId: 10 },
    isAuthenticatedUpload: true,
  });
  mocks.handleIngestSubmit.mockResolvedValue({
    success: true,
    artifactId: 701,
    extractionStatus: "extracted",
  });
  mocks.handleIngestProcess.mockImplementation(async (_session, artifactId: number, send: (event: unknown) => void) => {
    send({ type: "progress", stage: "synthetic_processing", percent: 50, message: "Processing synthetic report." });
    send({
      type: "complete",
      data: {
        ok: true,
        artifactId,
        tradelinesCount: 1,
        parserQuality: { confidenceScore: 95, requiresManualReview: false },
      },
    });
  });
  mocks.getLatestIngestProcessingJobByIdempotencyKey.mockResolvedValue(null);
  mocks.enqueueIngestProcessingJob.mockResolvedValue({
    status: "queued",
    job: ingestJobRow(),
    duplicateOfJobId: null,
  });
  mocks.updateArtifactProcessingStatus.mockResolvedValue(undefined);
  mocks.validateOrigin.mockResolvedValue({ valid: true, mode: "enforce" });
  mocks.runParserLabStage.mockResolvedValue(parserLabOutput);
  mocks.isAdmin.mockImplementation((user: { role?: string }) => user.role === "admin");
  mocks.shouldSuppressStaleReportingViolation.mockReturnValue(false);
  mocks.checkRateLimit.mockResolvedValue({ allowed: true });
  mocks.extractCanonicalCreditReport.mockResolvedValue({ parseResult: { synthetic: true } });
  mocks.generateAnonymousPreview.mockReturnValue([
    {
      type: "SYNTHETIC_REVIEW",
      title: "Synthetic review item",
      detail: "Synthetic detail.",
      solution: "Review the synthetic item.",
      urgency: "high",
    },
  ]);
});

describe("report ingest lifecycle endpoints", () => {
  it("denies unauthenticated upload and accepts a synthetic supported upload contract", async () => {
    mocks.resolveUserSession.mockRejectedValueOnce(new NotAuthenticatedError());

    const unauthenticated = await submitReport(postRequest("/_api/ingest/report", uploadInput()));
    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toEqual({ error: "Not authenticated" });
    expect(mocks.handleIngestSubmit).not.toHaveBeenCalled();

    const response = await submitReport(postRequest("/_api/ingest/report", uploadInput()));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ artifactId: 701, extractionStatus: "extracted" });
    expect(mocks.resolveUserSession).toHaveBeenLastCalledWith(expect.any(Request), "CA");
    expect(mocks.handleIngestSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: 10 }) }),
      uploadInput(),
      expect.any(Request),
    );
    responseTextIsPrivacySafe(body);
  });

  it("rejects unsupported or malformed upload requests without returning extracted content", async () => {
    const unsupported = await submitReport(
      postRequest("/_api/ingest/report", uploadInput({ fileName: "synthetic.txt", mimeType: "text/plain" })),
    );

    expect(unsupported.status).toBe(400);
    const unsupportedBody = await unsupported.json();
    expect(unsupportedBody).toEqual({ error: "Credit report upload must be a PDF" });
    responseTextIsPrivacySafe(unsupportedBody);
    expect(mocks.resolveUserSession).not.toHaveBeenCalled();
    expect(mocks.handleIngestSubmit).not.toHaveBeenCalled();

    const malformed = await submitReport(postRequest("/_api/ingest/report", "{"));
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({ error: "Invalid request body" });
  });

  it("rejects raw oversized authenticated upload bodies before JSON parse or submit work", async () => {
    const response = await submitReport(
      oversizedRawPostRequest("/_api/ingest/report", AUTHENTICATED_REPORT_UPLOAD_MAX_BYTES),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "Credit report request body exceeds the 15 MB upload limit",
    });
    expect(mocks.resolveUserSession).not.toHaveBeenCalled();
    expect(mocks.handleIngestSubmit).not.toHaveBeenCalled();
  });

  it("rejects malformed authenticated upload base64 before submit work", async () => {
    const response = await submitReport(
      postRequest("/_api/ingest/report", uploadInput({ bytesBase64: "not-valid-base64!" })),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Credit report data must be valid base64" });
    expect(mocks.resolveUserSession).not.toHaveBeenCalled();
    expect(mocks.handleIngestSubmit).not.toHaveBeenCalled();
  });

  it("rejects oversized authenticated upload before submit, parsing, or storage work", async () => {
    const response = await submitReport(
      postRequest(
        "/_api/ingest/report",
        uploadInput({ bytesBase64: oversizedBase64For(AUTHENTICATED_REPORT_UPLOAD_MAX_BYTES) }),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Credit report exceeds the 15 MB upload limit" });
    expect(mocks.resolveUserSession).not.toHaveBeenCalled();
    expect(mocks.handleIngestSubmit).not.toHaveBeenCalled();
  });

  it("rejects oversized anonymous upload before rate limiting or preview extraction", async () => {
    const response = await submitAnonymousReport(
      postRequest(
        "/_api/ingest/anonymous-report",
        uploadInput({ bytesBase64: oversizedBase64For(ANONYMOUS_REPORT_UPLOAD_MAX_BYTES) }),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please upload a PDF file to continue." });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.extractCanonicalCreditReport).not.toHaveBeenCalled();
  });

  it("rejects raw oversized anonymous upload bodies before JSON parse or preview extraction", async () => {
    const response = await submitAnonymousReport(
      oversizedRawPostRequest("/_api/ingest/anonymous-report", ANONYMOUS_REPORT_UPLOAD_MAX_BYTES),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "Credit report request body exceeds the 20 MB upload limit",
    });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.extractCanonicalCreditReport).not.toHaveBeenCalled();
  });

  it("rejects malformed anonymous upload base64 before rate limiting or preview extraction", async () => {
    const response = await submitAnonymousReport(
      postRequest("/_api/ingest/anonymous-report", uploadInput({ bytesBase64: "not-valid-base64!" })),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please upload a PDF file to continue." });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.extractCanonicalCreditReport).not.toHaveBeenCalled();
  });

  it("accepts a bounded anonymous PDF upload through the current preview path", async () => {
    const body = uploadInput({
      bytesBase64: "data:application/pdf;base64,JVBERi0xLjQKJXN5bnRoZXRpYw==",
    });

    const response = await submitAnonymousReport(postRequest("/_api/ingest/anonymous-report", body));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      problemCount: 1,
      sampleProblems: [
        {
          type: "SYNTHETIC_REVIEW",
          title: "Synthetic review item",
          detail: "Synthetic detail.",
          solution: "Review the synthetic item.",
          urgency: "high",
        },
      ],
    });
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("unknown_ip", "ANON_UPLOAD", 5, 22);
    expect(mocks.extractCanonicalCreditReport).toHaveBeenCalledWith({
      bytesBase64: body.bytesBase64,
      mimeType: "application/pdf",
      allowAiFallback: false,
    });
  });

  it("maps scanned or low-quality upload rejection to a controlled fail-closed response", async () => {
    mocks.handleIngestSubmit.mockResolvedValueOnce({
      success: false,
      error: "This PDF appears to be scanned or image-only. Deterministic OCR did not produce valid credit-report text.",
      code: SCANNED_PDF_UNSUPPORTED_CODE,
    });

    const response = await submitReport(postRequest("/_api/ingest/report", uploadInput()));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({
      artifactId: null,
      extractionStatus: "failed",
      error: "This PDF appears to be scanned or image-only. Deterministic OCR did not produce valid credit-report text.",
    });
    expect(body).not.toHaveProperty("tradelines");
    expect(body).not.toHaveProperty("canonicalOutput");
  });

  it("enqueues owned artifact processing through SSE and denies non-owner processing before queue work", async () => {
    queueResults(
      { first: artifactRow({ id: 701, userId: 10, processingStatus: "pending", storageUrl: "SHOULD_NOT_SELECT" }) },
      { first: { userId: 10, province: "ON" } },
    );

    const response = await processReport(postRequest("/_api/ingest/process", { artifactId: 701 }));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    const events = await readSseEvents(response);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "progress", stage: "queued", percent: 12 }),
        expect.objectContaining({
          type: "status",
          artifactId: 701,
          jobId: 9101,
          queueStatus: "queued",
          processingStatus: "queued",
          workerRequired: true,
        }),
        expect.objectContaining({
          type: "complete",
          data: expect.objectContaining({
            ok: true,
            queued: true,
            artifactId: 701,
            storageUrl: "701",
            jobId: 9101,
            queueStatus: "queued",
          }),
        }),
      ]),
    );
    expect(mocks.enqueueIngestProcessingJob).toHaveBeenCalledWith(expect.objectContaining({
      reportArtifactId: 701,
      userId: 10,
      source: "authenticated_ingest_process",
      idempotencyKey: "ingest.process.jh.a",
      payload: expect.objectContaining({
        region: "CA",
        mimeType: "application/pdf",
        metadata: expect.objectContaining({ processEndpointCutover: true }),
      }),
    }));
    expect(mocks.updateArtifactProcessingStatus).toHaveBeenCalledWith(701, "queued");
    expect(mocks.handleIngestProcess).not.toHaveBeenCalled();
    responseTextIsPrivacySafe(events);

    mocks.operations.length = 0;
    queueResults({ first: artifactRow({ id: 702, userId: 99 }) });
    const denied = await processReport(postRequest("/_api/ingest/process", { artifactId: 702 }));

    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toEqual({ error: "Unauthorized access to artifact" });
    expect(mocks.enqueueIngestProcessingJob).toHaveBeenCalledTimes(1);
  });

  it("reuses duplicate active jobs and exposes failed or dead-lettered queue state", async () => {
    queueResults(
      { first: artifactRow({ id: 701, userId: 10, processingStatus: "failed" }) },
      { first: { userId: 10, province: "ON" } },
    );
    mocks.enqueueIngestProcessingJob.mockResolvedValueOnce({
      status: "duplicate",
      job: ingestJobRow({
        status: "failed",
        runAfter: "2026-01-01T00:05:00.000Z",
        attemptCount: 1,
        lastErrorCode: "INGEST_PROCESSING_FAILED",
        lastErrorReason: "Synthetic transient queue failure.",
      }),
      duplicateOfJobId: 9101,
    });

    const retrying = await processReport(postRequest("/_api/ingest/process", { artifactId: 701 }));

    expect(retrying.status).toBe(200);
    const retryEvents = await readSseEvents(retrying);
    expect(retryEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "progress", stage: "retry_scheduled" }),
      expect.objectContaining({
        type: "status",
        queueStatus: "failed",
        retryAt: "2026-01-01T00:05:00.000Z",
        errorCode: "INGEST_PROCESSING_FAILED",
      }),
      expect.objectContaining({
        type: "complete",
        data: expect.objectContaining({
          queued: true,
          duplicate: true,
          queueStatus: "failed",
          errorReason: "Synthetic transient queue failure.",
        }),
      }),
    ]));

    mocks.operations.length = 0;
    mocks.getLatestIngestProcessingJobByIdempotencyKey.mockResolvedValueOnce(ingestJobRow({
      status: "dead_lettered",
      finishedAt: "2026-01-01T00:06:00.000Z",
      lastErrorCode: "INGEST_ARTIFACT_BYTES_MISSING",
      lastErrorReason: "Queued report artifact has no stored PDF bytes.",
    }));
    queueResults(
      { first: artifactRow({ id: 701, userId: 10, processingStatus: "failed" }) },
      { first: { userId: 10, province: "ON" } },
    );

    const deadLetter = await processReport(postRequest("/_api/ingest/process", { artifactId: 701 }));
    expect(deadLetter.status).toBe(200);
    const deadLetterEvents = await readSseEvents(deadLetter);
    expect(deadLetterEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "status", queueStatus: "dead_lettered" }),
      expect.objectContaining({
        type: "error",
        code: "INGEST_ARTIFACT_BYTES_MISSING",
        error: "Queued report artifact has no stored PDF bytes.",
      }),
    ]));
    expect(mocks.enqueueIngestProcessingJob).toHaveBeenCalledTimes(1);
    expect(mocks.handleIngestProcess).not.toHaveBeenCalled();
    expect(JSON.stringify([retryEvents, deadLetterEvents])).not.toMatch(/packetReady|packetWording|runtimeBridge|adminOverride/i);
  });

  it("lists report artifacts using current user scoping and compact synthetic metadata", async () => {
    queueResults({ firstOrThrow: { total: "1" } }, { execute: [artifactRow({ storageUrl: "SHOULD_NOT_SELECT" })] });

    const response = await listReportArtifacts(getRequest("/_api/report-artifact/list?limit=10&offset=0"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      total: 1,
      artifacts: [
        expect.objectContaining({
          id: 701,
          userId: 10,
          artifactType: "credit_report",
          processingStatus: "completed",
          linkedAccountCount: 1,
          bureauName: "Synthetic Bureau",
        }),
      ],
    });
    expect(body.artifacts[0]).not.toHaveProperty("storageUrl");
    expect(JSON.stringify(body)).not.toContain("SHOULD_NOT_SELECT");
    expect(whereValues("reportArtifact.userId")).toContainEqual(["reportArtifact.userId", "=", 10]);
    expect(whereValues("reportArtifact.processingStatus")).toContainEqual([
      "reportArtifact.processingStatus",
      "=",
      "completed",
    ]);
    expect(limitValuesFor("reportArtifact")).toContain(10);
    expect(offsetValuesFor("reportArtifact")).toContain(0);
    responseTextIsPrivacySafe(body);
  });

  it("rejects excessive report-artifact list limits before running list queries", async () => {
    const response = await listReportArtifacts(
      getRequest(`/_api/report-artifact/list?limit=${REPORT_ARTIFACT_LIST_MAX_LIMIT + 1}`),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toEqual(expect.any(String));
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
    responseTextIsPrivacySafe(body);
  });

  it("treats admin as cross-owner capable and support as non-admin scoped for artifact list/detail", async () => {
    mocks.getServerUserSession.mockResolvedValueOnce({ user: currentUser("admin") });
    queueResults({ firstOrThrow: { total: "1" } }, { execute: [artifactRow({ userId: 99 })] });

    const adminList = await listReportArtifacts(getRequest("/_api/report-artifact/list"));

    expect(adminList.status).toBe(200);
    await expect(adminList.json()).resolves.toMatchObject({ total: 1 });
    expect(whereValues("reportArtifact.userId")).toEqual([]);
    expect(limitValuesFor("reportArtifact")).toContain(REPORT_ARTIFACT_LIST_DEFAULT_LIMIT);
    expect(offsetValuesFor("reportArtifact")).toEqual([]);

    mocks.operations.length = 0;
    mocks.getServerUserSession.mockResolvedValueOnce({ user: currentUser("support") });
    queueResults({ first: null });

    const supportDetail = await getReportArtifact(getRequest("/_api/report-artifact/get?id=701"));

    expect(supportDetail.status).toBe(404);
    await expect(supportDetail.json()).resolves.toEqual({ error: "Report artifact not found or access denied" });
    expect(whereValues("userId")).toContainEqual(["userId", "=", 10]);
  });

  it("fetches own report detail and denies cross-owner upload-result detail before violation queries", async () => {
    queueResults({
      first: {
        id: 701,
        artifactType: "credit_report",
        storageUrl: null,
        reportDate: new Date("2026-01-01T00:00:00.000Z"),
        metro2Version: null,
        sha256: "synthetic-sha-701",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        userId: 10,
        organizationId: null,
      },
    });

    const detail = await getReportArtifact(getRequest("/_api/report-artifact/get?id=701"));

    expect(detail.status).toBe(200);
    const detailBody = await detail.json();
    expect(detailBody.reportArtifact).toMatchObject({ id: 701, userId: 10, storageUrl: null });
    expect(whereValues("userId")).toContainEqual(["userId", "=", 10]);
    responseTextIsPrivacySafe(detailBody);

    mocks.operations.length = 0;
    queueResults({
      first: {
        id: 702,
        userId: 99,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        data: { fileName: "synthetic-other-user.pdf", tradelineIds: [801] },
        tradelineId: null,
      },
    });

    const uploadResult = await getUploadResults(getRequest("/_api/upload-results/get?artifactId=702"));

    expect(uploadResult.status).toBe(403);
    await expect(uploadResult.json()).resolves.toEqual({ error: "Unauthorized access to artifact" });
    expect(mocks.db.selectFrom).toHaveBeenCalledTimes(2);
  });

  it("returns safe upload-result summary metadata for owned artifacts without tradelines", async () => {
    queueResults({
      first: {
        id: 701,
        userId: 10,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        data: {
          fileName: "synthetic-credit-report.pdf",
          bureauName: "Synthetic Bureau",
          parserQuality: {
            confidenceScore: 62,
            requiresManualReview: true,
            sourceBureauName: "Synthetic Bureau",
          },
        },
        tradelineId: null,
      },
    });

    const response = await getUploadResults(getRequest("/_api/upload-results/get?artifactId=701"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      metadata: {
        fileName: "synthetic-credit-report.pdf",
        region: "CA",
        bureauName: "Synthetic Bureau",
      },
      stats: {
        totalTradelines: 0,
        actionableCount: 1,
      },
      topFindings: [],
      challengeAccessPoints: [],
      parserQuality: expect.objectContaining({
        confidenceScore: 62,
        requiresManualReview: true,
      }),
    });
    responseTextIsPrivacySafe(body);
  });

  it("keeps Parser Lab admin-only, side-effect-free, and separate from persistent ingest", async () => {
    mocks.getServerUserSession.mockResolvedValueOnce({ user: currentUser("support") });
    mocks.isAdmin.mockReturnValueOnce(false);

    const denied = await runParserLab(postRequest("/_api/parser-lab/run", uploadInput()));
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.runParserLabStage).not.toHaveBeenCalled();

    mocks.getServerUserSession.mockResolvedValueOnce({ user: currentUser("admin") });
    mocks.isAdmin.mockReturnValueOnce(true);
    const response = await runParserLab(postRequest("/_api/parser-lab/run", uploadInput()));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sideEffects).toBe("none");
    expect(body).not.toHaveProperty("artifactId");
    expect(body).not.toHaveProperty("reportId");
    expect(mocks.db.insertInto).not.toHaveBeenCalled();

    const endpointSource = readFileSync(resolve("endpoints/parser-lab/run_POST.ts"), "utf8");
    const stageSource = readFileSync(resolve("helpers/parserLabStage.tsx"), "utf8");
    expect(`${endpointSource}\n${stageSource}`).not.toMatch(
      /\b(createReportArtifact|reportArtifact|artifactId|reportId|insertInto|updateTable|db\.)\b/,
    );
  });

  it("keeps Parser Lab scanned-PDF failures on the controlled 400 side-effect-free path", async () => {
    mocks.getServerUserSession.mockResolvedValueOnce({ user: currentUser("admin") });
    mocks.isAdmin.mockReturnValueOnce(true);
    mocks.runParserLabStage.mockRejectedValueOnce(
      new ScannedPdfUnsupportedError({
        isValid: false,
        printableRatio: 0,
        keywordCount: 0,
        avgWordLength: 0,
        totalChars: 0,
        invalidReason: "Text too short (< 100 characters)",
      }, null),
    );

    const response = await runParserLab(postRequest("/_api/parser-lab/run", uploadInput()));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: SCANNED_PDF_UNSUPPORTED_CODE,
      message:
        "This PDF appears to be scanned or image-only. Deterministic OCR did not produce valid credit-report text.",
      action: "Try a text-based credit report PDF or verify OCR support before retrying.",
      stage: "parser_lab",
      sideEffects: "none",
    });
    expect(mocks.db.insertInto).not.toHaveBeenCalled();
  });

  it("keeps runtime side effects out of report endpoint source boundaries", () => {
    const endpointSource = [
      "endpoints/ingest/report_POST.ts",
      "endpoints/ingest/process_POST.ts",
      "endpoints/report-artifact/list_GET.ts",
      "endpoints/report-artifact/get_GET.ts",
      "endpoints/upload-results/get_GET.ts",
    ]
      .map((path) => readFileSync(resolve(path), "utf8"))
      .join("\n");
    const ingestBoundarySource = [
      "endpoints/ingest/report_POST.ts",
      "endpoints/ingest/process_POST.ts",
      "helpers/ingestReportHandler.tsx",
      "helpers/ingestArtifactCreator.tsx",
    ]
      .map((path) => readFileSync(resolve(path), "utf8"))
      .join("\n");

    expect(ingestBoundarySource).not.toMatch(
      /\b(createPacket|buildPacket|generatePacket|packet\/create|packetReadiness|packetWording|adminOverride|directFurnisher)\b/i,
    );
    expect(endpointSource).not.toMatch(
      /\b(runtimeBridge|activateRuntime|activateRegistry|regulationRuntimeTruth|adminOverride|directFurnisher)\b/i,
    );
    expect(endpointSource).not.toMatch(/\bparserLabStage|sideEffects:\s*["']none["']/);
  });
});
