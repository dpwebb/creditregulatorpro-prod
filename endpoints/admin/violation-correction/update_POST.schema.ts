import { z } from "zod";
import type { ViolationReviewCorrectionDetail } from "./common";
import { correctionActionSchema, correctionStatusSchema, trainingLabelSchema } from "./common";

export const schema = z.object({
  id: z.number(),
  correctionAction: correctionActionSchema.optional(),
  correctedViolationType: z.string().trim().min(1).nullable().optional(),
  correctedSummary: z.string().trim().nullable().optional(),
  correctedExplanation: z.string().trim().nullable().optional(),
  correctedSeverity: z.string().trim().nullable().optional(),
  correctedConfidence: z.coerce.number().min(0).max(100).nullable().optional(),
  correctionReason: z.string().trim().nullable().optional(),
  adminNotes: z.string().trim().nullable().optional(),
  status: correctionStatusSchema.optional(),
  trainingLabel: trainingLabelSchema.nullable().optional(),
  trainingNoteOnly: z.boolean().optional(),
  useForTraining: z.boolean().optional(),
});

export type InputType = z.infer<typeof schema>;
export type OutputType = {
  correction: ViolationReviewCorrectionDetail;
};

export const updateViolationCorrection = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch("/_api/admin/violation-correction/update", {
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
