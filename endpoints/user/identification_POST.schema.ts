import { z } from "zod";

import type { ConsumerIdentificationMetadata } from "../../helpers/consumerIdentification";
import {
  addBase64UploadValidationIssues,
  CONSUMER_IDENTIFICATION_UPLOAD_MAX_BYTES,
  CONSUMER_IDENTIFICATION_UPLOAD_MIME_TYPES,
  uploadBase64PayloadSchema,
  uploadFileNameSchema,
  uploadMimeTypeSchema,
} from "../../helpers/uploadPayloadValidation";

export const schema = z.object({
  fileName: uploadFileNameSchema("Identification file name"),
  fileType: uploadMimeTypeSchema(
    CONSUMER_IDENTIFICATION_UPLOAD_MIME_TYPES,
    "Upload a PNG or JPEG image of your identification"
  ),
  fileDataBase64: uploadBase64PayloadSchema(
    CONSUMER_IDENTIFICATION_UPLOAD_MAX_BYTES,
    "Identification image"
  ),
}).superRefine((data, ctx) => {
  addBase64UploadValidationIssues(data, ctx, {
    base64Field: "fileDataBase64",
    mimeTypeField: "fileType",
    maxBytes: CONSUMER_IDENTIFICATION_UPLOAD_MAX_BYTES,
    allowedMimeTypes: CONSUMER_IDENTIFICATION_UPLOAD_MIME_TYPES,
    fileLabel: "Identification image",
  });
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  identification: ConsumerIdentificationMetadata;
};

export const postConsumerIdentification = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/user/identification`, {
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
