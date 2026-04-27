import { z } from "zod";

import { Selectable } from "kysely";
import { Packet } from "../../helpers/schema";

export const schema = z.object({
  tradelineId: z.number(),
  bureauId: z.number().optional(),
  status: z.string().nullable().optional(),
  content: z.string().min(1).nullable().optional(),
  creditorObligationTestId: z.number().nullable().optional(),
  disputeReasonCode: z.string().nullable().optional(),
  violationCategory: z.string().nullable().optional(),
  preview: z.boolean().optional(),
  // Optional third-party recipient fields — if provided (with required address fields),
  // they override the bureau lookup for the letter recipient.
  recipientName: z.string().optional(),
  recipientAddressLine1: z.string().optional(),
  recipientAddressLine2: z.string().optional(),
  recipientCity: z.string().optional(),
  recipientProvince: z.string().optional(),
  recipientPostalCode: z.string().optional(),
});

export type InputType = z.infer<typeof schema>;

/**
 * A preview packet is a packet that has not been inserted into the database.
 * It contains all the fields that would be set on a real packet, except `id` is null.
 */
export type PreviewPacket = {
  id: null;
  tradelineId: number | null;
  bureauId: number | null;
  status: string | null;
  terminalLabel: string | null;
  content: string | null;
  pdfStorageUrl: string | null;
  creditorObligationTestId: number | null;
  region: string;
  createdAt: Date;
  letterDate: Date;
  // Fields not generated during preview — set to null
  userId: number | null;
  organizationId: number | null;
  sentDate: Date | null;
  bureauResponseDate: Date | null;
  consumerCertification: boolean | null;
  deliveryMethod: string | null;
  pdfStorageUrl_: string | null;
  responseType: string | null;
  signatureMode: string | null;
  statuteVersionId: number | null;
  successOutcome: string | null;
  trackingNumber: string | null;
  type: string | null;
  recipientName: string | null;
  recipientAddressLine1: string | null;
  recipientAddressLine2: string | null;
  recipientCity: string | null;
  recipientProvince: string | null;
  recipientPostalCode: string | null;
};

export type OutputType = {
  packet: Selectable<Packet> | PreviewPacket;
};

export class PacketCreateError extends Error {
  missingFields?: string[];
  
  constructor(message: string, missingFields?: string[]) {
    super(message);
    this.name = "PacketCreateError";
    this.missingFields = missingFields;
  }
}

export const postPacketCreate = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/packet/create`, {
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
    throw new PacketCreateError(errorObject.error, errorObject.missingFields);
  }
  return JSON.parse(await result.text());
};