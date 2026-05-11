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

import { extractCanonicalCreditReport } from "../../helpers/canonicalCreditReportExtractor";
import { isScannedPdfUnsupportedError } from "../../helpers/creditReportPdfEligibility";
import {
  ocrDerivedTransUnionTextFixture,
  scannedImageOnlyPdfBase64Fixture,
} from "../fixtures/creditReportFixtures";

const validQuality: TextQualityAssessment = {
  isValid: true,
  printableRatio: 0.99,
  keywordCount: 10,
  avgWordLength: 5,
  totalChars: ocrDerivedTransUnionTextFixture.length,
};

const invalidPdfTextQuality: TextQualityAssessment = {
  isValid: false,
  printableRatio: 0,
  keywordCount: 0,
  avgWordLength: 0,
  totalChars: 0,
  invalidReason: "Text too short (< 100 characters)",
};

const unavailableDiagnostics: DeterministicOcrDiagnostics = {
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
  pageCount: 2,
  overallConfidence: 0.94,
  pages: [
    {
      pageNumber: 1,
      sourceMethod: "ocr_text",
      engine: "tesseract-cli",
      renderer: "pdftoppm",
      confidence: 0.95,
      charCount: 210,
      wordCount: 35,
      textSnippet: "TransUnion Canada Consumer Disclosure",
    },
    {
      pageNumber: 2,
      sourceMethod: "ocr_text",
      engine: "tesseract-cli",
      renderer: "pdftoppm",
      confidence: 0.93,
      charCount: 310,
      wordCount: 52,
      textSnippet: "Account(s): Creditor Name SCAN BANK VISA",
    },
  ],
  quality: validQuality,
  validation: {
    deterministic: true,
    qualityAccepted: true,
    minimumRules: [
      "pdf text extraction was insufficient",
      "OCR text passed deterministic credit-report text quality checks",
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Phase 2 deterministic OCR readiness", () => {
  it("fails image-only PDFs explicitly when deterministic OCR is unavailable", async () => {
    mocks.extractTextFromPdfWithQuality.mockResolvedValue({
      text: "",
      quality: invalidPdfTextQuality,
      sourceMethod: "pdf_text",
      pdfTextQuality: invalidPdfTextQuality,
      ocrDiagnostics: unavailableDiagnostics,
    });

    let caught: unknown;
    try {
      await extractCanonicalCreditReport({
        bytesBase64: scannedImageOnlyPdfBase64Fixture,
        mimeType: "application/pdf",
        allowAiFallback: true,
      });
    } catch (error) {
      caught = error;
    }

    expect(isScannedPdfUnsupportedError(caught)).toBe(true);
    expect(caught).toMatchObject({
      code: "SCANNED_PDF_UNSUPPORTED",
      ocrDiagnostics: unavailableDiagnostics,
    });
    expect(mocks.extractTextFromPdfWithQuality).toHaveBeenCalledWith(
      scannedImageOnlyPdfBase64Fixture,
      expect.objectContaining({
        allowOcrFallback: false,
        allowDeterministicOcr: true,
      }),
    );
  });

  it("allows deterministic OCR text into canonical fields with provenance and replay metadata", async () => {
    mocks.extractTextFromPdfWithQuality.mockResolvedValue({
      text: ocrDerivedTransUnionTextFixture,
      quality: validQuality,
      sourceMethod: "ocr_text",
      pdfTextQuality: invalidPdfTextQuality,
      ocrProvenance,
    });

    const result = await extractCanonicalCreditReport({
      bytesBase64: scannedImageOnlyPdfBase64Fixture,
      mimeType: "application/pdf",
      allowAiFallback: true,
    });

    const dobEvidence = result.canonicalOutput.evidence.fieldIndex["consumerInfo.dateOfBirth"];
    const creditorEvidence = result.canonicalOutput.evidence.fieldIndex["tradelines[0].creditorName"];

    expect(result.extractionSource).toBe("ocr_text");
    expect(result.provenance.sourceEvidence).toBe("ocr_text");
    expect(result.provenance.aiFallbackCanonicalEligibility).toBe("disabled");
    expect(result.provenance.normalizedByAi).toBe(false);
    expect(result.provenance.ocrProvenance).toEqual(ocrProvenance);
    expect(result.provenance.replayValidation.ok).toBe(true);
    expect(result.deterministicPipeline.sourceMethod).toBe("ocr_text");
    expect(result.deterministicPipeline.ocrProvenance).toEqual(ocrProvenance);
    expect(result.deterministicPipeline.replayHash).toBe(result.provenance.replayHash);
    expect(result.parseResult.reportMetadata.transUnionCaseId).toBe("OCR-2026-01");
    expect(result.parseResult.tradelines).toHaveLength(1);

    expect(dobEvidence).toMatchObject({
      sourceMethod: "ocr_text",
      pageNumber: 1,
    });
    expect(dobEvidence.textSnippet).toContain("Birth Date");
    expect(creditorEvidence).toMatchObject({
      sourceMethod: "ocr_text",
      pageNumber: 2,
    });
    expect(creditorEvidence.textSnippet).toContain("SCAN BANK VISA");
    expect(result.provenance.attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: "pdf_text", status: "failed" }),
        expect.objectContaining({ method: "ocr_text", status: "succeeded" }),
        expect.objectContaining({ method: "gemini", status: "skipped" }),
      ]),
    );
  });
});
