import { z } from "zod";
import superjson from "superjson";
import { Selectable } from "kysely";
import { ParserBureauDetectionConfig } from "../../helpers/schema";

export const schema = z.object({
  bureau: z.string().min(1),
  marker: z.string().min(1),
  weight: z.number(),
  isActive: z.boolean().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  marker: Selectable<ParserBureauDetectionConfig>;
};

export const upsertBureauDetectionConfig = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/bureau-detection-config/upsert`, {
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