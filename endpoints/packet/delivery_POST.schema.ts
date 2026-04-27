import { z } from "zod";


export const schema = z.object({
  packetId: z.number(),
  deliveryMethod: z.string().min(1, "Delivery method is required"),
  trackingNumber: z.string().optional(),
    sentDate: z.coerce.date(),
  consumerCertification: z.boolean().refine(val => val === true, {
    message: "Consumer certification is required"
  }),
  letterDate: z.coerce.date().optional(),
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
  packetId: number;
  message: string;
  obligationInstanceId?: number;
  deadlineEventId?: number;
  deadlineWarning?: string;
};

export const postPacketDelivery = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/packet/delivery`, {
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