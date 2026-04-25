import { z } from "zod";


export const schema = z.object({
  id: z.number()
});

export type InputType = z.infer<typeof schema>;
export type OutputType = { success: boolean };

export const postDeleteFeatureFlag = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const result = await fetch(`/_api/feature-flag/delete`, {
    method: "POST",
    body: JSON.stringify(schema.parse(body)),
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