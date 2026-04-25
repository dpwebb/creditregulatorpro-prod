import { z } from "zod";

import { Selectable } from "kysely";
import { SystemSettings } from "../../helpers/schema";

export const schema = z.object({
  settings: z.array(
    z.object({
      key: z.string().min(1),
      value: z.string(),
      description: z.string().nullable().optional(),
    })
  ),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = Selectable<SystemSettings>[];

export const postSystemSettings = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/admin/settings`, {
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