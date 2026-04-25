import { z } from "zod";

import { Selectable } from "kysely";
import { FeatureFlag } from "../../helpers/schema";

export const schema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional().nullable(),
  enabled: z.boolean(),
  minVersion: z.string().optional().nullable(),
  maxVersion: z.string().optional().nullable(),
  scope: z.enum(["admin", "global", "user"])
});

export type InputType = z.infer<typeof schema>;
export type OutputType = Selectable<FeatureFlag>;

export const postCreateFeatureFlag = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const result = await fetch(`/_api/feature-flag/create`, {
    method: "POST",
    body: JSON.stringify(schema.parse(body)),
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