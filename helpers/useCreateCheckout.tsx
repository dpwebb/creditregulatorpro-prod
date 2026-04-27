import { useMutation } from "@tanstack/react-query";
import { postCreateCheckout } from "../endpoints/subscription/create-checkout_POST.schema";

export function useCreateCheckout() {
  return useMutation({
    mutationFn: postCreateCheckout,
  });
}