import { z } from "zod";

import { Json } from "../../helpers/schema";

export const schema = z.object({});

export type ParserTestCaseSummary = {
  id: number;
  name: string;
  description: string | null;
  expectedConsumerInfo: Json | null;
  expectedTradelines: Json | null;
  rawExtractedText: string | null;
  lastRunPassed: boolean | null;
  lastRunAt: Date | null;
  totalRuns: number;
  updatedAt: Date;
};

export type OutputType = {
  testCases: ParserTestCaseSummary[];
};

export const getParserTestCases = async (
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/parser-test-case/list`, {
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
