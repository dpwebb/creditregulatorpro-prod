import { z } from "zod";

import { Json } from "../../helpers/schema";

// Using z.any() for complex JSON objects to avoid strict zod validation on dynamic structures,
// relying on TS types for structure.
export const schema = z.object({
  id: z.number(),
  name: z.string().optional(),
  description: z.string().optional(),
  expectedConsumerInfo: z.any().optional(),
  expectedTradelines: z.any().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  testCase: {
    id: number;
    name: string;
    description: string | null;
    expectedConsumerInfo: Json | null;
    expectedTradelines: Json | null;
  };
};

export const updateParserTestCase = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/parser-test-case/update`, {
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