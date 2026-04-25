import { z } from "zod";


export const schema = z.object({
  obligationInstanceId: z.number(),
});

export type InputType = z.infer<typeof schema>;

// Output is a Blob (PDF), not JSON
export type OutputType = Blob;

export const generatePackage = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const result = await fetch(`/_api/evidence-attachment/package`, {
    method: "POST",
    body: JSON.stringify(body),
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
  return await result.blob();
};