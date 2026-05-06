import { extractCanonicalCreditReport } from "./canonicalCreditReportExtractor";
import { AI_FALLBACK_AVAILABLE } from "./aiFallbackAvailability";
import { ParserPipelineFieldAudit } from "./parserPipelineFieldReconciliation";
import { ComprehensiveParseResult } from "./reportParserTypes";

export interface ParserTestRunOptions {
  allowAiFallback?: boolean | null;
  parserMode?: string | null;
}

export function resolveParserTestAllowAiFallback(options: ParserTestRunOptions = {}): boolean {
  if (!AI_FALLBACK_AVAILABLE) return false;
  if (typeof options.allowAiFallback === "boolean") return options.allowAiFallback;
  if (options.parserMode === "deterministic") return false;
  if (options.parserMode === "ai_fallback_enabled") return true;
  return true;
}

export async function parsePdfThroughProductionHtmlPipeline(
  pdfBase64: string,
  options: ParserTestRunOptions = {},
): Promise<{
  parseResult: ComprehensiveParseResult;
  rawExtractedText: string;
  extractionSource: "pdf_text" | "openai" | "gemini";
  parserPipelineAudit: ParserPipelineFieldAudit;
}> {
  const extraction = await extractCanonicalCreditReport({
    bytesBase64: pdfBase64,
    mimeType: "application/pdf",
    allowAiFallback: resolveParserTestAllowAiFallback(options),
  });

  if (!extraction) {
    throw new Error("Production extraction failed for parser test case");
  }

  return {
    parseResult: extraction.parseResult,
    rawExtractedText: extraction.rawText,
    extractionSource: extraction.extractionSource,
    parserPipelineAudit: extraction.fieldReconciliation,
  };
}
