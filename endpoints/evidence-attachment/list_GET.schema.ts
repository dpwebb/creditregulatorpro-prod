import { z } from "zod";

import { Selectable } from "kysely";
import { EvidenceAttachment } from "../../helpers/schema";

export const EVIDENCE_ATTACHMENT_LIST_DEFAULT_LIMIT = 50;
export const EVIDENCE_ATTACHMENT_LIST_MAX_LIMIT = 100;

export const schema = z.object({
  obligationInstanceId: z.number().optional(),
  packetId: z.number().optional(),
  limit: z.coerce.number().int().min(1).max(EVIDENCE_ATTACHMENT_LIST_MAX_LIMIT).default(EVIDENCE_ATTACHMENT_LIST_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

export type InputType = Partial<z.infer<typeof schema>>;

// Omit storageUrl from output to avoid sending large base64 strings
export type OutputType = Omit<Selectable<EvidenceAttachment>, 'storageUrl'>[];

export const getAttachments = async (input: InputType, init?: RequestInit): Promise<OutputType> => {
  const params = new URLSearchParams();
  if (input.obligationInstanceId) params.append("obligationInstanceId", input.obligationInstanceId.toString());
  if (input.packetId) params.append("packetId", input.packetId.toString());
  if (input.limit !== undefined) params.append("limit", input.limit.toString());
  if (input.offset !== undefined) params.append("offset", input.offset.toString());

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
