import { z } from "zod";


export const schema = z.object({
  tradelineId: z.number().optional(),
  reportArtifactId: z.number().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  processedCount: number;
  updatedCount: number;
  errors: string[];
};

export const postBackfillSourceText = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const result = await fetch(`/_api/tradeline/backfill-source-text`, {
    method: "POST",
    body: JSON.stringify(body),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!result.ok) {
    const errorObject = JSON.parse(await result.text());
    throw new Error(errorObject.error);
  }
  return JSON.parse(await result.text());
};