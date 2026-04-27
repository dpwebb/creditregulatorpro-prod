import { z } from "zod";


export const schema = z.object({
  artifactId: z.number().int().positive("Artifact ID must be a positive integer"),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  success: boolean;
  updated: number;
  errors: string[];
};

export const postGapFill = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/tradeline/gap-fill`, {
    method: "POST",
    body: JSON.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  
  if (!result.ok) {
    const errorObject = JSON.parse(await result.text());
    throw new Error(errorObject.error);
  }
  
  return JSON.parse(await result.text());
};