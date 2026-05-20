import { z } from "zod";

import type { RemediateIngestProcessingJobResult } from "../../helpers/ingestProcessingQueueService";

export const ingestQueueRemediationActionSchema = z.enum([
  "retry_dead_letter",
  "mark_reviewed",
  "cancel_job",
]);

export const schema = z.object({
  jobId: z.coerce.number().int().positive(),
  action: ingestQueueRemediationActionSchema,
  confirmRetry: z.boolean().optional(),
  confirmReview: z.boolean().optional(),
  confirmCancel: z.boolean().optional(),
  reviewNote: z.string().trim().max(500).nullable().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  remediation: RemediateIngestProcessingJobResult;
};

export const postAdminIngestQueueRemediation = async (
  body: InputType,
  init?: RequestInit,
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch("/_api/admin/ingest-queue-remediation", {
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
