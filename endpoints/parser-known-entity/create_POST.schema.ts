import { z } from "zod";

import { Selectable } from "kysely";
import { ParserKnownEntity, KnownEntityTypeArrayValues } from "../../helpers/schema";

export const schema = z.object({
  entityType: z.enum(KnownEntityTypeArrayValues),
  value: z.string().min(1),
  description: z.string().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  entity: Selectable<ParserKnownEntity>;
};

export const createParserKnownEntity = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/parser-known-entity/create`, {
    method: "POST",
    body: JSON.stringify(body),
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