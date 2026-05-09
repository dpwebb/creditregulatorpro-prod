import { z } from "zod";

import type { ConsumerFindingExplanationResult } from "../../helpers/consumerExplanationAssist";

export const schema = z.object({
  violationId: z.number().int().positive(),
});

export type InputType = z.infer<typeof schema>;
export type OutputType = ConsumerFindingExplanationResult;

function parseJsonResponse(text: string, status: number): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`AI preview returned a non-JSON response (${status})`);
  }
}

export const postConsumerFindingExplanationAssist = async (
  body: InputType,
  init?: RequestInit,
): Promise<OutputType> => {
  const result = await fetch(`/_api/ai-assist/consumer-finding-explanation`, {
    method: "POST",
    body: JSON.stringify(body),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const responseText = await result.text();
  const responseObject = parseJsonResponse(responseText, result.status);

  if (!result.ok) {
    const errorMessage =
      responseObject &&
      typeof responseObject === "object" &&
      "error" in responseObject &&
      typeof (responseObject as { error?: unknown }).error === "string"
        ? (responseObject as { error: string }).error
        : `AI preview request failed (${result.status})`;
    throw new Error(errorMessage);
  }

  return responseObject as OutputType;
};
