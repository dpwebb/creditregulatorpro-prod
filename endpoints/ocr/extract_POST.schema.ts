import { z } from "zod";

import { ParsedTradeline } from "../../helpers/reportParser";
import { ScoredTradeline } from "../../helpers/confidenceScorer";
import {
  addBase64UploadValidationIssues,
  AUTHENTICATED_REPORT_UPLOAD_MAX_BYTES,
  CREDIT_REPORT_UPLOAD_MIME_TYPES,
  uploadBase64PayloadSchema,
  uploadFileNameSchema,
  uploadMimeTypeSchema,
} from "../../helpers/uploadPayloadValidation";

export const OCR_EXTRACT_UPLOAD_MAX_BYTES = AUTHENTICATED_REPORT_UPLOAD_MAX_BYTES;

export const schema = z
  .object({
    userId: z.string().uuid(),
    region: z.string().length(2), // CA
    fileName: uploadFileNameSchema("File name"),
    mimeType: uploadMimeTypeSchema(CREDIT_REPORT_UPLOAD_MIME_TYPES, "Only PDF extraction is supported"),
    bytesBase64: uploadBase64PayloadSchema(OCR_EXTRACT_UPLOAD_MAX_BYTES, "PDF file"),
  })
  .superRefine((data, ctx) =>
    addBase64UploadValidationIssues(data, ctx, {
      base64Field: "bytesBase64",
      mimeTypeField: "mimeType",
      maxBytes: OCR_EXTRACT_UPLOAD_MAX_BYTES,
      allowedMimeTypes: CREDIT_REPORT_UPLOAD_MIME_TYPES,
      fileLabel: "PDF file",
    })
  );

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  reviewSessionId: string;
  extractedData: ScoredTradeline[];
  tradelinesCount: number;
};

export const postExtract = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/ocr/extract`, {
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
