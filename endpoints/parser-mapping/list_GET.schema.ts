import { z } from "zod";
import superjson from "superjson";
import { Selectable } from "kysely";
import { ParserFieldMapping } from "../../helpers/schema";
import { DefaultMappingEntry } from "../../helpers/parserMappingDefaults";

export const PARSER_MAPPING_LIST_DEFAULT_LIMIT = 50;
export const PARSER_MAPPING_LIST_MAX_LIMIT = 100;

export const schema = z.object({
  bureau: z.string().optional(),
  section: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(PARSER_MAPPING_LIST_MAX_LIMIT).default(PARSER_MAPPING_LIST_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

export type InputType = Partial<z.infer<typeof schema>>;

export type OutputType = {
  mappings: Selectable<ParserFieldMapping>[];
  defaults: DefaultMappingEntry[];
};

export const getParserMappings = async (
  query: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const params = new URLSearchParams();
  if (query.bureau) params.append("bureau", query.bureau);
  if (query.section) params.append("section", query.section);
  if (query.limit !== undefined) params.append("limit", query.limit.toString());
  if (query.offset !== undefined) params.append("offset", query.offset.toString());

  const result = await fetch(`/_api/parser-mapping/list?${params.toString()}`, {
    method: "GET",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  
  return superjson.parse<OutputType>(await result.text());
};
