import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getRegulatoryUpdateList, InputType as ListInput } from "../endpoints/regulatory-update/list_GET.schema";
import { postRegulatoryUpdateCreate, InputType as CreateInput } from "../endpoints/regulatory-update/create_POST.schema";
import { postRegulatoryUpdateUpdate, InputType as UpdateInput } from "../endpoints/regulatory-update/update_POST.schema";
import { postRegulatoryUpdateDelete, InputType as DeleteInput } from "../endpoints/regulatory-update/delete_POST.schema";

/**
 * Query key for regulatory updates.
 * Exported to allow manual invalidation if necessary.
 */
export const REGULATORY_UPDATES_QUERY_KEY = ["regulatoryUpdates"] as const;

/**
 * Hook to fetch a list of regulatory updates with optional filtering.
 * 
 * @param filters - Optional filters for jurisdiction, status, changeType, and source
 */
export const useRegulatoryUpdates = (filters?: ListInput) => {
  return useQuery({
    queryKey: [...REGULATORY_UPDATES_QUERY_KEY, filters],
    queryFn: () => getRegulatoryUpdateList(filters),
    placeholderData: (previousData) => previousData,
  });
};

/**
 * Mutation hook to create a new regulatory update.
 * Automatically invalidates the list query and shows success/error toasts.
 */
export const useCreateRegulatoryUpdate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInput) => postRegulatoryUpdateCreate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REGULATORY_UPDATES_QUERY_KEY });
      toast.success("Regulatory update created successfully");
    },
    onError: (error) => {
      console.error("Failed to create regulatory update:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create regulatory update");
    },
  });
};

/**
 * Mutation hook to update an existing regulatory update.
 * Automatically invalidates the list query and shows success/error toasts.
 */
export const useUpdateRegulatoryUpdate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateInput) => postRegulatoryUpdateUpdate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REGULATORY_UPDATES_QUERY_KEY });
      toast.success("Regulatory update updated successfully");
    },
    onError: (error) => {
      console.error("Failed to update regulatory update:", error);
      toast.error(error instanceof Error ? error.message : "Failed to update regulatory update");
    },
  });
};

/**
 * Mutation hook to delete a regulatory update.
 * Automatically invalidates the list query and shows success/error toasts.
 */
export const useDeleteRegulatoryUpdate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DeleteInput) => postRegulatoryUpdateDelete(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REGULATORY_UPDATES_QUERY_KEY });
      toast.success("Regulatory update deleted successfully");
    },
    onError: (error) => {
      console.error("Failed to delete regulatory update:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete regulatory update");
    },
  });
};