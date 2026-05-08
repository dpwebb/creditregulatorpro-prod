import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TextQualityAssessment } from "../../helpers/pdfTextQualityChecker";

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
    });
    expect(mocks.extractTextFromPdfWithQuality).toHaveBeenCalledWith(
      "JVBERi0xLjQ=",
      { allowOcrFallback: false },
    );
  });

  it("rejects image-only or scanned PDFs with the configured upload message", async () => {
    mocks.extractTextFromPdfWithQuality.mockResolvedValue({
      text: "",
      quality: invalidQuality,
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
    });
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
