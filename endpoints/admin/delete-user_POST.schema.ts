import { z } from "zod";


export const schema = z.object({
  userId: z.number().int().positive(),
  confirmEmail: z.string().email(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  success: boolean;
  deletedEmail: string;
  purgedCounts: Record<string, number>;
};

export const postAdminDeleteUser = async (
  body: z.infer<typeof schema>,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/admin/delete-user`, {
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