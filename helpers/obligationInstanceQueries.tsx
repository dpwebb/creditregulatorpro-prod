import { useQuery } from "@tanstack/react-query";
import { getObligationInstanceList, InputType } from "../endpoints/obligation-instance/list_GET.schema";

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

/**
 * Hook to fetch a list of obligation instances with optional filters.
 * 
 * @param filters - Optional filters: tradelineId, state, disputeVector
 */
export const useObligationInstanceList = (filters?: InputType) => {
  return useQuery({
    queryKey: ["obligation-instances", filters],
    queryFn: ({ signal }) =>
      getObligationInstanceList(filters, { signal: withQueryTimeout(signal) }),
    placeholderData: (previousData) => previousData,
    retry: 1,
  });
};

export type ObligationInstanceFilters = InputType;
