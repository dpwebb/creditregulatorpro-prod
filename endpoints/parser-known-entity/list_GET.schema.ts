import { z } from "zod";

import { KnownEntityType, ParserKnownEntity } from "../../helpers/schema";

// Define the schema for query parameters
export const schema = z.object({
  entityType: z.enum(["account_type", "creditor_name", "province", "remark_code", "status_code"] as const).optional(),
});

export type InputType = z.infer<typeof schema>;

export type ParserKnownEntityOutput = {
  id: number;
  entityType: KnownEntityType;
  value: string;
  description: string | null;
  createdAt: Date | null;
  createdBy: number | null;
};

export type OutputType = {
  entities: ParserKnownEntityOutput[];
};

export const getParserKnownEntities = async (
  params: InputType = {},
  init?: RequestInit
): Promise<OutputType> => {
  const url = new URL("/_api/parser-known-entity/list", window.location.origin);
  if (params.entityType) {
    url.searchParams.set("entityType", params.entityType);
  }

  const result = await fetch(url.toString(), {
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