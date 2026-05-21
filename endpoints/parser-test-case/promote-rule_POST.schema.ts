import { z } from "zod";

export const schema = z.object({
  testCaseId: z.number(),
  decisionId: z.string().min(1),
  runRegressionGate: z.boolean().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  candidate: {
    id: number;
    status: string;
    ruleType: string;
    ruleConfig: unknown;
    activatedRuleId: number | null;
  };
  activated: boolean;
  message: string;
  targetValidation: {
    passed: boolean;
    reason: string | null;
  };
  regressionGate?: {
    required?: boolean;
    bypassed?: boolean;
    passed?: boolean;
    beforeFailed: number;
    afterFailed: number;
    newFailures: Array<{ id: number; name: string; reason: string }>;
  };
};

export const promoteParserTestRule = async (
  body: InputType,
  init?: RequestInit,
): Promise<OutputType> => {
  const result = await fetch(`/_api/parser-test-case/promote-rule`, {
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
    throw new Error(
      responseText
        ? `Request failed (${result.status}): ${responseText}`
        : `Request failed (${result.status})`,
    );
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
