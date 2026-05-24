import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPacketList as fetchPacketList } from "../endpoints/packet/list_GET.schema";
import { postPacketDelete as deletePacket, InputType as DeleteInput } from "../endpoints/packet/delete_POST.schema";
import {
  getPacketRecommend,
  type OutputType as PacketRecommendOutput,
} from "../endpoints/packet/recommend_GET.schema";
import {
  postPacketBuild,
  type InputType as PacketBuildInput,
} from "../endpoints/packet/build_POST.schema";
import { postPacketValidateReadiness } from "../endpoints/packet/validate-readiness_POST.schema";
import { postPacketCreate } from "../endpoints/packet/create_POST.schema";
import type { DisputePacketType } from "./disputePacketTemplate";

export const usePacketList = () => {
  return useQuery({
    queryKey: ["packets"],
    queryFn: () => fetchPacketList(),
  });
};

export const useTradelinePackets = (tradelineId: number) => {
  return useQuery({
    queryKey: ["packets", { tradelineId }],
    queryFn: async () => {
      // The packet list endpoint enforces owner/org scope server-side.
      // Keep this client-side tradeline filter only as a display defense.
      const data = await fetchPacketList();
      return {
        packets: data.packets.filter(p => p.tradelineId === tradelineId)
      };
    },
    enabled: !!tradelineId
  });
};

export const useDeletePacket = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DeleteInput) => deletePacket(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
      queryClient.invalidateQueries({ queryKey: ["tradeline"] });
    },
  });
};

export const usePacketRecommendations = (packetType: DisputePacketType) => {
  return useQuery<PacketRecommendOutput>({
    queryKey: ["packet-recommendations", packetType],
    queryFn: () => getPacketRecommend({ packetType, limit: 100 }),
  });
};

export const usePacketReadiness = (
  input: PacketBuildInput,
  options: { enabled?: boolean } = {},
) => {
  return useQuery({
    queryKey: ["packet-readiness", input.packetType, input.selectedIssueIds, input.recipientBureauId ?? null, input.recipient ?? null],
    queryFn: () => postPacketValidateReadiness(input),
    enabled: options.enabled ?? input.selectedIssueIds.length > 0,
  });
};

export const useBuildPacketPreview = () => {
  return useMutation({
    mutationFn: (data: PacketBuildInput) => postPacketBuild(data),
  });
};

export const useCreatePacket = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PacketBuildInput) => postPacketCreate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
      queryClient.invalidateQueries({ queryKey: ["packet-recommendations"] });
    },
  });
};
