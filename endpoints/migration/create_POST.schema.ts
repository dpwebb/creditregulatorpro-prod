import { z } from "zod";

import { Selectable } from "kysely";
import { VersionMigration } from "../../helpers/schema";

export const schema = z.object({
  versionId: z.number(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  sqlUp: z.string().optional().nullable(),
  sqlDown: z.string().optional().nullable(),
});

export type InputType = z.infer<typeof schema>;
export type OutputType = Selectable<VersionMigration>;

export const postCreateMigration = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const result = await fetch(`/_api/migration/create`, {
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