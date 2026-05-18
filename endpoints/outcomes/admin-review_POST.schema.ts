import { z } from "zod";

import type { OutcomeComparisonRunDetail } from "../../helpers/outcomeTrackingService";

export const outcomeAdminReviewActionSchema = z.enum([
  "review_outcome",
  "mark_needs_review",
  "confirm_outcome",
  "reject_match",
  "reject_classification",
  "archive_review",
]);

export const schema = z.object({
  comparisonRunId: z.coerce.number().int().positive(),
  findingOutcomeId: z.coerce.number().int().positive().nullable().optional(),
  reviewAction: outcomeAdminReviewActionSchema,
  reviewNotes: z.string().trim().max(1000).nullable().optional(),
  evidenceIds: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  confirmNoCanonicalChange: z.boolean().optional(),
  confirmNoRuntimeActivation: z.boolean().optional(),
  confirmNoPacketMutation: z.boolean().optional(),
  explicitConfirmation: z.boolean().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  comparisonRun: OutcomeComparisonRunDetail;
};

export const postOutcomeAdminReview = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch("/_api/outcomes/admin-review", {
    method: "POST",
    body: JSON.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!result.ok) {
    const errorObject = JSON.parse(await result.text());
    throw new Error(errorObject.error);
  }
  return JSON.parse(await result.text());
};
