import { z } from "zod";

import { Selectable } from "kysely";
import { ReportArtifact } from "../../helpers/schema";
import {
  addBase64UploadValidationIssues,
  CREDIT_REPORT_UPLOAD_MIME_TYPES,
  getUploadRequestBodyMaxBytes,
  REPORT_ARTIFACT_UPLOAD_MAX_BYTES,
  normalizeUploadMimeType,
  uploadFileNameSchema,
} from "../../helpers/uploadPayloadValidation";

// Define a schema for JSON data if needed, otherwise allow any object
const jsonSchema = z.record(z.any()).nullable().optional();
const storageUrlSchema = z
  .string()
  .max(
    getUploadRequestBodyMaxBytes(REPORT_ARTIFACT_UPLOAD_MAX_BYTES),
    `Report artifact exceeds the ${REPORT_ARTIFACT_UPLOAD_MAX_BYTES / 1024 / 1024} MB upload limit`
  )
  .optional()
  .nullable();

type ReportArtifactUploadShape = {
  artifactType?: string | null;
  data?: Record<string, unknown> | null;
  storageUrl?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function metadataString(data: unknown, field: string): string | null {
  if (!isRecord(data)) return null;
  const value = data[field];
  return typeof value === "string" ? value : null;
}

function isStorageReference(value: string): boolean {
  return /^(?:local:|s3:\/\/|gs:\/\/|https?:\/\/|bucket:\/\/|memory:\/\/|\d+$)/i.test(value);
}

function declaredUploadMimeType(input: ReportArtifactUploadShape): {
  value: string;
  path: (string | number)[];
} {
  const dataMimeType = metadataString(input.data, "mimeType");
  if (dataMimeType) {
    return { value: dataMimeType, path: ["data", "mimeType"] };
  }

  if (typeof input.artifactType === "string" && input.artifactType.includes("/")) {
    return { value: input.artifactType, path: ["artifactType"] };
  }

  return { value: "application/pdf", path: ["artifactType"] };
}

function shouldValidateStorageUrlAsUpload(input: ReportArtifactUploadShape): boolean {
  if (typeof input.storageUrl !== "string") return false;
  const trimmed = input.storageUrl.trim();
  if (!trimmed || isStorageReference(trimmed)) return false;
  if (/^data:/i.test(trimmed)) return true;
  return normalizeUploadMimeType(declaredUploadMimeType(input).value) === "application/pdf";
}

export function addReportArtifactUploadValidationIssues(
  input: ReportArtifactUploadShape,
  ctx: z.RefinementCtx
) {
  const fileName = metadataString(input.data, "fileName");
  if (fileName !== null) {
    const result = uploadFileNameSchema("File name").safeParse(fileName);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["data", "fileName"],
          message: issue.message,
        });
      }
    }
  }

  const mimeType = metadataString(input.data, "mimeType");
  if (mimeType !== null && mimeType.length > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data", "mimeType"],
      message: "File type must be 100 characters or fewer",
    });
  }

  if (!shouldValidateStorageUrlAsUpload(input)) return;

  const declaredMimeType = declaredUploadMimeType(input);
  if (!(CREDIT_REPORT_UPLOAD_MIME_TYPES as readonly string[]).includes(normalizeUploadMimeType(declaredMimeType.value))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: declaredMimeType.path,
      message: "Report artifact upload must be a PDF",
    });
    return;
  }

  addBase64UploadValidationIssues(
    {
      storageUrl: input.storageUrl,
      reportArtifactMimeType: declaredMimeType.value,
    },
    ctx,
    {
      base64Field: "storageUrl",
      mimeTypeField: "reportArtifactMimeType",
      maxBytes: REPORT_ARTIFACT_UPLOAD_MAX_BYTES,
      allowedMimeTypes: CREDIT_REPORT_UPLOAD_MIME_TYPES,
      fileLabel: "Report artifact",
    }
  );
}

export const schema = z.object({
  tradelineId: z.number().nullable().optional().transform((val) => val && val > 0 ? val : null),
  reportDate: z.coerce.date({ required_error: "Report date is required" }),
  artifactType: z.string().min(1, "Artifact type is required").max(100, "Artifact type must be 100 characters or fewer"),
  data: jsonSchema,
  storageUrl: storageUrlSchema,
  sha256: z.string().optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
}).superRefine(addReportArtifactUploadValidationIssues);

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  artifact: Selectable<ReportArtifact>;
};

export const postReportArtifactCreate = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/report-artifact/create`, {
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
