import { z } from "zod";

import { Selectable } from "kysely";
import { SupportTicket } from "../../helpers/schema";

export const schema = z.object({
  ticketId: z.number(),
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING_ON_USER", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assignedAgentId: z.number().nullable().optional(),
  resolutionNote: z.string().trim().min(5).max(2000).optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  ticket: Selectable<SupportTicket>;
};

export const postUpdateSupportTicket = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/support-ticket/update`, {
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
