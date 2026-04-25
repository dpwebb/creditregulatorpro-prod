import { z } from "zod";

import { Selectable } from "kysely";
import { ReportArtifact } from "../../helpers/schema";

// Define a schema for JSON data if needed, otherwise allow any object
const jsonSchema = z.record(z.any()).nullable().optional();

export const schema = z.object({
  tradelineId: z.number().nullable().optional().transform((val) => val && val > 0 ? val : null),
  reportDate: z.date({ required_error: "Report date is required" }),
  artifactType: z.string().min(1, "Artifact type is required"),
  data: jsonSchema,
  storageUrl: z.string().optional().nullable(),
  sha256: z.string().optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
});

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