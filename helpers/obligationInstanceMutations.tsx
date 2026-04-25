import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { recordResponse, InputType as RecordResponseInput } from "../endpoints/obligation-instance/record-response_POST.schema";

/**
 * Mutation hook for deleting obligation instances (challenges).
 * Assumes an endpoint exists at POST /_api/obligation-instance/delete
 */
export const useDeleteObligationInstances = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: number[]) => {
      const response = await fetch("/_api/obligation-instance/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids }),
      });

      if (!response.ok) {
        // Try to parse error message
        try {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to delete challenges");
        } catch (e) {
          throw new Error("Failed to delete challenges");
        }
      }

      return response.json();
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ["obligation-instances"] });
      toast.success(
        `${ids.length} challenge${ids.length === 1 ? "" : "s"} deleted successfully`
      );
    },
    onError: (error) => {
      console.error("Delete error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete challenges");
    },
  });
};

/**
 * Mutation hook for recording a response for a dispute/obligation instance.
 * Uses the POST /_api/obligation-instance/record-response endpoint.
 */
export const useRecordDisputeResponse = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RecordResponseInput) => recordResponse(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["obligation-instances"] });
      // We might also want to invalidate specific instance queries if they exist,
      // e.g. ["obligation-instance", data.obligationInstance.id]
      
      toast.success("Response recorded successfully");
    },
    onError: (error) => {
      console.error("Record response error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to record response");
    },
  });
};