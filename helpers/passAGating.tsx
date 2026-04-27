import { db } from "./db";
import { PassADraftExtraction } from "./passAExtractorTypes";

export interface PassAGatingError {
  status: 409;
  message: "Full draft extraction required before further parsing";
  hint: "Call POST /ingest/report to run full extraction first";
  artifactId: number;
}

export type PassAGatingResult =
  | { success: true; extraction: PassADraftExtraction }
  | { success: false; error: PassAGatingError };

/**
 * Checks if Pass-A has been successfully completed for the given artifact.
 * If successful, returns the extraction data.
 * If not, returns a standardized error object.
 */
export const requirePassA = async (
  reportArtifactId: number
): Promise<PassAGatingResult> => {
  const record = await db
    .selectFrom("passExtraction")
    .select([
      "bureauContext",
      "consumerProfile",
      "rawEvidence",
      "conflicts",
      "missingRequiredFields",
      "qualityNotes",
      "completedAt",
      "channelGuess",
    ])
    .where("reportArtifactId", "=", reportArtifactId)
    .where("pass", "=", "A")
    .where("status", "=", "completed")
    .executeTakeFirst();

  if (!record) {
    return {
      success: false,
      error: {
        status: 409,
        message: "Full draft extraction required before further parsing",
        hint: "Call POST /ingest/report to run full extraction first",
        artifactId: reportArtifactId,
      },
    };
  }

  // Construct the PassADraftExtraction object from the DB record
  // We need to cast the JSON fields to their respective types as Kysely returns them as JsonValue
  const extraction: PassADraftExtraction = {
    schema: "urn:compnd:schemas:pass-a-draft-extraction:v1",
    doc_id: reportArtifactId,
    pass: "A",
    channel_guess: record.channelGuess,
    bureau_context: (record.bureauContext as any) || {},
    consumer_profile: (record.consumerProfile as any) || {},
    raw_evidence: (record.rawEvidence as any) || [],
    conflicts: (record.conflicts as any) || [],
    missing_required_fields: (record.missingRequiredFields as any) || [],
    quality_notes: (record.qualityNotes as any) || [],
    extracted_at: record.completedAt
      ? typeof record.completedAt === "string"
        ? record.completedAt
        : record.completedAt.toISOString()
      : new Date().toISOString(),
  };

  return {
    success: true,
    extraction,
  };
};

/**
 * Creates a standardized HTTP 409 response for Pass-A gating failures.
 * Use this in endpoints when requirePassA returns success: false.
 */
export const createPassAGatingResponse = (artifactId: number): Response => {
  const errorBody = {
    error: "Full draft extraction required before further parsing",
    hint: "Call POST /ingest/report to run full extraction first",
    artifactId,
  };

  return new Response(JSON.stringify(errorBody), {
    status: 409,
    headers: {
      "Content-Type": "application/json",
    },
  });
};

/**
 * Quick check if Pass-A is completed for an artifact.
 * Useful for conditional logic where the full extraction data is not needed.
 */
export const isPassACompleted = async (
  reportArtifactId: number
): Promise<boolean> => {
  const record = await db
    .selectFrom("passExtraction")
    .select("id")
    .where("reportArtifactId", "=", reportArtifactId)
    .where("pass", "=", "A")
    .where("status", "=", "completed")
    .executeTakeFirst();

  return !!record;
};