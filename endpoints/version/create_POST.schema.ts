import { z } from "zod";

import { Selectable } from "kysely";
import { SoftwareVersion } from "../../helpers/schema";

export const schema = z.object({
  codeLineCount: z.number().int().min(1).optional(),
  codename: z.string().optional(),
  version: z.string().regex(/^\d+\.\d+\.\d+/).optional(),
});

export type InputType = z.infer<typeof schema>;
export type OutputType = Selectable<SoftwareVersion>;

export const postCreateVersion = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const result = await fetch(`/_api/version/create`, {
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