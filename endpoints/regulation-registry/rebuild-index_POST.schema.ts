import { z } from "zod";

export const schema = z.object({});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  rebuilt: number;
};

export const postRegulationRebuildIndex = async (body: InputType = {}, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch("/_api/regulation-registry/rebuild-index", {
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
