import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getReviewData, OutputType as ReviewDataOutput } from "../endpoints/cases/review-data_GET.schema";
import { postPatchCase, InputType as PatchInput } from "../endpoints/cases/patch_POST.schema";
import { toast } from "sonner";

export const REVIEW_DATA_QUERY_KEY = (artifactId: number) => ["case", "review", artifactId];

export function useCaseReviewData(artifactId: number) {
  return useQuery({
    queryKey: REVIEW_DATA_QUERY_KEY(artifactId),
    queryFn: async () => {
      const result = await getReviewData(artifactId);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result;
    },
    enabled: !!artifactId && !isNaN(artifactId),
  });
}

export function useCasePatch(artifactId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patches: PatchInput["patches"]) => {
      const result = await postPatchCase({
        artifactId,
        patches,
      });
      
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: (data) => {
      // Optimistically update or invalidate
      // Since the patch endpoint returns the new effective view, we can update the cache
      queryClient.setQueryData(REVIEW_DATA_QUERY_KEY(artifactId), (old: ReviewDataOutput | undefined) => {
        if (!old || !old.ok) return old;
        
        return {
          ...old,
          effectiveView: data.effectiveView,
          editLog: data.editLog,
        };
      });
      toast.success("Changes saved");
    },
    onError: (error) => {
      toast.error(`Failed to save changes: ${error.message}`);
    },
  });
}