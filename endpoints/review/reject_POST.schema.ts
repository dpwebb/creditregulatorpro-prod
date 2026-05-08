import { z } from "zod";


export const schema = z.object({
  reviewSessionId: z.string().uuid(),
  reason: z.string(),
}).strict();

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  ok: boolean;
};

export const postReject = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/review/reject`, {
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
