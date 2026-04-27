import { z } from "zod";

export const schema = z.object({
  packetId: z.coerce.number()
});

export type InputType = z.infer<typeof schema>;

/**
 * Returns the endpoint URL to access the PDF directly.
 * Useful for assigning to a <object data="..."> or PDF viewer URL prop.
 */
export const getPacketPdfUrl = (input: InputType): string => {
  const params = new URLSearchParams();
  params.append("packetId", input.packetId.toString());
  return `/_api/packet/pdf?${params.toString()}`;
};