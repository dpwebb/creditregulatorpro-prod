import { extractHtmlWithFallbackChain } from "./fallbackPdfExtractor";
import { routeHtmlToLLMResponseWithOverrides } from "./bureauDetectionRouter";
import { parseHtmlToRawText } from "./_htmlParserUtils";
import { mapDocStrangeResponseToResult } from "./docstrangeParser";
import { LLMResponse } from "./docstrangeLLM";
import { assessParserQuality, ParserQualityAssessment } from "./parserQuality";
import { parseReport } from "./reportParser";
import { ComprehensiveParseResult, ParsedTradeline } from "./reportParserTypes";
import { sha256HexOfBase64Payload, sha256HexOfJson } from "./reportBinaryUtils";

export const CANONICAL_CREDIT_REPORT_EXTRACTION_VERSION = "parser-first-2026-05-v1";

export type CanonicalExtractionMethod = "pdf_text" | "gemini" | "openai";

export interface CanonicalExtractionAttempt {
  method: CanonicalExtractionMethod;
  status: "succeeded" | "failed" | "skipped";
  tradelineCount: number;
  confidenceScore: number | null;
  issueCodes: string[];
  error?: string;
}

export interface CanonicalExtractionProvenance {
  strategy: "pdf_text_first_ai_html_fallback";
  version: string;
  selectedMethod: CanonicalExtractionMethod;
  normalizedByAi: boolean;
  sourceEvidence: "pdf_text" | "ai_generated_html";
  documentBinarySha256: string;
  canonicalResultSha256: string;
  attempts: CanonicalExtractionAttempt[];
  extractedAt: string;
}

export interface CanonicalCreditReportExtraction {
  parseResult: ComprehensiveParseResult;
  llmData: LLMResponse;
  rawHtml: string | null;
  rawText: string;
  extractionSource: CanonicalExtractionMethod;
  parserQuality: ParserQualityAssessment;
  provenance: CanonicalExtractionProvenance;
}

export interface ExtractCanonicalCreditReportInput {
  bytesBase64: string;
  mimeType: string;
  allowAiFallback?: boolean;
}

interface CandidateExtraction {
  method: CanonicalExtractionMethod;
  parseResult: ComprehensiveParseResult;
  llmData: LLMResponse;
  rawHtml: string | null;
  rawText: string;
  parserQuality: ParserQualityAssessment;
}

function formatDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  return String(value);
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function compactStrings(values: Array<string | null | undefined>): string[] {
  return values.map((value) => value?.trim()).filter(Boolean) as string[];
}

function tradelineToLlmTradeline(tradeline: ParsedTradeline): NonNullable<LLMResponse["tradelines"]>[number] {
  const extra = tradeline as Record<string, any>;
  return {
    creditorName: tradeline.creditorName,
    accountNumber: tradeline.accountNumber,
    accountType: tradeline.accountType,
    balance: numberOrNull(tradeline.balance),
    status: tradeline.status,
    dateOpened: formatDate(tradeline.dates?.opened),
    dateReported: formatDate(tradeline.dates?.reported),
    dateClosed: formatDate(tradeline.dates?.closed),
    dateOfFirstDelinquency: formatDate(tradeline.dates?.dofd),
    highCredit: numberOrNull(tradeline.amounts?.high),
    pastDue: numberOrNull(tradeline.amounts?.pastDue),
    creditLimit: numberOrNull(tradeline.creditLimit),
    paymentPattern: tradeline.paymentPattern || tradeline.paymentHistoryProfile || null,
    responsibilityCode: tradeline.responsibilityCode,
    remarks: compactStrings(tradeline.remarkCodes).join(", ") || null,
    openedDate: formatDate(tradeline.dates?.opened),
    reportedDate: formatDate(tradeline.dates?.reported),
    closedDate: formatDate(tradeline.dates?.closed),
    firstDelinquencyDate: formatDate(tradeline.dates?.dofd),
    lastPaymentDate: formatDate(tradeline.lastPaymentDate),
    postedDate: formatDate(tradeline.postedDate),
    chargeOffDate: formatDate(tradeline.chargeOffDate),
    balloonPaymentDate: formatDate(tradeline.balloonPaymentDate),
    terms: tradeline.terms,
    legend: compactStrings(tradeline.remarkCodes).join(", ") || null,
    paymentHistory: tradeline.paymentHistory ?? null,
    paymentHistoryDetails: tradeline.paymentHistoryDetails?.map((detail) => ({
      date: detail.date ?? undefined,
      balance: numberOrNull(detail.balance) ?? undefined,
      payment: numberOrNull(detail.payment) ?? undefined,
      pastDue: numberOrNull(detail.pastDue) ?? undefined,
      mop: detail.mop ?? undefined,
      terms: detail.terms ?? undefined,
      highCredit: numberOrNull(detail.highCredit) ?? undefined,
      creditLimit: numberOrNull(detail.creditLimit) ?? undefined,
      balloonPayment: numberOrNull(detail.balloonPayment) ?? undefined,
      chargeOff: numberOrNull(detail.chargeOff) ?? undefined,
      narrative: detail.narrative ?? undefined,
    })) ?? null,
    paymentHistoryProfile: tradeline.paymentHistoryProfile || tradeline.paymentPattern || null,
    memberName: tradeline.originalCreditorName,
    isCollectionAccount: tradeline.isCollectionAccount,
    collectionAgencyName: tradeline.collectionAgencyName,
    originalCreditorName: tradeline.originalCreditorName,
    dateAssignedToCollection: formatDate(tradeline.dateAssignedToCollection),
    originalBalance: numberOrNull(tradeline.originalBalance),
    memberNumber: extra.memberNumber ?? null,
    sourceText: tradeline.sourceText,
    monthsReviewed: extra.monthsReviewed != null ? String(extra.monthsReviewed) : null,
    lastActivityDate: formatDate(tradeline.lastActivityDate),
    monthlyPayment: numberOrNull(tradeline.monthlyPayment),
    scheduledMonthlyPayment: numberOrNull(tradeline.scheduledMonthlyPayment),
    paymentFrequency: tradeline.paymentFrequency ?? null,
  };
}

