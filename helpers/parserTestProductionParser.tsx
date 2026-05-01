import { routeHtmlToComprehensiveResultWithOverrides } from "./bureauDetectionRouter";
import { parseHtmlToRawText } from "./_htmlParserUtils";
import { extractHtmlWithFallbackChain } from "./fallbackPdfExtractor";
import { ComprehensiveParseResult } from "./reportParserTypes";

export async function parsePdfThroughProductionHtmlPipeline(
  pdfBase64: string
): Promise<{
  parseResult: ComprehensiveParseResult;
  rawExtractedText: string;
  extractionSource: "openai" | "gemini";
}> {
  const extraction = await extractHtmlWithFallbackChain(pdfBase64);

  if (!extraction) {
    throw new Error("Production HTML extraction failed for parser test case");
  }

  const parseResult = await routeHtmlToComprehensiveResultWithOverrides(extraction.html);

  return {
    parseResult,
    rawExtractedText: parseHtmlToRawText(extraction.html),
    extractionSource: extraction.source,
  };
}
