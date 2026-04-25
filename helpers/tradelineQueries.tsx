import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTradelineList as fetchTradelineList } from "../endpoints/tradeline/list_GET.schema";
import { postTradelineCreate as createTradeline, InputType as CreateInput } from "../endpoints/tradeline/create_POST.schema";
import { postTradelineDelete as deleteTradeline, InputType as DeleteInput } from "../endpoints/tradeline/delete_POST.schema";

export const useTradelineList = () => {
  return useQuery({
    queryKey: ["tradelines"],
    queryFn: () => fetchTradelineList(),
  });
};

export const useCreateTradeline = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInput) => createTradeline(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tradelines"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    },
  });
};

export const useDeleteTradeline = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DeleteInput) => deleteTradeline(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tradelines"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    },
  });
};