import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { postTradelineDetectChanges, InputType as DetectInput } from "../endpoints/tradeline/detect-changes_POST.schema";
import { getTradelineDriftLogs, InputType as GetLogsInput } from "../endpoints/tradeline/drift-logs_GET.schema";

export const useDetectChanges = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DetectInput) => postTradelineDetectChanges(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["tradelines"] });
      queryClient.invalidateQueries({ queryKey: ["reportArtifacts"] });
      queryClient.invalidateQueries({ queryKey: ["obligation-instances"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
      queryClient.invalidateQueries({ queryKey: ["driftLogs", variables.tradelineId] });
      queryClient.invalidateQueries({ queryKey: ["driftLogs", "all"] });
    },
  });
};

export const useDriftLogs = (tradelineId?: number) => {
  return useQuery({
    queryKey: tradelineId ? ["driftLogs", tradelineId] : ["driftLogs", "all"],
    queryFn: () => getTradelineDriftLogs({ tradelineId }),
  });
};