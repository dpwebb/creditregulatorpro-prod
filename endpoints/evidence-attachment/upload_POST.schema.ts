import { z } from "zod";

import { Selectable } from "kysely";
import { EvidenceAttachment } from "../../helpers/schema";
import {
  addBase64UploadValidationIssues,
  EVIDENCE_ATTACHMENT_UPLOAD_MAX_BYTES,
  EVIDENCE_UPLOAD_MIME_TYPES,
  uploadBase64PayloadSchema,
  uploadDescriptionSchema,
  uploadFileNameSchema,
  uploadMimeTypeSchema,
} from "../../helpers/uploadPayloadValidation";

export const schema = z.object({
  obligationInstanceId: z.number().optional(),
  packetId: z.number().optional(),
  fileName: uploadFileNameSchema("File name"),
  fileType: uploadMimeTypeSchema(
    EVIDENCE_UPLOAD_MIME_TYPES,
    "File type must be PDF, PNG, or JPG"
  ),
  fileDataBase64: uploadBase64PayloadSchema(
    EVIDENCE_ATTACHMENT_UPLOAD_MAX_BYTES,
    "Evidence attachment"
  ),
  description: uploadDescriptionSchema().optional(),
}).superRefine((data, ctx) => {
  addBase64UploadValidationIssues(data, ctx, {
    base64Field: "fileDataBase64",
    mimeTypeField: "fileType",
    maxBytes: EVIDENCE_ATTACHMENT_UPLOAD_MAX_BYTES,
    allowedMimeTypes: EVIDENCE_UPLOAD_MIME_TYPES,
    fileLabel: "Evidence attachment",
  });
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
