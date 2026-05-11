import { z } from "zod";
import type { DisputePacketCandidate } from "../../helpers/disputePacketService";
import { DISPUTE_PACKET_TYPES } from "../../helpers/disputePacketTemplate";

export const schema = z.object({
  packetType: z.enum(DISPUTE_PACKET_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type OutputType = {
  recommendations: DisputePacketCandidate[];
};

export const getPacketRecommend = async (
  params?: z.infer<typeof schema>,
  init?: RequestInit,
): Promise<OutputType> => {
  const validatedInput = schema.parse(params ?? {});
  const searchParams = new URLSearchParams();
  if (validatedInput.packetType) searchParams.set("packetType", validatedInput.packetType);
  if (validatedInput.limit) searchParams.set("limit", String(validatedInput.limit));
  const query = searchParams.toString();

  const result = await fetch(`/_api/packet/recommend${query ? `?${query}` : ""}`, {
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
