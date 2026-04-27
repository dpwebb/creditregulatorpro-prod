import { z } from "zod";

import { Selectable } from "kysely";
import { EvidenceAttachment } from "../../helpers/schema";

export const schema = z.object({
  obligationInstanceId: z.number().optional(),
  packetId: z.number().optional(),
  fileName: z.string(),
  fileType: z.string(),
  fileDataBase64: z.string(),
  description: z.string().optional(),
}).refine(data => data.obligationInstanceId || data.packetId, {
  message: "Either obligationInstanceId or packetId must be provided",
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  attachment: Selectable<EvidenceAttachment>;
};

export const uploadAttachment = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const result = await fetch(`/_api/evidence-attachment/upload`, {
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