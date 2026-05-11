import { z } from "zod";
import type { SimpleDisputePacketContent } from "../../helpers/disputePacketTemplate";
import { schema as buildPacketSchema } from "./build_POST.schema";

export const schema = buildPacketSchema;

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  success: boolean;
  packetId: number;
  status: string;
  packet: SimpleDisputePacketContent;
};

export const postPacketCreate = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch("/_api/packet/create", {
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
