import { z } from "zod";
import superjson from "superjson";
import { Selectable } from "kysely";
import { ParserFieldMapping } from "../../helpers/schema";

export const schema = z.object({
  id: z.number(),
  sourcePath: z.string().optional(),
  targetField: z.string().optional(),
  section: z.string().optional(),
  transformType: z.string().optional(),
  transformConfig: z.any().optional(),
  isActive: z.boolean().optional(),
  priority: z.number().optional(),
  description: z.string().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  mapping: Selectable<ParserFieldMapping>;
};

export const updateParserMapping = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/parser-mapping/update`, {
    method: "POST",
    body: superjson.stringify(body),
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