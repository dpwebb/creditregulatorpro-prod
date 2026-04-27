import { z } from "zod";
import superjson from "superjson";
import { Selectable } from "kysely";
import { ParserFieldMapping } from "../../helpers/schema";

export const schema = z.object({
  bureau: z.string().min(1),
  sourcePath: z.string().min(1),
  targetField: z.string().min(1),
  section: z.string().min(1),
  transformType: z.string().min(1),
  transformConfig: z.any().optional(),
  isActive: z.boolean().optional(),
  priority: z.number().optional(),
  description: z.string().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  mapping: Selectable<ParserFieldMapping>;
};

export const createParserMapping = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/parser-mapping/create`, {
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