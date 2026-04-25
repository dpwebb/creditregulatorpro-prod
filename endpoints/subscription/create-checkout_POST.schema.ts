import { z } from "zod";

export const schema = z.object({
  plan: z.enum(["monthly", "annual"]),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  clientSecret: string;
  subscriptionId: string;
  plan: string;
  amount: number;
};

export const postCreateCheckout = async (
  body: z.infer<typeof schema>,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/subscription/create-checkout`, {
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