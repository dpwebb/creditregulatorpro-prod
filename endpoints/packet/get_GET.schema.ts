import { z } from "zod";

import { Selectable } from "kysely";
import { Packet } from "../../helpers/schema";
import type { PacketLifecycleSummary } from "../../helpers/packetLifecycle";

export const schema = z.object({
  packetId: z.coerce.number()
});

export type InputType = z.infer<typeof schema>;

export type PacketDetail = Pick<Selectable<Packet>, 'id' | 'status' | 'terminalLabel' | 'createdAt' | 'pdfStorageUrl' | 'sentDate' | 'deliveryMethod' | 'trackingNumber' | 'letterDate' | 'consumerCertification' | 'recipientName'> & {
  tradelineAccountNumber: string | null;
  bureauName: string | null;
  lifecycle: PacketLifecycleSummary;
};

export type OutputType = {
  packet: PacketDetail;
};

export const getPacket = async (input: InputType, init?: RequestInit): Promise<OutputType> => {
  // Construct query string from input
  const params = new URLSearchParams();
  params.append("packetId", input.packetId.toString());

  const result = await fetch(`/_api/packet/get?${params.toString()}`, {
    method: "GET",
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
