import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getUserDataSummary } from "../endpoints/user/data-summary_GET.schema";
import {
  postDeleteUserData,
  type InputType as DeleteUserDataInput,
} from "../endpoints/user/delete-data_POST.schema";
import {
  postDeleteUserAccount,
  type InputType as DeleteUserAccountInput,
} from "../endpoints/user/delete-account_POST.schema";
import { AUTH_QUERY_KEY } from "./useAuth";
import { CONSUMER_IDENTIFICATION_QUERY_KEY } from "./useConsumerIdentification";

export const USER_DATA_SUMMARY_QUERY_KEY = ["user", "data-summary"] as const;

const DATA_QUERY_PREFIXES = [
  ["reportArtifacts"],
  ["tradelines"],
  ["packets"],
  ["dashboardStats"],
  ["support-tickets"],
  ["fraud-freezes"],
  ["consumer-signatures"],
  CONSUMER_IDENTIFICATION_QUERY_KEY,
  USER_DATA_SUMMARY_QUERY_KEY,
] as const;

export function useUserDataDeletion() {
  const queryClient = useQueryClient();

  const summaryQuery = useQuery({
    queryKey: USER_DATA_SUMMARY_QUERY_KEY,
    queryFn: () => getUserDataSummary(),
    staleTime: 1000 * 60,
  });

  const invalidateUserData = () => {
    for (const queryKey of DATA_QUERY_PREFIXES) {
      queryClient.invalidateQueries({ queryKey });
    }
    queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
  };

  const deleteDataMutation = useMutation({
    mutationFn: (input: DeleteUserDataInput) => postDeleteUserData(input),
    onSuccess: (result) => {
      invalidateUserData();
      const deletedCount = Object.values(result.purgedCounts).reduce((sum, count) => sum + count, 0);
      toast.success(deletedCount > 0 ? "Selected data deleted" : "No matching data found to delete");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete selected data");
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: (input: DeleteUserAccountInput) => postDeleteUserAccount(input),
    onSuccess: () => {
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
      queryClient.resetQueries();
      toast.success("Account deleted");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete account");
    },
  });

  return {
    summary: summaryQuery.data ?? null,
    isLoadingSummary: summaryQuery.isLoading,
    deleteUserData: deleteDataMutation.mutateAsync,
    isDeletingData: deleteDataMutation.isPending,
    deleteUserAccount: deleteAccountMutation.mutateAsync,
    isDeletingAccount: deleteAccountMutation.isPending,
  };
}
