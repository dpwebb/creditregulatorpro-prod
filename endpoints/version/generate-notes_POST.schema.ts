import { z } from "zod";


export const ReleaseNoteCategorySchema = z.object({
  category: z.string(),
  items: z.array(z.string()),
});

export const schema = z.object({
  versionId: z.number(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  releaseNotes: z.infer<typeof ReleaseNoteCategorySchema>[];
};

export const postGenerateVersionNotes = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/version/generate-notes`, {
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