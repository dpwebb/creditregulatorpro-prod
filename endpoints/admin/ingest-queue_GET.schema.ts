import { z } from "zod";

import type { ListIngestProcessingJobsResult } from "../../helpers/ingestProcessingQueueService";

const boolParam = z.preprocess((value) => {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false || value === undefined) return false;
  return value;
}, z.boolean()).optional();

export const schema = z.object({
  jobId: z.coerce.number().int().positive().optional(),
  status: z.enum(["queued", "running", "succeeded", "failed", "dead_lettered", "canceled"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  includeEvents: boolParam,
});

export type InputType = z.infer<typeof schema>;

export type OutputType = ListIngestProcessingJobsResult;

export const getAdminIngestQueue = async (
  params?: InputType,
  init?: RequestInit,
): Promise<OutputType> => {
  const searchParams = new URLSearchParams();
  if (params?.jobId !== undefined) searchParams.set("jobId", String(params.jobId));
  if (params?.status !== undefined) searchParams.set("status", params.status);
  if (params?.limit !== undefined) searchParams.set("limit", String(params.limit));
  if (params?.offset !== undefined) searchParams.set("offset", String(params.offset));
  if (params?.includeEvents !== undefined) searchParams.set("includeEvents", String(params.includeEvents));
  const queryString = searchParams.toString() ? `?${searchParams.toString()}` : "";

  const result = await fetch(`/_api/admin/ingest-queue${queryString}`, {
    method: "GET",
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
