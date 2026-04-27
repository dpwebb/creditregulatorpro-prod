import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postConfirmPayment, InputType, OutputType } from "../endpoints/subscription/confirm-payment_POST.schema";
import { AUTH_QUERY_KEY } from "./useAuth";

export const useConfirmSubscriptionPayment = () => {
  const queryClient = useQueryClient();

  return useMutation<OutputType, Error, InputType>({
    mutationFn: (data) => postConfirmPayment(data),
    onSuccess: () => {
      // Invalidate auth query to refresh user session which carries subscription info
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
  });
};