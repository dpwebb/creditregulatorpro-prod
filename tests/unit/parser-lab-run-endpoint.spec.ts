import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TextQualityAssessment } from "../../helpers/pdfTextQualityChecker";
import {
  runParserLabStage as runParserLabStageClient,
  type OutputType,
} from "../../endpoints/parser-lab/run_POST.schema";

const mocks = vi.hoisted(() => ({
  getServerUserSession: vi.fn(),
  isAdmin: vi.fn(),
  runParserLabStage: vi.fn(),
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

vi.mock("../../helpers/userRoleUtils", () => ({
  isAdmin: mocks.isAdmin,
}));

vi.mock("../../helpers/parserLabStage", () => ({
  runParserLabStage: mocks.runParserLabStage,
}));

import { handle } from "../../endpoints/parser-lab/run_POST";
import {
  SCANNED_PDF_UNSUPPORTED_CODE,
  ScannedPdfUnsupportedError,
} from "../../helpers/creditReportPdfEligibility";

const adminUser = { id: 1, role: "admin" };

const validParserLabInput = {
  fileName: "credit-report.pdf",
  mimeType: "application/pdf",
  bytesBase64: "JVBERi0xLjQ=",
};

const invalidQuality: TextQualityAssessment = {
  isValid: false,
  printableRatio: 0,
  keywordCount: 0,
  avgWordLength: 0,
  totalChars: 0,
  invalidReason: "Text too short (< 100 characters)",
};

function parserLabRequest(body: unknown): Request {
  return new Request("http://localhost/_api/parser-lab/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function successfulParserLabOutput(): OutputType {
  return {
    stageVersion: "parser-lab-test",
    sideEffects: "none",
    fileName: "credit-report.pdf",
    bureauName: "TransUnion",
    extractionSource: "pdf_text",
    quality: {
      confidenceScore: 100,
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
      originalDocumentSha256: "source-sha",
      canonicalResultSha256: "canonical-sha",
      replayHash: "replay-hash",
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
    parsed: {
      reportMetadata: {},
      consumerInfo: {},
      tradelines: [],
      inquiries: [],
      publicRecords: [],
      employmentInfo: [],
      creditScores: [],
    },
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
    rawExtractedText: "TransUnion credit report account balance payment inquiry",
    rawTextPreview: "TransUnion credit report account balance payment inquiry",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerUserSession.mockResolvedValue({ user: adminUser });
  mocks.isAdmin.mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parser lab run endpoint", () => {
  it("maps scanned or image-only PDF rejection to a controlled 400 response", async () => {
    mocks.runParserLabStage.mockRejectedValue(
      new ScannedPdfUnsupportedError(invalidQuality, null),
    );

    const response = await handle(parserLabRequest(validParserLabInput));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: SCANNED_PDF_UNSUPPORTED_CODE,
      message:
        "This PDF appears to be scanned or image-only. Deterministic OCR did not produce valid credit-report text.",
      action: "Try a text-based credit report PDF or verify OCR support before retrying.",
      stage: "parser_lab",
      sideEffects: "none",
    });
    expect(body).not.toHaveProperty("artifactId");
    expect(body).not.toHaveProperty("reportId");
  });

  it("keeps unsupported file-type behavior on the existing 400 path", async () => {
    const response = await handle(
      parserLabRequest({
        fileName: "credit-report.txt",
        mimeType: "text/plain",
        bytesBase64: "bm90IGEgcGRm",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Unsupported file type. Please upload a PDF.",
    });
    expect(mocks.runParserLabStage).not.toHaveBeenCalled();
  });

  it("keeps the successful parser-lab flow side-effect free", async () => {
    const output = successfulParserLabOutput();
    mocks.runParserLabStage.mockResolvedValue(output);

    const response = await handle(parserLabRequest(validParserLabInput));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(output);
    expect(mocks.runParserLabStage).toHaveBeenCalledWith({
      fileName: "credit-report.pdf",
      mimeType: "application/pdf",
      bytesBase64: "JVBERi0xLjQ=",
      allowAiFallback: false,
    });
  });

  it("does not add report artifact persistence to Stage Lab", () => {
    const endpointSource = readFileSync(
      resolve("endpoints/parser-lab/run_POST.ts"),
      "utf8",
    );
    const stageSource = readFileSync(resolve("helpers/parserLabStage.tsx"), "utf8");

    expect(`${endpointSource}\n${stageSource}`).not.toMatch(
      /\b(createReportArtifact|reportArtifact|artifactId|reportId|insertInto|updateTable|db\.)\b/,
    );
  });

  it("surfaces controlled scanned-PDF messages through the Stage Lab client helper", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: SCANNED_PDF_UNSUPPORTED_CODE,
          message:
            "This PDF appears to be scanned or image-only. Deterministic OCR did not produce valid credit-report text.",
          action: "Try a text-based credit report PDF or verify OCR support before retrying.",
          stage: "parser_lab",
          sideEffects: "none",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(runParserLabStageClient(validParserLabInput)).rejects.toThrow(
      "This PDF appears to be scanned or image-only. Deterministic OCR did not produce valid credit-report text.",
    );
  });
});
