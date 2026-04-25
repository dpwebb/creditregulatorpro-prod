import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getUserProfile,
  OutputType as ProfileData,
} from "../endpoints/user/profile_GET.schema";
import {
  postUserProfile,
  InputType as ProfileInput,
} from "../endpoints/user/profile_POST.schema";
import { toast } from "sonner";

export const USER_PROFILE_QUERY_KEY = ["user", "profile"] as const;

export function useUserProfile() {
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: USER_PROFILE_QUERY_KEY,
    queryFn: () => getUserProfile(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: ProfileInput) => postUserProfile(data),
    onSuccess: (data) => {
      queryClient.setQueryData(USER_PROFILE_QUERY_KEY, data);
      toast.success("Profile updated successfully");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to update profile"
      );
    },
  });

  return {
    profile: profileQuery.data,
    isLoading: profileQuery.isLoading,
    error: profileQuery.error,
    updateProfile: updateProfileMutation.mutateAsync,
    isUpdating: updateProfileMutation.isPending,
  };
}