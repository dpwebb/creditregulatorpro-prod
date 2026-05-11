import { z } from "zod";

export const schema = z.object({});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  mappings: unknown[];
};

export const getRegulationMappings = async (init?: RequestInit): Promise<OutputType> => {
  const result = await fetch("/_api/regulation-registry/mapping", {
    method: "GET",
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
