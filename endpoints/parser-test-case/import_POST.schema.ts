import { z } from "zod";


// Reusing the structure from export, but defining it here for schema validation
const importedTestCaseSchema = z.object({
  name: z.string(),
  description: z.string().nullable().optional(),
  pdfBase64: z.string(),
  expectedConsumerInfo: z.any().nullable().optional(),
  expectedTradelines: z.any().nullable().optional(),
  rawExtractedText: z.string().nullable().optional(),
  bureau: z.string().nullable().optional(),
  parserMode: z.string().nullable().optional(),
  allowAiFallback: z.boolean().nullable().optional(),
  stageVersion: z.string().nullable().optional(),
  extractionSource: z.string().nullable().optional(),
  parserContext: z.any().nullable().optional(),
  adminReviewStatus: z.string().nullable().optional(),
  approvedConsumerInfo: z.any().nullable().optional(),
  approvedTradelines: z.any().nullable().optional(),
  adjudicationDecisions: z.any().nullable().optional(),
});

export const schema = z.object({
  testCases: z.array(importedTestCaseSchema),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  importedCount: number;
};

export const importParserTestCases = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/parser-test-case/import`, {
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
