import { z } from "zod";

export const schema = z.object({});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  success: boolean;
  termsAcceptedAt: string;
  termsAcceptedVersion: string | null;
};

export const postAcceptTerms = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/user/accept-terms`, {
    method: "POST",
    body: JSON.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!result.ok) {
    const errorObject = await result.json() as { error: string };
    throw new Error(errorObject.error);
  }
  return result.json() as Promise<OutputType>;
};