export function mapComprehensiveResultToLLMResponse(parseResult: ComprehensiveParseResult): LLMResponse {
  const consumer = parseResult.consumerInfo;
  const currentAddress = compactStrings([
    consumer?.addressLine1,
    consumer?.addressLine2,
  ]).join(" ") || null;

  return {
    bureau: parseResult.sourceBureau?.bureauName || parseResult.reportMetadata?.bureauName || null,
    reportDate: formatDate(parseResult.reportMetadata?.reportDate),
    consumerInfo: consumer
      ? {
          fullName: consumer.fullName,
          dateOfBirth: formatDate(consumer.dateOfBirth) || consumer.dateOfBirthRaw || null,
          currentAddress,
          previousAddresses: consumer.previousAddresses?.map((address) => address.addressLine1 || "").filter(Boolean) ?? [],
          employers: [],
        }
      : null,
    personalInfo: consumer
      ? {
          surname: null,
          givenNames: consumer.fullName,
          middleName: null,
          suffix: null,
          socialInsuranceNo: consumer.sinLastDigits,
          birthDate: formatDate(consumer.dateOfBirth) || consumer.dateOfBirthRaw || null,
        }
      : null,
    addresses: [
      ...(consumer?.addressLine1
        ? [{
            address: consumer.addressLine1,
            city: consumer.city,
            province: consumer.province,
            postalCode: consumer.postalCode,
            type: "Current",
          }]
        : []),
      ...(consumer?.previousAddresses?.map((address) => ({
        address: address.addressLine1,
        city: address.city,
        province: address.province,
        postalCode: address.postalCode,
        type: "Previous",
        sinceDate: null,
      })) ?? []),
    ],
    telephoneNumbers: compactStrings([consumer?.phone, consumer?.phoneSecondary]).map((number) => ({
      number,
      type: null,
    })),
    employments: parseResult.employmentInfo.map((employment) => ({
      date: formatDate(employment.verifiedDate),
      employerNameCityProvince: employment.employerName,
      occupation: employment.occupation,
      startDate: formatDate(employment.hireDate),
      finishDate: formatDate(employment.terminationDate),
      pay: employment.salary != null ? String(employment.salary) : null,
      payFrequency: employment.salaryFrequency,
    })),
    scores: parseResult.creditScores.map((score) => ({
      score: score.scoreValue,
      scoreType: score.scoreType,
      date: formatDate(score.scoreDate),
    })),
    tradelines: parseResult.tradelines.map(tradelineToLlmTradeline),
    inquiries: parseResult.inquiries.map((inquiry) => ({
      creditorName: inquiry.creditorName,
      date: formatDate(inquiry.inquiryDate),
      type: inquiry.inquiryType,
    })),
    publicRecords: parseResult.publicRecords.map((record) => ({
      type: record.recordType,
      dateFiled: formatDate(record.filingDate),
      status: record.status,
      amount: numberOrNull(record.amount),
      dateOfDischarge: formatDate(record.dischargeDate),
      court: record.courtName,
      description: record.rawSectionText,
    })),
  };
}

