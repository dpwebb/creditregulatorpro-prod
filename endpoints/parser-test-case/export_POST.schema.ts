import { z } from "zod";

import { Json } from "../../helpers/schema";

export const schema = z.object({
  testCaseIds: z.array(z.number()).optional(),
});

export type InputType = z.infer<typeof schema>;

export type ExportedTestCase = {
  name: string;
  description: string | null;
  pdfBase64: string;
  expectedConsumerInfo: Json | null;
  expectedTradelines: Json | null;
  rawExtractedText: string | null;
};

export type OutputType = {
  testCases: ExportedTestCase[];
};

export const exportParserTestCases = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/parser-test-case/export`, {
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