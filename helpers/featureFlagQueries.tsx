import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getFeatureFlagList } from "../endpoints/feature-flag/list_GET.schema";
import { postCreateFeatureFlag } from "../endpoints/feature-flag/create_POST.schema";
import { postUpdateFeatureFlag } from "../endpoints/feature-flag/update_POST.schema";
import { postDeleteFeatureFlag } from "../endpoints/feature-flag/delete_POST.schema";

const FF_KEYS = {
  all: ["featureFlags"] as const,
};

export function useFeatureFlags() {
  return useQuery({
    queryKey: FF_KEYS.all,
    queryFn: () => getFeatureFlagList(),
  });
}

export function useCreateFeatureFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postCreateFeatureFlag,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FF_KEYS.all });
    },
  });
}

export function useUpdateFeatureFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postUpdateFeatureFlag,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FF_KEYS.all });
    },
  });
}

export function useDeleteFeatureFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postDeleteFeatureFlag,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FF_KEYS.all });
    },
  });
}