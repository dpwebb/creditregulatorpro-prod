import { z } from "zod";
import type { ViolationReviewRunSummary } from "./common";

export const schema = z.object({
  reviewStatus: z.enum(["needs_review", "finalized", "all"]).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  runs: ViolationReviewRunSummary[];
  total: number;
};

export const getViolationCorrectionRuns = async (
  params: InputType = {},
  init?: RequestInit
): Promise<OutputType> => {
  const url = new URL(
    "/_api/admin/violation-correction/runs",
    typeof window !== "undefined" ? window.location.origin : "http://localhost",
  );
  if (params.reviewStatus) url.searchParams.set("reviewStatus", params.reviewStatus);
  if (params.limit !== undefined) url.searchParams.set("limit", String(params.limit));
  if (params.offset !== undefined) url.searchParams.set("offset", String(params.offset));

  const result = await fetch(url.toString(), {
    method: "GET",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await result.text();
  const body = text ? JSON.parse(text) : null;
  if (!result.ok) {
    throw new Error(body?.error || `Request failed (${result.status})`);
  }
  return body as OutputType;
};
