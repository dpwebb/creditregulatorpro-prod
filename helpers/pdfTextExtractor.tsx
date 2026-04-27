import pdfParse from "pdf-parse";
import { assessTextQuality } from "./pdfTextQualityChecker";
import { extractTextWithGeminiOcr } from "./geminiOcrExtractor";

/**
 * Extracts text content from a base64-encoded PDF document using pdf-parse.
 * This is the primary extraction method for text-based PDFs.
 *
 * @param pdfData The PDF data as a Uint8Array
 * @returns The extracted text content, or empty string if extraction fails
 */
async function extractTextWithPdfParse(pdfData: Uint8Array): Promise<string> {
  try {
    // pdf-parse accepts Buffer or Uint8Array-like objects
    const data = await pdfParse(pdfData as any);
    console.log(
      `[PDF Extract] pdf-parse: Extracted ${data.text.length} characters from ${data.numpages} pages`,
    );
    return data.text;
  } catch (error) {
    if (error instanceof Error) {
      console.error(
        `[PDF Extract] pdf-parse failed:`,
        error.message,
      );
    } else {
      console.error(`[PDF Extract] pdf-parse failed:`, error);
    }
    return "";
  }
}

/**
 * Extracts text content from a base64-encoded PDF document.
 * 
 * Uses pdf-parse for extraction, with Google Gemini OCR fallback when text quality is insufficient.
 * 
 * Extraction flow:
 * 1. Attempt text extraction with pdf-parse
 * 2. Assess text quality
 * 3. If quality is insufficient, attempt OCR with Google Gemini
 * 4. If OCR succeeds and quality improves, use OCR text; otherwise use pdf-parse text
 * 
 * Text quality is assessed by checking:
 * - Sufficient length (at least 100 characters)
 * - High ratio of printable characters (80%+)
 * - Presence of credit report keywords (3+ matches)
 * - Reasonable word length (not garbled)
 *
 * @param base64Data The PDF data encoded as base64 string
 * @returns The extracted text content, or empty string if extraction fails
 */
export async function extractTextFromPdf(
  base64Data: string,
): Promise<string> {
  try {
    // Remove data URL prefix if present (e.g., "data:application/pdf;base64,")
    const base64Clean = base64Data.includes(",")
      ? base64Data.split(",")[1]
      : base64Data;

        // Decode base64 to Uint8Array using Web APIs (Buffer not available in serverless)
    const binaryString = atob(base64Clean);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    // pdf-parse accepts Buffer or Uint8Array
    const pdfBuffer = bytes;

    console.log(`[PDF Extract] Attempting pdf-parse extraction...`);
    const textFromParse = await extractTextWithPdfParse(pdfBuffer);

    // Assess text quality
    const quality = assessTextQuality(textFromParse);
    
    console.log(
      `[PDF Extract] Text quality assessment:`,
      {
        isValid: quality.isValid,
        totalChars: quality.totalChars,
        printableRatio: `${(quality.printableRatio * 100).toFixed(1)}%`,
        keywordCount: quality.keywordCount,
        avgWordLength: quality.avgWordLength.toFixed(1),
        invalidReason: quality.invalidReason,
      }
    );

    // If text quality is insufficient, attempt OCR fallback
    if (!quality.isValid) {
      console.warn(
        `[PDF Extract] ⚠️  Text quality insufficient: ${quality.invalidReason}`
      );
      console.log(
        `[PDF Extract] Attempting OCR fallback with Google Gemini...`
      );

      const ocrText = await extractTextWithGeminiOcr(base64Clean);

      // Assess OCR text quality
      if (ocrText) {
        const ocrQuality = assessTextQuality(ocrText);
        
        console.log(
          `[PDF Extract] OCR text quality assessment:`,
          {
            isValid: ocrQuality.isValid,
            totalChars: ocrQuality.totalChars,
            printableRatio: `${(ocrQuality.printableRatio * 100).toFixed(1)}%`,
            keywordCount: ocrQuality.keywordCount,
            avgWordLength: ocrQuality.avgWordLength.toFixed(1),
            invalidReason: ocrQuality.invalidReason,
          }
        );

        // Use OCR text if it's better quality
        if (ocrQuality.isValid) {
          console.log(
            `[PDF Extract] ✓ OCR succeeded with acceptable quality, using OCR text`
          );
          return ocrText;
        } else {
          console.warn(
            `[PDF Extract] OCR text also has quality issues: ${ocrQuality.invalidReason}`
          );
          console.warn(
            `[PDF Extract] Falling back to pdf-parse text`
          );
        }
      } else {
        console.warn(
          `[PDF Extract] OCR extraction returned empty text, falling back to pdf-parse text`
        );
      }
    } else {
      console.log(
        `[PDF Extract] ✓ Text quality acceptable, using pdf-parse text`
      );
    }

    return textFromParse;

  } catch (error) {
    if (error instanceof Error) {
      console.error(`[PDF Extract] Failed to extract text from PDF:`, error.message);
    } else {
      console.error(`[PDF Extract] Failed to extract text from PDF:`, error);
    }
    return "";
  }
}