import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupportTickets, InputType as ListInput } from "../endpoints/support-ticket/list_GET.schema";
import { getSupportTicket } from "../endpoints/support-ticket/get_GET.schema";
import { postCreateSupportTicket } from "../endpoints/support-ticket/create_POST.schema";
import { postUpdateSupportTicket } from "../endpoints/support-ticket/update_POST.schema";
import { postReplySupportTicket } from "../endpoints/support-ticket/reply_POST.schema";
import { postCreateSupportAgent } from "../endpoints/admin/create-support-agent_POST.schema";

export const SUPPORT_TICKET_KEYS = {
  all: ["support-tickets"] as const,
  lists: () => ["support-tickets", "list"] as const,
  list: (filters: ListInput) => ["support-tickets", "list", filters] as const,
  details: () => ["support-tickets", "detail"] as const,
  detail: (id: number) => ["support-tickets", "detail", id] as const,
};

export function useSupportTicketList(filters: ListInput) {
  return useQuery({
    queryKey: SUPPORT_TICKET_KEYS.list(filters),
    queryFn: () => getSupportTickets(filters),
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
  });
}

export function useSupportTicket(id: number) {
  return useQuery({
    queryKey: SUPPORT_TICKET_KEYS.detail(id),
    queryFn: () => getSupportTicket({ id }),
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
    enabled: !!id,
  });
}

export function useCreateSupportTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof postCreateSupportTicket>[0]) => postCreateSupportTicket(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUPPORT_TICKET_KEYS.all });
    },
  });
}

export function useUpdateSupportTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof postUpdateSupportTicket>[0]) => postUpdateSupportTicket(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUPPORT_TICKET_KEYS.all });
    },
  });
}

export function useReplySupportTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof postReplySupportTicket>[0]) => postReplySupportTicket(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUPPORT_TICKET_KEYS.all });
    },
  });
}

export function useCreateSupportAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof postCreateSupportAgent>[0]) => postCreateSupportAgent(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}