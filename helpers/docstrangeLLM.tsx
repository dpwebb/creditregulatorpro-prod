import { z } from "zod";
import type { SSEEvent } from "./sseStreamBuilder";

/**
 * Zod schema for the legacy DocStrange-shaped compatibility envelope.
 * This shape is retained for deterministic parser diagnostics and old type imports.
 */

const DocStrangePersonalInfoSchema = z.object({
  surname: z.string().nullable().optional(),
  givenNames: z.string().nullable().optional(),
  middleName: z.string().nullable().optional(),
  suffix: z.string().nullable().optional(),
  socialInsuranceNo: z.string().nullable().optional(),
  birthDate: z.string().nullable().optional(),
});

const DocStrangeCrossReferenceSchema = z.object({
  type: z.string().nullable().optional(),
  surname: z.string().nullable().optional(),
  givenNames: z.string().nullable().optional(),
  middleName: z.string().nullable().optional(),
  suffix: z.string().nullable().optional(),
});

const DocStrangeAddressSchema = z.object({
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  province: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  ownOrRent: z.string().nullable().optional(),
  sinceDate: z.string().nullable().optional(),
  telephoneAssociations: z.string().nullable().optional(),
});

const DocStrangeEmploymentSchema = z.object({
  date: z.string().nullable().optional(),
  employerNameCityProvince: z.string().nullable().optional(),
  occupation: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  finishDate: z.string().nullable().optional(),
  pay: z.string().nullable().optional(),
  payFrequency: z.string().nullable().optional(),
});

const DocStrangeTelephoneSchema = z.object({
  qualifier: z.string().nullable().optional(),
  number: z.string().nullable().optional(),
  extension: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
});

const DocStrangePaymentHistoryDetailSchema = z.object({
  date: z.string().nullable().optional(),
  balance: z.number().nullable().optional(),
  payment: z.number().nullable().optional(),
  pastDue: z.number().nullable().optional(),
  mop: z.any().nullable().optional(), // Can be number or string
  terms: z.any().nullable().optional(), // Can be number or string
  highCredit: z.number().nullable().optional(),
  creditLimit: z.number().nullable().optional(),
  balloonPayment: z.number().nullable().optional(),
  chargeOff: z.number().nullable().optional(),
  narrative: z.string().nullable().optional(),
});

const DocStrangeTradelineSchema = z.object({
  creditorName: z.string().nullable().optional(),
  accountNumber: z.string().nullable().optional(),
  accountType: z.string().nullable().optional(),
  balance: z.number().nullable().optional(),
  status: z.string().nullable().optional(),
  dateOpened: z.string().nullable().optional(),
  dateReported: z.string().nullable().optional(),
  dateClosed: z.string().nullable().optional(),
  dateOfFirstDelinquency: z.string().nullable().optional(),
  highCredit: z.number().nullable().optional(),
  pastDue: z.number().nullable().optional(),
  creditLimit: z.number().nullable().optional(),
  paymentPattern: z.string().nullable().optional(),
  responsibilityCode: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
  // New fields
  openedDate: z.string().nullable().optional(),
  reportedDate: z.string().nullable().optional(),
  closedDate: z.string().nullable().optional(),
  firstDelinquencyDate: z.string().nullable().optional(),
  lastPaymentDate: z.string().nullable().optional(),
  postedDate: z.string().nullable().optional(),
  chargeOffDate: z.string().nullable().optional(),
  balloonPaymentDate: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
  legend: z.string().nullable().optional(),
  paymentHistory: z.any().nullable().optional(), // object of {30, 60, 90, #M}
  paymentHistoryDetails: z.array(DocStrangePaymentHistoryDetailSchema).nullable().optional(),
  // EQ-specific fields
  memberName: z.string().nullable().optional(),
  isCollectionAccount: z.boolean().nullable().optional(),
  collectionAgencyName: z.string().nullable().optional(),
  originalCreditorName: z.string().nullable().optional(),
  dateAssignedToCollection: z.string().nullable().optional(),
  originalBalance: z.number().nullable().optional(),
  memberNumber: z.string().nullable().optional(),
  sourceText: z.string().nullable().optional(),
  monthsReviewed: z.string().nullable().optional(),
  paymentHistoryProfile: z.string().nullable().optional(),
  lastActivityDate: z.string().nullable().optional(),
  monthlyPayment: z.number().nullable().optional(),
  scheduledMonthlyPayment: z.number().nullable().optional(),
  paymentFrequency: z.string().nullable().optional(),
});

