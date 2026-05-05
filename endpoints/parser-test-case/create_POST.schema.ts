import { z } from "zod";

import { Json } from "../../helpers/schema";

export const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  pdfBase64: z.string().min(1),
  expectedConsumerInfo: z.any().optional(),
  expectedTradelines: z.any().optional(),
  rawExtractedText: z.string().nullable().optional(),
  bureau: z.string().nullable().optional(),
  parserMode: z.string().nullable().optional(),
  allowAiFallback: z.boolean().nullable().optional(),
  stageVersion: z.string().nullable().optional(),
  extractionSource: z.string().nullable().optional(),
  parserContext: z.any().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  testCase: {
    id: number;
    name: string;
    description: string | null;
    expectedConsumerInfo: Json | null;
    expectedTradelines: Json | null;
    rawExtractedText: string | null;
    bureau: string | null;
    parserMode: string | null;
    allowAiFallback: boolean | null;
    stageVersion: string | null;
    extractionSource: string | null;
    parserContext: Json | null;
    adminReviewStatus: string;
  };
};

export const createParserTestCase = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/parser-test-case/create`, {
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
