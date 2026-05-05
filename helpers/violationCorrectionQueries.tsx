import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getViolationCorrectionRuns } from "../endpoints/admin/violation-correction/runs_GET.schema";
import { getViolationCorrectionRunDetail } from "../endpoints/admin/violation-correction/detail_GET.schema";
import { createViolationCorrection } from "../endpoints/admin/violation-correction/create_POST.schema";
import { updateViolationCorrection } from "../endpoints/admin/violation-correction/update_POST.schema";
import { updateViolationCorrectionEvidence } from "../endpoints/admin/violation-correction/evidence_POST.schema";
import { updateViolationRegulationReference } from "../endpoints/admin/violation-correction/regulation-reference_POST.schema";
import { finalizeViolationCorrection } from "../endpoints/admin/violation-correction/finalize_POST.schema";
import { exportViolationTrainingExamples } from "../endpoints/admin/violation-correction/export_POST.schema";

export const VIOLATION_CORRECTION_KEYS = {
  all: ["admin", "violationCorrections"] as const,
  runs: (reviewStatus: string, sourceSha256s?: string[]) =>
    [...VIOLATION_CORRECTION_KEYS.all, "runs", reviewStatus, sourceSha256s?.join(",") ?? "all"] as const,
  detail: (runId: number | null) => [...VIOLATION_CORRECTION_KEYS.all, "detail", runId ?? "none"] as const,
};

export function useViolationCorrectionRuns(
  reviewStatus: "needs_review" | "finalized" | "all" = "needs_review",
  sourceSha256s?: string[],
  enabled = true,
) {
  return useQuery({
    queryKey: VIOLATION_CORRECTION_KEYS.runs(reviewStatus, sourceSha256s),
    queryFn: () => getViolationCorrectionRuns({ reviewStatus, sourceSha256s }),
    enabled,
  });
}

export function useViolationCorrectionRunDetail(extractionRunId: number | null) {
  return useQuery({
    queryKey: VIOLATION_CORRECTION_KEYS.detail(extractionRunId),
    queryFn: () => {
      if (!extractionRunId) throw new Error("Extraction run is required");
      return getViolationCorrectionRunDetail({ extractionRunId });
    },
    enabled: Boolean(extractionRunId),
  });
}

function invalidateCorrectionQueries(queryClient: ReturnType<typeof useQueryClient>, extractionRunId?: number | null) {
  queryClient.invalidateQueries({ queryKey: VIOLATION_CORRECTION_KEYS.all });
  if (extractionRunId) {
    queryClient.invalidateQueries({ queryKey: VIOLATION_CORRECTION_KEYS.detail(extractionRunId) });
  }
}

export function useCreateViolationCorrection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createViolationCorrection>[0]) => createViolationCorrection(input),
    onSuccess: (data) => {
      invalidateCorrectionQueries(queryClient, data.correction.extractionRunId);
    },
  });
}

export function useUpdateViolationCorrection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateViolationCorrection>[0]) => updateViolationCorrection(input),
    onSuccess: (data) => {
      invalidateCorrectionQueries(queryClient, data.correction.extractionRunId);
    },
  });
}

export function useUpdateViolationCorrectionEvidence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateViolationCorrectionEvidence>[0]) =>
      updateViolationCorrectionEvidence(input),
    onSuccess: (data) => {
      invalidateCorrectionQueries(queryClient, data.correction.extractionRunId);
    },
  });
}

export function useUpdateViolationRegulationReference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateViolationRegulationReference>[0]) =>
      updateViolationRegulationReference(input),
    onSuccess: (data) => {
      invalidateCorrectionQueries(queryClient, data.correction.extractionRunId);
    },
  });
}

export function useFinalizeViolationCorrection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof finalizeViolationCorrection>[0]) => finalizeViolationCorrection(input),
    onSuccess: (data) => {
      invalidateCorrectionQueries(queryClient, data.correction.extractionRunId);
    },
  });
}

export function useExportViolationTrainingExamples() {
  return useMutation({
    mutationFn: (input: Parameters<typeof exportViolationTrainingExamples>[0]) =>
      exportViolationTrainingExamples(input),
  });
}
