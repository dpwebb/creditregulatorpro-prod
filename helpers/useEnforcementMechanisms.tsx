import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getEnforcementMechanismList, InputType as ListInput } from "../endpoints/enforcement-mechanism/list_GET.schema";
import { postEnforcementMechanismCreate, InputType as CreateInput } from "../endpoints/enforcement-mechanism/create_POST.schema";
import { postEnforcementMechanismUpdate, InputType as UpdateInput } from "../endpoints/enforcement-mechanism/update_POST.schema";
import { postEnforcementMechanismDelete, InputType as DeleteInput } from "../endpoints/enforcement-mechanism/delete_POST.schema";

/**
 * Query key for enforcement mechanisms.
 * Exported to allow manual invalidation if necessary.
 */
export const ENFORCEMENT_MECHANISMS_QUERY_KEY = ["enforcementMechanisms"] as const;

/**
 * Hook to fetch a list of enforcement mechanisms with optional filtering.
 * 
 * @param filters - Optional filters for jurisdiction and mechanismType
 */
export const useEnforcementMechanisms = (filters?: ListInput) => {
  return useQuery({
    queryKey: [...ENFORCEMENT_MECHANISMS_QUERY_KEY, filters],
    queryFn: () => getEnforcementMechanismList(filters),
    placeholderData: (previousData) => previousData,
  });
};

/**
 * Mutation hook to create a new enforcement mechanism.
 * Automatically invalidates the list query and shows success/error toasts.
 */
export const useCreateEnforcementMechanism = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInput) => postEnforcementMechanismCreate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ENFORCEMENT_MECHANISMS_QUERY_KEY });
      toast.success("Enforcement mechanism created successfully");
    },
    onError: (error) => {
      console.error("Failed to create enforcement mechanism:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create enforcement mechanism");
    },
  });
};

/**
 * Mutation hook to update an existing enforcement mechanism.
 * Automatically invalidates the list query and shows success/error toasts.
 */
export const useUpdateEnforcementMechanism = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateInput) => postEnforcementMechanismUpdate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ENFORCEMENT_MECHANISMS_QUERY_KEY });
      toast.success("Enforcement mechanism updated successfully");
    },
    onError: (error) => {
      console.error("Failed to update enforcement mechanism:", error);
      toast.error(error instanceof Error ? error.message : "Failed to update enforcement mechanism");
    },
  });
};

/**
 * Mutation hook to delete an enforcement mechanism.
 * Automatically invalidates the list query and shows success/error toasts.
 */
export const useDeleteEnforcementMechanism = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DeleteInput) => postEnforcementMechanismDelete(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ENFORCEMENT_MECHANISMS_QUERY_KEY });
      toast.success("Enforcement mechanism deleted successfully");
    },
    onError: (error) => {
      console.error("Failed to delete enforcement mechanism:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete enforcement mechanism");
    },
  });
};