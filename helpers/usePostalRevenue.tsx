import { useQuery } from "@tanstack/react-query";
import { getPostalRevenue } from "../endpoints/admin/postal-revenue_GET.schema";

export const POSTAL_REVENUE_QUERY_KEY = ["admin", "postalRevenue"] as const;

export const usePostalRevenue = () => {
  return useQuery({
    queryKey: POSTAL_REVENUE_QUERY_KEY,
    queryFn: async () => {
      return await getPostalRevenue();
    },
    // The revenue data shouldn't change aggressively, cache for a minute
    staleTime: 60 * 1000, 
  });
};