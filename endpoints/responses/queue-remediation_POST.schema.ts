import { z } from "zod";

import type { RemediateResponseProcessingJobResult } from "../../helpers/responseProcessingQueueService";

export const responseQueueRemediationActionSchema = z.enum([
  "retry_job",
  "acknowledge_dead_letter",
  "mark_stale_reviewed",
]);

export const schema = z.object({
  jobId: z.coerce.number().int().positive(),
  action: responseQueueRemediationActionSchema,
  confirmRetry: z.boolean().optional(),
  confirmReview: z.boolean().optional(),
  reviewNote: z.string().trim().max(500).nullable().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  remediation: RemediateResponseProcessingJobResult;
};

export const postResponseQueueRemediation = async (
  body: InputType,
  init?: RequestInit,
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch("/_api/responses/queue-remediation", {
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
