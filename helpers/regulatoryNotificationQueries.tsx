import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getRegulatoryNotificationList } from "../endpoints/regulatory-notification/list_GET.schema";
import {
  postRegulatoryNotificationMarkRead,
  InputType as MarkReadInput,
} from "../endpoints/regulatory-notification/mark-read_POST.schema";
import { postRegulatoryNotificationDismissAll } from "../endpoints/regulatory-notification/dismiss-all_POST.schema";

export const REGULATORY_NOTIFICATIONS_QUERY_KEY = ["regulatoryNotifications"] as const;

export function useRegulatoryNotifications(unreadOnly?: boolean) {
  return useQuery({
    queryKey: [...REGULATORY_NOTIFICATIONS_QUERY_KEY, { unreadOnly }],
    queryFn: () => getRegulatoryNotificationList({ unreadOnly, limit: 50 }),
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: MarkReadInput) => postRegulatoryNotificationMarkRead(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REGULATORY_NOTIFICATIONS_QUERY_KEY });
    },
  });
}

export function useDismissAllNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => postRegulatoryNotificationDismissAll({}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REGULATORY_NOTIFICATIONS_QUERY_KEY });
    },
  });
}