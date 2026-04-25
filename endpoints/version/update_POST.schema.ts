import { z } from "zod";

import { Selectable } from "kysely";
import { SoftwareVersion } from "../../helpers/schema";

export const schema = z.object({
  id: z.number(),
  codename: z.string().optional().nullable(),
  releaseNotes: z.array(
    z.object({
      category: z.string(),
      items: z.array(z.string())
    })
  ).optional().nullable(),
  status: z.enum(["archived", "draft", "released", "staged"]).optional(),
  locked: z.boolean().optional()
});

export type InputType = z.infer<typeof schema>;
export type OutputType = Selectable<SoftwareVersion>;

export const postUpdateVersion = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const result = await fetch(`/_api/version/update`, {
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