import { useQuery } from "@tanstack/react-query";
import { getTradeline } from "../endpoints/tradeline/get_GET.schema";

export const TRADELINE_QUERY_KEY = (id: number) => ["tradeline", id] as const;

/**
 * Hook to fetch a single tradeline by ID with details.
 * Handles loading and error states via React Query.
 */
export const useTradeline = (id: number | undefined) => {
  return useQuery({
    queryKey: TRADELINE_QUERY_KEY(id ?? 0),
    queryFn: async () => {
      if (!id) throw new Error("Tradeline ID is required");
      return await getTradeline({ id });
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};