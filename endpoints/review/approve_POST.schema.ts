import { z } from "zod";
import {
  addBase64UploadValidationIssues,
  CREDIT_REPORT_UPLOAD_MIME_TYPES,
  REVIEW_APPROVE_REPORT_UPLOAD_MAX_BYTES,
  uploadBase64PayloadSchema,
  uploadFileNameSchema,
  uploadMimeTypeSchema,
} from "../../helpers/uploadPayloadValidation";


const TradelineSchema = z.object({
  accountNumber: z.string().optional().default("Not reported"),
  creditorName: z.string(),
  accountType: z.string(),
  balance: z.number(),
  status: z.string(),
  dates: z.object({
    opened: z.coerce.date().nullable().optional(),
    reported: z.coerce.date().nullable().optional(),
    closed: z.coerce.date().nullable().optional(),
    dofd: z.coerce.date().nullable().optional(),
  }).passthrough(),
  amounts: z.object({
    high: z.number().optional(),
    pastDue: z.number().optional(),
  }).passthrough(),
  remarkCodes: z.array(z.string()),
});

export const schema = z.object({
  reviewSessionId: z.string().uuid(),
  region: z.string().length(2),
  fileName: uploadFileNameSchema("File name"),
  mimeType: uploadMimeTypeSchema(
    CREDIT_REPORT_UPLOAD_MIME_TYPES,
    "Review approval upload must be a PDF"
  ),
  bytesBase64: uploadBase64PayloadSchema(
    REVIEW_APPROVE_REPORT_UPLOAD_MAX_BYTES,
    "Review approval report"
  ),
  tradelines: z.array(TradelineSchema),
}).strict().superRefine((data, ctx) => {
  addBase64UploadValidationIssues(data, ctx, {
    base64Field: "bytesBase64",
    mimeTypeField: "mimeType",
    maxBytes: REVIEW_APPROVE_REPORT_UPLOAD_MAX_BYTES,
    allowedMimeTypes: CREDIT_REPORT_UPLOAD_MIME_TYPES,
    fileLabel: "Review approval report",
  });
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  ok: boolean;
  storageUrl: string;
  tradelineIds: number[];
};

export const postApprove = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/review/approve`, {
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
