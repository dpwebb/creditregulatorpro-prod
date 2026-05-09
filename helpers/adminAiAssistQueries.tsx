import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getAdminAiAssistRuns,
  InputType as AdminAiAssistRunsInput,
} from "../endpoints/admin/ai-assist/runs_GET.schema";
import { postConsumerFindingExplanationAssist } from "../endpoints/ai-assist/consumer-finding-explanation_POST.schema";

const ADMIN_AI_ASSIST_KEYS = {
  all: ["adminAiAssistRuns"] as const,
  runs: (params: Partial<AdminAiAssistRunsInput>) => ["adminAiAssistRuns", params] as const,
};

export function useAdminAiAssistRuns(params: Partial<AdminAiAssistRunsInput> = {}) {
  return useQuery({
    queryKey: ADMIN_AI_ASSIST_KEYS.runs(params),
    queryFn: () => getAdminAiAssistRuns(params),
  });
}

export function usePreviewConsumerFindingExplanationAssist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Parameters<typeof postConsumerFindingExplanationAssist>[0]) =>
      postConsumerFindingExplanationAssist(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_AI_ASSIST_KEYS.all });
    },
  });
}
