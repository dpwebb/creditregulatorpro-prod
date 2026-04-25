import { z } from "zod";


export const schema = z.object({
  deadlineEventId: z.number(),
  completedAt: z.string().optional(), // ISO date string
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  success: boolean;
};

export const completeDeadline = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const result = await fetch(`/_api/deadline/complete`, {
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
  return JSON.parse(await result.text());
};