import { z } from "zod";

export const schema = z.object({
  tradelineId: z.number({ coerce: true }),
});

export type InputType = z.infer<typeof schema>;

export type TimelineEntry = {
  id: string;
  type: "SNAPSHOT" | "PACKET" | "DRIFT" | "IMPACT" | "EVIDENCE" | "OBLIGATION";
  timestamp: string;
  data: any; // Type-specific data payload
};

export type OutputType = {
  timeline: TimelineEntry[];
};

export const getTradelineChangeTimeline = async (params: InputType, init?: RequestInit): Promise<OutputType> => {
  const queryString = `?tradelineId=${params.tradelineId}`;
  const result = await fetch(`/_api/tradeline/change-timeline${queryString}`, {
    method: "GET",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!result.ok) {
    const errorObject = JSON.parse(await result.text());
    throw new Error(errorObject.error || "Failed to fetch timeline");
  }
  return JSON.parse(await result.text());
};