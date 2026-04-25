import { z } from "zod";

import { SupportTicketCategory, SupportTicketPriority, SupportTicketStatus } from "../../helpers/schema";

export const schema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING_ON_USER", "RESOLVED", "CLOSED"]).optional(),
  category: z.enum(["ACCOUNT", "BILLING", "DISPUTE_HELP", "TECHNICAL", "OTHER"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  tickets: {
    id: number;
    subject: string;
    category: SupportTicketCategory;
    priority: SupportTicketPriority;
    status: SupportTicketStatus;
    createdAt: Date;
    updatedAt: Date;
    userId: number;
    userDisplayName: string;
    assignedAgentName: string | null;
    latestMessagePreview: string | null;
  }[];
  total: number;
};

export const getSupportTickets = async (
  params: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.append("status", params.status);
  if (params.category) searchParams.append("category", params.category);
  if (params.priority) searchParams.append("priority", params.priority);
  if (params.search) searchParams.append("search", params.search);
  searchParams.append("limit", String(params.limit));
  searchParams.append("offset", String(params.offset));

  const result = await fetch(`/_api/support-ticket/list?${searchParams.toString()}`, {
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