import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getBureauList as fetchBureauList } from "../endpoints/bureau/list_GET.schema";
import { postBureauCreate as createBureau, InputType as CreateInput } from "../endpoints/bureau/create_POST.schema";
import { postBureauDelete as deleteBureau, InputType as DeleteInput } from "../endpoints/bureau/delete_POST.schema";

export const useBureauList = () => {
  return useQuery({
    queryKey: ["bureaus"],
    queryFn: () => fetchBureauList(),
  });
};

export const useCreateBureau = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInput) => createBureau(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bureaus"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    },
  });
};

export const useDeleteBureau = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DeleteInput) => deleteBureau(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bureaus"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    },
  });
};