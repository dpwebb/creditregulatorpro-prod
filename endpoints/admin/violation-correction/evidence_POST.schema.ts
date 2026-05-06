import { z } from "zod";
import type { ViolationReviewCorrectionDetail } from "./common";
import { evidencePayloadSchema, idSchema } from "./common";

export const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    correctionId: idSchema,
    evidence: evidencePayloadSchema,
  }),
  z.object({
    action: z.literal("remove"),
    correctionId: idSchema,
    evidenceId: idSchema,
  }),
]);

export type InputType = z.infer<typeof schema>;
export type OutputType = {
  correction: ViolationReviewCorrectionDetail;
};

export const updateViolationCorrectionEvidence = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch("/_api/admin/violation-correction/evidence", {
    method: "POST",
    body: JSON.stringify(body),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await result.text();
  const responseObject = text ? JSON.parse(text) : null;
  if (!result.ok) {
    throw new Error(responseObject?.error || `Request failed (${result.status})`);
  }
  return responseObject as OutputType;
};
