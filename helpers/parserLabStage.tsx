import { extractCanonicalCreditReport } from "./canonicalCreditReportExtractor";
import {
  ComprehensiveParseResult,
  ParsedTradeline,
} from "./reportParserTypes";

export const PARSER_LAB_STAGE_VERSION = "parser-lab-shadow-2026-05-v1";

export interface ParserLabStageInput {
  bytesBase64: string;
  fileName: string;
  mimeType: string;
  allowAiFallback?: boolean;
}

export interface ParserLabStageOutput {
  stageVersion: string;
  sideEffects: "none";
  fileName: string;
  bureauName: string | null;
  extractionSource: string;
  quality: {
    confidenceScore: number;
    requiresManualReview: boolean;
    expectedAccountMarkers: number;
    parsedTradelineCount: number;
    issues: Array<{
      severity: string;
      code: string;
      message: string;
    }>;
    fieldCompleteness: {
      averageScore: number;
      lowCompletenessTradelines: number;
      missingCoreDates: number;
      missingReportedDates: number;
      missingOpenedDates: number;
    };
  };
  retention: {
    originalDocumentSha256: string;
    canonicalResultSha256: string;
    rawTextCharacters: number;
    rawHtmlCharacters: number;
    tradelinesWithSourceText: number;
    sourceTextCoveragePercent: number;
    criticalFieldCompletenessPercent: number;
    reviewQueueCount: number;
    blockers: string[];
  };
  counts: {
    tradelines: number;
    inquiries: number;
    publicRecords: number;
    employments: number;
    scores: number;
    consumerStatements: number;
  };
  reviewQueue: ParserLabReviewItem[];
  parsed: {
    reportMetadata: ComprehensiveParseResult["reportMetadata"];
    consumerInfo: ComprehensiveParseResult["consumerInfo"];
    tradelines: ParserLabTradelinePreview[];
    inquiries: ComprehensiveParseResult["inquiries"];
    publicRecords: ComprehensiveParseResult["publicRecords"];
    employmentInfo: ComprehensiveParseResult["employmentInfo"];
    creditScores: ComprehensiveParseResult["creditScores"];
  };
  provenance: Record<string, unknown>;
  rawTextPreview: string;
}

export interface ParserLabReviewItem {
  kind: "report" | "tradeline";
  index: number | null;
  creditorName: string | null;
  accountNumber: string | null;
  reasons: string[];
  sourceTextPreview: string | null;
}

export interface ParserLabTradelinePreview {
  index: number;
  creditorName: string;
  accountNumber: string;
  accountType: string;
  status: string;
  balance: number | null;
  creditLimit: number | null;
  highCredit: number | null;
  pastDue: number | null;
  dates: {
    opened: string | null;
    reported: string | null;
    closed: string | null;
    dofd: string | null;
    lastPayment: string | null;
    lastActivity: string | null;
  };
  sourceTextCharacters: number;
  paymentHistoryDetailsCount: number;
  needsReview: boolean;
  reviewReasons: string[];
}

function dateToIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function hasValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "number") return Number.isFinite(value);
  const normalized = String(value).trim().toLowerCase();
  return Boolean(
    normalized &&
      !["unknown", "not reported", "n/a", "na", "-", "missing"].includes(normalized)
  );
}

function hasAnyDate(tradeline: ParsedTradeline): boolean {
  return Boolean(
    tradeline.dates?.opened ||
      tradeline.dates?.reported ||
      tradeline.dates?.closed ||
      tradeline.dates?.dofd ||
      tradeline.lastPaymentDate ||
      tradeline.lastActivityDate
  );
}

function getTradelineReviewReasons(tradeline: ParsedTradeline): string[] {
  const reasons: string[] = [];

  if (!hasValue(tradeline.creditorName)) reasons.push("Missing creditor name");
  if (!hasValue(tradeline.accountNumber)) reasons.push("Missing account number");
  if (!hasValue(tradeline.accountType)) reasons.push("Missing account type");
  if (!hasValue(tradeline.status)) reasons.push("Missing account status");
  if (!hasValue(tradeline.balance)) reasons.push("Missing balance");
  if (!hasAnyDate(tradeline)) reasons.push("Missing usable account date");
  if (!hasValue(tradeline.sourceText) || (tradeline.sourceText || "").trim().length < 20) {
    reasons.push("Missing source text evidence");
  }

  return reasons;
}

function criticalFieldCompletenessPercent(tradelines: ParsedTradeline[]): number {
  if (tradelines.length === 0) return 0;

  let present = 0;
  let total = 0;

  for (const tradeline of tradelines) {
    const checks = [
      hasValue(tradeline.creditorName),
      hasValue(tradeline.accountNumber),
      hasValue(tradeline.accountType),
      hasValue(tradeline.status),
      hasValue(tradeline.balance),
      hasAnyDate(tradeline),
      hasValue(tradeline.sourceText),
    ];

    total += checks.length;
    present += checks.filter(Boolean).length;
  }

  return Math.round((present / total) * 100);
}

