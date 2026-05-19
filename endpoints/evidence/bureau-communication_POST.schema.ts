import { z } from "zod";

import { Selectable } from "kysely";
import { EvidenceEvent, EvidenceAttachment, ObligationInstance } from "../../helpers/schema";
import type { BureauResponseClassification } from "../../helpers/bureauResponseClassifier";
import {
  addBase64UploadValidationIssues,
  BUREAU_COMMUNICATION_UPLOAD_MAX_BYTES,
  EVIDENCE_UPLOAD_MIME_TYPES,
  uploadBase64PayloadSchema,
  uploadDescriptionSchema,
  uploadFileNameSchema,
  uploadMimeTypeSchema,
} from "../../helpers/uploadPayloadValidation";

export const BureauCommunicationTypes = [
  "BUREAU_RESPONSE_RECEIVED",
  "BUREAU_ACKNOWLEDGMENT",
  "BUREAU_DENIAL",
  "BUREAU_VERIFICATION_REQUEST",
  "BUREAU_CORRECTION_NOTICE",
  "BUREAU_OTHER"
] as const;

export const schema = z.object({
  fileDataBase64: uploadBase64PayloadSchema(
    BUREAU_COMMUNICATION_UPLOAD_MAX_BYTES,
    "Bureau communication"
  ),
  fileName: uploadFileNameSchema("File name"),
  fileType: uploadMimeTypeSchema(
    EVIDENCE_UPLOAD_MIME_TYPES,
    "File type must be PDF, PNG, or JPG"
  ),
  communicationType: z.enum(BureauCommunicationTypes),
  tradelineId: z.number().optional(),
  packetId: z.number().optional(),
  obligationInstanceId: z.number().optional(),
  description: uploadDescriptionSchema().optional(),
  responseStatus: z.string().optional(),
  responseLetterContent: z.string().optional(),
  responseMovDisclosed: z.boolean().optional(),
  responseMovDescription: z.string().optional(),
  responseItemsDisputed: z.array(z.string()).optional(),
  responseItemsAddressed: z.array(z.string()).optional(),
  responseDocumentationProvided: z.boolean().optional(),
  responseDocumentationTypes: z.array(z.string()).optional(),
  responseSenderAddress: z.string().optional(),
  responseAuthorizedSignature: z.boolean().optional(),
  responseSignatoryName: z.string().optional(),
  responseSignatoryTitle: z.string().optional(),
  runAudit: z.boolean().optional(),
}).superRefine((data, ctx) => {
  addBase64UploadValidationIssues(data, ctx, {
    base64Field: "fileDataBase64",
    mimeTypeField: "fileType",
    maxBytes: BUREAU_COMMUNICATION_UPLOAD_MAX_BYTES,
    allowedMimeTypes: EVIDENCE_UPLOAD_MIME_TYPES,
    fileLabel: "Bureau communication",
  });
}).refine(data => data.tradelineId || data.packetId || data.obligationInstanceId, {
  message: "At least one of tradelineId, packetId, or obligationInstanceId must be provided",
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  evidenceEvent: Selectable<EvidenceEvent>;
  evidenceAttachment: Selectable<EvidenceAttachment>;
  updatedObligationInstance: Selectable<ObligationInstance> | null;
  fileHash: string;
  responseClassification: BureauResponseClassification;
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
