import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postCreatePaymentIntent } from "../endpoints/stripe/create-payment-intent_POST.schema";

export function useCreatePaymentIntent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: postCreatePaymentIntent,
    onSuccess: () => {
      // Invalidate postal transactions or packet queries if relevant when a payment starts
      queryClient.invalidateQueries({ queryKey: ["postal-transactions"] });
    },
  });
}