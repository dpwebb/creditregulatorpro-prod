import { z } from "zod";

import { ConsumerFindingExplanationResult } from "../../helpers/consumerExplanationAssist";

export const schema = z.object({
  violationId: z.number().int().positive(),
});

export type InputType = z.infer<typeof schema>;
export type OutputType = ConsumerFindingExplanationResult;

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

  if (!result.ok) {
    const errorObject = JSON.parse(await result.text());
    throw new Error(errorObject.error);
  }

  return JSON.parse(await result.text());
};
