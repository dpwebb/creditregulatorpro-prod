import { z } from "zod";
import {
  addBase64UploadValidationIssues,
  ANONYMOUS_REPORT_UPLOAD_MAX_BYTES,
  CREDIT_REPORT_UPLOAD_MIME_TYPES,
  uploadBase64PayloadSchema,
  uploadFileNameSchema,
  uploadMimeTypeSchema,
} from "../../helpers/uploadPayloadValidation";


export const schema = z.object({
  bytesBase64: uploadBase64PayloadSchema(
    ANONYMOUS_REPORT_UPLOAD_MAX_BYTES,
    "Credit report"
  ),
  fileName: uploadFileNameSchema("Filename"),
  mimeType: uploadMimeTypeSchema(
    CREDIT_REPORT_UPLOAD_MIME_TYPES,
    "Credit report upload must be a PDF"
  ),
  region: z.literal("CA"),
}).superRefine((data, ctx) => {
  addBase64UploadValidationIssues(data, ctx, {
    base64Field: "bytesBase64",
    mimeTypeField: "mimeType",
    maxBytes: ANONYMOUS_REPORT_UPLOAD_MAX_BYTES,
    allowedMimeTypes: CREDIT_REPORT_UPLOAD_MIME_TYPES,
    fileLabel: "Credit report",
  });
});

export type InputType = z.infer<typeof schema>;

export type SampleProblem = {
  type: string;
  title: string;
  detail: string;
  solution: string;
  urgency: string;
};

export type OutputType = {
  problemCount: number;
  sampleProblems: SampleProblem[];
};

export const postAnonymousReport = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/ingest/anonymous-report`, {
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
    throw new Error(errorObject.error || "Failed to process anonymous report");
  }

  return JSON.parse(await result.text());
};
