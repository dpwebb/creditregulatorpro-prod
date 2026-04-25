import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getFreezeList, InputType as ListInput } from "../endpoints/fraud-freeze/list_GET.schema";
import { postCreateFreeze, InputType as CreateInput } from "../endpoints/fraud-freeze/create_POST.schema";
import { postUpdateFreeze, InputType as UpdateInput } from "../endpoints/fraud-freeze/update_POST.schema";
import { postRequestThaw, InputType as ThawInput } from "../endpoints/fraud-freeze/request-thaw_POST.schema";
import { postCancelFreeze, InputType as CancelInput } from "../endpoints/fraud-freeze/cancel_POST.schema";

export const useFreezeList = (params: ListInput = {}) => {
  return useQuery({
    queryKey: ["freezes", params],
    queryFn: () => getFreezeList(params),
  });
};

export const useCreateFreeze = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInput) => postCreateFreeze(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["freezes"] });
    },
  });
};

export const useUpdateFreeze = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateInput) => postUpdateFreeze(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["freezes"] });
    },
  });
};

export const useRequestThaw = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ThawInput) => postRequestThaw(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["freezes"] });
    },
  });
};

export const useCancelFreeze = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CancelInput) => postCancelFreeze(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["freezes"] });
    },
  });
};