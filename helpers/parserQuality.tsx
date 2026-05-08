import { LLMResponse } from "./docstrangeLLM";
import { ParsedTradeline } from "./reportParser";
import { ComprehensiveParseResult } from "./reportParserTypes";
import { extractAccounts } from "./transunionAccountParser";

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
  fieldCompleteness: {
    averageScore: number;
    lowCompletenessTradelines: number;
    missingCoreDates: number;
    missingReportedDates: number;
    missingOpenedDates: number;
  };
  requiresManualReview: boolean;
  issues: ParserQualityIssue[];
}

const AI_EXTRACTION_SOURCES = new Set(["openai", "gemini"]);

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

function countTransUnionAccountBlocks(html: string): number {
  if (!/Account\(s\)\s*:/i.test(html)) return 0;

  try {
    return extractAccounts(html).filter((account) =>
      Boolean(account?.creditorName?.trim())
    ).length;
  } catch {
    return 0;
  }
}

function estimateExpectedAccountMarkersFromHtml(html: string): number {
  if (!html) return 0;

  const transUnionAccountBlocks = countTransUnionAccountBlocks(html);
  const equifaxHeadings = countEquifaxAccountHeadings(html);

  return Math.max(transUnionAccountBlocks, equifaxHeadings);
}

export function estimateExpectedAccountMarkersFromRawText(rawText: string | null | undefined): number {
  const text = rawText?.trim();
  if (!text) return 0;

  const hasAccountSection =
    /\bAccount\(s\)\s*:/i.test(text) ||
    /\bAccounts\b/i.test(text) ||
    /\bCollections\b/i.test(text);
  if (!hasAccountSection) return 0;

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const isInstructionLine = (line: string) =>
    /(?:TradelineExtract|Parser\s+Assertion|Expected\s+Error|Embedded\s+Known\s+Errors|Test\s+Assertions)/i.test(line);
  const accountTypeValuePattern =
    /\bAccount\s+Type\s*[:#-]?\s*(?:REVOLVING|INSTALLMENT|MORTGAGE|COLLECTION|OPEN|CLOSED|LINE\s+OF\s+CREDIT|CREDIT\s+CARD|AUTO|LOAN|INDIVIDUAL|JOINT)\b/i;
  const standaloneAccountTypeValuePattern =
    /^(?:REVOLVING|INSTALLMENT|MORTGAGE|COLLECTION|OPEN|CLOSED|LINE\s+OF\s+CREDIT|CREDIT\s+CARD|AUTO|LOAN)\b/i;

  const countLines = (predicate: (line: string, index: number) => boolean): number =>
    lines.reduce((count, line, index) => count + (predicate(line, index) ? 1 : 0), 0);
  const searchableText = lines.filter((line) => !isInstructionLine(line)).join("\n");

  const collapsedCreditorRows = countLines((line) =>
    !isInstructionLine(line) &&
    /\bCreditor\s+Name[\s\S]{0,160}?Payment\s+History\b/i.test(line),
  );
  const creditorNameLabels = countLines((line) =>
    !isInstructionLine(line) && /\bCreditor\s+Name\b/i.test(line),
  );
  const accountTypeLabels = countLines((line, index) =>
    !isInstructionLine(line) &&
    /\bAccount\s+Type\b/i.test(line) &&
    (
      accountTypeValuePattern.test(line) ||
      (/^\s*Account\s+Type\s*$/i.test(line) && standaloneAccountTypeValuePattern.test(lines[index + 1] ?? ""))
    ),
  );
  const equifaxAccountNumbers =
    searchableText.match(/\bAccount\s*(?:Number|#)\b/gi)?.length ?? 0;

  return Math.max(
    collapsedCreditorRows,
    creditorNameLabels,
    accountTypeLabels,
    equifaxAccountNumbers,
  );
}

function hasMeaningfulCreditorName(tradeline: ParsedTradeline): boolean {
  const name = (tradeline.creditorName || "").trim().toLowerCase();
  return Boolean(name && name !== "unknown" && name !== "unknown creditor");
}

function hasUsefulAccountNumber(tradeline: ParsedTradeline): boolean {
  const accountNumber = (tradeline.accountNumber || "").trim().toLowerCase();
  return Boolean(accountNumber && accountNumber !== "unknown" && accountNumber !== "not reported");
}

function hasCoreDate(tradeline: ParsedTradeline): boolean {
  return Boolean(
    tradeline.dates?.opened ||
    tradeline.dates?.reported ||
    tradeline.dates?.closed ||
    tradeline.dates?.dofd ||
    tradeline.lastActivityDate ||
    tradeline.lastPaymentDate
  );
}

function scoreTradelineCompleteness(tradeline: ParsedTradeline): number {
  let score = 0;
  if (hasMeaningfulCreditorName(tradeline)) score += 20;
  if (hasUsefulAccountNumber(tradeline)) score += 10;
  if (tradeline.accountType && tradeline.accountType.toLowerCase() !== "unknown") score += 10;
  if (tradeline.status) score += 15;
  if (typeof tradeline.balance === "number" && Number.isFinite(tradeline.balance)) score += 10;
  if (tradeline.dates?.opened) score += 10;
  if (tradeline.dates?.reported) score += 15;
  if (hasCoreDate(tradeline)) score += 5;
  if (tradeline.sourceText && tradeline.sourceText.trim().length > 20) score += 5;
  return score;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function assessParserQuality(input: {
  rawHtml: string;
  rawText?: string | null;
  llmData?: LLMResponse | null;
  parseResult: ComprehensiveParseResult;
  parsedTradelines: ParsedTradeline[];
  extractionSource?: string | null;
}): ParserQualityAssessment {
  const { rawHtml, rawText = null, llmData, parseResult, parsedTradelines, extractionSource = null } = input;
  const expectedAccountMarkers = Math.max(
    estimateExpectedAccountMarkersFromHtml(rawHtml),
    estimateExpectedAccountMarkersFromRawText(rawText),
  );
  const parsedTradelineCount = parsedTradelines.length;
  const sourceBureauName = parseResult.sourceBureau?.bureauName || llmData?.bureau || null;
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

  if (!parseResult.reportMetadata?.reportDate && !llmData?.reportDate) {
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

  const completenessScores = parsedTradelines.map(scoreTradelineCompleteness);
  const averageCompleteness = completenessScores.length
    ? clampScore(completenessScores.reduce((sum, score) => sum + score, 0) / completenessScores.length)
    : 0;
  const lowCompletenessTradelines = completenessScores.filter((score) => score < 65).length;
  const missingCoreDates = parsedTradelines.filter((tradeline) => !hasCoreDate(tradeline)).length;
  const missingReportedDates = parsedTradelines.filter((tradeline) => !tradeline.dates?.reported).length;
  const missingOpenedDates = parsedTradelines.filter((tradeline) => !tradeline.dates?.opened).length;

  if (parsedTradelineCount > 0 && averageCompleteness < 65) {
    issues.push({
      severity: averageCompleteness < 45 ? "ERROR" : "WARNING",
      code: "TRADELINE_FIELD_COMPLETENESS_LOW",
      message: `Parsed tradelines averaged ${averageCompleteness}% field completeness.`,
    });
  }

  if (parsedTradelineCount > 0 && missingCoreDates > 0) {
    issues.push({
      severity: "WARNING",
      code: "CORE_DATE_COMPLETENESS_LOW",
      message: `${missingCoreDates} parsed tradeline(s) have no usable account dates.`,
    });
  }

  let score = 100;
  if (sourceIsAiNormalized) score -= 10;
  if (!sourceBureauName) score -= 25;
  if (!parseResult.reportMetadata?.reportDate && !llmData?.reportDate) score -= 10;
  if (parsedTradelineCount === 0) score -= 60;
  if (expectedAccountMarkers > 0 && parsedTradelineCount < expectedAccountMarkers) score -= 25;
  if (unknownCreditorCount > 0) score -= Math.min(20, unknownCreditorCount * 10);
  if (parsedTradelineCount > 0 && averageCompleteness < 80) score -= Math.min(30, 80 - averageCompleteness);
  if (missingCoreDates > 0) score -= Math.min(20, missingCoreDates * 5);

  const confidenceScore = clampScore(score);
  const requiresManualReview =
    confidenceScore < 50 ||
    parsedTradelineCount === 0 ||
    averageCompleteness < 45 ||
    issues.some((issue) => issue.severity === "ERROR");

  return {
    confidenceScore,
    expectedAccountMarkers,
    parsedTradelineCount,
    sourceBureauName,
    sourceBureauConfidence,
    sourceIsAiNormalized,
    extractionSource,
    fieldCompleteness: {
      averageScore: averageCompleteness,
      lowCompletenessTradelines,
      missingCoreDates,
      missingReportedDates,
      missingOpenedDates,
    },
    requiresManualReview,
    issues,
  };
}
