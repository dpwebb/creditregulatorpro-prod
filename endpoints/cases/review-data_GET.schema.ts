import { z } from "zod";
import { PassADraftExtraction } from "../../helpers/passAExtractorTypes";
import { FullDraftExtraction } from "../../helpers/fullExtractionTypes";

// Define AnyDraftExtraction using frontend-safe types
export type AnyDraftExtraction = PassADraftExtraction | FullDraftExtraction;

// Define EditLogEntry inline to avoid importing from backend-heavy helper
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

export const schema = z.object({
  artifactId: z.string().transform((val) => parseInt(val, 10)),
});

export type InputType = z.infer<typeof schema>;

export type OutputType =
  | {
      ok: true;
      artifactId: number;
      effectiveView: AnyDraftExtraction;
      draftExtraction: AnyDraftExtraction;
      editLog: EditLogEntry[];
      isFullExtraction: boolean;
    }
  | {
      ok: false;
      error: string;
    };

export const getReviewData = async (
  artifactId: number,
  init?: RequestInit
): Promise<OutputType> => {
  const params = new URLSearchParams({ artifactId: artifactId.toString() });
  const result = await fetch(`/_api/cases/review-data?${params.toString()}`, {
    method: "GET",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!result.ok) {
    const text = await result.text();
    try {
      const errorObject = JSON.parse(text);
      return errorObject;
    } catch {
      throw new Error(text || `Request failed with status ${result.status}`);
    }
  }

  const text = await result.text();
  return JSON.parse(text);
};