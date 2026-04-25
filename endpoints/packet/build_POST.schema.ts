import { z } from "zod";


export const schema = z.object({
  obligationInstanceId: z.number(),
  // Optional overrides for consumer information (if user profile is incomplete)
  consumerName: z.string().optional(),
  consumerAddress: z.array(z.string()).optional(),
  consumerDOB: z.string().optional(),
  consumerPhone: z.string().optional(),
  consumerEmail: z.string().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  ok: boolean;
  packetId: number;
};

export const postBuildPacket = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/packet/build`, {
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