function summarizeAttempt(
  method: CanonicalExtractionMethod,
  status: CanonicalExtractionAttempt["status"],
  parserQuality?: ParserQualityAssessment | null,
  tradelineCount = 0,
  error?: unknown,
): CanonicalExtractionAttempt {
  return {
    method,
    status,
    tradelineCount,
    confidenceScore: parserQuality?.confidenceScore ?? null,
    issueCodes: parserQuality?.issues.map((issue) => issue.code) ?? [],
    ...(error ? { error: error instanceof Error ? error.message : String(error) } : {}),
  };
}

function isLikelyCreditAccountType(accountType: string | null | undefined): boolean {
  const type = (accountType || "").toLowerCase();
  if (!type) return false;
  return (
    type.includes("revolving") ||
    type.includes("installment") ||
    type.includes("mortgage") ||
    type.includes("line") ||
    type.includes("loan") ||
    type.includes("credit")
  );
}

function hasMeaningfulText(value: string | null | undefined): boolean {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) return false;
  if (["unknown", "not reported", "n/a", "na", "-", "missing"].includes(normalized)) return false;
  return true;
}

function estimateTradelineDetailCoverage(tradelines: ParsedTradeline[]): number {
  if (tradelines.length === 0) return 0;

  let total = 0;
  for (const tradeline of tradelines) {
    let score = 0;
    const likelyCredit = isLikelyCreditAccountType(tradeline.accountType);

    if (hasMeaningfulText(tradeline.creditorName)) score += 15;
    if (hasMeaningfulText(tradeline.accountNumber)) score += 10;
    if (tradeline.dates?.reported || tradeline.postedDate) score += 10;
    if (tradeline.lastPaymentDate || tradeline.dateAssignedToCollection) score += 10;
    if (likelyCredit && typeof tradeline.creditLimit === "number" && tradeline.creditLimit > 0) score += 15;
    if (likelyCredit && typeof tradeline.amounts?.high === "number" && tradeline.amounts.high > 0) score += 15;
    if (typeof tradeline.amounts?.pastDue === "number") score += 5;
    if (hasMeaningfulText(tradeline.terms)) score += 10;
    if (hasMeaningfulText(tradeline.paymentPattern)) score += 10;

    total += score;
  }

  return Math.max(0, Math.min(100, Math.round(total / tradelines.length)));
}

function shouldAttemptAiFallback(candidate: CandidateExtraction): boolean {
  if (candidate.parseResult.tradelines.length === 0) return true;
  if (candidate.parserQuality.requiresManualReview) return true;
  if (candidate.parserQuality.confidenceScore < 78) return true;
  const detailCoverage = estimateTradelineDetailCoverage(candidate.parseResult.tradelines);
  if (detailCoverage < 65) return true;
  if (
    detailCoverage < 78 &&
    candidate.parseResult.tradelines.some((tradeline) => {
      if (!isLikelyCreditAccountType(tradeline.accountType)) return false;
      const missingLimit = !(typeof tradeline.creditLimit === "number" && tradeline.creditLimit > 0);
      const missingHighCredit = !(typeof tradeline.amounts?.high === "number" && tradeline.amounts.high > 0);
      return missingLimit && missingHighCredit;
    })
  ) {
    return true;
  }
  return candidate.parserQuality.issues.some((issue) =>
    [
      "PARSER_ACCOUNT_COUNT_MISMATCH",
      "TRADELINE_FIELD_COMPLETENESS_LOW",
      "CORE_DATE_COMPLETENESS_LOW",
    ].includes(issue.code)
  );
}

function chooseCandidate(
  deterministic: CandidateExtraction,
  aiCandidate: CandidateExtraction | null,
): CandidateExtraction {
  if (!aiCandidate) return deterministic;
  if (deterministic.parseResult.tradelines.length === 0 && aiCandidate.parseResult.tradelines.length > 0) {
    return aiCandidate;
  }

  const aiScore = aiCandidate.parserQuality.confidenceScore;
  const deterministicScore = deterministic.parserQuality.confidenceScore;
  const aiHasComparableCoverage =
    aiCandidate.parseResult.tradelines.length >= Math.max(1, deterministic.parseResult.tradelines.length);

  if (aiHasComparableCoverage && aiScore >= deterministicScore + 8) {
    return aiCandidate;
  }

  return deterministic;
}

