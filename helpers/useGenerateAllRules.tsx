import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { postScanningRuleGenerateAll } from "../endpoints/scanning-rule/generate-all_POST.schema";
import { SCANNING_RULES_QUERY_KEY } from "./scanningRuleQueries";
import { REGULATORY_UPDATES_QUERY_KEY } from "./useRegulatoryUpdates";

export function useGenerateAllRules() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: () => postScanningRuleGenerateAll({}),
    onSuccess: (data) => {
      // Invalidate related lists so the UI reflects the newly generated rules
      queryClient.invalidateQueries({ queryKey: SCANNING_RULES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: REGULATORY_UPDATES_QUERY_KEY });
      
      if (data.errors > 0) {
        toast.warning(data.message);
      } else if (data.generated > 0) {
        toast.success(data.message);
      } else {
        toast.info(data.message);
      }
    },
    onError: (error) => {
      console.error("Bulk generation error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to bulk generate rules");
    },
  });
}