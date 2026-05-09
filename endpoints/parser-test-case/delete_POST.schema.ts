import { z } from "zod";


export const schema = z.object({
  id: z.coerce.number().int().positive(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  success: boolean;
  deleted?: {
    testRuns: number;
    testCases: number;
    materializedArtifacts: number;
    preservedTrainingArtifacts: number;
    violationCorrections: number;
    preservedViolationTrainingArtifacts: number;
  };
};

export const deleteParserTestCase = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/parser-test-case/delete`, {
    method: "POST",
    body: JSON.stringify(validatedInput),
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
