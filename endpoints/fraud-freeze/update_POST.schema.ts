import { z } from "zod";

import { Selectable } from "kysely";
import { IdentityTheftFreeze, FreezeStatus } from "../../helpers/schema";

export const schema = z.object({
  freezeId: z.number(),
  status: z.enum(["active", "cancelled", "expired", "requested", "thawed"]),
  effectiveDate: z.coerce.date().optional().nullable(),
  thawDate: z.coerce.date().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  freeze: Selectable<IdentityTheftFreeze>;
};

export const postUpdateFreeze = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/fraud-freeze/update`, {
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