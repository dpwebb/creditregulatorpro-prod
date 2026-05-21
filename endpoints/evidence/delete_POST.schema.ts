import { z } from "zod";

import { Selectable } from "kysely";
import { EvidenceEvent } from "../../helpers/schema";


export const schema = z.object({
  id: z.number(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  success: boolean;
  event?: Selectable<EvidenceEvent>;
  originalEventId?: number;
  appendOnly?: boolean;
};

export const postEvidenceDelete = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/evidence/delete`, {
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
