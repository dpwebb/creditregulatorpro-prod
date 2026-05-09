import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postBureauCommunication, InputType, OutputType } from "../endpoints/evidence/bureau-communication_POST.schema";
import { toast } from "sonner";

export const useBureauCommunication = () => {
  const queryClient = useQueryClient();

  return useMutation<OutputType, Error, InputType>({
    mutationFn: async (data) => {
      return await postBureauCommunication(data);
    },
    onSuccess: (data) => {
      toast.success("Bureau communication recorded successfully");
      
      // Invalidate evidence queries using the keys from EVIDENCE_KEYS in evidenceQueries
      // Using "evidence" as the base key to invalidate all evidence-related lists and events
      queryClient.invalidateQueries({ queryKey: ["evidence"] });
      
      // Also invalidate attachments as bureau communication creates an evidence attachment
      queryClient.invalidateQueries({ queryKey: ["attachments"] });

      if (data.evidenceAttachment.packetId) {
        queryClient.invalidateQueries({ queryKey: ["packets", data.evidenceAttachment.packetId] });
        queryClient.invalidateQueries({ queryKey: ["packets"] });
      }
      if (data.evidenceAttachment.obligationInstanceId) {
        queryClient.invalidateQueries({ queryKey: ["obligation-instances", data.evidenceAttachment.obligationInstanceId] });
        queryClient.invalidateQueries({ queryKey: ["obligation-instances"] });
      }
    },
    onError: (error) => {
      toast.error(`Failed to record communication: ${error.message}`);
    },
  });
};
