import { z } from "zod";

import { Json } from "../../helpers/schema";

export const PARSER_TEST_CASE_LIST_DEFAULT_LIMIT = 50;
export const PARSER_TEST_CASE_LIST_MAX_LIMIT = 100;

export const schema = z.object({
  limit: z.coerce.number().int().min(1).max(PARSER_TEST_CASE_LIST_MAX_LIMIT).default(PARSER_TEST_CASE_LIST_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

export type InputType = Partial<z.infer<typeof schema>>;

export type ParserTestCaseSummary = {
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
  lastRunPassed: boolean | null;
  lastRunAt: Date | null;
  totalRuns: number;
  createdAt: Date;
  updatedAt: Date;
};

export type OutputType = {
  testCases: ParserTestCaseSummary[];
};

export const getParserTestCases = async (
  params?: Partial<InputType>,
  init?: RequestInit
): Promise<OutputType> => {
  const searchParams = new URLSearchParams();
  if (params?.limit !== undefined) searchParams.set("limit", params.limit.toString());
  if (params?.offset !== undefined) searchParams.set("offset", params.offset.toString());
  const queryString = searchParams.toString() ? `?${searchParams.toString()}` : "";

  const result = await fetch(`/_api/parser-test-case/list${queryString}`, {
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
