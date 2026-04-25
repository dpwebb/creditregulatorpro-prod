import { z } from "zod";


// Input is empty as this is a scheduled task trigger
export const schema = z.object({});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  ok: boolean;
  purgedCount: number;
};

export const postAdminPurge = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/admin/purge`, {
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