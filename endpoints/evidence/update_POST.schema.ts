import { z } from "zod";

import { Selectable } from "kysely";
import { EvidenceEvent } from "../../helpers/schema";

export const schema = z.object({
  id: z.number(),
  eventType: z.string().optional(),
  description: z.string().optional(),
  // Renamed from statuteId to statuteVersionId to match the actual EvidenceEvent column
  statuteVersionId: z.number().optional().nullable(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  event: Selectable<EvidenceEvent>;
};

export const postEvidenceUpdate = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/evidence/update`, {
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