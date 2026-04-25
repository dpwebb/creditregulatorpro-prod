import { useQuery } from "@tanstack/react-query";
import { getObligationInstanceList, InputType } from "../endpoints/obligation-instance/list_GET.schema";

/**
 * Hook to fetch a list of obligation instances with optional filters.
 * 
 * @param filters - Optional filters: tradelineId, state, disputeVector
 */
export const useObligationInstanceList = (filters?: InputType) => {
  return useQuery({
    queryKey: ["obligation-instances", filters],
    queryFn: () => getObligationInstanceList(filters),
    placeholderData: (previousData) => previousData,
  });
};

export type ObligationInstanceFilters = InputType;