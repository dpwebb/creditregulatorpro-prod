import { z } from "zod";

import { Selectable } from "kysely";
import { ReportArtifact } from "../../helpers/schema";

const jsonSchema = z.record(z.any()).nullable().optional();

export const schema = z.object({
  id: z.number(),
  reportDate: z.coerce.date().optional(),
  artifactType: z.string().optional(),
  data: jsonSchema,
  storageUrl: z.string().optional().nullable(),
  sha256: z.string().optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
});

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