import pdfParse from "pdf-parse";
import { assessTextQuality } from "./pdfTextQualityChecker";
import type { TextQualityAssessment } from "./pdfTextQualityChecker";
import {
  createDeterministicCliOcrProvider,
  type DeterministicOcrCoordinateIndex,
  type DeterministicOcrDiagnostics,
  type DeterministicOcrProvider,
  type DeterministicOcrProvenance,
} from "./deterministicOcr";
import { base64PayloadToBuffer, sha256Hex } from "./reportBinaryUtils";

export type PdfTextSourceMethod = "pdf_text" | "ocr_text";

export interface PdfTextExtractionResult {
  text: string;
  quality: TextQualityAssessment;
  sourceMethod?: PdfTextSourceMethod;
  pdfTextQuality?: TextQualityAssessment;
  ocrProvenance?: DeterministicOcrProvenance;
  ocrCoordinateIndex?: DeterministicOcrCoordinateIndex;
  ocrDiagnostics?: DeterministicOcrDiagnostics;
}

export interface PdfTextExtractionOptions {
  allowOcrFallback?: boolean;
  allowDeterministicOcr?: boolean;
  deterministicOcrProvider?: DeterministicOcrProvider;
}

/**
 * Extracts text content from a base64-encoded PDF document using pdf-parse.
 * This is the deterministic primary extraction method for text-based PDFs.
 */
async function extractTextWithPdfParse(pdfData: Uint8Array): Promise<string> {
  try {
    const data = await pdfParse(pdfData as any);
    console.log(
      `[PDF Extract] pdf-parse: Extracted ${data.text.length} characters from ${data.numpages} pages`,
    );
    return data.text;
  } catch (error) {
    if (error instanceof Error) {
      console.error("[PDF Extract] pdf-parse failed:", error.message);
    } else {
      console.error("[PDF Extract] pdf-parse failed:", error);
    }
    return "";
  }
}

/**
 * Extracts text content from a base64-encoded PDF document.
 *
 * AI OCR fallback is disabled for authoritative credit ingestion. Scanned-PDF
 * support must come from a deterministic OCR implementation before it can feed
 * canonical parsing.
 */
export async function extractTextFromPdf(
  base64Data: string,
  options: PdfTextExtractionOptions = {},
): Promise<string> {
  const result = await extractTextFromPdfWithQuality(base64Data, options);
  return result.text;
}

export async function extractTextFromPdfWithQuality(
  base64Data: string,
  options: PdfTextExtractionOptions = {},
): Promise<PdfTextExtractionResult> {
  try {
    const allowOcrFallback = options.allowOcrFallback ?? false;
    const allowDeterministicOcr =
      options.allowDeterministicOcr ?? allowOcrFallback;

    const base64Clean = base64Data.includes(",")
      ? base64Data.split(",")[1]
      : base64Data;

    const buffer = base64PayloadToBuffer(base64Clean);
    const bytes = new Uint8Array(buffer);
    const documentSha256 = sha256Hex(buffer);

    console.log("[PDF Extract] Attempting pdf-parse extraction...");
    const textFromParse = await extractTextWithPdfParse(bytes);

    const quality = assessTextQuality(textFromParse);
    console.log("[PDF Extract] Text quality assessment:", {
      isValid: quality.isValid,
      totalChars: quality.totalChars,
      printableRatio: `${(quality.printableRatio * 100).toFixed(1)}%`,
      keywordCount: quality.keywordCount,
      avgWordLength: quality.avgWordLength.toFixed(1),
      invalidReason: quality.invalidReason,
    });

    if (!quality.isValid) {
      console.warn(
        `[PDF Extract] Text quality insufficient: ${quality.invalidReason}`,
      );
      if (allowDeterministicOcr) {
        console.warn(
          "[PDF Extract] Attempting deterministic OCR fallback. AI OCR remains disabled for authoritative extraction.",
        );

        const provider =
          options.deterministicOcrProvider ?? createDeterministicCliOcrProvider();
        const ocrResult = await provider.extract({
          bytesBase64: base64Data,
          mimeType: "application/pdf",
          documentSha256,
        });

        if (ocrResult.status === "succeeded") {
          console.log("[PDF Extract] Deterministic OCR text passed quality checks");
          return {
            text: ocrResult.text,
            quality: ocrResult.quality,
            sourceMethod: "ocr_text",
            pdfTextQuality: quality,
            ocrProvenance: ocrResult.provenance,
            ocrCoordinateIndex: ocrResult.coordinateIndex,
          };
        }

        console.warn("[PDF Extract] Deterministic OCR was not usable:", {
          status: ocrResult.status,
          reason: ocrResult.diagnostics.reason,
        });
        return {
          text: ocrResult.text ?? textFromParse,
          quality: ocrResult.quality ?? quality,
          sourceMethod: "pdf_text",
          pdfTextQuality: quality,
          ocrDiagnostics: ocrResult.diagnostics,
        };
      } else if (allowOcrFallback) {
        console.warn(
          "[PDF Extract] OCR fallback was requested, but deterministic OCR is not enabled and AI OCR is disabled by policy.",
        );
      } else {
        console.warn(
          "[PDF Extract] OCR fallback disabled for this parse. Returning pdf-parse text.",
        );
      }
      return { text: textFromParse, quality, sourceMethod: "pdf_text", pdfTextQuality: quality };
    }

    console.log("[PDF Extract] Text quality acceptable, using pdf-parse text");
    return { text: textFromParse, quality, sourceMethod: "pdf_text", pdfTextQuality: quality };
  } catch (error) {
    if (error instanceof Error) {
      console.error("[PDF Extract] Failed to extract text from PDF:", error.message);
    } else {
      console.error("[PDF Extract] Failed to extract text from PDF:", error);
    }
    const text = "";
    return { text, quality: assessTextQuality(text), sourceMethod: "pdf_text" };
  }
}
