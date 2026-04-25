import { z } from "zod";

import { Selectable } from "kysely";
import { SupportTicket, SupportTicketMessage } from "../../helpers/schema";

export const schema = z.object({
  id: z.coerce.number(),
});

export type InputType = z.infer<typeof schema>;

export type MessageWithSender = Selectable<SupportTicketMessage> & {
  senderDisplayName: string;
};

export type OutputType = {
  ticket: Selectable<SupportTicket>;
  messages: MessageWithSender[];
  userDisplayName: string;
  assignedAgentName: string | null;
};

export const getSupportTicket = async (
  params: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const searchParams = new URLSearchParams();
  searchParams.append("id", params.id.toString());

  const result = await fetch(`/_api/support-ticket/get?${searchParams.toString()}`, {
    method: "GET",
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