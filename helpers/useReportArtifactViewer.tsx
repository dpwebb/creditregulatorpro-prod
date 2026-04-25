import { useQuery } from "@tanstack/react-query";
import { getReportArtifact, ReportArtifactDetail } from "../endpoints/report-artifact/get_GET.schema";

export function useReportArtifactViewer(reportArtifactId: number | null) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["report-artifact", reportArtifactId],
    queryFn: async () => {
      if (!reportArtifactId) throw new Error("No report artifact ID provided");
      return getReportArtifact({ id: reportArtifactId });
    },
    enabled: !!reportArtifactId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  return {
    reportArtifact: data?.reportArtifact ?? null,
    isLoading,
    error: error as Error | null,
  };
}