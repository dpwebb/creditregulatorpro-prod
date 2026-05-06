import { useQuery } from "@tanstack/react-query";
import { getPacket, PacketDetail } from "../endpoints/packet/get_GET.schema";
import type { PreviewPacket } from "../endpoints/packet/create_POST.schema";
import { buildPacketLifecycleSummary } from "./packetLifecycle";

interface UsePacketViewerResult {
  packet: PacketDetail | null;
  isLoading: boolean;
  error: unknown;
}

/**
 * Hook to fetch a single packet by ID using the packet/get_GET endpoint.
 * Returns the packet object including the PDF storage URL.
 */
export const usePacketViewer = (
  packetId: number | null,
  previewData?: PreviewPacket | null
): UsePacketViewerResult => {
  const { data, isFetching, error } = useQuery({
    queryKey: ["packet", packetId],
    queryFn: () => getPacket({ packetId: packetId! }),
    enabled: packetId !== null && !previewData,
  });

  if (previewData) {
    return {
      packet: {
        id: -1,
        status: previewData.status || "Draft",
        terminalLabel: previewData.terminalLabel,
        createdAt: previewData.createdAt,
        pdfStorageUrl: previewData.pdfStorageUrl,
        sentDate: null,
        deliveryMethod: null,
        trackingNumber: null,
        letterDate: previewData.letterDate || null,
        consumerCertification: null,
        tradelineAccountNumber: null,
        bureauName: null,
        recipientName: previewData.recipientName ?? null,
        lifecycle: buildPacketLifecycleSummary({
          status: previewData.status || "Draft",
          sentDate: null,
        }),
      },
      isLoading: false,
      error: null,
    };
  }

  return {
    packet: data?.packet ?? null,
    isLoading: isFetching,
    error,
  };
};
