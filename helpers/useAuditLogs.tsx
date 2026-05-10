import { useQuery } from "@tanstack/react-query";
import { getAuditLogs, InputType } from "../endpoints/admin/audit-logs_GET.schema";

export const AUDIT_LOGS_QUERY_KEY = ["audit", "logs"] as const;

export const useAuditLogs = (params: InputType) => {
  return useQuery({
    queryKey: [...AUDIT_LOGS_QUERY_KEY, params],
    queryFn: () => getAuditLogs(params),
    // Keep data fresh but don't refetch too aggressively for logs
    staleTime: 1000 * 60, // 1 minute
  });
};
