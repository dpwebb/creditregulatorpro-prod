import { z } from "zod";

import {
  AuditActionTypeArrayValues,
  AuditEntityTypeArrayValues,
  AuditStatusArrayValues,
} from "../../helpers/schema";

// Define schema for query parameters
// Note: Since GET requests don't have a body, these will come from query string
// We use z.coerce to handle string-to-number/date conversions from URL params
export const schema = z.object({
  userId: z.coerce.number().optional(),
  actionType: z.enum(AuditActionTypeArrayValues).optional(),
  entityType: z.enum(AuditEntityTypeArrayValues).optional(),
  status: z.enum(AuditStatusArrayValues).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  limit: z.coerce.number().min(1).max(1000).default(100),
  offset: z.coerce.number().min(0).default(0),
});

export type InputType = z.infer<typeof schema>;

export type AuditLogEntry = {
  id: number;
  actionType: string;
  entityType: string;
  entityId: number | null;
  userId: number | null;
  userEmail: string | null;
  details: any;
  status: string;
  errorMessage: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: Date;
  region: string;
};

export type OutputType = {
  logs: AuditLogEntry[];
  total: number;
};

export const getAuditLogs = async (
  params: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  // Construct query string
  const searchParams = new URLSearchParams();
  if (params.userId) searchParams.set("userId", params.userId.toString());
  if (params.actionType) searchParams.set("actionType", params.actionType);
  if (params.entityType) searchParams.set("entityType", params.entityType);
  if (params.status) searchParams.set("status", params.status);
  if (params.startDate)
    searchParams.set("startDate", params.startDate.toISOString());
  if (params.endDate)
    searchParams.set("endDate", params.endDate.toISOString());
  if (params.limit) searchParams.set("limit", params.limit.toString());
  if (params.offset) searchParams.set("offset", params.offset.toString());

  const result = await fetch(`/_api/audit/log?${searchParams.toString()}`, {
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