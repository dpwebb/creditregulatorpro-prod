import { z } from "zod";

import { Selectable } from "kysely";
import { ReportArtifact } from "../../helpers/schema";
import {
  addReportArtifactUploadValidationIssues,
} from "./create_POST.schema";
import {
  getUploadRequestBodyMaxBytes,
  REPORT_ARTIFACT_UPLOAD_MAX_BYTES,
} from "../../helpers/uploadPayloadValidation";

const jsonSchema = z.record(z.any()).nullable().optional();
const storageUrlSchema = z
  .string()
  .max(
    getUploadRequestBodyMaxBytes(REPORT_ARTIFACT_UPLOAD_MAX_BYTES),
    `Report artifact exceeds the ${REPORT_ARTIFACT_UPLOAD_MAX_BYTES / 1024 / 1024} MB upload limit`
  )
  .optional()
  .nullable();

export const schema = z.object({
  id: z.number(),
  reportDate: z.coerce.date().optional(),
  artifactType: z.string().max(100, "Artifact type must be 100 characters or fewer").optional(),
  data: jsonSchema,
  storageUrl: storageUrlSchema,
  sha256: z.string().optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
}).superRefine(addReportArtifactUploadValidationIssues);

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  artifact: Selectable<ReportArtifact>;
};

export const postReportArtifactUpdate = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/report-artifact/update`, {
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
