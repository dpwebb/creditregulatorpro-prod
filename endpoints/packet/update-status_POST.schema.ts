import { z } from "zod";


export const schema = z.object({
  packetId: z.number().int().positive(),
  status: z.string().min(1, "Status cannot be empty"),
  recipientName: z.string().optional(),
  recipientAddressLine1: z.string().optional(),
  recipientAddressLine2: z.string().optional(),
  recipientCity: z.string().optional(),
  recipientProvince: z.string().optional(),
  recipientPostalCode: z.string().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  success: boolean;
  packetId: number;
  status: string;
  recipientName?: string;
  recipientAddressLine1?: string;
  recipientAddressLine2?: string;
  recipientCity?: string;
  recipientProvince?: string;
  recipientPostalCode?: string;
};

export const postUpdateStatus = async (
  body: z.infer<typeof schema>,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/packet/update-status`, {
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