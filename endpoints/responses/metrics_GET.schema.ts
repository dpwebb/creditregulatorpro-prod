import { z } from "zod";

import type { ResponseProcessingMetrics } from "../../helpers/responseProcessingMetrics";

export const schema = z.object({
  lookbackHours: z.coerce.number().int().min(1).max(168).optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  metrics: ResponseProcessingMetrics;
};

export const getResponseProcessingMetrics = async (
  params?: InputType,
  init?: RequestInit,
): Promise<OutputType> => {
  const searchParams = new URLSearchParams();
  if (params?.lookbackHours !== undefined) searchParams.set("lookbackHours", String(params.lookbackHours));
  const queryString = searchParams.toString() ? `?${searchParams.toString()}` : "";

  const result = await fetch(`/_api/responses/metrics${queryString}`, {
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
