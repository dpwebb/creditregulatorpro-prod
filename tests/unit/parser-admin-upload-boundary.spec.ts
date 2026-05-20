import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ADMIN_MOCK_LIFECYCLE_TOTAL_UPLOAD_MAX_BYTES,
  ADMIN_MOCK_LIFECYCLE_UPLOAD_MAX_BYTES,
  getUploadRequestBodyMaxBytes,
  PARSER_LAB_UPLOAD_MAX_BYTES,
  PARSER_TEST_CASE_IMPORT_MAX_FILES,
  PARSER_TEST_CASE_UPLOAD_MAX_BYTES,
} from "../../helpers/uploadPayloadValidation";

const mocks = vi.hoisted(() => ({
  db: {
    insertInto: vi.fn(),
    selectFrom: vi.fn(),
    updateTable: vi.fn(),
  },
  ensureParserTestAdjudicationSchema: vi.fn(),
  getServerUserSession: vi.fn(),
  isAdmin: vi.fn(),
  parsePdfThroughProductionHtmlPipeline: vi.fn(),
  createReportArtifact: vi.fn(),
  handleIngestProcess: vi.fn(),
  runParserLabStage: vi.fn(),
  materializeUploadedFixture: vi.fn(),
  resolveAndValidatePdfPath: vi.fn(),
  startMockLifecycleJob: vi.fn(),
  insertValues: [] as Array<Record<string, unknown>>,
}));

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

