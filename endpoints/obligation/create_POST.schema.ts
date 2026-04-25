import { z } from "zod";

import { Selectable } from "kysely";
import { Obligation, ObligationSectionArrayValues } from "../../helpers/schema";

export const schema = z.object({
  description: z.string().min(1, "Description is required"),
  obligationType: z.string().nullable().optional(),
  section: z.enum(ObligationSectionArrayValues),
  jurisdiction: z.string().nullable().optional(),
  statutoryReference: z.string().nullable().optional(),
  timeframeDays: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
  dutyType: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  obligation: Selectable<Obligation>;
};

export const postObligationCreate = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/obligation/create`, {
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