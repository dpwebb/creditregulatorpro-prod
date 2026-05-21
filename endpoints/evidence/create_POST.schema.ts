import { z } from "zod";

import { Selectable } from "kysely";
import { EvidenceEvent } from "../../helpers/schema";

export const schema = z.object({
  packetId: z.number().optional().nullable(),
  eventType: z.string().min(1, "Event type is required"),
  description: z.string().min(1, "Description is required"),
  statuteVersionId: z.number().optional().nullable(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  event: Selectable<EvidenceEvent>;
};

export const postEvidenceCreate = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/evidence/create`, {
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
