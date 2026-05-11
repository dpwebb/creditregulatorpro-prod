import { z } from "zod";
import { ViolationCategoryArrayValues } from "../../helpers/schema";

export const schema = z.object({
  id: z.number().nullable().optional(),
  violationCategory: z.enum(ViolationCategoryArrayValues),
  regulationId: z.string().min(1),
  regulationRecordId: z.number().nullable().optional(),
  sectionNumber: z.string().min(1),
  subsection: z.string().nullable().optional(),
  jurisdiction: z.string().min(1),
  explanationTemplate: z.string().min(1),
  active: z.boolean().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  mapping: unknown;
};

export const postRegulationMapping = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch("/_api/regulation-registry/mapping", {
    method: "POST",
    body: JSON.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!result.ok) {
    const errorObject = JSON.parse(await result.text()) as { error: string };
    throw new Error(errorObject.error);
  }
  return JSON.parse(await result.text()) as OutputType;
};
