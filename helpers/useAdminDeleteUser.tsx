import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postAdminDeleteUser, InputType, OutputType } from "../endpoints/admin/delete-user_POST.schema";

export const useAdminDeleteUser = () => {
  const queryClient = useQueryClient();

  return useMutation<OutputType, Error, InputType>({
    mutationFn: postAdminDeleteUser,
    onSuccess: (data, variables) => {
      // Invalidate users list to refresh UI
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      // Invalidate the specifically deleted user to purge cached details
      queryClient.invalidateQueries({ queryKey: ["admin", "user-detail", variables.userId] });
    },
  });
};