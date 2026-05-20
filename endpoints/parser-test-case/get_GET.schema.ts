import { z } from "zod";

import { Json } from "../../helpers/schema";

export const schema = z.object({
  id: z.coerce.number().int().positive(),
});

export type InputType = z.infer<typeof schema>;

export type ParserTestCaseDetail = {
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
  approvedConsumerInfo: Json | null;
  approvedTradelines: Json | null;
  adjudicationDecisions: Json | null;
  createdAt: Date;
  updatedAt: Date;
};

export type OutputType = {
  testCase: ParserTestCaseDetail;
};

export const getParserTestCase = async (
  params: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const searchParams = new URLSearchParams({ id: params.id.toString() });
  const result = await fetch(`/_api/parser-test-case/get?${searchParams.toString()}`, {
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
