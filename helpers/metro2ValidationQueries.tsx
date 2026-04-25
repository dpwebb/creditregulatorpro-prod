import { useQuery } from "@tanstack/react-query";
import { ValidationSeverity } from "./schema";
import { getMetro2ValidationLogs } from "../endpoints/metro2-validation-log/list_GET.schema";

export type Metro2LogFilters = {
  tradelineId?: number;
  severity?: ValidationSeverity;
  category?: string;
};

// --- React Query Hook ---

export const useMetro2ValidationLogs = (filters: Metro2LogFilters) => {
  return useQuery({
    queryKey: ["metro2ValidationLogs", filters],
    queryFn: async () => {
      const result = await getMetro2ValidationLogs(filters);
      return result.logs;
    },
    staleTime: 1000 * 30, // 30 seconds
  });
};