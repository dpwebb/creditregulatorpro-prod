import { z } from "zod";


export const schema = z.object({});

export type OutputType = {
  deletedSessions: number;
  deletedOauthStates: number;
  deletedEmailTokens: number;
  deletedLoginAttempts: number;
};

export const postAdminCleanupStaleAuth = async (
  body: z.infer<typeof schema>,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/admin/cleanup-stale-auth`, {
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