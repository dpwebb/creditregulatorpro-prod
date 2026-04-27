import { z } from "zod";

import { Selectable } from "kysely";
import { IdentityTheftFreeze } from "../../helpers/schema";

export const schema = z.object({
  freezeId: z.number(),
  thawDuration: z.number().optional(), // in days, if temporary
  thawUntilDate: z.coerce.date().optional(), // alternative to duration
  purpose: z.string().min(1, "Purpose is required"),
  creditorName: z.string().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  freeze: Selectable<IdentityTheftFreeze>;
};

export const postRequestThaw = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/fraud-freeze/request-thaw`, {
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