const DocStrangeConsumerInfoSchema = z.object({
  fullName: z.string().nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
  currentAddress: z.string().nullable().optional(),
  previousAddresses: z.array(z.string()).optional(),
  employers: z.array(z.string()).optional(),
});

const DocStrangeScoreSchema = z.object({
  score: z.number().nullable().optional(),
  scoreType: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
});

const DocStrangeInquirySchema = z.object({
  creditorName: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  authorizedUserName: z.string().nullable().optional(),
  telephone: z.string().nullable().optional(),
});

const DocStrangePublicRecordSchema = z.object({
  type: z.string().nullable().optional(),
  dateFiled: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  dateOfDischarge: z.string().nullable().optional(),
  court: z.string().nullable().optional(),
  trustee: z.string().nullable().optional(),
  liabilityAmount: z.number().nullable().optional(),
  assetAmount: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
});

// The root schema for the DocStrange API response
export const DocStrangeResponseSchema = z.object({
  bureau: z.string().nullable().optional(),
  reportDate: z.string().nullable().optional(),
  tuCaseId: z.string().nullable().optional(),
  firstReportedDate: z.string().nullable().optional(),
  lastReviewedBy: z.string().nullable().optional(),
  lastReviewedDate: z.string().nullable().optional(),
  consumerInfo: DocStrangeConsumerInfoSchema.nullable().optional(),
  personalInfo: DocStrangePersonalInfoSchema.nullable().optional(),
  scores: z.array(DocStrangeScoreSchema).optional(),
  tradelines: z.array(DocStrangeTradelineSchema).optional(),
  inquiries: z.array(DocStrangeInquirySchema).optional(),
  creditRelatedInquiries: z.array(DocStrangeInquirySchema).optional(),
  nonCreditRelatedInquiries: z.array(DocStrangeInquirySchema).optional(),
  accountReviewInquiries: z.array(DocStrangeInquirySchema).optional(),
  publicRecords: z.array(DocStrangePublicRecordSchema).optional(),
  insolvency: z.array(DocStrangePublicRecordSchema).optional(),
  crossReferences: z.array(DocStrangeCrossReferenceSchema).optional(),
  addresses: z.array(DocStrangeAddressSchema).optional(),
  employments: z.array(DocStrangeEmploymentSchema).optional(),
  telephoneNumbers: z.array(DocStrangeTelephoneSchema).optional(),
});

export type LLMResponse = z.infer<typeof DocStrangeResponseSchema>;

export type DocStrangeSubmitResult =
  | { mode: "async"; recordId: string }
  | { mode: "failed"; error: string };

/**
 * Legacy DocStrange submission is disabled for deterministic credit ingestion.
 */
export async function submitDocStrangeExtraction(
  base64PdfData: string,
  sendSSE?: (event: SSEEvent) => void
): Promise<DocStrangeSubmitResult> {
  void base64PdfData;
  void sendSSE;
  return {
    mode: "failed",
    error: "DocStrange extraction is disabled by deterministic ingestion policy.",
  };
}

/**
 * Legacy DocStrange polling is disabled for deterministic credit ingestion.
 */
export async function pollDocStrangeResult(
  recordId: string,
  sendSSE?: (event: SSEEvent) => void,
  maxAttempts: number = 50,
  intervalMs: number = 3000
): Promise<{ html: string | null } | null> {
  void recordId;
  void sendSSE;
  void maxAttempts;
  void intervalMs;
  return null;
}

/**
 * Legacy DocStrange extraction is disabled for deterministic credit ingestion.
 */
export async function extractStructuredDataWithDocStrange(
  base64PdfData: string,
  sendSSE?: (event: SSEEvent) => void
): Promise<{ html: string | null } | null> {
  void base64PdfData;
  void sendSSE;
  return null;
}

// Export for backward compatibility
export const extractStructuredDataWithLLM = extractStructuredDataWithDocStrange;
