import { z } from "zod";

export type PostGridErrorType = "address_from" | "address_to" | "other";

export const schema = z.object({
  packetId: z.number(),
  paymentIntentId: z.string().optional(),
  userReviewed: z.literal(true, {
    errorMap: () => ({ message: "You must confirm you have reviewed the submission." }),
  }),
  userApproved: z.literal(true, {
    errorMap: () => ({ message: "You must confirm the information is accurate." }),
  }),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  success: boolean;
  message: string;
  trackingNumber?: string;
  expectedDeliveryDate?: string;
  postgridLetterId?: string;
  testMode?: boolean;
  paymentRefunded?: boolean;
  deadlineWarning?: string;
  errorDetails?: {
    type: PostGridErrorType;
    userMessage: string;
  };
};

export const postPacketSendRegistered = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/packet/send-registered`, {
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
    throw new Error(errorObject.message || errorObject.error);
  }
  return JSON.parse(await result.text());
};