import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postRequestVerificationEmail } from "../endpoints/auth/request_verification_email_POST.schema";
import { postVerifyEmail } from "../endpoints/auth/verify_email_POST.schema";
import { AUTH_QUERY_KEY } from "./useAuth";

export const useRequestVerificationEmail = () => {
  return useMutation({
    mutationFn: async () => {
      return await postRequestVerificationEmail({});
    },
  });
};

export const useVerifyEmail = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (token: string) => {
      return await postVerifyEmail({ token });
    },
    onSuccess: () => {
      // Invalidate auth session query to refresh user info (e.g., emailVerified status)
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
  });
};