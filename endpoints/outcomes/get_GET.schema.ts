import { z } from "zod";

import type { OutcomeComparisonRunDetail } from "../../helpers/outcomeTrackingService";

export const schema = z.object({
  comparisonRunId: z.coerce.number().int().positive(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  comparisonRun: OutcomeComparisonRunDetail;
};

export const getOutcome = async (params: InputType, init?: RequestInit): Promise<OutputType> => {
  const searchParams = new URLSearchParams();
  searchParams.set("comparisonRunId", String(params.comparisonRunId));

  const result = await fetch(`/_api/outcomes/get?${searchParams.toString()}`, {
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
