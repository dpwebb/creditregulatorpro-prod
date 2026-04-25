import { z } from "zod";

export const schema = z.object({
  tempToken: z.string().min(1, "Temporary token is required"),
});

export type InputType = z.infer<typeof schema>;

import { User } from "../../helpers/User";

export type OutputType =
  | {
      user: User;
      success: boolean;
    }
  | {
      error: string;
    };

export const postEstablishSession = async (
  body: z.infer<typeof schema>,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
    const result = await fetch(`/_api/auth/establish_session`, {
    method: "POST",
    body: JSON.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
  });
  return result.json();
};
