import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getRegulationRegistryList,
  type InputType as RegistryListInput,
} from "../endpoints/regulation-registry/list_GET.schema";
import {
  getRegulationCandidates,
  type InputType as CandidateListInput,
} from "../endpoints/regulation-registry/candidates_GET.schema";
import {
  postRegulationCandidateCreate,
  type InputType as CandidateCreateInput,
} from "../endpoints/regulation-registry/create-candidate_POST.schema";
import {
  postRegulationCandidateReview,
  type InputType as CandidateReviewInput,
} from "../endpoints/regulation-registry/review_POST.schema";
import {
  postRegulationDeactivate,
  type InputType as DeactivateInput,
} from "../endpoints/regulation-registry/deactivate_POST.schema";
import {
  postRegulationRestore,
  type InputType as RestoreInput,
} from "../endpoints/regulation-registry/restore_POST.schema";
import { postRegulationRebuildIndex } from "../endpoints/regulation-registry/rebuild-index_POST.schema";
import {
  postRegulationRegistryScan,
  type InputType as ScanInput,
} from "../endpoints/regulation-registry/scan_POST.schema";
import { getRegulationMappings } from "../endpoints/regulation-registry/mapping_GET.schema";
import {
  postRegulationMapping,
  type InputType as MappingInput,
} from "../endpoints/regulation-registry/mapping_POST.schema";
import {
  getRegulationReconciliationCandidates,
  type InputType as ReconciliationCandidateListInput,
} from "../endpoints/regulation-registry/reconciliation-candidates/list_GET.schema";
import {
  postRegulationReconciliationCandidateStatus,
  type InputType as ReconciliationCandidateStatusInput,
} from "../endpoints/regulation-registry/reconciliation-candidates/update-status_POST.schema";
import {
  getRuntimeBridgeMappings,
  type InputType as RuntimeBridgeMappingListInput,
} from "../endpoints/regulation-registry/runtime-bridge/list_GET.schema";
import {
  postRuntimeBridgeMappingStatus,
  type InputType as RuntimeBridgeMappingStatusInput,
} from "../endpoints/regulation-registry/runtime-bridge/update-status_POST.schema";

export const REGULATION_REGISTRY_QUERY_KEY = ["regulationRegistry"] as const;
export const REGULATION_CANDIDATES_QUERY_KEY = ["regulationCandidates"] as const;
export const REGULATION_MAPPINGS_QUERY_KEY = ["regulationMappings"] as const;
export const REGULATION_RECONCILIATION_CANDIDATES_QUERY_KEY = ["regulationReconciliationCandidates"] as const;
export const REGULATION_RUNTIME_BRIDGE_MAPPINGS_QUERY_KEY = ["regulationRuntimeBridgeMappings"] as const;

export function useRegulationRegistry(filters?: RegistryListInput) {
  return useQuery({
    queryKey: [...REGULATION_REGISTRY_QUERY_KEY, filters],
    queryFn: () => getRegulationRegistryList(filters),
    placeholderData: (previousData) => previousData,
  });
}

export function useRegulationCandidates(filters?: CandidateListInput) {
  return useQuery({
    queryKey: [...REGULATION_CANDIDATES_QUERY_KEY, filters],
    queryFn: () => getRegulationCandidates(filters),
    placeholderData: (previousData) => previousData,
  });
}

export function useRegulationMappings() {
  return useQuery({
    queryKey: REGULATION_MAPPINGS_QUERY_KEY,
    queryFn: () => getRegulationMappings(),
  });
}

export function useRegulationReconciliationCandidates(
  filters?: ReconciliationCandidateListInput,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: [...REGULATION_RECONCILIATION_CANDIDATES_QUERY_KEY, filters],
    queryFn: () => getRegulationReconciliationCandidates(filters),
    placeholderData: (previousData) => previousData,
    enabled: options?.enabled ?? true,
  });
}

export function useRuntimeBridgeMappings(
  filters?: Partial<RuntimeBridgeMappingListInput>,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: [...REGULATION_RUNTIME_BRIDGE_MAPPINGS_QUERY_KEY, filters],
    queryFn: () => getRuntimeBridgeMappings(filters),
    placeholderData: (previousData) => previousData,
    enabled: options?.enabled ?? true,
  });
}

export function useCreateRegulationCandidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CandidateCreateInput) => postRegulationCandidateCreate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REGULATION_CANDIDATES_QUERY_KEY });
      toast.success("Regulation candidate added for review.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to add regulation candidate."),
  });
}

export function useReviewRegulationCandidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CandidateReviewInput) => postRegulationCandidateReview(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: REGULATION_CANDIDATES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: REGULATION_REGISTRY_QUERY_KEY });
      toast.success(data.decision === "approve" ? "Regulation approved." : "Regulation candidate rejected.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to review regulation candidate."),
  });
}

export function useDeactivateRegulation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DeactivateInput) => postRegulationDeactivate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REGULATION_REGISTRY_QUERY_KEY });
      toast.success("Regulation deactivated.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to deactivate regulation."),
  });
}

export function useRestoreRegulation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: RestoreInput) => postRegulationRestore(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REGULATION_REGISTRY_QUERY_KEY });
      toast.success("Regulation version restored.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to restore regulation version."),
  });
}

export function useRebuildRegulationIndex() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => postRegulationRebuildIndex({}),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: REGULATION_REGISTRY_QUERY_KEY });
      toast.success(`Regulation indexes rebuilt: ${data.rebuilt} updated.`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to rebuild regulation indexes."),
  });
}

export function useScanRegulationRegistry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ScanInput) => postRegulationRegistryScan(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: REGULATION_CANDIDATES_QUERY_KEY });
      toast.success(`Scan complete: ${data.inserted} candidate(s), ${data.skipped} skipped.`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to scan regulation sources."),
  });
}

export function useSaveRegulationMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: MappingInput) => postRegulationMapping(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REGULATION_MAPPINGS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: REGULATION_REGISTRY_QUERY_KEY });
      toast.success("Regulation mapping saved.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to save regulation mapping."),
  });
}

export function useUpdateRegulationReconciliationCandidateStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ReconciliationCandidateStatusInput) => postRegulationReconciliationCandidateStatus(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REGULATION_RECONCILIATION_CANDIDATES_QUERY_KEY });
      toast.success("Reconciliation candidate review status updated.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to update reconciliation candidate."),
  });
}

export function useUpdateRuntimeBridgeMappingStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: RuntimeBridgeMappingStatusInput) => postRuntimeBridgeMappingStatus(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REGULATION_RUNTIME_BRIDGE_MAPPINGS_QUERY_KEY });
      toast.success("Runtime bridge mapping review status updated.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to update runtime bridge mapping."),
  });
}
