import { z } from "zod";
import {
  addBase64UploadValidationIssues,
  AUTHENTICATED_REPORT_UPLOAD_MAX_BYTES,
  CREDIT_REPORT_UPLOAD_MIME_TYPES,
  uploadBase64PayloadSchema,
  uploadFileNameSchema,
  uploadMimeTypeSchema,
} from "./uploadPayloadValidation";

export const UploadReportInput = z.object({
  region: z.literal("CA"),
  fileName: uploadFileNameSchema("File name"),
  mimeType: uploadMimeTypeSchema(
    CREDIT_REPORT_UPLOAD_MIME_TYPES,
    "Credit report upload must be a PDF"
  ),
  bytesBase64: uploadBase64PayloadSchema(
    AUTHENTICATED_REPORT_UPLOAD_MAX_BYTES,
    "Credit report"
  ),
}).strict().superRefine((data, ctx) => {
  addBase64UploadValidationIssues(data, ctx, {
    base64Field: "bytesBase64",
    mimeTypeField: "mimeType",
    maxBytes: AUTHENTICATED_REPORT_UPLOAD_MAX_BYTES,
    allowedMimeTypes: CREDIT_REPORT_UPLOAD_MIME_TYPES,
    fileLabel: "Credit report",
  });
});

export type UploadReportInputType = z.infer<typeof UploadReportInput>;

export const TrackingWebhookInput = z.object({
  packetId: z.string().uuid(),
  status: z.enum(["DELIVERED", "RETURNED", "IN_TRANSIT", "RESPONDED"]),
  payload: z.any(),
});

export type TrackingWebhookInputType = z.infer<typeof TrackingWebhookInput>;
