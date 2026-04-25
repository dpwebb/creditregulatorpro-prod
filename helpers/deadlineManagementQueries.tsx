import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postDeadlineCreate, InputType as CreateInput } from "../endpoints/deadline/create_POST.schema";
import { postDeadlineUpdate, InputType as UpdateInput } from "../endpoints/deadline/update_POST.schema";
import { postDeadlineDelete, InputType as DeleteInput } from "../endpoints/deadline/delete_POST.schema";
import { toast } from "sonner";
import { DEADLINE_KEYS } from "./deadlineQueries";

export const useCreateDeadline = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInput) => postDeadlineCreate(data),
    onSuccess: () => {
      toast.success("Deadline created successfully");
      queryClient.invalidateQueries({ queryKey: DEADLINE_KEYS.all });
    },
    onError: (error: Error) => {
      toast.error(`Failed to create deadline: ${error.message}`);
    },
  });
};

export const useUpdateDeadline = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateInput) => postDeadlineUpdate(data),
    onSuccess: () => {
      toast.success("Deadline updated successfully");
      queryClient.invalidateQueries({ queryKey: DEADLINE_KEYS.all });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update deadline: ${error.message}`);
    },
  });
};

export const useDeleteDeadline = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DeleteInput) => postDeadlineDelete(data),
    onSuccess: () => {
      toast.success("Deadline deleted");
      queryClient.invalidateQueries({ queryKey: DEADLINE_KEYS.all });
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete deadline: ${error.message}`);
    },
  });
};