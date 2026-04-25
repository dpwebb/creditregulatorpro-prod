import { z } from "zod";

import { Selectable } from "kysely";
import { Tradeline } from "../../helpers/schema";

export const schema = z.object({
  limit: z.coerce.number().min(1).optional(),
  offset: z.coerce.number().min(0).optional(),
});

export type InputType = z.infer<typeof schema>;

export type TradelineWithDetails = Selectable<Tradeline> & {
  bureauName: string | null;
  creditorName: string | null;
  userEmail: string | null;
  userRole: string | null;
  disputeStatus: string | null;
  crossBureauTradelineId: number | null;
  violationCount: number;
  challengesSentCount: number;
  responsesReceivedCount: number;
  nextDeadline: string | null;
  approachingStatuteMonths: number | null;
  packetsCreatedCount: number;
};

export type OutputType = {
  tradelines: TradelineWithDetails[];
  total: number;
};

export const getTradelineList = async (params?: InputType, init?: RequestInit): Promise<OutputType> => {
  const searchParams = new URLSearchParams();
  if (params?.limit !== undefined) searchParams.set("limit", params.limit.toString());
  if (params?.offset !== undefined) searchParams.set("offset", params.offset.toString());
  const queryString = searchParams.toString() ? `?${searchParams.toString()}` : '';

  const result = await fetch(`/_api/tradeline/list${queryString}`, {
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