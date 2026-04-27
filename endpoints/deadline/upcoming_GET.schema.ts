import { z } from "zod";


export const schema = z.object({
  limit: z.number().optional().default(50),
});

export type InputType = z.infer<typeof schema>;

// Output type derived from getUpcomingDeadlines return type
export type OutputType = {
  id: number;
  title: string;
  deadline: Date;
  eventType: string;
  description: string | null;
  obligationInstanceId: number | null;
  packetId: number | null;
  obligationTradelineId?: number | null;
  packetTradelineId?: number | null;
}[];

export const getUpcomingDeadlines = async (input?: InputType, init?: RequestInit): Promise<OutputType> => {
  const params = new URLSearchParams();
  if (input?.limit) params.append("limit", input.limit.toString());

  const result = await fetch(`/_api/deadline/upcoming?${params.toString()}`, {
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