vi.mock("../../helpers/parserTestAdjudicationSchema", () => ({
  ensureParserTestAdjudicationSchema: mocks.ensureParserTestAdjudicationSchema,
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

vi.mock("../../helpers/userRoleUtils", () => ({
  isAdmin: mocks.isAdmin,
}));

vi.mock("../../helpers/parserTestProductionParser", () => ({
  parsePdfThroughProductionHtmlPipeline: mocks.parsePdfThroughProductionHtmlPipeline,
}));

vi.mock("../../helpers/ingestArtifactCreator", () => ({
  createReportArtifact: mocks.createReportArtifact,
}));

vi.mock("../../helpers/ingestReportHandler", () => ({
  handleIngestProcess: mocks.handleIngestProcess,
}));

vi.mock("../../helpers/parserLabStage", () => ({
  runParserLabStage: mocks.runParserLabStage,
}));

vi.mock("../../endpoints/admin/mock-lifecycle/jobRunner", () => ({
  materializeUploadedFixture: mocks.materializeUploadedFixture,
  resolveAndValidatePdfPath: mocks.resolveAndValidatePdfPath,
  startMockLifecycleJob: mocks.startMockLifecycleJob,
}));

import { handle as createParserTestCase } from "../../endpoints/parser-test-case/create_POST";
import { handle as importParserTestCases } from "../../endpoints/parser-test-case/import_POST";
import { handle as runParserLab } from "../../endpoints/parser-lab/run_POST";
import { handle as runMockLifecycle } from "../../endpoints/admin/mock-lifecycle/run_POST";

const adminUser = {
  id: 101,
  email: "admin@example.com",
  displayName: "Admin User",
  role: "admin",
  organizationId: null,
};

const supportUser = {
  ...adminUser,
  role: "support",
};

const validPdfBase64 = "JVBERi0xLjQKJXN5bnRoZXRpYyBwZGY=";

function postRequest(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function oversizedRawRequest(path: string, maxDecodedBytes: number) {
  return postRequest(
    path,
    "{",
    {
      "content-length": String(getUploadRequestBodyMaxBytes(maxDecodedBytes) + 1),
    }
  );
}

function oversizedBase64For(maxDecodedBytes: number) {
  return "A".repeat(Math.ceil((maxDecodedBytes + 1) / 3) * 4);
}

function parserTestCaseInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "Synthetic parser fixture",
    pdfBase64: validPdfBase64,
    expectedConsumerInfo: {},
    expectedTradelines: [],
    rawExtractedText: "Synthetic parser fixture text",
    parserContext: {
      canonicalOutput: { consumerInfo: {}, tradelines: [] },
      replayHash: "fixture-replay-hash",
      sourceFileName: "synthetic-parser-fixture.pdf",
    },
    ...overrides,
  };
}

function importedTestCase(overrides: Record<string, unknown> = {}) {
  return {
    name: "Imported parser fixture",
    pdfBase64: validPdfBase64,
    expectedConsumerInfo: {},
    expectedTradelines: [],
    rawExtractedText: "Imported parser fixture text",
    parserContext: {
      canonicalOutput: { consumerInfo: {}, tradelines: [] },
      replayHash: "imported-replay-hash",
    },
    ...overrides,
  };
}

function installInsertHarness() {
  const builder: Record<string, any> = {};
  builder.values = vi.fn((values: Record<string, unknown>) => {
    mocks.insertValues.push(values);
    return builder;
  });
  builder.returningAll = vi.fn(() => builder);
  builder.execute = vi.fn(async () => []);
  builder.executeTakeFirstOrThrow = vi.fn(async () => {
    const values = mocks.insertValues.at(-1) ?? {};
    return {
      id: 501,
      description: null,
      expectedConsumerInfo: null,
      expectedTradelines: [],
      rawExtractedText: null,
      bureau: null,
      parserMode: "deterministic",
      allowAiFallback: false,
      stageVersion: null,
      extractionSource: null,
      parserContext: null,
      adminReviewStatus: "needs_review",
      ...values,
    };
  });

  mocks.db.insertInto.mockReturnValue(builder);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insertValues.length = 0;
  mocks.getServerUserSession.mockResolvedValue({ user: adminUser });
  mocks.isAdmin.mockReturnValue(true);
  mocks.ensureParserTestAdjudicationSchema.mockResolvedValue(undefined);
  installInsertHarness();
  mocks.runParserLabStage.mockResolvedValue({
    stageVersion: "parser-boundary-test",
    sideEffects: "none",
  });
  mocks.resolveAndValidatePdfPath.mockResolvedValue("C:\\fixtures\\credit-report.pdf");
  mocks.materializeUploadedFixture.mockResolvedValue("C:\\fixtures\\uploaded-report.pdf");
  mocks.startMockLifecycleJob.mockResolvedValue({ jobId: "job-1", status: "queued" });
});

describe("parser and admin upload boundary hardening", () => {
  it("rejects oversized parser-test-case create requests before parser or persistence work", async () => {
    const response = await createParserTestCase(
      oversizedRawRequest("/_api/parser-test-case/create", PARSER_TEST_CASE_UPLOAD_MAX_BYTES)
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "Parser test PDF request body exceeds the 15 MB upload limit",
    });
    expect(mocks.ensureParserTestAdjudicationSchema).not.toHaveBeenCalled();
    expect(mocks.parsePdfThroughProductionHtmlPipeline).not.toHaveBeenCalled();
    expect(mocks.db.insertInto).not.toHaveBeenCalled();
  });

  it("rejects oversized parser-test-case imports", async () => {
    const response = await importParserTestCases(
      postRequest("/_api/parser-test-case/import", {
        testCases: [
          importedTestCase({
            pdfBase64: oversizedBase64For(PARSER_TEST_CASE_UPLOAD_MAX_BYTES),
          }),
        ],
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Parser test PDF exceeds the 15 MB upload limit",
    });
    expect(mocks.ensureParserTestAdjudicationSchema).not.toHaveBeenCalled();
    expect(mocks.db.insertInto).not.toHaveBeenCalled();
  });

  it("rejects excessive parser-test-case import counts", async () => {
    const response = await importParserTestCases(
      postRequest("/_api/parser-test-case/import", {
        testCases: Array.from({ length: PARSER_TEST_CASE_IMPORT_MAX_FILES + 1 }, (_, index) =>
          importedTestCase({ name: `Imported parser fixture ${index}` })
        ),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Parser test import supports at most 25 files per request",
    });
    expect(mocks.ensureParserTestAdjudicationSchema).not.toHaveBeenCalled();
    expect(mocks.db.insertInto).not.toHaveBeenCalled();
  });

  it("rejects oversized parser-lab run requests before parser execution", async () => {
    const response = await runParserLab(
      oversizedRawRequest("/_api/parser-lab/run", PARSER_LAB_UPLOAD_MAX_BYTES)
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "Parser lab PDF request body exceeds the 15 MB upload limit",
    });
    expect(mocks.runParserLabStage).not.toHaveBeenCalled();
  });

  it("rejects malformed base64 before parser-test persistence", async () => {
    const response = await createParserTestCase(
      postRequest("/_api/parser-test-case/create", parserTestCaseInput({ pdfBase64: "not-valid-@@@" }))
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Parser test PDF data must be valid base64",
    });
    expect(mocks.ensureParserTestAdjudicationSchema).not.toHaveBeenCalled();
    expect(mocks.db.insertInto).not.toHaveBeenCalled();
  });

  it("rejects invalid MIME declarations and data-url MIME mismatches", async () => {
    const invalidParserLabMime = await runParserLab(
      postRequest("/_api/parser-lab/run", {
        fileName: "credit-report.pdf",
        mimeType: "text/plain",
        bytesBase64: validPdfBase64,
      })
    );
    expect(invalidParserLabMime.status).toBe(400);
    await expect(invalidParserLabMime.json()).resolves.toEqual({
      error: "Unsupported file type. Please upload a PDF.",
    });
    expect(mocks.runParserLabStage).not.toHaveBeenCalled();

    const invalidParserTestMime = await createParserTestCase(
      postRequest(
        "/_api/parser-test-case/create",
        parserTestCaseInput({
          pdfBase64: `data:text/plain;base64,${validPdfBase64}`,
        })
      )
    );
    expect(invalidParserTestMime.status).toBe(400);
    await expect(invalidParserTestMime.json()).resolves.toEqual({
      error: "File data MIME type must match the declared file type",
    });
    expect(mocks.db.insertInto).not.toHaveBeenCalled();
  });

  it("bounds parser/admin upload filenames", async () => {
    const response = await runParserLab(
      postRequest("/_api/parser-lab/run", {
        fileName: "nested/path/credit-report.pdf",
        mimeType: "application/pdf",
        bytesBase64: validPdfBase64,
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "File name contains unsupported characters",
    });
    expect(mocks.runParserLabStage).not.toHaveBeenCalled();
  });

  it("keeps valid parser-test create/import fixtures accepted without parser fallback", async () => {
    const createResponse = await createParserTestCase(
      postRequest("/_api/parser-test-case/create", parserTestCaseInput())
    );
    expect(createResponse.status).toBe(200);
    const created = await createResponse.json();
    expect(created.testCase).toMatchObject({
      id: 501,
      name: "Synthetic parser fixture",
      parserMode: "deterministic",
      adminReviewStatus: "needs_review",
    });

    const importResponse = await importParserTestCases(
      postRequest("/_api/parser-test-case/import", {
        testCases: [importedTestCase()],
      })
    );
    expect(importResponse.status).toBe(200);
    await expect(importResponse.json()).resolves.toEqual({ importedCount: 1 });

    expect(mocks.parsePdfThroughProductionHtmlPipeline).not.toHaveBeenCalled();
    expect(mocks.db.insertInto).toHaveBeenCalledTimes(2);
    expect(mocks.insertValues.map((value) => value.pdfBase64)).toEqual([
      validPdfBase64,
      validPdfBase64,
    ]);
  });

  it("keeps valid parser-lab runs side-effect free", async () => {
    const output = { stageVersion: "parser-boundary-test", sideEffects: "none" };
    mocks.runParserLabStage.mockResolvedValueOnce(output);

    const response = await runParserLab(
      postRequest("/_api/parser-lab/run", {
        fileName: "credit-report.pdf",
        mimeType: "application/pdf",
        bytesBase64: validPdfBase64,
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(output);
    expect(mocks.runParserLabStage).toHaveBeenCalledWith({
      fileName: "credit-report.pdf",
      mimeType: "application/pdf",
      bytesBase64: validPdfBase64,
      allowAiFallback: false,
    });
    expect(mocks.db.insertInto).not.toHaveBeenCalled();
  });

  it("rejects malformed mock lifecycle uploads before fixture materialization", async () => {
    const response = await runMockLifecycle(
      postRequest("/_api/admin/mock-lifecycle/run", {
        initialReportUpload: {
          fileName: "initial-report.pdf",
          mimeType: "application/pdf",
          bytesBase64: "not-valid-@@@",
        },
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Uploaded fixture data must be valid base64",
    });
    expect(mocks.materializeUploadedFixture).not.toHaveBeenCalled();
    expect(mocks.startMockLifecycleJob).not.toHaveBeenCalled();
  });

  it("rejects oversized mock lifecycle uploads before fixture materialization", async () => {
    const response = await runMockLifecycle(
      oversizedRawRequest(
        "/_api/admin/mock-lifecycle/run",
        ADMIN_MOCK_LIFECYCLE_TOTAL_UPLOAD_MAX_BYTES
      )
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "Mock lifecycle upload request body exceeds the 30 MB upload limit",
    });
    expect(mocks.materializeUploadedFixture).not.toHaveBeenCalled();
    expect(mocks.startMockLifecycleJob).not.toHaveBeenCalled();
  });

  it("rejects invalid mock lifecycle upload MIME declarations", async () => {
    const response = await runMockLifecycle(
      postRequest("/_api/admin/mock-lifecycle/run", {
        initialReportUpload: {
          fileName: "initial-report.pdf",
          mimeType: "text/plain",
          bytesBase64: validPdfBase64,
        },
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Uploaded fixture mimeType must be application/pdf.",
    });
    expect(mocks.materializeUploadedFixture).not.toHaveBeenCalled();
    expect(mocks.startMockLifecycleJob).not.toHaveBeenCalled();
  });

  it("keeps admin auth required before parsing upload request bodies", async () => {
    mocks.getServerUserSession.mockResolvedValue({ user: supportUser });
    mocks.isAdmin.mockReturnValue(false);

    const parserCreateDenied = await createParserTestCase(
      oversizedRawRequest("/_api/parser-test-case/create", PARSER_TEST_CASE_UPLOAD_MAX_BYTES)
    );
    expect(parserCreateDenied.status).toBe(403);
    await expect(parserCreateDenied.json()).resolves.toEqual({ error: "Unauthorized" });

    const parserImportDenied = await importParserTestCases(
      oversizedRawRequest(
        "/_api/parser-test-case/import",
        PARSER_TEST_CASE_UPLOAD_MAX_BYTES * PARSER_TEST_CASE_IMPORT_MAX_FILES
      )
    );
    expect(parserImportDenied.status).toBe(403);
    await expect(parserImportDenied.json()).resolves.toEqual({ error: "Unauthorized" });

    const parserLabDenied = await runParserLab(
      oversizedRawRequest("/_api/parser-lab/run", PARSER_LAB_UPLOAD_MAX_BYTES)
    );
    expect(parserLabDenied.status).toBe(403);
    await expect(parserLabDenied.json()).resolves.toEqual({ error: "Unauthorized" });

    const mockLifecycleDenied = await runMockLifecycle(
      oversizedRawRequest(
        "/_api/admin/mock-lifecycle/run",
        ADMIN_MOCK_LIFECYCLE_UPLOAD_MAX_BYTES
      )
    );
    expect(mockLifecycleDenied.status).toBe(403);
    await expect(mockLifecycleDenied.json()).resolves.toEqual({
      error: "Unauthorized: Admin access required",
    });

    expect(mocks.ensureParserTestAdjudicationSchema).not.toHaveBeenCalled();
    expect(mocks.parsePdfThroughProductionHtmlPipeline).not.toHaveBeenCalled();
    expect(mocks.runParserLabStage).not.toHaveBeenCalled();
    expect(mocks.materializeUploadedFixture).not.toHaveBeenCalled();
    expect(mocks.db.insertInto).not.toHaveBeenCalled();
  });
});
