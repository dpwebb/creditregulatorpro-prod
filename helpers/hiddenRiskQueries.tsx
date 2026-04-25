import { useQuery } from "@tanstack/react-query";
import { getHiddenRiskList } from "../endpoints/hidden-risk/list_GET.schema";

export const useHiddenRisks = (userId?: number) => {
  return useQuery({
    queryKey: ["hiddenRisks", userId],
    queryFn: () => getHiddenRiskList({ userId }),
  });
};