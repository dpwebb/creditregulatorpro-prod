import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postAcceptTerms } from "../endpoints/user/accept-terms_POST.schema";
import { AUTH_QUERY_KEY } from "./useAuth";

export const useAcceptTerms = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return postAcceptTerms({});
    },
    onSuccess: () => {
      // Invalidate the auth query key so any user session data relying on terms acceptance is refreshed
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
  });
};