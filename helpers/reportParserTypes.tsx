import { ExtractedReportMetadata } from "./reportMetadataExtractor";
import { ExtractedConsumerInfo } from "./consumerInfoExtractor";
import { ExtractedCreditScore } from "./creditScoreExtractor";
import { ExtractedInquiry } from "./inquiryExtractor";
import { ExtractedPublicRecord } from "./publicRecordExtractor";
import { ExtractedConsumerStatement } from "./consumerStatementExtractor";
import { ExtractedEmploymentInfo } from "./employmentExtractor";
import { ExtractedPaymentHistory } from "./paymentHistoryExtractor";

/**
 * Represents the structured data for a single credit account (tradeline) 
 * extracted from a Canadian credit report.
 */
export interface ParsedTradeline {
  /** The account number, often masked (e.g., "****1234") */
  accountNumber: string;
  /** The name of the creditor or financial institution */
  creditorName: string;
  /** The category of account (e.g., Revolving, Installment, Mortgage, Open) */
  accountType: string;
  /** Current outstanding balance */
  balance: number;
  /** Canadian credit rating (e.g., R1, I2) or descriptive status */
  status: string;
  /** Key dates associated with the account */
  dates: {
    /** When the account was originally opened */
    opened?: Date | null;
    /** The date this information was last reported by the creditor */
    reported?: Date | null;
    /** If applicable, when the account was closed */
    closed?: Date | null;
    /** Date of First Delinquency, critical for statute of limitations */
    dofd?: Date | null;
    [key: string]: any;
  };
  /** Financial limits and delinquency amounts */
  amounts: {
    /** The highest balance ever reached or the total credit limit */
    high?: number;
    /** The amount currently overdue */
    pastDue?: number;
    [key: string]: any;
  };
  /** Standardized or custom remark codes (e.g., "AC01") */
  remarkCodes: string[];
  /** Original creditor name (for collection accounts where current creditor is a collection agency) */
  originalCreditorName?: string;
  /** Raw text section that was parsed to create this tradeline (for document highlighting) */
  sourceText?: string;

  /** Flag indicating if this is a collection account */
  isCollectionAccount?: boolean;
  /** Name of the collection agency (if different from creditor) */
  collectionAgencyName?: string;
  /** When the debt was assigned to collection */
  dateAssignedToCollection?: Date | null;
  /** Original balance/principal before collection */
  originalBalance?: number;
  /** Interest rate (if applicable) */
  interestRate?: number;
  /** Payment terms */
  terms?: string;
  /** Monthly payment amount */
  monthlyPayment?: number;
  /** Date of last activity on the account */
  lastActivityDate?: Date | null;
  /** Responsibility code: Individual, Joint, Authorized User, Cosigner */
  responsibilityCode?: string;
  /** ECOA code: I, J, A, C, S, B, T, X, Z */
  ecoaCode?: string;
  /** Date of the last payment made on the account */
  lastPaymentDate?: Date | null;
  /** Amount of the last payment made */
  lastPaymentAmount?: number;
  /** Maturity date (for loans/mortgages) */
  maturityDate?: Date | null;
  /** Date the account was posted */
  postedDate?: Date | null;
  /** Date the account was charged off */
  chargeOffDate?: Date | null;
  /** Date of the balloon payment */
  balloonPaymentDate?: Date | null;
  /** Payment pattern/history string (e.g., "111111111111") */
  paymentPattern?: string;
  /** Manner of Payment code (0-9, X) */
  mop?: string;
  /** Credit limit for revolving accounts */
  creditLimit?: number;
}

/**
 * Represents the basic structured output of the credit report parsing process.
 */
export interface ParseResult {
  /** List of all valid tradelines identified in the report */
  tradelines: ParsedTradeline[];
  /** The detected source bureau (Equifax Canada, TransUnion Canada) with confidence score */
  sourceBureau: { bureauName: string; confidence: number } | null;
  /** Extracted consumer personal information (name, address, DOB) from the report */
  consumerInfo: ExtractedConsumerInfo | null;
}

/**
 * Comprehensive parsing result that includes ALL extracted data from a credit report.
 * Extends ParseResult to maintain backward compatibility.
 */
export interface ComprehensiveParseResult extends ParseResult {
  /** Raw extracted text for audit/debugging purposes */
  rawText: string;
  
  /** Report-level metadata extracted from the header section */
  reportMetadata: ExtractedReportMetadata;
  
  /** Credit scores from the report (may include multiple scores from different models/dates) */
  creditScores: ExtractedCreditScore[];
  
  /** Credit inquiries (both hard and soft) */
  inquiries: ExtractedInquiry[];
  
  /** Public records (bankruptcies, judgments, liens, etc.) */
  publicRecords: ExtractedPublicRecord[];
  
  /** Consumer statements, fraud alerts, disputes, and security freezes */
  consumerStatements: ExtractedConsumerStatement[];
  
  /** Employment information and history */
  employmentInfo: ExtractedEmploymentInfo[];
  
  /** 
   * Payment histories corresponding to the tradelines.
   * Indexed in the same order as tradelines array.
   * During persistence, these will be linked to their respective tradeline IDs.
   */
  paymentHistories: ExtractedPaymentHistory[];
}

// Re-export types from extractors for convenience
export type { ExtractedReportMetadata } from "./reportMetadataExtractor";
export type { ExtractedConsumerInfo } from "./consumerInfoExtractor";
export type { ExtractedCreditScore } from "./creditScoreExtractor";
export type { ExtractedInquiry } from "./inquiryExtractor";
export type { ExtractedPublicRecord } from "./publicRecordExtractor";
export type { ExtractedConsumerStatement } from "./consumerStatementExtractor";
export type { ExtractedEmploymentInfo } from "./employmentExtractor";
export type { ExtractedPaymentHistory } from "./paymentHistoryExtractor";