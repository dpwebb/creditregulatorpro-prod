import { describe, expect, it, vi } from "vitest";

import { extractCanonicalCreditReport } from "../../helpers/canonicalCreditReportExtractor";
import {
  parsePdfThroughProductionHtmlPipeline,
  resolveParserTestAllowAiFallback,
} from "../../helpers/parserTestProductionParser";

vi.mock("../../helpers/canonicalCreditReportExtractor", () => ({
  extractCanonicalCreditReport: vi.fn(),
}));

const extractCanonicalCreditReportMock = vi.mocked(extractCanonicalCreditReport);

function mockExtraction() {
  extractCanonicalCreditReportMock.mockResolvedValue({
    parseResult: {
      rawText: "raw text",
      sourceBureau: null,
      consumerInfo: null,
      reportMetadata: {},
      tradelines: [],
      creditScores: [],
      inquiries: [],
      publicRecords: [],
      consumerStatements: [],
      employmentInfo: [],
      paymentHistories: [],
    } as any,
    llmData: {},
    rawHtml: null,
    rawText: "raw text",
    extractionSource: "pdf_text",
    parserQuality: {} as any,
    provenance: {} as any,
  });
}

describe("parsePdfThroughProductionHtmlPipeline", () => {
  it("passes saved AI fallback settings through to canonical extraction", async () => {
    mockExtraction();

    await parsePdfThroughProductionHtmlPipeline("pdf-base64", { allowAiFallback: false });

    expect(extractCanonicalCreditReportMock).toHaveBeenCalledWith({
      bytesBase64: "pdf-base64",
      mimeType: "application/pdf",
      allowAiFallback: false,
    });
  });

  it("defaults to AI fallback enabled when no test case setting exists", async () => {
    mockExtraction();

    await parsePdfThroughProductionHtmlPipeline("pdf-base64");

    expect(extractCanonicalCreditReportMock).toHaveBeenCalledWith({
      bytesBase64: "pdf-base64",
      mimeType: "application/pdf",
      allowAiFallback: true,
    });
  });
});

describe("resolveParserTestAllowAiFallback", () => {
  it("uses an explicit saved AI fallback setting first", () => {
    expect(resolveParserTestAllowAiFallback({
      allowAiFallback: false,
      parserMode: "ai_fallback_enabled",
    })).toBe(false);
  });

  it("infers deterministic parser mode as AI fallback disabled", () => {
    expect(resolveParserTestAllowAiFallback({
      allowAiFallback: null,
      parserMode: "deterministic",
    })).toBe(false);
  });
});
