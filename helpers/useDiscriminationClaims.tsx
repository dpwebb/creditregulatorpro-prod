import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDiscriminationClaims, InputType as ListInput } from "../endpoints/discrimination/list_GET.schema";
import { postCreateDiscriminationClaim, InputType as CreateInput } from "../endpoints/discrimination/create_POST.schema";
import { postUpdateDiscriminationClaim, InputType as UpdateInput } from "../endpoints/discrimination/update_POST.schema";
import { postDeleteDiscriminationClaim, InputType as DeleteInput } from "../endpoints/discrimination/delete_POST.schema";

export const DISCRIMINATION_CLAIMS_QUERY_KEY = ["discriminationClaims"] as const;

export function useDiscriminationClaims(filters: ListInput = {}) {
  return useQuery({
    queryKey: [...DISCRIMINATION_CLAIMS_QUERY_KEY, filters],
    queryFn: () => getDiscriminationClaims(filters),
  });
}

export function useCreateDiscriminationClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInput) => postCreateDiscriminationClaim(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DISCRIMINATION_CLAIMS_QUERY_KEY });
    },
  });
}

export function useUpdateDiscriminationClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateInput) => postUpdateDiscriminationClaim(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DISCRIMINATION_CLAIMS_QUERY_KEY });
    },
  });
}

export function useDeleteDiscriminationClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DeleteInput) => postDeleteDiscriminationClaim(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DISCRIMINATION_CLAIMS_QUERY_KEY });
    },
  });
}