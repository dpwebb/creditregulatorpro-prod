import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { postRegulatoryUpdateAutoEscalate } from "../endpoints/regulatory-update/auto-escalate_POST.schema";
import { REGULATORY_UPDATES_QUERY_KEY } from "./useRegulatoryUpdates";
import { REGULATORY_NOTIFICATIONS_QUERY_KEY } from "./regulatoryNotificationQueries";

export function useAutoEscalateRegulatory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => postRegulatoryUpdateAutoEscalate({}),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: REGULATORY_UPDATES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: REGULATORY_NOTIFICATIONS_QUERY_KEY });
      toast.success(
        `Auto-escalation complete: ${data.escalated} escalated, ${data.notificationsCreated} notifications, ${data.statutesLinked} statutes linked.`
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to run auto-escalation.");
    },
  });
}