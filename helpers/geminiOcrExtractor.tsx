/**
 * Legacy Gemini OCR compatibility shim.
 *
 * Credit ingestion may not use AI OCR as authoritative text extraction. This
 * export is retained only so old imports fail closed without network calls.
 */

export async function extractTextWithGeminiOcr(
  base64Data: string,
): Promise<string> {
  void base64Data;
  return "";
}
