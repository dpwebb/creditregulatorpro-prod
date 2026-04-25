import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { postPacketSendFirstClass, InputType, OutputType } from "../endpoints/packet/send-first-class_POST.schema";

export const useSendFirstClass = () => {
  const queryClient = useQueryClient();

  return useMutation<OutputType, Error, InputType>({
    mutationFn: (data) => postPacketSendFirstClass(data),
    onSuccess: (data) => {
      toast.success(data.message || "Packet dispatched via First Class Mail");
      
      // Invalidate relevant react query cache keys
      queryClient.invalidateQueries({ queryKey: ["packets"] });
      queryClient.invalidateQueries({ queryKey: ["postalTransactions"] });
      queryClient.invalidateQueries({ queryKey: ["evidenceEvents"] });
      queryClient.invalidateQueries({ queryKey: ["deadlines"] });
      queryClient.invalidateQueries({ queryKey: ["tradeline"] });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to send packet via First Class Mail");
    },
  });
};