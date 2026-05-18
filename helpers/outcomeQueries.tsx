import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  getOutcomeList,
  type InputType as OutcomeListInput,
} from "../endpoints/outcomes/list_GET.schema";
import {
  getOutcome,
  type InputType as OutcomeGetInput,
} from "../endpoints/outcomes/get_GET.schema";
import {
  postOutcomeAdminReview,
  type InputType as OutcomeAdminReviewInput,
} from "../endpoints/outcomes/admin-review_POST.schema";

export const OUTCOME_RUNS_QUERY_KEY = ["outcomes", "runs"] as const;
export const OUTCOME_RUN_QUERY_KEY = ["outcomes", "run"] as const;

export function useOutcomeRuns(filters?: OutcomeListInput) {
  return useQuery({
    queryKey: [...OUTCOME_RUNS_QUERY_KEY, filters],
    queryFn: () => getOutcomeList(filters),
    placeholderData: (previousData) => previousData,
  });
}

export function useOutcomeRun(comparisonRunId?: OutcomeGetInput["comparisonRunId"] | null) {
  return useQuery({
    queryKey: [...OUTCOME_RUN_QUERY_KEY, comparisonRunId],
    queryFn: () => getOutcome({ comparisonRunId: comparisonRunId as number }),
    enabled: Number.isInteger(comparisonRunId) && Number(comparisonRunId) > 0,
  });
}

export function useOutcomeAdminReviewMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: OutcomeAdminReviewInput) => postOutcomeAdminReview(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: OUTCOME_RUNS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: [...OUTCOME_RUN_QUERY_KEY, variables.comparisonRunId] });
      toast.success("Outcome review metadata updated.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update outcome review metadata.");
    },
  });
}

export type {
  OutcomeListInput,
  OutcomeGetInput,
  OutcomeAdminReviewInput,
};
