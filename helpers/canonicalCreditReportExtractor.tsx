import { LLMResponse } from "./docstrangeLLM";
import { assessParserQuality, ParserQualityAssessment } from "./parserQuality";
import { parseReport } from "./reportParser";
import { ComprehensiveParseResult, ParsedTradeline } from "./reportParserTypes";
import { sha256HexOfBase64Payload } from "./reportBinaryUtils";
import {
  buildDeterministicCreditReportPipelinePackage,
  DeterministicNormalizedReport,
  DeterministicPipelinePackage,
} from "./deterministicCreditReportPipeline";
import {
  applyParserExtractionRules,
  loadActiveParserExtractionRules,
} from "./parserExtractionRules";
import {
  extractRawParserFieldBaseline,
  ParserPipelineFieldAudit,
  reconcileParserPipelineFields,
} from "./parserPipelineFieldReconciliation";

export const CANONICAL_CREDIT_REPORT_EXTRACTION_VERSION = "deterministic-state-machine-2026-05-v1";

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
  strategy: "deterministic_pdf_text_state_machine";
  version: string;
  selectedMethod: CanonicalExtractionMethod;
  normalizedByAi: boolean;
  sourceEvidence: "pdf_text" | "ai_generated_html";
  documentBinarySha256: string;
  canonicalResultSha256: string;
  replayHash: string;
  deterministicPipelineVersion: string;
  aiFallbackAvailable: boolean;
  aiFallbackRequested: boolean;
  aiFallbackCanonicalEligibility: "disabled";
  attempts: CanonicalExtractionAttempt[];
  fieldReconciliation: ParserPipelineFieldAudit;
}

export interface CanonicalCreditReportExtraction {
  parseResult: ComprehensiveParseResult;
  llmData: LLMResponse;
  rawHtml: string | null;
  rawText: string;
  extractionSource: CanonicalExtractionMethod;
  parserQuality: ParserQualityAssessment;
  provenance: CanonicalExtractionProvenance;
  fieldReconciliation: ParserPipelineFieldAudit;
  deterministicPipeline: DeterministicPipelinePackage;
  canonicalOutput: DeterministicNormalizedReport;
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

export async function extractCanonicalCreditReport(
  input: ExtractCanonicalCreditReportInput,
): Promise<CanonicalCreditReportExtraction> {
  if (input.mimeType !== "application/pdf") {
    throw new Error("Unsupported file type. Please upload a PDF.");
  }

  const attempts: CanonicalExtractionAttempt[] = [];
  const documentBinarySha256 = sha256HexOfBase64Payload(input.bytesBase64);
  const requestedAiFallback = input.allowAiFallback ?? false;

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

  attempts.push(
    summarizeAttempt(
      "gemini",
      "skipped",
      null,
      0,
      requestedAiFallback
        ? "AI fallback was requested but is diagnostic-only and cannot become canonical."
        : "AI fallback is disabled for deterministic canonical extraction.",
    ),
  );

  if (!deterministic) {
    throw new Error("Credit report extraction failed. The deterministic PDF parser produced no usable report data.");
  }

  const selected = deterministic;
  let selectedParseResult = selected.parseResult;
  let selectedLlmData = selected.llmData;
  let selectedParserQuality = selected.parserQuality;
  const rawFieldBaseline = extractRawParserFieldBaseline(selected.rawText);
  const appliedParserRuleIds: number[] = [];

  try {
    const activeRules = await loadActiveParserExtractionRules(
      selectedParseResult.sourceBureau?.bureauName || selectedLlmData.bureau,
    );
    if (activeRules.length > 0) {
      const applied = applyParserExtractionRules(selectedParseResult, activeRules);
      if (applied.appliedRuleIds.length > 0) {
        appliedParserRuleIds.push(...applied.appliedRuleIds);
        selectedParseResult = applied.parseResult;
        selectedLlmData = mapComprehensiveResultToLLMResponse(selectedParseResult);
        selectedParserQuality = assessParserQuality({
          rawHtml: selected.rawHtml || "",
          llmData: selectedLlmData,
          parseResult: selectedParseResult,
          parsedTradelines: selectedParseResult.tradelines,
          extractionSource: selected.method,
        });
      }
    }
  } catch (error) {
    console.warn(
      "[Canonical Extractor] Active parser extraction rules could not be loaded. Continuing with built-in parser output.",
      error instanceof Error ? error.message : error,
    );
  }

  const fieldReconciliation = reconcileParserPipelineFields(
    selectedParseResult,
    rawFieldBaseline,
  );
  if (fieldReconciliation.changed) {
    selectedParseResult = fieldReconciliation.parseResult;
    selectedLlmData = mapComprehensiveResultToLLMResponse(selectedParseResult);
    selectedParserQuality = assessParserQuality({
      rawHtml: selected.rawHtml || "",
      llmData: selectedLlmData,
      parseResult: selectedParseResult,
      parsedTradelines: selectedParseResult.tradelines,
      extractionSource: selected.method,
    });
    console.warn(
      `[Canonical Extractor] Recovered parser fields dropped after raw extraction: ${fieldReconciliation.audit.summary.backfilledFields.join(", ")}`,
    );
  } else {
    selectedParseResult = fieldReconciliation.parseResult;
  }

  const deterministicPipeline = buildDeterministicCreditReportPipelinePackage({
    parseResult: selectedParseResult,
    rawText: selected.rawText,
    documentBinarySha256,
    appliedParserRuleIds,
  });

  return {
    parseResult: selectedParseResult,
    llmData: selectedLlmData,
    rawHtml: selected.rawHtml,
    rawText: selected.rawText,
    extractionSource: selected.method,
    parserQuality: selectedParserQuality,
    fieldReconciliation: fieldReconciliation.audit,
    deterministicPipeline,
    canonicalOutput: deterministicPipeline.finalOutput,
    provenance: {
      strategy: "deterministic_pdf_text_state_machine",
      version: CANONICAL_CREDIT_REPORT_EXTRACTION_VERSION,
      selectedMethod: selected.method,
      normalizedByAi: false,
      sourceEvidence: "pdf_text",
      documentBinarySha256,
      canonicalResultSha256: deterministicPipeline.canonicalResultSha256,
      replayHash: deterministicPipeline.replayHash,
      deterministicPipelineVersion: deterministicPipeline.version,
      aiFallbackAvailable: false,
      aiFallbackRequested: requestedAiFallback,
      aiFallbackCanonicalEligibility: "disabled",
      attempts,
      fieldReconciliation: fieldReconciliation.audit,
    },
  };
}
