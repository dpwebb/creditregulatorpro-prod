import { z } from "zod";

import { ComparisonSummary } from "../../helpers/parserPatternAnalyzer";

export const schema = z.object({
  testCaseId: z.number(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  testCaseId: number;
  passed: boolean;
  needsReview: boolean;
  summary: ComparisonSummary;
  actualConsumerInfo: any;
  actualTradelines: any[];
  parserPipelineAudit?: unknown;
};

export const runParserTest = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/parser-test-case/run`, {
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
