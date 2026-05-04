import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postPacketDelivery, InputType, OutputType } from "../endpoints/packet/delivery_POST.schema";
import { toast } from "sonner";

export const usePacketDelivery = () => {
  const queryClient = useQueryClient();

  return useMutation<OutputType, Error, InputType>({
    mutationFn: (data) => postPacketDelivery(data),
    onSuccess: (data) => {
      toast.success("Packet delivery recorded successfully");
      // Invalidate relevant queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ["packets"] });
      queryClient.invalidateQueries({ queryKey: ["packet", data.packetId] });
      queryClient.invalidateQueries({ queryKey: ["evidence-events"] });
      queryClient.invalidateQueries({ queryKey: ["obligation-instances"] });
      queryClient.invalidateQueries({ queryKey: ["deadline-events"] });
      queryClient.invalidateQueries({ queryKey: ["deadlines"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    },
    onError: (error) => {
      toast.error(`Failed to record delivery: ${error.message}`);
    },
  });
};
