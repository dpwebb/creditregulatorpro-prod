import { z } from "zod";
import type { ViolationReviewCorrectionDetail } from "./common";
import { idSchema, regulationReferencePayloadSchema } from "./common";

export const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    correctionId: idSchema,
    reference: regulationReferencePayloadSchema,
  }),
  z.object({
    action: z.literal("update"),
    correctionId: idSchema,
    referenceId: idSchema,
    reference: regulationReferencePayloadSchema.partial().extend({
      extractionRunId: idSchema.optional(),
      jurisdiction: z.enum(["federal", "provincial", "bureau_standard", "internal_rule"]).optional(),
    }),
  }),
  z.object({
    action: z.literal("remove"),
    correctionId: idSchema,
    referenceId: idSchema,
  }),
]);

export type InputType = z.infer<typeof schema>;
export type OutputType = {
  correction: ViolationReviewCorrectionDetail;
};

export const updateViolationRegulationReference = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch("/_api/admin/violation-correction/regulation-reference", {
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
