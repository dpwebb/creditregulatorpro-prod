import { z } from "zod";
import type { ViolationReviewRunDetail } from "./common";

export const schema = z.object({
  extractionRunId: z.coerce.number().min(1),
});

export type InputType = z.infer<typeof schema>;
export type OutputType = ViolationReviewRunDetail;

export const getViolationCorrectionRunDetail = async (
  params: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const url = new URL(
    "/_api/admin/violation-correction/detail",
    typeof window !== "undefined" ? window.location.origin : "http://localhost",
  );
  url.searchParams.set("extractionRunId", String(params.extractionRunId));

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
