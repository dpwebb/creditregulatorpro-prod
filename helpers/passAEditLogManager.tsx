import { db } from "./db";
import { PassADraftExtraction } from "./passAExtractorTypes";
import { FullDraftExtraction } from "./fullExtractionTypes";
import { PassExtraction } from "./schema";
import { Selectable } from "kysely";

// -- Types --

export type AnyDraftExtraction = PassADraftExtraction | FullDraftExtraction;

export interface PatchOperation {
  path: string;
  op: "set" | "unset";
  value?: any;
  reason?: string;
  source: {
    type: string; // 'human_edit'
    timestamp: string; // ISO timestamp
  };
}

export interface EditLogEntry {
  id: number;
  reportArtifactId: number;
  path: string;
  op: "set" | "unset";
  value: any;
  reason: string | null;
  sourceType: string;
  sourceTimestamp: Date;
  createdAt: Date;
}

export interface EffectiveExtractionResult {
  draftExtraction: AnyDraftExtraction;
  effectiveView: AnyDraftExtraction;
  editLog: EditLogEntry[];
  isFullExtraction: boolean;
}

// -- Utilities --

/**
 * Deep clones a value to ensure no mutations affect the original.
 */
function deepClone<T>(val: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(val);
  }
  return JSON.parse(JSON.stringify(val));
}

/**
 * Gets a value from an object at a given path (dot notation).
 * Returns undefined if path does not exist.
 */
function getPath(obj: any, path: string): any {
  if (obj == null) return undefined;
  const parts = path.split(".");
  let current = obj;

  for (const part of parts) {
    if (current == null) return undefined;
    // Handle array indices if needed, though JS objects handle numeric keys fine
    current = current[part];
  }
  return current;
}

/**
 * Sets a value on an object at a given path (dot notation).
 * Creates intermediate objects if they don't exist.
 * Mutates the object.
 */
function setPath(obj: any, path: string, value: any): void {
  if (obj == null) return;
  const parts = path.split(".");
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const nextPart = parts[i + 1];

    // If current part doesn't exist, create it
    if (current[part] == null) {
      // If next part is a number, create an array, else object
      const isNextIndex = !isNaN(Number(nextPart));
      current[part] = isNextIndex ? [] : {};
    }
    current = current[part];
  }

  const lastPart = parts[parts.length - 1];
  current[lastPart] = value;
}

/**
 * Reconstructs the PassADraftExtraction object from the DB row.
 * Maps camelCase DB columns to snake_case JSON fields required by the type.
 */
function reconstructDraft(
  row: Selectable<PassExtraction>
): PassADraftExtraction {
  return {
    schema: "urn:compnd:schemas:pass-a-draft-extraction:v1",
    doc_id: row.reportArtifactId,
    pass: "A",
    channel_guess: row.channelGuess,
    bureau_context: (row.bureauContext as any) || {},
    consumer_profile: (row.consumerProfile as any) || {
      address_history: [],
      phone_history: [],
      employment_history: [],
    },
    raw_evidence: (row.rawEvidence as any) || [],
    conflicts: (row.conflicts as any) || [],
    missing_required_fields: (row.missingRequiredFields as any) || [],
    quality_notes: (row.qualityNotes as any) || [],
    extracted_at: row.completedAt
      ? new Date(row.completedAt).toISOString()
      : new Date().toISOString(),
  };
}

/**
 * Reconstructs the FullDraftExtraction object from the DB row.
 * Maps camelCase DB columns to snake_case JSON fields required by the type.
 */
function reconstructFullDraft(
  row: Selectable<PassExtraction>
): FullDraftExtraction {
  return {
    schema: "urn:compnd:schemas:tu-full-draft-extraction:v1",
    doc_id: row.reportArtifactId,
    pass: "A_FULL",
    channel_guess: row.channelGuess,
    bureau_context: (row.bureauContext as any) || {},
    consumer_profile: (row.consumerProfile as any) || {
      address_history: [],
      phone_history: [],
      employment_history: [],
    },
    portal_summary: (row.portalSummary as any) || {},
    accounts: (row.accounts as any) || [],
    inquiries_credit_related: (row.inquiriesCreditRelated as any) || [],
    inquiries_other: (row.inquiriesOther as any) || [],
    insolvency_public_records: (row.insolvencyPublicRecords as any) || {
      section_present: false,
      records: [],
    },
    raw_evidence: (row.rawEvidence as any) || [],
    conflicts: (row.conflicts as any) || [],
    missing_required_fields: (row.missingRequiredFields as any) || [],
    quality_notes: (row.qualityNotes as any) || [],
    extracted_at: row.completedAt
      ? new Date(row.completedAt).toISOString()
      : new Date().toISOString(),
  };
}

