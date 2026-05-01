import { LLMResponse } from "./docstrangeLLM";
import { ComprehensiveParseResult } from "./reportParserTypes";
import { parseHtmlToLLMResponse } from "./transunionHtmlParser";
import { parseHtmlToRawText } from "./_htmlParserUtils";
import { parseEquifaxHtmlToLLMResponse } from "./equifaxReportParser";
import { mapDocStrangeResponseToResult } from "./docstrangeParser";
import { loadActiveMappings, loadBureauDetectionConfig, applyOverrides } from "./parserMappingEngine";

type BureauMarker = { marker: string; weight: number };

const DEFAULT_TU_MARKERS: BureauMarker[] = [
  { marker: "TRANSUNION", weight: 50 },
  { marker: "TU CASE ID", weight: 60 },
  { marker: "TRANSUNION CANADA", weight: 50 },
];

const DEFAULT_EQ_MARKERS: BureauMarker[] = [
  { marker: "EQUIFAX", weight: 50 },
  { marker: "EQUIFAX CREDIT SCORE", weight: 40 },
  { marker: "ECRS", weight: 30 },
  { marker: "H1S 2Z2", weight: 40 },
  { marker: "1-800-465-7166", weight: 60 },
];

const MIN_BUREAU_SCORE = 30;
const MIN_BUREAU_SCORE_MARGIN = 15;

function scoreMarkers(upperHtml: string, markers: BureauMarker[]): number {
  return markers.reduce((score, { marker, weight }) => {
    return upperHtml.includes(marker.toUpperCase()) ? score + weight : score;
  }, 0);
}

function resolveBureauFromScores(tuScore: number, eqScore: number): "TransUnion" | "Equifax" {
  if (tuScore < MIN_BUREAU_SCORE && eqScore < MIN_BUREAU_SCORE) {
    throw new Error("Unsupported credit bureau format. Only TransUnion and Equifax Canada reports are accepted.");
  }

  if (Math.abs(tuScore - eqScore) < MIN_BUREAU_SCORE_MARGIN) {
    throw new Error(
      `Ambiguous credit bureau format. TransUnion score ${tuScore}, Equifax score ${eqScore}. Please upload a clearer TransUnion or Equifax Canada report.`
    );
  }

  return tuScore > eqScore ? "TransUnion" : "Equifax";
}

/**
 * Detects whether the provided HTML represents a TransUnion or Equifax report
 * by looking for specific markers.
 * 
 * @param html The raw HTML string
 * @returns "TransUnion" or "Equifax"
 */
export function detectBureau(html: string): "TransUnion" | "Equifax" {
  if (!html) throw new Error("Unsupported credit bureau format. Only TransUnion and Equifax Canada reports are accepted.");

  const upperHtml = html.toUpperCase();
  const tuScore = scoreMarkers(upperHtml, DEFAULT_TU_MARKERS);
  const eqScore = scoreMarkers(upperHtml, DEFAULT_EQ_MARKERS);

  return resolveBureauFromScores(tuScore, eqScore);
}

/**
 * Detects whether the provided HTML represents a TransUnion or Equifax report
 * using custom admin-configured markers from the database, falling back to defaults.
 * 
 * @param html The raw HTML string
 * @returns "TransUnion" or "Equifax"
 */
export async function detectBureauWithConfig(html: string): Promise<"TransUnion" | "Equifax"> {
  if (!html) throw new Error("Unsupported credit bureau format. Only TransUnion and Equifax Canada reports are accepted.");

  const upperHtml = html.toUpperCase();
  const configMarkers = await loadBureauDetectionConfig();

  const tuMarkers: BureauMarker[] = [...DEFAULT_TU_MARKERS];
  const eqMarkers: BureauMarker[] = [...DEFAULT_EQ_MARKERS];

  if (configMarkers && configMarkers.length > 0) {
    for (const config of configMarkers) {
      if (config.bureau === "TransUnion") {
        tuMarkers.push({ marker: config.marker, weight: config.weight });
      } else if (config.bureau === "Equifax") {
        eqMarkers.push({ marker: config.marker, weight: config.weight });
      }
    }
  }

  const tuScore = scoreMarkers(upperHtml, tuMarkers);
  const eqScore = scoreMarkers(upperHtml, eqMarkers);

  return resolveBureauFromScores(tuScore, eqScore);
}

/**
 * Routes HTML to the appropriate LLMResponse parser based on bureau detection.
 * 
 * @param html The raw HTML string
 * @returns Structed LLMResponse data
 */
export function routeHtmlToLLMResponse(html: string): LLMResponse {
  const bureau = detectBureau(html);

  if (bureau === "TransUnion") {
    return parseHtmlToLLMResponse(html);
  }

  return parseEquifaxHtmlToLLMResponse(html);
}

/**
 * Routes HTML through configured bureau detection and parser field mappings.
 * This is the production-safe entry point when database-backed parser overrides
 * should affect parsed upload results.
 */
export async function routeHtmlToLLMResponseWithOverrides(html: string): Promise<LLMResponse> {
  const bureau = await detectBureauWithConfig(html);

  const llmResponse =
    bureau === "TransUnion"
      ? parseHtmlToLLMResponse(html)
      : parseEquifaxHtmlToLLMResponse(html);

  const mappings = await loadActiveMappings(bureau);
  if (!mappings || mappings.length === 0) {
    return llmResponse;
  }

  return applyOverrides(llmResponse, mappings);
}

/**
 * High-level orchestrator that determines bureau format, parses to LLMResponse,
 * and maps the result to the final ComprehensiveParseResult output.
 * 
 * @param html The raw HTML string
 * @returns ComprehensiveParseResult
 */
export function routeHtmlToComprehensiveResult(html: string): ComprehensiveParseResult {
  const llmResponse = routeHtmlToLLMResponse(html);
  const rawText = parseHtmlToRawText(html);
  
  return mapDocStrangeResponseToResult(llmResponse, rawText);
}

/**
 * Async orchestrator that detects bureau (using custom config), parses to LLMResponse,
 * applies dynamic DB-driven overrides, and maps the result to the final ComprehensiveParseResult.
 * 
 * @param html The raw HTML string
 * @returns ComprehensiveParseResult
 */
export async function routeHtmlToComprehensiveResultWithOverrides(html: string): Promise<ComprehensiveParseResult> {
  const llmResponse = await routeHtmlToLLMResponseWithOverrides(html);
  const rawText = parseHtmlToRawText(html);

  return mapDocStrangeResponseToResult(llmResponse, rawText);
}
