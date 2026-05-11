import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TextQualityAssessment } from "../../helpers/pdfTextQualityChecker";
import type {
  DeterministicOcrDiagnostics,
  DeterministicOcrProvenance,
} from "../../helpers/deterministicOcr";

const mocks = vi.hoisted(() => ({
  extractTextFromPdfWithQuality: vi.fn(),
}));

vi.mock("../../helpers/pdfTextExtractor", () => ({
  extractTextFromPdfWithQuality: mocks.extractTextFromPdfWithQuality,
}));

import {
  assertTextBasedCreditReportPdf,
  isScannedPdfUnsupportedError,
  SCANNED_PDF_UNSUPPORTED_CODE,
  SCANNED_PDF_UNSUPPORTED_MESSAGE,
  ScannedPdfUnsupportedError,
} from "../../helpers/creditReportPdfEligibility";

const validQuality: TextQualityAssessment = {
  isValid: true,
  printableRatio: 0.98,
  keywordCount: 7,
  avgWordLength: 5,
  totalChars: 5000,
};

const invalidQuality: TextQualityAssessment = {
  isValid: false,
  printableRatio: 0,
  keywordCount: 0,
  avgWordLength: 0,
  totalChars: 0,
  invalidReason: "Text too short (< 100 characters)",
};

const ocrUnavailableDiagnostics: DeterministicOcrDiagnostics = {
  enabled: false,
  available: false,
  engine: "tesseract-cli",
  renderer: "pdftoppm",
  engineVersion: null,
  rendererVersion: null,
  reason: "Deterministic OCR is disabled.",
};

const ocrProvenance: DeterministicOcrProvenance = {
  sourceMethod: "ocr_text",
  engine: "tesseract-cli",
  renderer: "pdftoppm",
  engineVersion: "tesseract 5.3.0",
  rendererVersion: "pdftoppm 23.11.0",
  pageCount: 1,
  overallConfidence: 0.92,
  pages: [
    {
      pageNumber: 1,
      sourceMethod: "ocr_text",
      engine: "tesseract-cli",
      renderer: "pdftoppm",
      confidence: 0.92,
      charCount: 5000,
      wordCount: 800,
      textSnippet: "TransUnion Canada Consumer Disclosure",
    },
  ],
  quality: validQuality,
  validation: {
    deterministic: true,
    qualityAccepted: true,
    minimumRules: ["OCR text passed deterministic credit-report text quality checks"],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("credit report PDF eligibility", () => {
  it("returns pre-extracted text and quality for readable credit-report PDFs", async () => {
    mocks.extractTextFromPdfWithQuality.mockResolvedValue({
      text: "TransUnion credit report account balance payment inquiry",
      quality: validQuality,
    });

    const result = await assertTextBasedCreditReportPdf({
      bytesBase64: "JVBERi0xLjQ=",
      mimeType: "application/pdf",
    });

    expect(result).toEqual({
      rawText: "TransUnion credit report account balance payment inquiry",
      quality: validQuality,
      sourceMethod: "pdf_text",
      pdfTextQuality: undefined,
      ocrProvenance: undefined,
      ocrDiagnostics: undefined,
    });
    expect(mocks.extractTextFromPdfWithQuality).toHaveBeenCalledWith(
      "JVBERi0xLjQ=",
      expect.objectContaining({
        allowOcrFallback: false,
        allowDeterministicOcr: false,
      }),
    );
  });

  it("rejects image-only or scanned PDFs with the configured upload message", async () => {
    mocks.extractTextFromPdfWithQuality.mockResolvedValue({
      text: "",
      quality: invalidQuality,
      sourceMethod: "pdf_text",
      pdfTextQuality: invalidQuality,
      ocrDiagnostics: ocrUnavailableDiagnostics,
    });

    let caught: unknown;
    try {
      await assertTextBasedCreditReportPdf({
        bytesBase64: "JVBERi0xLjQ=",
        mimeType: "application/pdf",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScannedPdfUnsupportedError);
    expect(isScannedPdfUnsupportedError(caught)).toBe(true);
    expect(caught).toMatchObject({
      code: SCANNED_PDF_UNSUPPORTED_CODE,
      statusCode: 400,
      message: SCANNED_PDF_UNSUPPORTED_MESSAGE,
      quality: invalidQuality,
      ocrDiagnostics: ocrUnavailableDiagnostics,
    });
  });

  it("accepts OCR text only when deterministic OCR provenance and quality are present", async () => {
    mocks.extractTextFromPdfWithQuality.mockResolvedValue({
      text: "TransUnion credit report account balance payment inquiry",
      quality: validQuality,
      sourceMethod: "ocr_text",
      pdfTextQuality: invalidQuality,
      ocrProvenance,
    });

    const result = await assertTextBasedCreditReportPdf(
      {
        bytesBase64: "JVBERi0xLjQ=",
        mimeType: "application/pdf",
      },
      { allowDeterministicOcr: true },
    );

    expect(result).toMatchObject({
      rawText: "TransUnion credit report account balance payment inquiry",
      sourceMethod: "ocr_text",
      quality: validQuality,
      pdfTextQuality: invalidQuality,
      ocrProvenance,
    });
    expect(mocks.extractTextFromPdfWithQuality).toHaveBeenCalledWith(
      "JVBERi0xLjQ=",
      expect.objectContaining({
        allowOcrFallback: false,
        allowDeterministicOcr: true,
      }),
    );
  });

  it("does not parse unsupported MIME types", async () => {
    await expect(
      assertTextBasedCreditReportPdf({
        bytesBase64: "PGh0bWw+",
        mimeType: "text/html",
      }),
    ).rejects.toThrow("Unsupported file type. Please upload a PDF.");

    expect(mocks.extractTextFromPdfWithQuality).not.toHaveBeenCalled();
  });

  it("recognizes serialized scanned-PDF errors by code", () => {
    expect(
      isScannedPdfUnsupportedError({
        code: SCANNED_PDF_UNSUPPORTED_CODE,
        message: SCANNED_PDF_UNSUPPORTED_MESSAGE,
      }),
    ).toBe(true);
  });
});
