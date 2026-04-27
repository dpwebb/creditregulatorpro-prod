import { z } from "zod";

import { Selectable } from "kysely";
import { EvidenceAttachment } from "../../helpers/schema";

export const schema = z.object({
  obligationInstanceId: z.number().optional(),
  packetId: z.number().optional(),
});

export type InputType = z.infer<typeof schema>;

// Omit storageUrl from output to avoid sending large base64 strings
export type OutputType = Omit<Selectable<EvidenceAttachment>, 'storageUrl'>[];

export const getAttachments = async (input: InputType, init?: RequestInit): Promise<OutputType> => {
  const params = new URLSearchParams();
  if (input.obligationInstanceId) params.append("obligationInstanceId", input.obligationInstanceId.toString());
  if (input.packetId) params.append("packetId", input.packetId.toString());

  const result = await fetch(`/_api/evidence-attachment/list?${params.toString()}`, {
    method: "GET",
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