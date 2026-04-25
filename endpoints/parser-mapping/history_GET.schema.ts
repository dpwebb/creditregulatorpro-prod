import { z } from "zod";
import superjson from "superjson";
import { Selectable } from "kysely";
import { ParserMappingVersion } from "../../helpers/schema";

export const schema = z.object({
  mappingId: z.number().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  versions: Selectable<ParserMappingVersion>[];
};

export const getParserMappingHistory = async (
  query: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const params = new URLSearchParams();
  if (query.mappingId) {
    params.append("mappingId", query.mappingId.toString());
  }

  const result = await fetch(`/_api/parser-mapping/history?${params.toString()}`, {
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