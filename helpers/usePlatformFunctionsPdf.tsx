import { useQuery } from "@tanstack/react-query";
import { getPlatformFunctionsPdf } from "../endpoints/pdf/platform-functions_GET.schema";

/**
 * Hook to fetch the static platform functions reference PDF.
 * This document is statically generated based on platform capabilities.
 */
export const usePlatformFunctionsPdf = () => {
  return useQuery({
    queryKey: ["pdf", "platform-functions"],
    queryFn: () => getPlatformFunctionsPdf(),
    staleTime: Infinity, // The PDF content is static so it doesn't need to be refetched
  });
};