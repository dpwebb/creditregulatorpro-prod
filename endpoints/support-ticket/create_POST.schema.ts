import { z } from "zod";

import { Selectable } from "kysely";
import { SupportTicket } from "../../helpers/schema";

export const schema = z.object({
  subject: z.string().min(1, "Subject is required"),
  description: z.string().min(1, "Description is required"),
  category: z.enum(["ACCOUNT", "BILLING", "DISPUTE_HELP", "TECHNICAL", "OTHER"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  ticket: Selectable<SupportTicket>;
};

export const postCreateSupportTicket = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/support-ticket/create`, {
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