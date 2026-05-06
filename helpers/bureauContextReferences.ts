import { db } from "./db";

export function extractBureauContextString(bureauContext: unknown, keys: string[]): string | undefined {
  let context = bureauContext as Record<string, unknown> | null;
  if (typeof context === "string") {
    try {
      context = JSON.parse(context) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
  if (!context || typeof context !== "object") return undefined;

  for (const key of keys) {
    const entry = context[key] as { value?: unknown } | string | null | undefined;
    const value = typeof entry === "object" && entry !== null ? entry.value : entry;
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }

  return undefined;
}

export function extractTransUnionCaseIdFromBureauContext(bureauContext: unknown): string | undefined {
  return extractBureauContextString(bureauContext, [
    "tuCaseId",
    "tu_case_id",
    "transUnionCaseId",
    "trans_union_case_id",
  ]);
}

export async function fetchTransUnionCaseIdForReportArtifact(
  reportArtifactId: number | null | undefined,
): Promise<string | undefined> {
  if (!reportArtifactId) return undefined;

  const extractions = await db
    .selectFrom("passExtraction")
    .select("bureauContext")
    .where("reportArtifactId", "=", reportArtifactId)
    .where("status", "=", "completed")
    .where("pass", "in", ["A", "A_FULL"])
    .orderBy("pass", "asc")
    .execute();

  for (const extraction of extractions) {
    const caseId = extractTransUnionCaseIdFromBureauContext(extraction.bureauContext);
    if (caseId) return caseId;
  }

  return undefined;
}
