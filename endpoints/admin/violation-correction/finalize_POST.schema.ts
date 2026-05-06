import { z } from "zod";
import { idSchema, type TrainingExampleRecord, type ViolationReviewCorrectionDetail } from "./common";

export const schema = z.object({
  correctionId: idSchema,
});

export type InputType = z.infer<typeof schema>;
export type OutputType = {
  correction: ViolationReviewCorrectionDetail;
  trainingExample: TrainingExampleRecord;
};

export const finalizeViolationCorrection = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch("/_api/admin/violation-correction/finalize", {
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
