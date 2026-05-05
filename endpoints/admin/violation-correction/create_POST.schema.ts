import { z } from "zod";
import type { ViolationReviewCorrectionDetail } from "./common";
import { correctionPayloadSchema, evidencePayloadSchema, regulationReferencePayloadSchema } from "./common";

export const schema = correctionPayloadSchema.extend({
  evidence: z.array(evidencePayloadSchema).optional(),
  regulationReferences: z.array(regulationReferencePayloadSchema).optional(),
});

export type InputType = z.infer<typeof schema>;
export type OutputType = {
  correction: ViolationReviewCorrectionDetail;
};

export const createViolationCorrection = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch("/_api/admin/violation-correction/create", {
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
