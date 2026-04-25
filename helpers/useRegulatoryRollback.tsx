import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  postRegulatoryUpdateRollback,
  InputType,
} from "../endpoints/regulatory-update/rollback_POST.schema";
import { REGULATORY_UPDATES_QUERY_KEY } from "./useRegulatoryUpdates";
import { REGULATORY_NOTIFICATIONS_QUERY_KEY } from "./regulatoryNotificationQueries";
import { SCANNING_RULES_QUERY_KEY } from "./scanningRuleQueries";

export function useRegulatoryRollback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: InputType) => postRegulatoryUpdateRollback(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REGULATORY_UPDATES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: REGULATORY_NOTIFICATIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: SCANNING_RULES_QUERY_KEY });
      toast.success("Update rolled back to VERIFIED.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to rollback update.");
    },
  });
}