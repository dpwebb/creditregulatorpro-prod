import { z } from "zod";


export const schema = z.object({
  packetId: z.number().int().positive(),
  mailType: z.enum(["registered", "first_class"]).optional().default("registered"),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  clientSecret: string | null;
  paymentIntentId: string | null;
  isBeta: boolean;
  amount: number;
};

export const postCreatePaymentIntent = async (
  body: z.infer<typeof schema>,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/stripe/create-payment-intent`, {
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