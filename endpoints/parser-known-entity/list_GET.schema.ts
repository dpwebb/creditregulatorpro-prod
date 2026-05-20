import { z } from "zod";

import { KnownEntityType, ParserKnownEntity } from "../../helpers/schema";

export const PARSER_KNOWN_ENTITY_LIST_DEFAULT_LIMIT = 50;
export const PARSER_KNOWN_ENTITY_LIST_MAX_LIMIT = 100;

// Define the schema for query parameters
export const schema = z.object({
  entityType: z.enum(["account_type", "creditor_name", "province", "remark_code", "status_code"] as const).optional(),
  limit: z.coerce.number().int().min(1).max(PARSER_KNOWN_ENTITY_LIST_MAX_LIMIT).default(PARSER_KNOWN_ENTITY_LIST_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

export type InputType = Partial<z.infer<typeof schema>>;

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
  if (params.limit !== undefined) url.searchParams.set("limit", params.limit.toString());
  if (params.offset !== undefined) url.searchParams.set("offset", params.offset.toString());

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
