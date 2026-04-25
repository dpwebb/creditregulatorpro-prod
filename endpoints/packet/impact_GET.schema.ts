import { z } from "zod";
import { Selectable } from "kysely";
import { PacketImpactAssessment, TradelineSnapshot, Packet } from "../../helpers/schema";

export const schema = z.object({
  packetId: z.number({ coerce: true }),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  assessment: Selectable<PacketImpactAssessment> | null;
  packet: Pick<Selectable<Packet>, "id" | "tradelineId" | "status" | "baselineSnapshotId" | "createdAt"> | null;
  baselineSnapshot: Selectable<TradelineSnapshot> | null;
  followupSnapshot: Selectable<TradelineSnapshot> | null;
};

export const getPacketImpact = async (params: InputType, init?: RequestInit): Promise<OutputType> => {
  const queryString = `?packetId=${params.packetId}`;
  const result = await fetch(`/_api/packet/impact${queryString}`, {
    method: "GET",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!result.ok) {
    const errorObject = JSON.parse(await result.text());
    throw new Error(errorObject.error || "Failed to fetch packet impact");
  }
  return JSON.parse(await result.text());
};