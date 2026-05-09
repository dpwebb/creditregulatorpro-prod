import { useQuery } from "@tanstack/react-query";
import { getHiddenRiskList } from "../endpoints/hidden-risk/list_GET.schema";

export const HIDDEN_RISKS_QUERY_KEY = "hiddenRisks";

export const useHiddenRisks = (userId?: number) => {
  return useQuery({
    queryKey: [HIDDEN_RISKS_QUERY_KEY, userId],
    queryFn: () => getHiddenRiskList({ userId }),
  });
};
