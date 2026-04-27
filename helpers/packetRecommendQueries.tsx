import { useQuery } from "@tanstack/react-query";
import { getRecommendPacket } from "../endpoints/packet/recommend_GET.schema";

export const PACKET_RECOMMENDATIONS_QUERY_KEY = ["packetRecommendations"] as const;

/**
 * React Query hook to fetch intelligent packet recommendations.
 * Utilizes the getRecommendPacket endpoint to surface the top 3 actionable violations
 * or fallback procedural ingress vectors if no strong data violations exist.
 */
export function usePacketRecommendations() {
  return useQuery({
    queryKey: PACKET_RECOMMENDATIONS_QUERY_KEY,
    queryFn: async () => {
      const response = await getRecommendPacket();
      if ("error" in response) {
        throw new Error(response.error);
      }
      return response;
    },
  });
}