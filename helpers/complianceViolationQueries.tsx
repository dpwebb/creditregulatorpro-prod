import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCreditorValidationList } from "../endpoints/creditor-validation/list_GET.schema";
import { postDismissCreditorValidation } from "../endpoints/creditor-validation/dismiss_POST.schema";

const QUERY_TIMEOUT_MS = 15000;

const withQueryTimeout = (signal?: AbortSignal): AbortSignal | undefined => {
  if (typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function") {
    return signal;
  }

  const timeoutSignal = AbortSignal.timeout(QUERY_TIMEOUT_MS);
  if (!signal) return timeoutSignal;

  const anyFn = (AbortSignal as any).any as ((signals: AbortSignal[]) => AbortSignal) | undefined;
  if (typeof anyFn === "function") {
    return anyFn([signal, timeoutSignal]);
  }

  return timeoutSignal;
};

export const useComplianceViolations = (tradelineId: number) => {
  return useQuery({
    queryKey: ["creditorValidations", tradelineId],
    queryFn: ({ signal }) =>
      getCreditorValidationList({ tradelineId }, { signal: withQueryTimeout(signal) }),
    enabled: tradelineId > 0,
    retry: 1,
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
