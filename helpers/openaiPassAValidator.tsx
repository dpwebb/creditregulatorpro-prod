/**
 * Validation logic for Pass-A extraction output.
 */

import { PassADraftExtraction } from "./passAExtractorTypes";

export interface ValidationResult {
  isValid: boolean;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * Validates that the extracted data conforms to the Pass-A schema.
 * 
 * Checks:
 * - Schema identifier matches
 * - Pass identifier is "A"
 * - Bureau context exists and is an object
 * - Consumer profile exists and is an object
 * - Raw evidence array exists
 * 
 * @param extraction The extraction output to validate
 * @returns Validation result with error details if invalid
 */
export function validatePassAExtraction(
  extraction: any
): ValidationResult {
  if (!extraction) {
    return {
      isValid: false,
      error: {
        code: "INVALID_SCHEMA",
        message: "Extraction output is null or undefined",
        details: extraction,
      },
    };
  }

  if (extraction.schema !== "urn:compnd:schemas:pass-a-draft-extraction:v1") {
    return {
      isValid: false,
      error: {
        code: "INVALID_SCHEMA",
        message: "Schema identifier does not match Pass-A schema",
        details: { actual: extraction.schema },
      },
    };
  }

  if (extraction.pass !== "A") {
    return {
      isValid: false,
      error: {
        code: "INVALID_SCHEMA",
        message: "Pass identifier is not 'A'",
        details: { actual: extraction.pass },
      },
    };
  }

  if (
    typeof extraction.bureau_context !== "object" ||
    extraction.bureau_context === null
  ) {
    return {
      isValid: false,
      error: {
        code: "INVALID_SCHEMA",
        message: "Bureau context is missing or not an object",
        details: extraction,
      },
    };
  }

  if (
    typeof extraction.consumer_profile !== "object" ||
    extraction.consumer_profile === null
  ) {
    return {
      isValid: false,
      error: {
        code: "INVALID_SCHEMA",
        message: "Consumer profile is missing or not an object",
        details: extraction,
      },
    };
  }

  if (!Array.isArray(extraction.raw_evidence)) {
    return {
      isValid: false,
      error: {
        code: "INVALID_SCHEMA",
        message: "Raw evidence is missing or not an array",
        details: extraction,
      },
    };
  }

  return { isValid: true };
}

/**
 * Injects system fields into the extraction output.
 * 
 * Adds:
 * - doc_id: The report artifact ID
 * - extracted_at: Current ISO timestamp
 * - raw_evidence: Empty array if missing
 * 
 * @param extraction The extraction output to enrich
 * @param reportArtifactId The report artifact ID
 */
export function enrichExtractionWithSystemFields(
  extraction: any,
  reportArtifactId: number
): PassADraftExtraction {
  extraction.doc_id = reportArtifactId;
  extraction.extracted_at = new Date().toISOString();

  // Ensure raw_evidence exists
  if (!extraction.raw_evidence) {
    extraction.raw_evidence = [];
  }

  return extraction as PassADraftExtraction;
}