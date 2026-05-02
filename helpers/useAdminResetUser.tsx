import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postAdminResetUser, InputType, OutputType } from "../endpoints/admin/reset-user_POST.schema";

export const useAdminResetUser = () => {
  const queryClient = useQueryClient();

  return useMutation<OutputType, Error, InputType>({
    mutationFn: (input: Parameters<typeof postAdminResetUser>[0]) => postAdminResetUser(input),
    onSuccess: (data, variables) => {
      // Invalidate relevant queries when a user gets reset
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "user-detail", variables.userId] });
    },
  });
};