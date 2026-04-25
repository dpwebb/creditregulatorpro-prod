import { z } from "zod";

import { Selectable } from "kysely";
import { Bureau } from "../../helpers/schema";

export const schema = z.object({
  name: z.string().min(1, "Name is required"),
  contactEmail: z.string().email().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  bureau: Selectable<Bureau>;
};

export const postBureauCreate = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/bureau/create`, {
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