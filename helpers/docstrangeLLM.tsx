import { z } from "zod";
import { SSEEvent } from "./sseStreamBuilder";

/**
 * Zod schema for the structured output expected from DocStrange API.
 * This matches the response from extraction-api.nanonets.com
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
 * Converts base64 PDF data to a File object for multipart/form-data upload.
 */
function base64ToFile(base64Data: string, filename: string): File {
  // Remove data URL prefix if present
  const base64Clean = base64Data.replace(/^data:application\/pdf;base64,/, "");

  // Convert base64 to binary
  const binaryString = atob(base64Clean);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Create File object
  const blob = new Blob([bytes], { type: "application/pdf" });
  return new File([blob], filename, { type: "application/pdf" });
}

/**
 * Processes raw DocStrange response object, extracting HTML content.
 */
function processDocStrangeResponseData(data: any): { html: string | null } {
  let html: string | null = null;

  if (data.result && data.result.html) {
    if (typeof data.result.html === "object" && data.result.html.content) {
      html = data.result.html.content;
    } else if (typeof data.result.html === "string") {
      html = data.result.html;
    }
  } else if (data.html) {
    if (typeof data.html === "object" && data.html.content) {
      html = data.html.content;
    } else if (typeof data.html === "string") {
      html = data.html;
    }
  }

  return { html };
}

/**
 * Submits PDF data to DocStrange API for extraction using the async endpoint.
 */
export async function submitDocStrangeExtraction(
  base64PdfData: string,
  sendSSE?: (event: SSEEvent) => void
): Promise<DocStrangeSubmitResult> {
  const apiKey = process.env.DOCSTRANGE_API_KEY;

  if (!apiKey) {
    console.error("[DocStrange API] Missing DOCSTRANGE_API_KEY");
    return { mode: "failed", error: "Missing API Key" };
  }

  try {
    console.log("[DocStrange API] Preparing PDF for upload to async endpoint...");
    const pdfFile = base64ToFile(base64PdfData, "credit-report.pdf");

    const asyncFormData = new FormData();
    asyncFormData.append("file", pdfFile);
    asyncFormData.append("output_format", "html");

    let heartbeatInterval: NodeJS.Timeout | null = null;
    if (sendSSE) {
      heartbeatInterval = setInterval(() => {
        sendSSE({
          type: "progress",
          stage: "docstrange_processing",
          message: "Processing with XApp proprietary AI...",
        });
      }, 5000);
    }

    let asyncResponse: Response;
    try {
      asyncResponse = await fetch("https://extraction-api.nanonets.com/api/v1/extract/async", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: asyncFormData,
      });
    } finally {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    }

    if (!asyncResponse.ok) {
      const asyncErrorText = await asyncResponse.text();
      console.error(`[DocStrange API] Async API error: ${asyncResponse.status} ${asyncResponse.statusText}`, asyncErrorText);
      return { mode: "failed", error: `Async API returned ${asyncResponse.status}` };
    }

    const asyncData = await asyncResponse.json();
    const recordId = asyncData.record_id;
    if (!recordId) {
      console.error("[DocStrange API] Async API did not return a record_id");
      return { mode: "failed", error: "Async API missing record_id" };
    }

    console.log(`[DocStrange API] Successfully submitted to async endpoint. Record ID: ${recordId}`);
    return { mode: "async", recordId };
  } catch (error) {
    console.error("[DocStrange API] Unexpected error", error);
    return { mode: "failed", error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Polls DocStrange async results endpoint until processing is complete.
 */
export async function pollDocStrangeResult(
  recordId: string,
  sendSSE?: (event: SSEEvent) => void,
  maxAttempts: number = 50,
  intervalMs: number = 3000
): Promise<{ html: string | null } | null> {
  const apiKey = process.env.DOCSTRANGE_API_KEY;
  if (!apiKey) {
    console.error("[DocStrange API] Missing DOCSTRANGE_API_KEY");
    return null;
  }

    let pollData: any = { status: "processing" };
  let attempts = 0;

  while (pollData.status === "processing" && attempts < maxAttempts) {
    attempts++;
    if (sendSSE) {
      // Progress from 15% to 34% across all polling attempts
      const percent = Math.min(15 + Math.round((attempts / maxAttempts) * 19), 34);
      sendSSE({
        type: "progress",
        stage: "docstrange_processing",
        message: `Processing with XApp proprietary AI (Async attempt ${attempts}/${maxAttempts})...`,
        percent,
      });
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    const pollResponse = await fetch(`https://extraction-api.nanonets.com/api/v1/extract/results/${recordId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (pollResponse.ok) {
      pollData = await pollResponse.json();
    } else {
      console.error(`[DocStrange API] Poll failed with status ${pollResponse.status}`);
    }
  }

  if (pollData.status === "processing") {
    console.error(`[DocStrange API] Async polling exhausted all ${maxAttempts} attempts without completion.`);
    return null;
  }

  console.log("[DocStrange API] Successfully polled async results");
  return processDocStrangeResponseData(pollData);
}

/**
 * Calls DocStrange API to extract structured data from a PDF credit report.
 * Provides backwards compatibility for legacy calls.
 */
export async function extractStructuredDataWithDocStrange(
  base64PdfData: string,
  sendSSE?: (event: SSEEvent) => void
): Promise<{ html: string | null } | null> {
  const submitResult = await submitDocStrangeExtraction(base64PdfData, sendSSE);

  if (submitResult.mode === "async") {
    return await pollDocStrangeResult(submitResult.recordId, sendSSE, 28, 5000); // legacy equivalent timeout settings
  }

  return null;
}

// Export for backward compatibility
export const extractStructuredDataWithLLM = extractStructuredDataWithDocStrange;