function buildTradelinePreview(tradeline: ParsedTradeline, index: number): ParserLabTradelinePreview {
  const reviewReasons = getTradelineReviewReasons(tradeline);

  return {
    index,
    creditorName: tradeline.creditorName || "",
    accountNumber: tradeline.accountNumber || "",
    accountType: tradeline.accountType || "",
    status: tradeline.status || "",
    balance: numberOrNull(tradeline.balance),
    creditLimit: numberOrNull(tradeline.creditLimit),
    highCredit: numberOrNull(tradeline.amounts?.high),
    pastDue: numberOrNull(tradeline.amounts?.pastDue),
    dates: {
      opened: dateToIso(tradeline.dates?.opened),
      reported: dateToIso(tradeline.dates?.reported),
      closed: dateToIso(tradeline.dates?.closed),
      dofd: dateToIso(tradeline.dates?.dofd),
      lastPayment: dateToIso(tradeline.lastPaymentDate),
      lastActivity: dateToIso(tradeline.lastActivityDate),
    },
    sourceTextCharacters: (tradeline.sourceText || "").trim().length,
    paymentHistoryDetailsCount: tradeline.paymentHistoryDetails?.length ?? 0,
    needsReview: reviewReasons.length > 0,
    reviewReasons,
  };
}

function buildReviewQueue(
  parseResult: ComprehensiveParseResult,
  qualityIssues: ParserLabStageOutput["quality"]["issues"],
): ParserLabReviewItem[] {
  const queue: ParserLabReviewItem[] = [];

  const blockingIssues = qualityIssues.filter((issue) =>
    ["ERROR", "WARNING"].includes(issue.severity)
  );

  if (blockingIssues.length > 0) {
    queue.push({
      kind: "report",
      index: null,
      creditorName: null,
      accountNumber: null,
      reasons: blockingIssues.map((issue) => `${issue.code}: ${issue.message}`),
      sourceTextPreview: null,
    });
  }

  parseResult.tradelines.forEach((tradeline, index) => {
    const reasons = getTradelineReviewReasons(tradeline);
    if (reasons.length === 0) return;

    queue.push({
      kind: "tradeline",
      index,
      creditorName: tradeline.creditorName || null,
      accountNumber: tradeline.accountNumber || null,
      reasons,
      sourceTextPreview: previewText(tradeline.sourceText || "", 800),
    });
  });

  return queue;
}

function previewText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

export async function runParserLabStage(input: ParserLabStageInput): Promise<ParserLabStageOutput> {
  const extraction = await extractCanonicalCreditReport({
    bytesBase64: input.bytesBase64,
    mimeType: input.mimeType,
    allowAiFallback: input.allowAiFallback ?? true,
  });

  const { parseResult, parserQuality, provenance } = extraction;
  const quality = {
    confidenceScore: parserQuality.confidenceScore,
    requiresManualReview: parserQuality.requiresManualReview,
    expectedAccountMarkers: parserQuality.expectedAccountMarkers,
    parsedTradelineCount: parserQuality.parsedTradelineCount,
    issues: parserQuality.issues,
    fieldCompleteness: parserQuality.fieldCompleteness,
  };
  const reviewQueue = buildReviewQueue(parseResult, quality.issues);
  const tradelinesWithSourceText = parseResult.tradelines.filter((tradeline) =>
    hasValue(tradeline.sourceText)
  ).length;
  const sourceTextCoveragePercent =
    parseResult.tradelines.length === 0
      ? 0
      : Math.round((tradelinesWithSourceText / parseResult.tradelines.length) * 100);
  const blockers = [
    ...(parserQuality.requiresManualReview ? ["Parser quality requires manual review"] : []),
    ...(parseResult.tradelines.length === 0 ? ["No tradelines parsed"] : []),
    ...(sourceTextCoveragePercent < 100 ? ["Not every tradeline has source text evidence"] : []),
  ];

  return {
    stageVersion: PARSER_LAB_STAGE_VERSION,
    sideEffects: "none",
    fileName: input.fileName,
    bureauName: parseResult.sourceBureau?.bureauName ?? null,
    extractionSource: extraction.extractionSource,
    quality,
    retention: {
      originalDocumentSha256: provenance.documentBinarySha256,
      canonicalResultSha256: provenance.canonicalResultSha256,
      rawTextCharacters: extraction.rawText.length,
      rawHtmlCharacters: extraction.rawHtml?.length ?? 0,
      tradelinesWithSourceText,
      sourceTextCoveragePercent,
      criticalFieldCompletenessPercent: criticalFieldCompletenessPercent(parseResult.tradelines),
      reviewQueueCount: reviewQueue.length,
      blockers,
    },
    counts: {
      tradelines: parseResult.tradelines.length,
      inquiries: parseResult.inquiries.length,
      publicRecords: parseResult.publicRecords.length,
      employments: parseResult.employmentInfo.length,
      scores: parseResult.creditScores.length,
      consumerStatements: parseResult.consumerStatements.length,
    },
    reviewQueue,
    parsed: {
      reportMetadata: parseResult.reportMetadata,
      consumerInfo: parseResult.consumerInfo,
      tradelines: parseResult.tradelines.map(buildTradelinePreview),
      inquiries: parseResult.inquiries,
      publicRecords: parseResult.publicRecords,
      employmentInfo: parseResult.employmentInfo,
      creditScores: parseResult.creditScores,
    },
    provenance: provenance as unknown as Record<string, unknown>,
    rawTextPreview: previewText(extraction.rawText, 5000),
  };
}
