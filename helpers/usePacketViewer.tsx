import { useQuery } from "@tanstack/react-query";
import { getPacket, PacketDetail } from "../endpoints/packet/get_GET.schema";

interface UsePacketViewerResult {
  packet: PacketDetail | null;
  isLoading: boolean;
  error: unknown;
}

/**
 * Hook to fetch a single packet by ID using the packet/get_GET endpoint.
 * Returns the packet object including the PDF storage URL.
 */
export const usePacketViewer = (packetId: number | null): UsePacketViewerResult => {
  const { data, isFetching, error } = useQuery({
    queryKey: ["packet", packetId],
    queryFn: () => getPacket({ packetId: packetId! }),
    enabled: packetId !== null,
  });

  return {
    packet: data?.packet ?? null,
    isLoading: isFetching,
    error,
  };
};