// -- Main Functions --

/**
 * Store multiple patch operations to the edit_log table (append-only).
 */
export async function storeEdits(
  reportArtifactId: number,
  patches: PatchOperation[]
): Promise<void> {
  if (patches.length === 0) return;

  const rows = patches.map((patch) => ({
    reportArtifactId,
    path: patch.path,
    op: patch.op,
    value: patch.value === undefined ? null : JSON.parse(JSON.stringify(patch.value)),
    reason: patch.reason || null,
    sourceType: patch.source.type,
    sourceTimestamp: new Date(patch.source.timestamp),
    // createdAt is handled by DB default
  }));

  await db.insertInto("passAEditLog").values(rows).execute();
}

/**
 * Retrieve all edit log entries for a given artifact, ordered by created_at.
 */
export async function getEditLog(
  reportArtifactId: number
): Promise<EditLogEntry[]> {
  const rows = await db
    .selectFrom("passAEditLog")
    .where("reportArtifactId", "=", reportArtifactId)
    .orderBy("createdAt", "asc")
    .selectAll()
    .execute();

  return rows.map((row) => ({
    id: row.id,
    reportArtifactId: row.reportArtifactId,
    path: row.path,
    op: row.op as "set" | "unset",
    value: row.value, // Kysely parses JSON automatically
    reason: row.reason,
    sourceType: row.sourceType,
    sourceTimestamp:
      typeof row.sourceTimestamp === "string"
        ? new Date(row.sourceTimestamp)
        : row.sourceTimestamp,
    createdAt:
      typeof row.createdAt === "string"
        ? new Date(row.createdAt)
        : row.createdAt,
  }));
}

/**
 * Apply edits over the draft extraction to produce an effective view WITHOUT mutating the original.
 * - Process edits in order (oldest first)
 * - For 'set' ops: set the value at the path
 * - For 'unset' ops: remove any override, revert to original value
 */
export function computeEffectiveView(
  draftExtraction: AnyDraftExtraction,
  editLog: EditLogEntry[]
): AnyDraftExtraction {
  // Start with a deep clone of the draft
  const effective = deepClone(draftExtraction);

  for (const edit of editLog) {
    if (edit.op === "set") {
      setPath(effective, edit.path, edit.value);
    } else if (edit.op === "unset") {
      // To revert, we fetch the value from the ORIGINAL draft
      const originalValue = getPath(draftExtraction, edit.path);
      setPath(effective, edit.path, originalValue);
    }
  }

  return effective;
}

/**
 * Convenience function that fetches the draft extraction, edit log, and computes effective view.
 * Prioritizes A_FULL extraction if available, falls back to A extraction.
 */
export async function getEffectiveExtraction(
  reportArtifactId: number
): Promise<EffectiveExtractionResult> {
  // 1. First try A_FULL extraction
  let extractionRow = await db
    .selectFrom("passExtraction")
    .where("reportArtifactId", "=", reportArtifactId)
    .where("pass", "=", "A_FULL")
    .selectAll()
    .executeTakeFirst();

  let isFullExtraction = !!extractionRow;

  // Fall back to A if no A_FULL found
  if (!extractionRow) {
    extractionRow = await db
      .selectFrom("passExtraction")
      .where("reportArtifactId", "=", reportArtifactId)
      .where("pass", "=", "A")
      .selectAll()
      .executeTakeFirst();
  }

  if (!extractionRow) {
    throw new Error(`No extraction found for artifact ${reportArtifactId}`);
  }

  const draftExtraction = isFullExtraction
    ? reconstructFullDraft(extractionRow)
    : reconstructDraft(extractionRow);

  // 2. Fetch the edit log
  const editLog = await getEditLog(reportArtifactId);

  // 3. Compute effective view
  const effectiveView = computeEffectiveView(draftExtraction, editLog);

  return {
    draftExtraction,
    effectiveView,
    editLog,
    isFullExtraction,
  };
}
