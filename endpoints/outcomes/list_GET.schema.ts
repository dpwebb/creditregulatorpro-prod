import { z } from "zod";

import type { OutcomeRunSummary } from "../../helpers/outcomeTrackingService";

export const outcomeTypeSchema = z.enum([
  "corrected",
  "removed",
  "unchanged",
  "reinserted",
  "partially_corrected",
  "new_issue",
  "unresolved",
  "needs_review",
  "not_comparable",
  "response_received",
]);

export const statusSchema = z.enum(["pending", "completed", "needs_review", "failed", "archived"]);

export const schema = z.object({
  packetId: z.coerce.number().int().positive().optional(),
  previousReportArtifactId: z.coerce.number().int().positive().optional(),
  laterReportArtifactId: z.coerce.number().int().positive().optional(),
  outcomeType: outcomeTypeSchema.optional(),
  status: statusSchema.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  runs: OutcomeRunSummary[];
  total: number;
};

export const getOutcomeList = async (params?: InputType, init?: RequestInit): Promise<OutputType> => {
  const searchParams = new URLSearchParams();
  if (params?.packetId !== undefined) searchParams.set("packetId", String(params.packetId));
  if (params?.previousReportArtifactId !== undefined) searchParams.set("previousReportArtifactId", String(params.previousReportArtifactId));
  if (params?.laterReportArtifactId !== undefined) searchParams.set("laterReportArtifactId", String(params.laterReportArtifactId));
  if (params?.outcomeType !== undefined) searchParams.set("outcomeType", params.outcomeType);
  if (params?.status !== undefined) searchParams.set("status", params.status);
  if (params?.startDate !== undefined) searchParams.set("startDate", params.startDate.toISOString());
  if (params?.endDate !== undefined) searchParams.set("endDate", params.endDate.toISOString());
  if (params?.limit !== undefined) searchParams.set("limit", String(params.limit));
  if (params?.offset !== undefined) searchParams.set("offset", String(params.offset));
  const queryString = searchParams.toString() ? `?${searchParams.toString()}` : "";

  const result = await fetch(`/_api/outcomes/list${queryString}`, {
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
