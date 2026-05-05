import { z } from "zod";

import { Json } from "../../helpers/schema";

export const parserDecisionSchema = z.object({
  entityType: z.enum(["report", "consumerInfo", "tradeline", "inquiry", "employment", "publicRecord", "score", "other"]),
  entityKey: z.string().optional(),
  fieldPath: z.string().min(1),
  decision: z.enum(["accepted", "corrected", "missing", "not_reported", "ignored"]),
  parsedValue: z.any().optional(),
  correctValue: z.any().optional(),
  sourceEvidence: z.string().optional(),
  reason: z.string().optional(),
});

export const schema = z.object({
  testCaseId: z.number(),
  adminReviewStatus: z.enum(["needs_review", "partially_reviewed", "approved", "needs_parser_rule"]).optional(),
  approvedConsumerInfo: z.any().optional(),
  approvedTradelines: z.any().optional(),
  decision: parserDecisionSchema.optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  testCase: {
    id: number;
    adminReviewStatus: string;
    approvedConsumerInfo: Json | null;
    approvedTradelines: Json | null;
    adjudicationDecisions: Json | null;
    updatedAt: Date;
  };
};

export const adjudicateParserTestCase = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/parser-test-case/adjudicate`, {
    method: "POST",
    body: JSON.stringify(body),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const responseText = await result.text();
  let responseObject: unknown = null;
  try {
    responseObject = responseText ? JSON.parse(responseText) : null;
  } catch {
    if (!result.ok) {
      throw new Error(
        responseText
          ? `Request failed (${result.status}): ${responseText}`
          : `Request failed (${result.status})`,
      );
    }
    throw new Error("Parser adjudication returned an invalid JSON response.");
  }

  if (!result.ok) {
    const errorObject =
      responseObject && typeof responseObject === "object" && "error" in responseObject
        ? responseObject as { error?: string }
        : null;
    throw new Error(errorObject?.error || `Request failed (${result.status})`);
  }

  return responseObject as OutputType;
};
