/**
 * Legacy AI PDF fallback compatibility shim.
 *
 * Authoritative credit ingestion must not call OpenAI/Gemini fallback extractors.
 * These exports are retained only to keep old imports safe; they fail closed.
 */

export async function extractHtmlWithOpenAI(base64Pdf: string): Promise<string | null> {
  void base64Pdf;
  return null;
}

export async function extractHtmlWithGemini(base64Pdf: string): Promise<string | null> {
  void base64Pdf;
  return null;
}

export async function extractHtmlWithFallbackChain(
  base64Pdf: string,
): Promise<{ html: string; source: "openai" | "gemini" } | null> {
  void base64Pdf;
  return null;
}
