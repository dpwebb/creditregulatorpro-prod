import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getScanningRuleList, InputType as ListInput } from "../endpoints/scanning-rule/list_GET.schema";
import { postScanningRuleGenerate, InputType as GenerateInput } from "../endpoints/scanning-rule/generate_POST.schema";
import { postScanningRuleUpdate, InputType as UpdateInput } from "../endpoints/scanning-rule/update_POST.schema";
import { postScanningRuleDelete, InputType as DeleteInput } from "../endpoints/scanning-rule/delete_POST.schema";

export const SCANNING_RULES_QUERY_KEY = ["scanning-rules"] as const;

export function useScanningRules(params?: ListInput) {
  return useQuery({
    queryKey: [...SCANNING_RULES_QUERY_KEY, params],
    queryFn: () => getScanningRuleList(params),
  });
}

export function useGenerateScanningRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: GenerateInput) => postScanningRuleGenerate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SCANNING_RULES_QUERY_KEY });
    },
  });
}

export function useUpdateScanningRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateInput) => postScanningRuleUpdate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SCANNING_RULES_QUERY_KEY });
    },
  });
}

export function useDeleteScanningRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DeleteInput) => postScanningRuleDelete(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SCANNING_RULES_QUERY_KEY });
    },
  });
}