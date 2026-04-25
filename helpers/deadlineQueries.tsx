import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getUpcomingDeadlines, OutputType as UpcomingType } from "../endpoints/deadline/upcoming_GET.schema";
import { getOverdueDeadlines, OutputType as OverdueType } from "../endpoints/deadline/overdue_GET.schema";
import { completeDeadline, InputType as CompleteInput } from "../endpoints/deadline/complete_POST.schema";
import { postDeadlineCreate, InputType as CreateInput } from "../endpoints/deadline/create_POST.schema";
import { postDeadlineUpdate, InputType as UpdateInput } from "../endpoints/deadline/update_POST.schema";
import { postDeadlineDelete, InputType as DeleteInput } from "../endpoints/deadline/delete_POST.schema";
import { toast } from "sonner";

export const DEADLINE_KEYS = {
  all: ["deadlines"] as const,
  upcoming: (limit?: number) => [...DEADLINE_KEYS.all, "upcoming", limit] as const,
  overdue: (limit?: number) => [...DEADLINE_KEYS.all, "overdue", limit] as const,
};

export const useUpcomingDeadlines = (limit: number = 50) => {
  return useQuery({
    queryKey: DEADLINE_KEYS.upcoming(limit),
    queryFn: () => getUpcomingDeadlines({ limit }),
    placeholderData: (prev) => prev,
  });
};

export const useOverdueDeadlines = (limit: number = 50) => {
  return useQuery({
    queryKey: DEADLINE_KEYS.overdue(limit),
    queryFn: () => getOverdueDeadlines({ limit }),
    placeholderData: (prev) => prev,
  });
};

export const useCompleteDeadlineMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CompleteInput) => completeDeadline(data),
    onSuccess: () => {
      toast.success("Deadline marked as completed");
      queryClient.invalidateQueries({ queryKey: DEADLINE_KEYS.all });
    },
    onError: (error: Error) => {
      toast.error(`Failed to complete deadline: ${error.message}`);
    },
  });
};

export const useCreateDeadlineMutation = () => {
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

export const useUpdateDeadlineMutation = () => {
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

export const useDeleteDeadlineMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DeleteInput) => postDeadlineDelete(data),
    onSuccess: () => {
      toast.success("Deadline deleted successfully");
      queryClient.invalidateQueries({ queryKey: DEADLINE_KEYS.all });
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete deadline: ${error.message}`);
    },
  });
};