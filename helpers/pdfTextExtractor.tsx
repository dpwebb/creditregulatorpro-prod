import pdfParse from "pdf-parse";
import { assessTextQuality } from "./pdfTextQualityChecker";
import type { TextQualityAssessment } from "./pdfTextQualityChecker";

export interface PdfTextExtractionResult {
  text: string;
  quality: TextQualityAssessment;
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
  options: { allowOcrFallback?: boolean } = {},
): Promise<string> {
  const result = await extractTextFromPdfWithQuality(base64Data, options);
  return result.text;
}

export async function extractTextFromPdfWithQuality(
  base64Data: string,
  options: { allowOcrFallback?: boolean } = {},
): Promise<PdfTextExtractionResult> {
  try {
    const allowOcrFallback = options.allowOcrFallback ?? false;

    const base64Clean = base64Data.includes(",")
      ? base64Data.split(",")[1]
      : base64Data;

    const binaryString = atob(base64Clean);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

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
      if (allowOcrFallback) {
        console.warn(
          "[PDF Extract] OCR fallback was requested, but AI OCR is disabled by deterministic ingestion policy.",
        );
      } else {
        console.warn(
          "[PDF Extract] OCR fallback disabled for this parse. Returning pdf-parse text.",
        );
      }
      return { text: textFromParse, quality };
    }

    console.log("[PDF Extract] Text quality acceptable, using pdf-parse text");
    return { text: textFromParse, quality };
  } catch (error) {
    if (error instanceof Error) {
      console.error("[PDF Extract] Failed to extract text from PDF:", error.message);
    } else {
      console.error("[PDF Extract] Failed to extract text from PDF:", error);
    }
    const text = "";
    return { text, quality: assessTextQuality(text) };
  }
}
