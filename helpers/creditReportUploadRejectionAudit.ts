import { logAudit } from "./auditLogger";
import {
  SCANNED_PDF_UNSUPPORTED_CODE,
  SCANNED_PDF_UNSUPPORTED_MESSAGE,
} from "./creditReportPdfEligibility";
import { base64PayloadToBuffer, sha256Hex } from "./reportBinaryUtils";
import type { TextQualityAssessment } from "./pdfTextQualityChecker";

export type CreditReportUploadRoute =
  | "anonymous_preview"
  | "authenticated_ingest"
  | "ocr_extract";

export interface RejectedScannedPdfUploadAuditInput {
  route: CreditReportUploadRoute;
  bytesBase64: string;
  mimeType: string;
  userId?: number | null;
  request?: Request;
  quality?: TextQualityAssessment | null;
}

function getUploadMetrics(bytesBase64: string): {
  sha256: string | null;
  fileSizeBytes: number | null;
} {
  try {
    const buffer = base64PayloadToBuffer(bytesBase64);
    return {
      sha256: sha256Hex(buffer),
      fileSizeBytes: buffer.length,
    };
  } catch (error) {
    console.warn("[Upload Rejection Audit] Could not derive upload metrics:", error);
    return {
      sha256: null,
      fileSizeBytes: null,
    };
  }
}

function summarizeTextQuality(quality: TextQualityAssessment | null | undefined) {
  if (!quality) return null;

  return {
    isValid: quality.isValid,
    printableRatio: quality.printableRatio,
    keywordCount: quality.keywordCount,
    avgWordLength: quality.avgWordLength,
    totalChars: quality.totalChars,
    invalidReason: quality.invalidReason ?? null,
  };
}

export async function logRejectedScannedPdfUpload(
  input: RejectedScannedPdfUploadAuditInput,
): Promise<void> {
  const metrics = getUploadMetrics(input.bytesBase64);

  await logAudit({
    action: "UPLOAD",
    entityType: "REPORT_ARTIFACT",
    entityId: null,
    userId: input.userId ?? null,
    status: "FAILURE",
    errorMessage: SCANNED_PDF_UNSUPPORTED_MESSAGE,
    request: input.request,
    details: {
      route: input.route,
      reasonCode: SCANNED_PDF_UNSUPPORTED_CODE,
      mimeType: input.mimeType,
      fileSizeBytes: metrics.fileSizeBytes,
      sha256: metrics.sha256,
      persistedArtifact: false,
      textQuality: summarizeTextQuality(input.quality),
    },
  });
}
