import { z } from "zod";

import { Selectable } from "kysely";
import { DiscriminationClaim } from "../../helpers/schema";

const DiscriminationGroundEnum = z.enum([
  "RACE",
  "NATIONAL_ETHNIC_ORIGIN",
  "COLOUR",
  "RELIGION",
  "AGE",
  "SEX",
  "SEXUAL_ORIENTATION",
  "GENDER_IDENTITY_EXPRESSION",
  "MARITAL_STATUS",
  "FAMILY_STATUS",
  "GENETIC_CHARACTERISTICS",
  "DISABILITY",
  "CONVICTION_PARDONED",
  "OTHER"
]);

export const schema = z.object({
  id: z.number(),
  grounds: z.array(DiscriminationGroundEnum).min(1).optional(),
  description: z.string().optional(),
  evidenceSummary: z.string().optional(),
  status: z.string().optional(),
  resolution: z.string().optional(),
  resolvedDate: z.coerce.date().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = Selectable<DiscriminationClaim>;

export const postUpdateDiscriminationClaim = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/discrimination/update`, {
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