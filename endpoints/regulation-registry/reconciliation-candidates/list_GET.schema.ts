import { z } from "zod";
import {
  RegulationReconciliationCandidateReviewStatusArrayValues,
  RegulationReconciliationCandidateSeverityArrayValues,
  RegulationReconciliationCandidateTypeArrayValues,
} from "../../../helpers/schema";

export const schema = z.object({
  candidateType: z.enum(RegulationReconciliationCandidateTypeArrayValues).optional(),
  severity: z.enum(RegulationReconciliationCandidateSeverityArrayValues).optional(),
  reviewStatus: z.enum(RegulationReconciliationCandidateReviewStatusArrayValues).optional(),
  staticReferenceId: z.string().trim().min(1).optional(),
  dbRegulationId: z.string().trim().min(1).optional(),
  deterministicRuleId: z.string().trim().min(1).optional(),
  reconciliationRunId: z.string().trim().min(1).optional(),
  includeSnapshotData: z.coerce.boolean().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  candidates: unknown[];
};

export const getRegulationReconciliationCandidates = async (
  filters?: InputType,
  init?: RequestInit,
): Promise<OutputType> => {
  const params = new URLSearchParams();
  if (filters?.candidateType) params.set("candidateType", filters.candidateType);
  if (filters?.severity) params.set("severity", filters.severity);
  if (filters?.reviewStatus) params.set("reviewStatus", filters.reviewStatus);
  if (filters?.staticReferenceId) params.set("staticReferenceId", filters.staticReferenceId);
  if (filters?.dbRegulationId) params.set("dbRegulationId", filters.dbRegulationId);
  if (filters?.deterministicRuleId) params.set("deterministicRuleId", filters.deterministicRuleId);
  if (filters?.reconciliationRunId) params.set("reconciliationRunId", filters.reconciliationRunId);
  if (filters?.includeSnapshotData) params.set("includeSnapshotData", "true");

  const result = await fetch(`/_api/regulation-registry/reconciliation-candidates/list${params.toString() ? `?${params}` : ""}`, {
    method: "GET",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!result.ok) {
    const errorObject = JSON.parse(await result.text()) as { error: string };
    throw new Error(errorObject.error);
  }
  return JSON.parse(await result.text()) as OutputType;
};
