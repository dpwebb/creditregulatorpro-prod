import { z } from "zod";

import { Selectable } from "kysely";
import { Obligation, ObligationSectionArrayValues } from "../../helpers/schema";

export const schema = z.object({
  section: z.enum(ObligationSectionArrayValues).optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  obligations: Selectable<Obligation>[];
};

export const getObligationList = async (params?: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = params ? schema.parse(params) : {};
  const queryString = validatedInput.section ? `?section=${encodeURIComponent(validatedInput.section)}` : '';
  const result = await fetch(`/_api/obligation/list${queryString}`, {
    method: "GET",
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