export async function extractCanonicalCreditReport(
  input: ExtractCanonicalCreditReportInput,
): Promise<CanonicalCreditReportExtraction> {
  if (input.mimeType !== "application/pdf") {
    throw new Error("Unsupported file type. Please upload a PDF.");
  }

  const attempts: CanonicalExtractionAttempt[] = [];
  const documentBinarySha256 = sha256HexOfBase64Payload(input.bytesBase64);
  const allowAiFallback = input.allowAiFallback ?? true;

  let deterministic: CandidateExtraction | null = null;

  try {
    const parseResult = await parseReport(input.bytesBase64, input.mimeType, {
      allowOcrFallback: false,
      enableAiAugmentation: false,
      logRawTextPreview: false,
    });
    const llmData = mapComprehensiveResultToLLMResponse(parseResult);
    const parserQuality = assessParserQuality({
      rawHtml: "",
      llmData,
      parseResult,
      parsedTradelines: parseResult.tradelines,
      extractionSource: "pdf_text",
    });

    deterministic = {
      method: "pdf_text",
      parseResult,
      llmData,
      rawHtml: null,
      rawText: parseResult.rawText,
      parserQuality,
    };
    attempts.push(summarizeAttempt("pdf_text", "succeeded", parserQuality, parseResult.tradelines.length));
  } catch (error) {
    attempts.push(summarizeAttempt("pdf_text", "failed", null, 0, error));
  }

  let aiCandidate: CandidateExtraction | null = null;
  const needsAiFallback = allowAiFallback && (!deterministic || shouldAttemptAiFallback(deterministic));

  if (needsAiFallback) {
    try {
      const fallbackResult = await extractHtmlWithFallbackChain(input.bytesBase64);
      if (fallbackResult) {
        const llmData = await routeHtmlToLLMResponseWithOverrides(fallbackResult.html);
        const rawText = parseHtmlToRawText(fallbackResult.html);
        const parseResult = mapDocStrangeResponseToResult(llmData, rawText);
        const parserQuality = assessParserQuality({
          rawHtml: fallbackResult.html,
          llmData,
          parseResult,
          parsedTradelines: parseResult.tradelines,
          extractionSource: fallbackResult.source,
        });

        aiCandidate = {
          method: fallbackResult.source,
          parseResult,
          llmData,
          rawHtml: fallbackResult.html,
          rawText,
          parserQuality,
        };
        attempts.push(summarizeAttempt(fallbackResult.source, "succeeded", parserQuality, parseResult.tradelines.length));
      } else {
        attempts.push(summarizeAttempt("gemini", "failed", null, 0, "AI extraction fallback returned no HTML."));
      }
    } catch (error) {
      attempts.push(summarizeAttempt("gemini", "failed", null, 0, error));
    }
  } else {
    attempts.push(summarizeAttempt("gemini", "skipped", null, 0));
  }

  if (!deterministic && !aiCandidate) {
    throw new Error("Credit report extraction failed. No parser produced usable report data.");
  }

  const selected = deterministic ? chooseCandidate(deterministic, aiCandidate) : aiCandidate!;
  const canonicalResultSha256 = sha256HexOfJson({
    ...selected.parseResult,
    rawText: undefined,
    tradelines: selected.parseResult.tradelines.map((tradeline) => ({
      ...tradeline,
      sourceText: undefined,
    })),
  });

  return {
    parseResult: selected.parseResult,
    llmData: selected.llmData,
    rawHtml: selected.rawHtml,
    rawText: selected.rawText,
    extractionSource: selected.method,
    parserQuality: selected.parserQuality,
    provenance: {
      strategy: "pdf_text_first_ai_html_fallback",
      version: CANONICAL_CREDIT_REPORT_EXTRACTION_VERSION,
      selectedMethod: selected.method,
      normalizedByAi: selected.method !== "pdf_text",
      sourceEvidence: selected.method === "pdf_text" ? "pdf_text" : "ai_generated_html",
      documentBinarySha256,
      canonicalResultSha256,
      attempts,
      extractedAt: new Date().toISOString(),
    },
  };
}
