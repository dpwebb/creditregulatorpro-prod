import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getEvidenceList, EvidenceEventWithDetails } from "../endpoints/evidence/list_GET.schema";
import { postEvidenceCreate, InputType as CreateInput } from "../endpoints/evidence/create_POST.schema";
import { postEvidenceUpdate, InputType as UpdateInput } from "../endpoints/evidence/update_POST.schema";
import { postEvidenceDelete, InputType as DeleteInput } from "../endpoints/evidence/delete_POST.schema";
import { getAttachments } from "../endpoints/evidence-attachment/list_GET.schema";

export type { EvidenceEventWithDetails };

export const EVIDENCE_KEYS = {
  all: ["evidence"] as const,
  lists: () => [...EVIDENCE_KEYS.all, "list"] as const,
  list: (tradelineId?: number) => [...EVIDENCE_KEYS.lists(), tradelineId ?? "all"] as const,
  tradeline: (tradelineId: number) => [...EVIDENCE_KEYS.all, "tradeline", tradelineId] as const,
  obligation: (obligationInstanceId: number) => [...EVIDENCE_KEYS.all, "obligation", obligationInstanceId] as const,
  stats: () => [...EVIDENCE_KEYS.all, "stats"] as const,
};

export function useEvidenceList(tradelineId?: number) {
  return useQuery({
    queryKey: EVIDENCE_KEYS.list(tradelineId),
    queryFn: () => getEvidenceList({ tradelineId }),
    placeholderData: (prev) => prev,
  });
}

export function useTradelineEvidence(tradelineId: number) {
  return useQuery({
    queryKey: EVIDENCE_KEYS.tradeline(tradelineId),
    queryFn: () => getEvidenceList({ tradelineId }),
    enabled: !!tradelineId,
    placeholderData: (prev) => prev,
  });
}

export function useObligationEvidence(obligationInstanceId: number) {
  return useQuery({
    queryKey: EVIDENCE_KEYS.obligation(obligationInstanceId),
    queryFn: () => getAttachments({ obligationInstanceId }),
    enabled: !!obligationInstanceId,
    placeholderData: (prev) => prev,
  });
}

export function useEvidenceStats() {
  return useQuery({
    queryKey: EVIDENCE_KEYS.stats(),
    queryFn: async () => {
      const [events, attachments] = await Promise.all([
        getEvidenceList({}),
        getAttachments({})
      ]);

      // Count attachments by obligation instance
      const evidenceByObligation = attachments.reduce((acc, attachment) => {
        if (attachment.obligationInstanceId) {
          acc[attachment.obligationInstanceId] = (acc[attachment.obligationInstanceId] || 0) + 1;
        }
        return acc;
      }, {} as Record<number, number>);

      // Count attachments by packet
      const evidenceByPacket = attachments.reduce((acc, attachment) => {
        if (attachment.packetId) {
          acc[attachment.packetId] = (acc[attachment.packetId] || 0) + 1;
        }
        return acc;
      }, {} as Record<number, number>);

      return {
        totalEvents: events.events.length,
        totalAttachments: attachments.length,
        uniqueObligations: Object.keys(evidenceByObligation).length,
        uniquePackets: Object.keys(evidenceByPacket).length,
        evidenceByObligation,
        evidenceByPacket,
        averageAttachmentsPerObligation: Object.keys(evidenceByObligation).length > 0
          ? attachments.filter(a => a.obligationInstanceId).length / Object.keys(evidenceByObligation).length
          : 0,
      };
    },
    placeholderData: (prev) => prev,
  });
}

export const useCreateEvidenceEvent = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInput) => postEvidenceCreate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EVIDENCE_KEYS.all });
    },
  });
};

export const useUpdateEvidenceEvent = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateInput) => postEvidenceUpdate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EVIDENCE_KEYS.all });
    },
  });
};

export const useDeleteEvidenceEvent = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DeleteInput) => postEvidenceDelete(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EVIDENCE_KEYS.all });
    },
  });
};