import { z } from "zod";


export const schema = z.object({
  packetIds: z.array(z.number()).optional()
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  processedPackets: number;
  recordsCreated: number;
  errors: string[];
  reparsedArtifacts?: number;
  tradelinesUpdated?: number;
};

export const postBackfillCompliance = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/admin/backfill-compliance`, {
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