import { z } from "zod";

import { Selectable } from "kysely";
import { Packet } from "../../helpers/schema";

export const schema = z.object({
  tradelineId: z.number(),
  bureauId: z.number().nullable().optional(),
  status: z.string().default("Draft"),
  terminalLabel: z.string().nullable().optional(),
  content: z.string(),
  pdfStorageUrl: z.string(),
  creditorObligationTestId: z.number().nullable().optional(),
  signatureMode: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  // Optional third-party recipient fields
  recipientName: z.string().optional(),
  recipientAddressLine1: z.string().optional(),
  recipientAddressLine2: z.string().optional(),
  recipientCity: z.string().optional(),
  recipientProvince: z.string().optional(),
  recipientPostalCode: z.string().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  packet: Selectable<Packet>;
};

export const postPacketSave = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/packet/save`, {
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