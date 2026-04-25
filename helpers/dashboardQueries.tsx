import { useQuery } from "@tanstack/react-query";
import { getDashboardStats as fetchDashboardStats } from "../endpoints/dashboard/stats_GET.schema";

export const useDashboardStats = () => {
  return useQuery({
    queryKey: ["dashboardStats"],
    queryFn: () => fetchDashboardStats(),
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });
};