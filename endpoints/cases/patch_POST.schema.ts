import { z } from "zod";
import { PassADraftExtraction } from "../../helpers/passAExtractorTypes";
import { FullDraftExtraction } from "../../helpers/fullExtractionTypes";

export type AnyDraftExtraction = PassADraftExtraction | FullDraftExtraction;

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

export const patchOperationSchema = z.object({
  path: z.string(),
  op: z.enum(["set", "unset"]),
  value: z.any().optional(), // value is optional for unset
  reason: z.string().optional(),
  source: z.object({
    type: z.string(),
    timestamp: z.string(), // ISO string
  }),
});

export const schema = z.object({
  artifactId: z.number(),
  patches: z.array(patchOperationSchema),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = 
  | {
      ok: true;
      artifactId: number;
      effectiveView: AnyDraftExtraction;
      editLog: EditLogEntry[];
    }
  | {
      ok: false;
      error: string;
    };

export const postPatchCase = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/cases/patch`, {
    method: "POST",
    body: JSON.stringify(body),
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