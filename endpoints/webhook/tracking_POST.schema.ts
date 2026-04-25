import { z } from "zod";


// Defining local schema to override the helper one which uses UUID for packetId
// The requirement explicitly asked to change schema to accept packet id as number
export const schema = z.object({
  packetId: z.number(),
  status: z.enum(["DELIVERED", "RETURNED", "IN_TRANSIT", "RESPONDED"]),
  payload: z.any(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  ok: boolean;
};

export const postTrackingWebhook = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/webhook/tracking`, {
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