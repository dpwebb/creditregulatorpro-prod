import { LLMResponse } from "./docstrangeLLM";
import { ComprehensiveParseResult } from "./reportParserTypes";
import { parseHtmlToLLMResponse } from "./transunionHtmlParser";
import { parseHtmlToRawText } from "./_htmlParserUtils";
import { parseEquifaxHtmlToLLMResponse } from "./equifaxReportParser";
import { mapDocStrangeResponseToResult } from "./docstrangeParser";
import { loadActiveMappings, loadBureauDetectionConfig, applyOverrides } from "./parserMappingEngine";

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

  const tuMarkers = [
    { marker: "TRANSUNION", weight: 50 },
    { marker: "TU CASE ID", weight: 60 },
    { marker: "TRANSUNION CANADA", weight: 50 }
  ];

  const eqMarkers = [
    { marker: "EQUIFAX", weight: 50 },
    { marker: "EQUIFAX CREDIT SCORE", weight: 40 },
    { marker: "ECRS", weight: 30 },
    { marker: "H1S 2Z2", weight: 40 },
    { marker: "1-800-465-7166", weight: 60 }
  ];

  let tuScore = 0;
  for (const { marker, weight } of tuMarkers) {
    if (upperHtml.includes(marker)) {
      tuScore += weight;
    }
  }

  let eqScore = 0;
  for (const { marker, weight } of eqMarkers) {
    if (upperHtml.includes(marker)) {
      eqScore += weight;
    }
  }

  if (tuScore < 30 && eqScore < 30) {
    throw new Error("Unsupported credit bureau format. Only TransUnion and Equifax Canada reports are accepted.");
  }

  return tuScore > eqScore ? "TransUnion" : "Equifax";
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

  let tuScore = 0;
  let eqScore = 0;

  if (configMarkers && configMarkers.length > 0) {
    for (const config of configMarkers) {
      if (upperHtml.includes(config.marker.toUpperCase())) {
        if (config.bureau === "TransUnion") {
          tuScore += config.weight;
        } else if (config.bureau === "Equifax") {
          eqScore += config.weight;
        }
      }
    }
  } else {
    return detectBureau(html);
  }

  if (tuScore < 30 && eqScore < 30) {
    throw new Error("Unsupported credit bureau format. Only TransUnion and Equifax Canada reports are accepted.");
  }

  return tuScore > eqScore ? "TransUnion" : "Equifax";
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
  const bureau = await detectBureauWithConfig(html);
  
  let llmResponse: LLMResponse;
  if (bureau === "TransUnion") {
    llmResponse = parseHtmlToLLMResponse(html);
  } else {
    llmResponse = parseEquifaxHtmlToLLMResponse(html);
  }

  const rawText = parseHtmlToRawText(html);
  
  const mappings = await loadActiveMappings(bureau);
  let overriddenLLMData: LLMResponse | undefined = undefined;
  
  if (mappings && mappings.length > 0) {
    overriddenLLMData = applyOverrides(llmResponse, mappings);
  }

  return mapDocStrangeResponseToResult(llmResponse, rawText, overriddenLLMData);
}