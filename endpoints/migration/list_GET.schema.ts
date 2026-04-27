import { z } from "zod";

import { Selectable } from "kysely";
import { VersionMigration } from "../../helpers/schema";

export const schema = z.object({
  versionId: z.coerce.number()
});

export type InputType = z.infer<typeof schema>;
export type OutputType = Selectable<VersionMigration>[];

export const getMigrationList = async (params: InputType, init?: RequestInit): Promise<OutputType> => {
  const searchParams = new URLSearchParams();
  searchParams.append("versionId", params.versionId.toString());
  
  const result = await fetch(`/_api/migration/list?${searchParams.toString()}`, {
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