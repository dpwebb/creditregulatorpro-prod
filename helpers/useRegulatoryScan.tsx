import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { postRegulatoryUpdateScan, InputType as ScanInput } from "../endpoints/regulatory-update/scan_POST.schema";
import { REGULATORY_UPDATES_QUERY_KEY } from "./useRegulatoryUpdates";

/**
 * Mutation hook to trigger an AI scan for new regulatory updates.
 * Automatically invalidates the regulatory updates list query upon completion.
 */
export const useRegulatoryScan = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: ScanInput = {}) => postRegulatoryUpdateScan(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: REGULATORY_UPDATES_QUERY_KEY });
      toast.success(`Scan complete: found ${data.inserted} new regulatory updates.`);
    },
    onError: (error) => {
      console.error("Failed to run regulatory scan:", error);
      toast.error(error instanceof Error ? error.message : "Failed to run regulatory scan");
    },
  });
};