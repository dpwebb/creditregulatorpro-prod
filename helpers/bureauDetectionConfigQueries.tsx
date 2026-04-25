import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getBureauDetectionConfigs } from "../endpoints/bureau-detection-config/list_GET.schema";
import { updateBureauDetectionConfig } from "../endpoints/bureau-detection-config/update_POST.schema";
import { upsertBureauDetectionConfig } from "../endpoints/bureau-detection-config/upsert_POST.schema";

export const BUREAU_DETECTION_CONFIG_KEYS = {
  all: ["bureauDetectionConfig"] as const,
  lists: () => [...BUREAU_DETECTION_CONFIG_KEYS.all, "list"] as const,
};

export function useBureauDetectionConfigs() {
  return useQuery({
    queryKey: BUREAU_DETECTION_CONFIG_KEYS.lists(),
    queryFn: () => getBureauDetectionConfigs(),
  });
}

export function useUpdateBureauDetectionConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateBureauDetectionConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUREAU_DETECTION_CONFIG_KEYS.lists() });
    },
  });
}

export function useUpsertBureauDetectionConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertBureauDetectionConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUREAU_DETECTION_CONFIG_KEYS.lists() });
    },
  });
}