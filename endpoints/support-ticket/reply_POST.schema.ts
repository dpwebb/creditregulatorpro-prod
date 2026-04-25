import { z } from "zod";

import { Selectable } from "kysely";
import { SupportTicketMessage } from "../../helpers/schema";

export const schema = z.object({
  ticketId: z.number(),
  message: z.string().min(1, "Message is required"),
  isInternalNote: z.boolean().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  message: Selectable<SupportTicketMessage>;
};

export const postReplySupportTicket = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/support-ticket/reply`, {
    method: "POST",
    body: JSON.stringify(body),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!result.ok) {
    const errorData = await result.json();
    throw new Error(errorData.error || "Request failed");
  }
  return JSON.parse(await result.text());
};