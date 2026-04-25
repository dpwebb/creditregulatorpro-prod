import { z } from "zod";

import { Selectable } from "kysely";
import { Users } from "../../helpers/schema";

export const schema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1, "Display name is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  user: Selectable<Users>;
};

export const postCreateSupportAgent = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/admin/create-support-agent`, {
    method: "POST",
    body: JSON.stringify(body),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!result.ok) {
    const errorData = await result.json();
    throw new Error(errorData.error || "Request failed");
  }
  return JSON.parse(await result.text());
};