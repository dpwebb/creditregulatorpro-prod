import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCreditorValidationList } from "../endpoints/creditor-validation/list_GET.schema";
import { postDismissCreditorValidation } from "../endpoints/creditor-validation/dismiss_POST.schema";

export const useComplianceViolations = (tradelineId: number) => {
  return useQuery({
    queryKey: ["creditorValidations", tradelineId],
    queryFn: () => getCreditorValidationList({ tradelineId }),
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
    },
  });
};