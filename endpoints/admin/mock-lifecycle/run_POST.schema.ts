import { z } from "zod";
import type { MockLifecycleJobRecord } from "./types";

const uploadedPdfSchema = z.object({
  fileName: z.string().trim().min(1, "Uploaded fileName is required"),
  mimeType: z.string().trim().optional(),
  bytesBase64: z.string().min(1, "Uploaded bytesBase64 is required"),
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
