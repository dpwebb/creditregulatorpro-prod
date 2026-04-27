import { z } from "zod";

import { Selectable } from "kysely";
import { VersionMigration } from "../../helpers/schema";

export const schema = z.object({
  id: z.number(),
  status: z.enum(["applied", "pending", "rolled_back"])
});

export type InputType = z.infer<typeof schema>;
export type OutputType = Selectable<VersionMigration>;

export const postUpdateMigration = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const result = await fetch(`/_api/migration/update`, {
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