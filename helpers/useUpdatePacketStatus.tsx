import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postUpdateStatus, InputType } from "../endpoints/packet/update-status_POST.schema";
import { toast } from "sonner";

export function useUpdatePacketStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: InputType) => postUpdateStatus(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["packets"] });
      // Also invalidate potentially specific packet queries if any exist
      queryClient.invalidateQueries({ queryKey: ["packet", data.packetId] });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update packet status");
    },
  });
}