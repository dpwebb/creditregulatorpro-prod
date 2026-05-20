import { z } from "zod";
import type { MockLifecycleJobRecord } from "./types";
import {
  addBase64UploadValidationIssues,
  ADMIN_MOCK_LIFECYCLE_UPLOAD_MAX_BYTES,
  CREDIT_REPORT_UPLOAD_MIME_TYPES,
  uploadBase64PayloadSchema,
  uploadFileNameSchema,
  uploadMimeTypeSchema,
} from "../../../helpers/uploadPayloadValidation";

const uploadedPdfSchema = z
  .object({
    fileName: uploadFileNameSchema("Uploaded fileName"),
    mimeType: uploadMimeTypeSchema(
      CREDIT_REPORT_UPLOAD_MIME_TYPES,
      "Uploaded fixture mimeType must be application/pdf."
    ).default("application/pdf"),
    bytesBase64: uploadBase64PayloadSchema(
      ADMIN_MOCK_LIFECYCLE_UPLOAD_MAX_BYTES,
      "Uploaded fixture"
    ),
  })
  .superRefine((data, ctx) => {
    addBase64UploadValidationIssues(data, ctx, {
      base64Field: "bytesBase64",
      mimeTypeField: "mimeType",
      maxBytes: ADMIN_MOCK_LIFECYCLE_UPLOAD_MAX_BYTES,
      allowedMimeTypes: CREDIT_REPORT_UPLOAD_MIME_TYPES,
      fileLabel: "Uploaded fixture",
    });
  });

export const schema = z
  .object({
    initialReportPath: z.string().trim().min(1).optional(),
    initialReportUpload: uploadedPdfSchema.optional(),
    followupReportPath: z.string().trim().min(1).optional(),
    followupReportUpload: uploadedPdfSchema.optional(),
    simulateDays: z.coerce.number().int().min(1).max(365).default(30),
    packetCount: z.coerce.number().int().min(1).max(10).default(2),
    strict: z.boolean().default(false),
    useDbAssist: z.boolean().default(true),
    baseUrl: z.string().trim().url().optional(),
    origin: z.string().trim().url().optional(),
    email: z.string().trim().email().optional(),
    password: z.string().trim().min(8).optional(),
    displayName: z.string().trim().min(1).max(120).optional(),
    legalNameSignature: z.string().trim().min(1).max(120).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.initialReportPath && !value.initialReportUpload) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["initialReportPath"],
        message: "Provide initialReportPath or initialReportUpload.",
      });
    }
  });

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  job: MockLifecycleJobRecord;
};

export const postAdminMockLifecycleRun = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);

  const result = await fetch(`/_api/admin/mock-lifecycle/run`, {
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
    throw new Error(errorObject.error ?? "Failed to start lifecycle run");
  }

  return JSON.parse(await result.text()) as OutputType;
};
