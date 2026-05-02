import { useMutation } from "@tanstack/react-query";
import { postCreateCheckout } from "../endpoints/subscription/create-checkout_POST.schema";

export function useCreateCheckout() {
  return useMutation({
    mutationFn: (input: Parameters<typeof postCreateCheckout>[0]) => postCreateCheckout(input),
  });
}