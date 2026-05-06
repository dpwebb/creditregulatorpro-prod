import { extractCanonicalCreditReport } from "./canonicalCreditReportExtractor";
import { ParserPipelineFieldAudit } from "./parserPipelineFieldReconciliation";
import { ComprehensiveParseResult } from "./reportParserTypes";
import type {
  DeterministicNormalizedReport,
  DeterministicPipelinePackage,
} from "./deterministicCreditReportPipeline";

export interface ParserTestRunOptions {
  allowAiFallback?: boolean | null;
  parserMode?: string | null;
}

export function resolveParserTestAllowAiFallback(options: ParserTestRunOptions = {}): boolean {
  void options;
  return false;
}

export async function parsePdfThroughProductionHtmlPipeline(
  pdfBase64: string,
  options: ParserTestRunOptions = {},
): Promise<{
  parseResult: ComprehensiveParseResult;
  rawExtractedText: string;
  extractionSource: "pdf_text" | "openai" | "gemini";
  parserPipelineAudit: ParserPipelineFieldAudit;
  deterministicPipeline: DeterministicPipelinePackage;
  canonicalOutput: DeterministicNormalizedReport;
  replayHash: string;
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
    deterministicPipeline: extraction.deterministicPipeline,
    canonicalOutput: extraction.canonicalOutput,
    replayHash: extraction.deterministicPipeline.replayHash,
  };
}
