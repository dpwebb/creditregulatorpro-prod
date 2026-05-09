import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCreditorValidationList } from "../endpoints/creditor-validation/list_GET.schema";
import { postDismissCreditorValidation } from "../endpoints/creditor-validation/dismiss_POST.schema";
import { PACKET_RECOMMENDATIONS_QUERY_KEY } from "./packetRecommendQueries";
import { HIDDEN_RISKS_QUERY_KEY } from "./hiddenRiskQueries";

export const useComplianceViolations = (tradelineId: number) => {
  return useQuery({
    queryKey: ["creditorValidations", tradelineId],
    queryFn: ({ signal }) => getCreditorValidationList({ tradelineId }, { signal }),
    enabled: tradelineId > 0,
  });
};

export const useDismissViolation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { violationId: number; status: "dismissed" | "verified"; reason?: string }) => 
      postDismissCreditorValidation(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creditorValidations"] });
      queryClient.invalidateQueries({ queryKey: [HIDDEN_RISKS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: PACKET_RECOMMENDATIONS_QUERY_KEY });
    },
  });
};
