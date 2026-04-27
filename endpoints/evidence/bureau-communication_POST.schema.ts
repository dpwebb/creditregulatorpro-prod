import { z } from "zod";

import { Selectable } from "kysely";
import { EvidenceEvent, EvidenceAttachment, ObligationInstance } from "../../helpers/schema";

export const BureauCommunicationTypes = [
  "BUREAU_RESPONSE_RECEIVED",
  "BUREAU_ACKNOWLEDGMENT",
  "BUREAU_DENIAL",
  "BUREAU_VERIFICATION_REQUEST",
  "BUREAU_CORRECTION_NOTICE",
  "BUREAU_OTHER"
] as const;

export const schema = z.object({
  fileDataBase64: z.string().min(1, "File content is required"),
  fileName: z.string().min(1, "File name is required"),
  fileType: z.string().refine((val) => {
    const allowedTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
    return allowedTypes.includes(val);
  }, "File type must be PDF, PNG, or JPG"),
  communicationType: z.enum(BureauCommunicationTypes),
  tradelineId: z.number().optional(),
  packetId: z.number().optional(),
  obligationInstanceId: z.number().optional(),
  description: z.string().optional(),
}).refine(data => data.tradelineId || data.packetId || data.obligationInstanceId, {
  message: "At least one of tradelineId, packetId, or obligationInstanceId must be provided",
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  evidenceEvent: Selectable<EvidenceEvent>;
  evidenceAttachment: Selectable<EvidenceAttachment>;
  updatedObligationInstance: Selectable<ObligationInstance> | null;
  fileHash: string;
};

export const postBureauCommunication = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/evidence/bureau-communication`, {
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