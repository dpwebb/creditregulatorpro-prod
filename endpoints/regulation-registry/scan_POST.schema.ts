import { z } from "zod";
import { RegulationUpdateModeArrayValues } from "../../helpers/schema";
import { regulationDraftSchema } from "./create-candidate_POST.schema";

export const schema = z.object({
  mode: z.enum(RegulationUpdateModeArrayValues).optional().default("assisted"),
  fetchConfiguredSources: z.boolean().optional().default(false),
  sourceDocuments: z.array(regulationDraftSchema).optional().default([]),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  inserted: number;
  skipped: number;
  errors: string[];
  candidateIds: number[];
};

export const postRegulationRegistryScan = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch("/_api/regulation-registry/scan", {
    method: "POST",
    body: JSON.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!result.ok) {
    const errorObject = JSON.parse(await result.text()) as { error: string };
    throw new Error(errorObject.error);
  }
  return JSON.parse(await result.text()) as OutputType;
};
