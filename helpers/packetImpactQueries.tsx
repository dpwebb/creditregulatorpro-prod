import { useQuery } from "@tanstack/react-query";
import { getPacketImpact } from "../endpoints/packet/impact_GET.schema";
import { getTradelineChangeTimeline } from "../endpoints/tradeline/change-timeline_GET.schema";

export const usePacketImpact = (packetId: number | null) => {
  return useQuery({
    queryKey: ["packetImpact", packetId],
    queryFn: () => {
      if (packetId === null) {
        throw new Error("packetId is required");
      }
      return getPacketImpact({ packetId });
    },
    enabled: packetId !== null,
  });
};

export const useChangeTimeline = (tradelineId: number) => {
  return useQuery({
    queryKey: ["changeTimeline", tradelineId],
    queryFn: () => getTradelineChangeTimeline({ tradelineId }),
  });
};