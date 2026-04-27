import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSubscriptionStatus } from "../endpoints/subscription/status_GET.schema";
import { useAuth } from "./useAuth";
import { postUpdatePlan } from "../endpoints/subscription/update-plan_POST.schema";
import { postCancelSubscription } from "../endpoints/subscription/cancel_POST.schema";

export const SUBSCRIPTION_QUERY_KEY = ["subscription"] as const;

export function useSubscription() {
  const { authState } = useAuth();

  const query = useQuery({
    queryKey: SUBSCRIPTION_QUERY_KEY,
    queryFn: () => getSubscriptionStatus(),
    enabled:
      authState.type === "authenticated" &&
      authState.user.role !== "admin" &&
      authState.user.role !== "support",
  });

  const data = query.data;
  const isBeta = data?.plan === "beta";
  const isActive = data?.status === "active";
  const isTrialing = data?.status === "trialing";
  const isExpired =
    data?.status === "expired" ||
    data?.status === "past_due" ||
    data?.status === "cancelled";

  let daysLeftInTrial = 0;
  if (data?.trialEnd) {
    const now = new Date();
    const diffTime = new Date(data.trialEnd).getTime() - now.getTime();
    daysLeftInTrial = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  }

  return {
    subscription: data,
    isLoading: query.isPending,
    isBeta,
    isActive,
    isTrialing,
    isExpired,
    daysLeftInTrial,
    error: query.error,
  };
}

export function useUpdatePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: postUpdatePlan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY });
    },
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: postCancelSubscription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY });
    },
  });
}