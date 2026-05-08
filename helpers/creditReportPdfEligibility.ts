import { extractTextFromPdfWithQuality } from "./pdfTextExtractor";
import type { TextQualityAssessment } from "./pdfTextQualityChecker";

export const SCANNED_PDF_UNSUPPORTED_CODE = "SCANNED_PDF_UNSUPPORTED";
export const SCANNED_PDF_UNSUPPORTED_MESSAGE =
  "This PDF appears to be scanned or image-only. Please upload the original downloaded PDF from Equifax or TransUnion Canada with selectable text. Scanned/photo PDFs are not supported yet.";

export class ScannedPdfUnsupportedError extends Error {
  readonly code = SCANNED_PDF_UNSUPPORTED_CODE;
  readonly statusCode = 400;

  constructor(public readonly quality: TextQualityAssessment) {
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
}

export async function assertTextBasedCreditReportPdf(input: {
  bytesBase64: string;
  mimeType: string;
}): Promise<CreditReportPdfEligibility> {
  if (input.mimeType !== "application/pdf") {
    throw new Error("Unsupported file type. Please upload a PDF.");
  }

  const result = await extractTextFromPdfWithQuality(input.bytesBase64, {
    allowOcrFallback: false,
  });

  if (!result.quality.isValid) {
    throw new ScannedPdfUnsupportedError(result.quality);
  }

  return {
    rawText: result.text,
    quality: result.quality,
  };
}
