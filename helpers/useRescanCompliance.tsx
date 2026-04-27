import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  postRescanCompliance,
  InputType,
  OutputType,
} from "../endpoints/tradeline/rescan-compliance_POST.schema";
import { toast } from "sonner";

export const useRescanCompliance = () => {
  const queryClient = useQueryClient();

  return useMutation<OutputType, Error, InputType>({
    mutationFn: (data) => postRescanCompliance(data),
    onSuccess: (data, variables) => {
      toast.success(data.message);
      // Invalidate queries related to the specific tradeline to refresh UI
      queryClient.invalidateQueries({
        queryKey: ["tradeline", variables.tradelineId],
      });
      // Also invalidate any lists of violations if they exist
      // Invalidating both specific and general keys to ensure all views update
      queryClient.invalidateQueries({
        queryKey: ["creditorValidations", variables.tradelineId],
      });
      queryClient.invalidateQueries({
        queryKey: ["creditorValidations"],
      });
      queryClient.invalidateQueries({
        queryKey: ["obligation-instances"],
      });
      queryClient.invalidateQueries({
        queryKey: ["evidence"],
      });
      queryClient.invalidateQueries({
        queryKey: ["packets", { tradelineId: variables.tradelineId }],
      });
      queryClient.invalidateQueries({
        queryKey: ["dashboardStats"],
      });
    },
    onError: (error) => {
      toast.error(`Rescan failed: ${error.message}`);
    },
  });
};