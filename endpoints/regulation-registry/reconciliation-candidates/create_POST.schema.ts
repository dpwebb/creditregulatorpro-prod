import { z } from "zod";
import {
  RegulationReconciliationCandidateTypeArrayValues,
  RegulationReconciliationCandidateSeverityArrayValues,
} from "../../../helpers/schema";

export const reconciliationFindingSchema = z.object({
  candidateType: z.enum(RegulationReconciliationCandidateTypeArrayValues).optional(),
  staticReferenceId: z.string().trim().min(1).optional(),
  dbRegulationId: z.string().trim().min(1).optional(),
  dbMappingId: z.coerce.number().int().positive().nullable().optional(),
  deterministicRuleId: z.string().trim().min(1).nullable().optional(),
  jurisdiction: z.string().trim().min(1).nullable().optional(),
  category: z.string().trim().min(1).nullable().optional(),
  mismatchType: z.enum([
    "missing_db_registry_record",
    "missing_static_reference",
    "citation_mismatch",
    "jurisdiction_mismatch",
    "source_url_missing",
    "effective_date_missing",
    "approval_status_missing",
    "title_mismatch",
    "category_mismatch",
    "unclear_mapping",
    "consumer_wording_risk",
  ]),
  severity: z.enum(RegulationReconciliationCandidateSeverityArrayValues),
  message: z.string().trim().min(1),
  recommendedAction: z.string().trim().min(1),
  oldValue: z.unknown().optional(),
  proposedValue: z.unknown().optional(),
  sourceUrl: z.string().trim().url().nullable().optional(),
  citation: z.string().trim().min(1).nullable().optional(),
  effectiveDate: z.coerce.date().nullable().optional(),
  staticSnapshotHash: z.string().trim().min(1).nullable().optional(),
  dbSnapshotHash: z.string().trim().min(1).nullable().optional(),
  reconciliationRunId: z.string().trim().min(1).nullable().optional(),
});

export const schema = z.object({
  reconciliationRunId: z.string().trim().min(1).nullable().optional(),
  findings: z.array(reconciliationFindingSchema).min(1).max(200),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  createdCandidates: unknown[];
  existingCandidates: unknown[];
};

export const postRegulationReconciliationCandidatesCreate = async (
  body: InputType,
  init?: RequestInit,
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch("/_api/regulation-registry/reconciliation-candidates/create", {
    method: "POST",
    body: JSON.stringify(validatedInput),
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
