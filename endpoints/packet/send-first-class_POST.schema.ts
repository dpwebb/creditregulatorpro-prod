import { z } from "zod";

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

export type PostGridErrorType = "address_from" | "address_to" | "other";

export type OutputType = {
  success: boolean;
  message: string;
  trackingNumber?: string | null;
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

export const postPacketSendFirstClass = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/packet/send-first-class`, {
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