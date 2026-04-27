import { useQuery } from "@tanstack/react-query";
import { getUploadResults } from "../endpoints/upload-results/get_GET.schema";

export const useUploadResults = (artifactId: number) => {
  return useQuery({
    queryKey: ["uploadResults", artifactId],
    queryFn: () => getUploadResults({ artifactId }),
    enabled: !!artifactId && !isNaN(artifactId),
    retry: 2,
  });
};