/**
 * TypeScript types for Pass-A draft extraction conforming to schema "urn:compnd:schemas:pass-a-draft-extraction:v1".
 * This defines deterministic extraction of consumer profile and bureau metadata.
 */

// Source method enum for provenance tracking
export type ExtractionSourceMethod = 'pdf_text' | 'ocr_text';

// Provenance evidence - REQUIRED for every extracted value
export interface ProvenanceEvidence {
  page_number: number;
  source_method: ExtractionSourceMethod;
  snippet: string; // max 25 words
}

// Extracted value with provenance
export interface ExtractedValue<T> {
  value: T;
  confidence: number; // 0-1
  evidence: ProvenanceEvidence;
}

// Bureau contact details
export interface BureauContact {
  address?: ExtractedValue<string>;
  phone?: ExtractedValue<string>;
  toll_free?: ExtractedValue<string>; // e.g., "1-800-663-9980"
  french_qc_toll_free?: ExtractedValue<string>; // e.g., "1-877-713-3393"
  fax?: ExtractedValue<string>;
  website?: ExtractedValue<string>;
  dispute_url?: ExtractedValue<string>;
  dispute_portal?: ExtractedValue<string>; // e.g., "http://ocs.transunion.ca"
}

// Portal summary (counts only, not full data)
export interface PortalSummary {
  credit_score?: ExtractedValue<number>;
  total_accounts?: ExtractedValue<number>;
  open_accounts?: ExtractedValue<number>;
  closed_accounts?: ExtractedValue<number>;
  delinquent_accounts?: ExtractedValue<number>;
  derogatory_accounts?: ExtractedValue<number>;
  total_balance?: ExtractedValue<number>;
  total_credit_limit?: ExtractedValue<number>;
  utilization_percent?: ExtractedValue<number>;
  total_payments?: ExtractedValue<number>;
  inquiries_count?: ExtractedValue<number>;
  inquiries_6yrs?: ExtractedValue<number>; // Specifically 6 year inquiries
  public_records_count?: ExtractedValue<number>;
}

// Bureau context
export interface BureauContext {
  bureau_name?: ExtractedValue<string>;
  bureau_legal_entity?: ExtractedValue<string>; // e.g., "Trans Union of Canada, Inc."
  report_title?: ExtractedValue<string>;
  report_generated_at?: ExtractedValue<string>; // ISO date
  report_as_of_date?: ExtractedValue<string>; // ISO date
  tu_case_id?: ExtractedValue<string>;
  authentication_reference?: ExtractedValue<string>;
  bureau_contact?: BureauContact;
  first_reported_to_bureau?: ExtractedValue<string>;
  last_reviewed_by?: ExtractedValue<string>;
  last_reviewed_date?: ExtractedValue<string>;
  portal_summary?: PortalSummary;
}

// Address entry with full details
export interface AddressEntry {
  address_line_1?: ExtractedValue<string>;
  address_line_2?: ExtractedValue<string>;
  city?: ExtractedValue<string>;
  province?: ExtractedValue<string>;
  postal_code?: ExtractedValue<string>;
  country?: ExtractedValue<string>;
  reported_date?: ExtractedValue<string>;
  since_date?: ExtractedValue<string>; // When address was first reported
  status?: ExtractedValue<string>; // Current, Previous, etc.
  associated_phone?: ExtractedValue<string>; // Phone shown with this address
}

// Phone entry
export interface PhoneEntry {
  phone_number: ExtractedValue<string>;
  phone_type?: ExtractedValue<string>; // Home, Work, Mobile, etc.
  extension?: ExtractedValue<string>; // Phone extension if present
  reported_date?: ExtractedValue<string>;
}

// Employment entry
export interface EmploymentEntry {
  employer_name?: ExtractedValue<string>;
  occupation?: ExtractedValue<string>;
  employer_address?: ExtractedValue<string>;
  hire_date?: ExtractedValue<string>;
  verification_date?: ExtractedValue<string>;
  status?: ExtractedValue<string>; // Current, Previous
}

// Consumer profile
export interface ConsumerProfile {
  legal_name?: {
    given_name?: ExtractedValue<string>;
    middle_name?: ExtractedValue<string>;
    surname?: ExtractedValue<string>;
    suffix?: ExtractedValue<string>;
  };
  date_of_birth?: ExtractedValue<string>; // ISO date
  sin_status_indicator?: ExtractedValue<string>; // "ON FILE" | "NOT ON FILE" only if explicit
  aliases?: ExtractedValue<string>[]; // Former names
  address_history: AddressEntry[];
  phone_history: PhoneEntry[];
  employment_history: EmploymentEntry[];
}

// Conflict detected during extraction
export interface ExtractionConflict {
  path: string; // e.g., "consumer_profile.date_of_birth"
  candidates: ExtractedValue<any>[];
  reason: string;
}

// Quality note
export interface QualityNote {
  category: 'warning' | 'info' | 'error';
  message: string;
  affected_paths?: string[];
}

// Raw evidence item for tracking all extracted values
export interface RawEvidenceItem {
  path: string; // e.g., "consumer_profile.date_of_birth"
  value: any;
  confidence: number;
  evidence: ProvenanceEvidence;
}

// Main Pass-A draft extraction output
export interface PassADraftExtraction {
  schema: 'urn:compnd:schemas:pass-a-draft-extraction:v1';
  doc_id: number; // report_artifact_id
  pass: 'A';
  channel_guess: string | null; // e.g., "TransUnion Credit Monitoring", "Consumer Disclosure"
  bureau_context: BureauContext;
  consumer_profile: ConsumerProfile;
  raw_evidence: RawEvidenceItem[];
  conflicts: ExtractionConflict[];
  missing_required_fields: string[];
  quality_notes: QualityNote[];
  extracted_at: string; // ISO timestamp
}

// Input for extraction
export interface PassAExtractionInput {
  reportArtifactId: number;
  pdfBase64: string;
  rawText: string;
  pageCount?: number;
}

// Result wrapper
export interface PassAExtractionResult {
  success: boolean;
  extraction?: PassADraftExtraction;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}
