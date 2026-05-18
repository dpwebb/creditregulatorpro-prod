import { z } from "zod";

import type { ResponseDocumentRecord } from "../../helpers/responseDocumentService";

export const responseAdminReviewActionSchema = z.enum([
  "mark_needs_review",
  "mark_related",
  "mark_unrelated",
  "archive_response",
  "link_to_packet",
  "link_to_outcome",
  "add_review_note",
]);

export const schema = z.object({
  responseId: z.coerce.number().int().positive(),
  reviewAction: responseAdminReviewActionSchema,
  reviewNotes: z.string().trim().max(1000).nullable().optional(),
  packetId: z.coerce.number().int().positive().nullable().optional(),
  disputePacketFindingId: z.coerce.number().int().positive().nullable().optional(),
  comparisonRunId: z.coerce.number().int().positive().nullable().optional(),
  findingOutcomeId: z.coerce.number().int().positive().nullable().optional(),
  confirmEvidenceOnly: z.boolean().optional(),
  confirmNoCanonicalChange: z.boolean().optional(),
  confirmNoOutcomeClassification: z.boolean().optional(),
  explicitConfirmation: z.boolean().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  response: ResponseDocumentRecord;
};

export const postResponseAdminReview = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch("/_api/responses/admin-review", {
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
