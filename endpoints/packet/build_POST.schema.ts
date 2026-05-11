import { z } from "zod";
import type { SimpleDisputePacketContent } from "../../helpers/disputePacketTemplate";
import { DISPUTE_PACKET_TYPES } from "../../helpers/disputePacketTemplate";

export const packetRecipientSchema = z.object({
  name: z.string().trim().min(1).optional(),
  addressLine1: z.string().trim().min(1).optional(),
  addressLine2: z.string().trim().optional(),
  city: z.string().trim().min(1).optional(),
  province: z.string().trim().min(1).optional(),
  postalCode: z.string().trim().min(1).optional(),
});

export const schema = z.object({
  packetType: z.enum(DISPUTE_PACKET_TYPES),
  selectedIssueIds: z.array(z.coerce.number().int().positive()).min(1).max(25),
  recipientBureauId: z.coerce.number().int().positive().optional(),
  recipient: packetRecipientSchema.optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  packet: SimpleDisputePacketContent;
};

export const postPacketBuild = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch("/_api/packet/build", {
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
