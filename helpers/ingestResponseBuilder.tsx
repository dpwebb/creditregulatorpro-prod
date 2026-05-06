import { ParsedTradeline } from "./reportParser";
import { PassADraftExtraction } from "./passAExtractorTypes";
import { ConsumerInfoComparison } from "./fuzzyMatcher";
import { ParserQualityAssessment } from "./parserQuality";
import type {
  DeterministicNormalizedReport,
  DeterministicPipelinePackage,
} from "./deterministicCreditReportPipeline";

export interface BuildResponseInput {
  artifactId: number;
  parsedTradelines: ParsedTradeline[];
  tradelineIds: number[];
  profileFieldsPopulated: string[];
  passAExtraction: PassADraftExtraction | null;
  fullExtractionResult: {
    success: boolean;
    extraction?: {
      accounts: any[];
      inquiries_credit_related: any[];
      inquiries_other: any[];
      insolvency_public_records: {
        section_present: boolean;
      };
    };
    error?: {
      message: string;
    };
  };
  parseResult: {
    creditScores: any[];
    inquiries: any[];
    publicRecords: any[];
    consumerStatements: any[];
    employmentInfo: any[];
    paymentHistories: any[];
  } | null;
  consumerInfoComparison: ConsumerInfoComparison | null;
  parserQuality?: ParserQualityAssessment | null;
  deterministicPipeline?: DeterministicPipelinePackage | null;
}

export interface IngestResponseData {
  ok: boolean;
  storageUrl: string;
  tradelines: ParsedTradeline[];
  tradelinesCount: number;
  tradelineIds: number[];
  profileFieldsPopulated: string[];
  passAExtraction: {
    status: "completed";
    channelGuess: string | null;
    conflictsCount: number;
    qualityNotesCount: number;
    missingFieldsCount: number;
  };
  fullExtraction?: {
    status: "completed" | "failed";
    accountsCount?: number;
    creditInquiriesCount?: number;
    otherInquiriesCount?: number;
    publicRecordsPresent?: boolean;
    error?: string;
  };
  comprehensiveExtraction?: {
    creditScoresCount: number;
    inquiriesCount: number;
    publicRecordsCount: number;
    consumerStatementsCount: number;
    employmentInfoCount: number;
    paymentHistoriesCount: number;
  };
  consumerInfoComparison?: {
    isMatch: boolean;
    nameMismatch: boolean;
    addressMismatch: boolean;
    extractedInfo: {
      fullName: string | null;
      addressLine1: string | null;
      city: string | null;
      province: string | null;
      postalCode: string | null;
      dateOfBirth: Date | null;
      phone: string | null;
    };
    profileInfo: {
      fullName: string | null;
      addressLine1: string | null;
      city: string | null;
      province: string | null;
      postalCode: string | null;
      dateOfBirth: Date | null;
      phone: string | null;
    };
  };
  parserQuality?: ParserQualityAssessment;
  canonicalOutput?: DeterministicNormalizedReport;
  replayHash?: string;
}

/**
 * Builds the final response data object for the ingestion process.
 * 
 * @param input - All data collected during the ingestion process
 * @returns Structured response data
 */
export function buildIngestResponse(
  input: BuildResponseInput
): IngestResponseData {
  const {
    artifactId,
    parsedTradelines,
    tradelineIds,
    profileFieldsPopulated,
    passAExtraction,
    fullExtractionResult,
    parseResult,
    consumerInfoComparison,
    parserQuality,
    deterministicPipeline,
  } = input;

  const responseData: IngestResponseData = {
    ok: true,
    storageUrl: String(artifactId),
    tradelines: parsedTradelines,
    tradelinesCount: parsedTradelines.length,
    tradelineIds: tradelineIds,
    profileFieldsPopulated: profileFieldsPopulated,
    passAExtraction: {
      status: "completed",
      channelGuess: passAExtraction?.channel_guess || null,
      conflictsCount: passAExtraction?.conflicts.length || 0,
      qualityNotesCount: passAExtraction?.quality_notes.length || 0,
      missingFieldsCount: passAExtraction?.missing_required_fields.length || 0,
    },
  };

  // Include full extraction status if available
  if (fullExtractionResult.success && fullExtractionResult.extraction) {
    responseData.fullExtraction = {
      status: "completed",
      accountsCount: fullExtractionResult.extraction.accounts.length,
      creditInquiriesCount: fullExtractionResult.extraction.inquiries_credit_related.length,
      otherInquiriesCount: fullExtractionResult.extraction.inquiries_other.length,
      publicRecordsPresent: fullExtractionResult.extraction.insolvency_public_records.section_present,
    };
  } else {
    responseData.fullExtraction = {
      status: "failed",
      error: fullExtractionResult.error?.message,
    };
  }

  // Include comprehensive extraction stats if available
  if (parseResult) {
    responseData.comprehensiveExtraction = {
      creditScoresCount: parseResult.creditScores.length,
      inquiriesCount: parseResult.inquiries.length,
      publicRecordsCount: parseResult.publicRecords.length,
      consumerStatementsCount: parseResult.consumerStatements.length,
      employmentInfoCount: parseResult.employmentInfo.length,
      paymentHistoriesCount: parseResult.paymentHistories.length,
    };
  }

  // Include consumer info comparison if available
  if (consumerInfoComparison) {
    responseData.consumerInfoComparison = {
      isMatch: consumerInfoComparison.isMatch,
      nameMismatch: consumerInfoComparison.nameMismatch,
      addressMismatch: consumerInfoComparison.addressMismatch,
      extractedInfo: {
        fullName: consumerInfoComparison.extractedInfo.fullName,
        addressLine1: consumerInfoComparison.extractedInfo.addressLine1,
        city: consumerInfoComparison.extractedInfo.city,
        province: consumerInfoComparison.extractedInfo.province,
        postalCode: consumerInfoComparison.extractedInfo.postalCode,
        dateOfBirth: consumerInfoComparison.extractedInfo.dateOfBirth,
        phone: consumerInfoComparison.extractedInfo.phone,
      },
      profileInfo: {
        fullName: consumerInfoComparison.profileInfo.fullName,
        addressLine1: consumerInfoComparison.profileInfo.addressLine1,
        city: consumerInfoComparison.profileInfo.city,
        province: consumerInfoComparison.profileInfo.province,
        postalCode: consumerInfoComparison.profileInfo.postalCode,
        dateOfBirth: consumerInfoComparison.profileInfo.dateOfBirth,
        phone: consumerInfoComparison.profileInfo.phone,
      },
    };
  }

  if (parserQuality) {
    responseData.parserQuality = parserQuality;
  }

  if (deterministicPipeline) {
    responseData.canonicalOutput = deterministicPipeline.finalOutput;
    responseData.replayHash = deterministicPipeline.replayHash;
  }

  return responseData;
}
