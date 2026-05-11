import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPacketList as fetchPacketList } from "../endpoints/packet/list_GET.schema";
import { postPacketDelete as deletePacket, InputType as DeleteInput } from "../endpoints/packet/delete_POST.schema";

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
      // Fetch all packets and filter client-side since the list endpoint 
      // returns all user/org packets anyway. 
      // In a real optimized scenario, we'd add a query param to the endpoint.
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
