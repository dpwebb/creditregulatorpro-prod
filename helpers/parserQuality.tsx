import { LLMResponse } from "./docstrangeLLM";
import { ParsedTradeline } from "./reportParser";
import { ComprehensiveParseResult } from "./reportParserTypes";

export type ParserQualitySeverity = "INFO" | "WARNING" | "ERROR";

export interface ParserQualityIssue {
  severity: ParserQualitySeverity;
  code: string;
  message: string;
}

export interface ParserQualityAssessment {
  confidenceScore: number;
  expectedAccountMarkers: number;
  parsedTradelineCount: number;
  sourceBureauName: string | null;
  sourceBureauConfidence: number | null;
  sourceIsAiNormalized: boolean;
  extractionSource: string | null;
  requiresManualReview: boolean;
  issues: ParserQualityIssue[];
}

const AI_EXTRACTION_SOURCES = new Set(["openai", "gemini"]);

function countMatches(text: string, regex: RegExp): number {
  return (text.match(regex) ?? []).length;
}

function countEquifaxAccountHeadings(html: string): number {
  const sections = html.match(/<h1[^>]*>\s*(?:Accounts(?:\s*-\s*[^<]+)?|Collections)\s*<\/h1>[\s\S]*?(?=<h1|$)/gi) ?? [];
  let count = 0;

  for (const section of sections) {
    const headings = section.match(/<h2[^>]*>[\s\S]*?<\/h2>/gi) ?? [];
    for (const heading of headings) {
      const label = heading.replace(/<[^>]+>/g, "").trim();
      if (!label || /^Page\s+\d+$/i.test(label)) continue;
      count += 1;
    }
  }

  return count;
}

function estimateExpectedAccountMarkers(html: string): number {
  if (!html) return 0;

  const creditorNameMarkers = countMatches(html, /\bCreditor Name\b/gi);
  const accountNumberMarkers = countMatches(html, /\bAccount Number\b/gi);
  const equifaxHeadings = countEquifaxAccountHeadings(html);

  return Math.max(creditorNameMarkers, accountNumberMarkers, equifaxHeadings);
}

function hasMeaningfulCreditorName(tradeline: ParsedTradeline): boolean {
  const name = (tradeline.creditorName || "").trim().toLowerCase();
  return Boolean(name && name !== "unknown" && name !== "unknown creditor");
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function assessParserQuality(input: {
  rawHtml: string;
  llmData: LLMResponse;
  parseResult: ComprehensiveParseResult;
  parsedTradelines: ParsedTradeline[];
  extractionSource?: string | null;
}): ParserQualityAssessment {
  const { rawHtml, llmData, parseResult, parsedTradelines, extractionSource = null } = input;
  const expectedAccountMarkers = estimateExpectedAccountMarkers(rawHtml);
  const parsedTradelineCount = parsedTradelines.length;
  const sourceBureauName = parseResult.sourceBureau?.bureauName || llmData.bureau || null;
  const sourceBureauConfidence = parseResult.sourceBureau?.confidence ?? null;
  const sourceIsAiNormalized = extractionSource ? AI_EXTRACTION_SOURCES.has(extractionSource.toLowerCase()) : false;
  const issues: ParserQualityIssue[] = [];

  if (sourceIsAiNormalized) {
    issues.push({
      severity: "INFO",
      code: "AI_NORMALIZED_SOURCE",
      message: "The PDF was converted through an AI-normalized HTML extraction path before parsing.",
    });
  }

  if (!sourceBureauName) {
    issues.push({
      severity: "WARNING",
      code: "BUREAU_NOT_IDENTIFIED",
      message: "The parser did not produce a source bureau name.",
    });
  }

  if (!parseResult.reportMetadata?.reportDate && !llmData.reportDate) {
    issues.push({
      severity: "WARNING",
      code: "REPORT_DATE_MISSING",
      message: "The parser did not identify a report date.",
    });
  }

  if (parsedTradelineCount === 0) {
    issues.push({
      severity: "ERROR",
      code: "PARSER_ZERO_TRADELINES",
      message: "The parser completed without finding any tradelines.",
    });
  }

  if (expectedAccountMarkers > 0 && parsedTradelineCount < expectedAccountMarkers) {
    issues.push({
      severity: parsedTradelineCount === 0 ? "ERROR" : "WARNING",
      code: "PARSER_ACCOUNT_COUNT_MISMATCH",
      message: `The source looked like it contained ${expectedAccountMarkers} account section(s), but ${parsedTradelineCount} tradeline(s) were parsed.`,
    });
  }

  const unknownCreditorCount = parsedTradelines.filter((tradeline) => !hasMeaningfulCreditorName(tradeline)).length;
  if (unknownCreditorCount > 0) {
    issues.push({
      severity: "WARNING",
      code: "UNKNOWN_CREDITOR_NAMES",
      message: `${unknownCreditorCount} parsed tradeline(s) did not have a meaningful creditor name.`,
    });
  }

  let score = 100;
  if (sourceIsAiNormalized) score -= 10;
  if (!sourceBureauName) score -= 25;
  if (!parseResult.reportMetadata?.reportDate && !llmData.reportDate) score -= 10;
  if (parsedTradelineCount === 0) score -= 60;
  if (expectedAccountMarkers > 0 && parsedTradelineCount < expectedAccountMarkers) score -= 25;
  if (unknownCreditorCount > 0) score -= Math.min(20, unknownCreditorCount * 10);

  const confidenceScore = clampScore(score);
  const requiresManualReview =
    confidenceScore < 50 ||
    parsedTradelineCount === 0 ||
    issues.some((issue) => issue.severity === "ERROR");

  return {
    confidenceScore,
    expectedAccountMarkers,
    parsedTradelineCount,
    sourceBureauName,
    sourceBureauConfidence,
    sourceIsAiNormalized,
    extractionSource,
    requiresManualReview,
    issues,
  };
}
