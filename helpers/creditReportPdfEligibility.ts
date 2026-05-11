import { extractTextFromPdfWithQuality } from "./pdfTextExtractor";
import type { TextQualityAssessment } from "./pdfTextQualityChecker";
import type {
  DeterministicOcrDiagnostics,
  DeterministicOcrProvider,
  DeterministicOcrProvenance,
} from "./deterministicOcr";
import type { PdfTextSourceMethod } from "./pdfTextExtractor";

export const SCANNED_PDF_UNSUPPORTED_CODE = "SCANNED_PDF_UNSUPPORTED";
export const SCANNED_PDF_UNSUPPORTED_MESSAGE =
  "This PDF appears to be scanned or image-only. Deterministic OCR is unavailable or did not produce valid credit-report text. Please upload the original downloaded PDF from Equifax or TransUnion Canada with selectable text.";

export class ScannedPdfUnsupportedError extends Error {
  readonly code = SCANNED_PDF_UNSUPPORTED_CODE;
  readonly statusCode = 400;

  constructor(
    public readonly quality: TextQualityAssessment,
    public readonly ocrDiagnostics: DeterministicOcrDiagnostics | null = null,
  ) {
    super(SCANNED_PDF_UNSUPPORTED_MESSAGE);
    this.name = "ScannedPdfUnsupportedError";
  }
}

export function isScannedPdfUnsupportedError(
  error: unknown,
): error is ScannedPdfUnsupportedError {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  return (
    error instanceof ScannedPdfUnsupportedError ||
    (typeof error === "object" &&
      error !== null &&
      candidate?.code === SCANNED_PDF_UNSUPPORTED_CODE &&
      typeof candidate.message === "string")
  );
}

export interface CreditReportPdfEligibility {
  rawText: string;
  quality: TextQualityAssessment;
  sourceMethod: PdfTextSourceMethod;
  pdfTextQuality?: TextQualityAssessment;
  ocrProvenance?: DeterministicOcrProvenance;
  ocrDiagnostics?: DeterministicOcrDiagnostics;
}

export interface CreditReportPdfEligibilityOptions {
  allowDeterministicOcr?: boolean;
  deterministicOcrProvider?: DeterministicOcrProvider;
}

export async function assertTextBasedCreditReportPdf(input: {
  bytesBase64: string;
  mimeType: string;
}, options: CreditReportPdfEligibilityOptions = {}): Promise<CreditReportPdfEligibility> {
  if (input.mimeType !== "application/pdf") {
    throw new Error("Unsupported file type. Please upload a PDF.");
  }

  const result = await extractTextFromPdfWithQuality(input.bytesBase64, {
    allowOcrFallback: false,
    allowDeterministicOcr: options.allowDeterministicOcr ?? false,
    deterministicOcrProvider: options.deterministicOcrProvider,
  });
  const sourceMethod = result.sourceMethod ?? "pdf_text";

  if (!result.quality.isValid) {
    throw new ScannedPdfUnsupportedError(result.quality, result.ocrDiagnostics ?? null);
  }

  if (sourceMethod === "ocr_text" && !result.ocrProvenance) {
    throw new ScannedPdfUnsupportedError(result.quality, result.ocrDiagnostics ?? null);
  }

  return {
    rawText: result.text,
    quality: result.quality,
    sourceMethod,
    pdfTextQuality: result.pdfTextQuality,
    ocrProvenance: result.ocrProvenance,
    ocrDiagnostics: result.ocrDiagnostics,
  };
}
