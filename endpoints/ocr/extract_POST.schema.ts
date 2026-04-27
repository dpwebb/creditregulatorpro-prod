import { z } from "zod";

import { ParsedTradeline } from "../../helpers/reportParser";
import { ScoredTradeline } from "../../helpers/confidenceScorer";

// Define input schema locally to avoid dependency issues if helpers/schemas is not available
export const schema = z.object({
  userId: z.string().uuid(),
  region: z.string().length(2), // CA
  fileName: z.string(),
  mimeType: z.string(),
  bytesBase64: z.string(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  reviewSessionId: string;
  extractedData: ScoredTradeline[];
  tradelinesCount: number;
};

export const postExtract = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/ocr/extract`, {
    method: "POST",
    body: JSON.stringify(validatedInput),
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