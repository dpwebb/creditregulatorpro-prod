import { z } from "zod";
import { RegulationReconciliationCandidateReviewStatusArrayValues } from "../../../helpers/schema";

export const schema = z.object({
  candidateId: z.coerce.number().int().positive(),
  reviewStatus: z.enum(RegulationReconciliationCandidateReviewStatusArrayValues),
  reviewNotes: z.string().trim().nullable().optional(),
  rejectedReason: z.string().trim().nullable().optional(),
  supersedesCandidateId: z.coerce.number().int().positive().nullable().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  candidate: unknown;
};

export const postRegulationReconciliationCandidateStatus = async (
  body: InputType,
  init?: RequestInit,
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch("/_api/regulation-registry/reconciliation-candidates/update-status", {
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
