import { z } from "zod";

import { AuditActionType, AuditEntityType, AuditStatus } from "../../helpers/schema";

export const schema = z.object({
  actionType: z.string().optional(),
  entityType: z.string().optional(),
  status: z.enum(["SUCCESS", "FAILURE"]).optional(),
  userId: z.coerce.number().optional(),
  email: z.string().optional(),
  startDate: z.string().optional(), // ISO date string
  endDate: z.string().optional(), // ISO date string
  limit: z.coerce.number().optional().default(100),
  offset: z.coerce.number().optional().default(0),
});

export type InputType = z.infer<typeof schema>;

export type AuditLogEntry = {
  id: number;
  actionType: AuditActionType;
  entityType: AuditEntityType;
  entityId: number | null;
  userId: number | null;
  details: unknown; // JSON
  status: AuditStatus;
  errorMessage: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  region: string;
  timestamp: Date;
  userEmail: string | null;
  userDisplayName: string | null;
};

export type OutputType = { logs: AuditLogEntry[]; total: number };

export const getAuditLogs = async (
  params: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  // Convert params to URLSearchParams
  const searchParams = new URLSearchParams();
  if (params.actionType) searchParams.append("actionType", params.actionType);
  if (params.entityType) searchParams.append("entityType", params.entityType);
  if (params.status) searchParams.append("status", params.status);
  if (params.userId) searchParams.append("userId", params.userId.toString());
  if (params.email) searchParams.append("email", params.email);
  if (params.startDate) searchParams.append("startDate", params.startDate);
  if (params.endDate) searchParams.append("endDate", params.endDate);
  if (params.limit) searchParams.append("limit", params.limit.toString());
  if (params.offset) searchParams.append("offset", params.offset.toString());

  const result = await fetch(`/_api/admin/audit-logs?${searchParams.toString()}`, {
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
  return JSON.parse(await result.text()) as OutputType;
};