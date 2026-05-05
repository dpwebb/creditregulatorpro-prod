import { z } from "zod";
import type { TrainingExampleRecord } from "./common";
import { trainingLabelSchema } from "./common";

export const schema = z.object({
  correctionIds: z.array(z.number()).optional(),
  labels: z.array(trainingLabelSchema).optional(),
  useForTrainingOnly: z.boolean().optional(),
});

export type InputType = z.infer<typeof schema>;
export type OutputType = {
  exportedAt: string;
  count: number;
  examples: TrainingExampleRecord[];
};

export const exportViolationTrainingExamples = async (
  body: InputType = {},
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch("/_api/admin/violation-correction/export", {
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
