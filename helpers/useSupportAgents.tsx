import { useQuery } from "@tanstack/react-query";
import { getSupportAgents } from "../endpoints/support-ticket/agents_GET.schema";

export const SUPPORT_AGENTS_QUERY_KEY = ["support-agents"] as const;

export const useSupportAgents = () => {
  return useQuery({
    queryKey: SUPPORT_AGENTS_QUERY_KEY,
    queryFn: () => getSupportAgents(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};