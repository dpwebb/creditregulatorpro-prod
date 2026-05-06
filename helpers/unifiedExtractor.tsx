import type { LLMResponse } from "./docstrangeLLM";
import type { ComprehensiveParseResult } from "./reportParserTypes";
import type { PassADraftExtraction } from "./passAExtractorTypes";
import type { FullDraftExtraction } from "./fullExtractionTypes";

export interface UnifiedExtractionResult {
  comprehensive: ComprehensiveParseResult;
  passA: PassADraftExtraction;
  fullExtraction: FullDraftExtraction;
}

/**
 * Legacy DocStrange/LLM unified extraction is disabled.
 *
 * The authoritative path is extractCanonicalCreditReport followed by
 * deriveDeterministicDraftExtractions. This function throws so accidental legacy
 * imports cannot silently become ingestion truth.
 */
export function unifiedExtract(
  llmData: LLMResponse,
  rawText: string,
  artifactId: number,
): UnifiedExtractionResult {
  void llmData;
  void rawText;
  void artifactId;
  throw new Error(
    "Legacy DocStrange/LLM unified extraction is disabled; use deterministic canonical extraction.",
  );
}
