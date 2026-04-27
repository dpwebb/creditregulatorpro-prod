/**
 * TypeScript types for Full Draft Extraction conforming to schema "urn:compnd:schemas:tu-full-draft-extraction:v1".
 * This extends the Pass-A extraction types with comprehensive account, inquiry, and public record details.
 */

import {
  ExtractedValue,
  ProvenanceEvidence,
  BureauContext,
  ConsumerProfile,
  PortalSummary,
  ExtractionConflict,
  QualityNote,
  RawEvidenceItem,
} from "./passAExtractorTypes";

// Re-export reused types for convenience
export type {
  ExtractedValue,
  ProvenanceEvidence,
  BureauContext,
  ConsumerProfile,
  PortalSummary,
  ExtractionConflict,
  QualityNote,
  RawEvidenceItem,
};

// ----------------------------------------------------------------------------
// 1. Account/Tradeline Extraction Types
// ----------------------------------------------------------------------------

export interface PaymentHistoryEntry {
  period: ExtractedValue<string>; // e.g., "2023-11", "NOV 2023"
  status: ExtractedValue<string>; // e.g., "OK", "30", "60", etc.
  evidence: ProvenanceEvidence;
}

export interface AccountExtraction {
  creditor_name: ExtractedValue<string>;
  account_number_partial?: ExtractedValue<string>;
  account_type?: ExtractedValue<string>; // revolving, installment, etc.
  responsibility?: ExtractedValue<string>; // Individual, Joint, etc.
  
  // Dates
  date_opened?: ExtractedValue<string>;
  date_closed?: ExtractedValue<string>;
  date_reported?: ExtractedValue<string>;
  date_last_activity?: ExtractedValue<string>;
  date_last_payment?: ExtractedValue<string>;
  date_first_delinquency?: ExtractedValue<string>;
  
  // Amounts
  high_credit?: ExtractedValue<number>;
  credit_limit?: ExtractedValue<number>;
  balance?: ExtractedValue<number>;
  amount_past_due?: ExtractedValue<number>;
  monthly_payment?: ExtractedValue<number>;
  actual_payment?: ExtractedValue<number>;
  
  // Status
  status?: ExtractedValue<string>;
  status_date?: ExtractedValue<string>;
  payment_status?: ExtractedValue<string>;
  narrative_codes?: ExtractedValue<string>[];
  
  // Payment history (as extracted)
  payment_history?: PaymentHistoryEntry[];
  
  // Terms
  terms?: ExtractedValue<string>;
  terms_months?: ExtractedValue<number>;
}

// ----------------------------------------------------------------------------
// 2. Inquiry Types
// ----------------------------------------------------------------------------

export interface InquiryExtraction {
  inquirer_name: ExtractedValue<string>;
  inquiry_date: ExtractedValue<string>;
  phone_number?: ExtractedValue<string>;
  inquiry_type?: ExtractedValue<string>;
}

// ----------------------------------------------------------------------------
// 3. Insolvency/Public Records
// ----------------------------------------------------------------------------

export interface PublicRecordExtraction {
  record_type: ExtractedValue<string>;
  filing_date?: ExtractedValue<string>;
  court_name?: ExtractedValue<string>;
  case_number?: ExtractedValue<string>;
  status?: ExtractedValue<string>;
  amount?: ExtractedValue<number>;
}

export interface InsolvencyPublicRecords {
  section_present: boolean;
  records: PublicRecordExtraction[];
  portal_count?: ExtractedValue<number>;
}

// ----------------------------------------------------------------------------
// 4. Full Draft Extraction Output
// ----------------------------------------------------------------------------

export interface FullDraftExtraction {
  schema: 'urn:compnd:schemas:tu-full-draft-extraction:v1';
  doc_id: number; // report_artifact_id
  pass: 'A_FULL';
  channel_guess: string | null;
  
  // Context & Profile (reused from Pass A)
  bureau_context: BureauContext;
  consumer_profile: ConsumerProfile;
  portal_summary: PortalSummary;
  
  // Detailed Lists
  accounts: AccountExtraction[];
  inquiries_credit_related: InquiryExtraction[];
  inquiries_other: InquiryExtraction[];
  insolvency_public_records: InsolvencyPublicRecords;
  
  // Meta & Quality
  raw_evidence: RawEvidenceItem[];
  conflicts: ExtractionConflict[];
  missing_required_fields: string[];
  quality_notes: QualityNote[];
  extracted_at: string; // ISO timestamp
}

// ----------------------------------------------------------------------------
// 5. Input Types
// ----------------------------------------------------------------------------

export interface PagePayload {
  page_number: number;
  pdf_text: string | null;
  ocr_text: string | null;
  image_available: boolean;
  quality_hints?: string[];
}

export interface FullExtractionInput {
  reportArtifactId: number;
  pdfBase64: string;
  docMeta: {
    fileName: string;
    mimeType: string;
    fileSize?: number;
  };
  pagesPayload?: PagePayload[];
}

export interface FullExtractionResult {
  success: boolean;
  extraction?: FullDraftExtraction;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}