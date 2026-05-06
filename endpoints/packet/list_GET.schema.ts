import { z } from "zod";

import { Selectable } from "kysely";
import { Packet } from "../../helpers/schema";
import type { PacketLifecycleSummary } from "../../helpers/packetLifecycle";

export const schema = z.object({
  limit: z.coerce.number().min(1).optional(),
  offset: z.coerce.number().min(0).optional(),
});

export type InputType = z.infer<typeof schema>;

export type PacketWithDetails = Omit<Selectable<Packet>, 'userId' | 'pdfStorageUrl' | 'baselineSnapshotId'> & {
  processingStatus: Selectable<Packet>['processingStatus'];
  tradelineAccountNumber: string | null;
  tradelineCreditorName: string | null;
  bureauName: string | null;
  recipientName: string | null;
  recipientAddressLine1: string | null;
  recipientAddressLine2: string | null;
  recipientCity: string | null;
  recipientProvince: string | null;
  recipientPostalCode: string | null;
  lifecycle: PacketLifecycleSummary;
};

export type OutputType = {
  packets: PacketWithDetails[];
  total: number;
};

export const getPacketList = async (params?: InputType, init?: RequestInit): Promise<OutputType> => {
  const searchParams = new URLSearchParams();
  if (params?.limit !== undefined) searchParams.set("limit", params.limit.toString());
  if (params?.offset !== undefined) searchParams.set("offset", params.offset.toString());
  const queryString = searchParams.toString() ? `?${searchParams.toString()}` : '';

  const result = await fetch(`/_api/packet/list${queryString}`, {
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
