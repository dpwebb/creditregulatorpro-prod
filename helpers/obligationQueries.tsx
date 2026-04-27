import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getObligationList as fetchObligationList } from "../endpoints/obligation/list_GET.schema";
import { postObligationCreate as createObligation, InputType as CreateInput } from "../endpoints/obligation/create_POST.schema";
import { postObligationUpdate as updateObligation, InputType as UpdateInput } from "../endpoints/obligation/update_POST.schema";
import { postObligationDelete as deleteObligation, InputType as DeleteInput } from "../endpoints/obligation/delete_POST.schema";

export const useObligationList = () => {
  return useQuery({
    queryKey: ["obligations"],
    queryFn: () => fetchObligationList(),
  });
};

export const useCreateObligation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInput) => createObligation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["obligations"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    },
  });
};

export const useUpdateObligation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateInput) => updateObligation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["obligations"] });
    },
  });
};

export const useDeleteObligation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DeleteInput) => deleteObligation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["obligations"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    },
  });
};