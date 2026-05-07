import { z } from "zod";
import type { ViolationReviewRunSummary } from "./common";

const dateStringSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Invalid date");

export const schema = z
  .object({
    reviewStatus: z.enum(["needs_review", "finalized", "all"]).optional(),
    limit: z.coerce.number().min(1).max(100).optional(),
    offset: z.coerce.number().min(0).optional(),
    sourceSha256s: z.array(z.string().trim().min(1)).optional(),
    sourceCreatedAfters: z.array(dateStringSchema).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.sourceCreatedAfters) return;

    if (!value.sourceSha256s || value.sourceCreatedAfters.length !== value.sourceSha256s.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceCreatedAfters"],
        message: "sourceCreatedAfter values must match sourceSha256 values",
      });
    }
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
  params.sourceSha256s?.forEach((sha256) => {
    url.searchParams.append("sourceSha256", sha256);
  });
  params.sourceCreatedAfters?.forEach((createdAfter) => {
    url.searchParams.append("sourceCreatedAfter", createdAfter);
  });

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
