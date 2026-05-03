import { z } from "zod";

import {
  AuditActionType,
  AuditActionTypeArrayValues,
  AuditEntityType,
  AuditEntityTypeArrayValues,
  AuditStatus,
  AuditStatusArrayValues,
} from "../../helpers/schema";
import { ErrorSeverity, ErrorSeverityValues } from "../../helpers/errorSeverity";

export const schema = z.object({
  actionType: z.enum(AuditActionTypeArrayValues).optional(),
  entityType: z.enum(AuditEntityTypeArrayValues).optional(),
  status: z.enum(AuditStatusArrayValues).optional(),
  userId: z.coerce.number().optional(),
  email: z.string().trim().max(200).optional(),
  startDate: z.string().trim().max(40).optional(),
  endDate: z.string().trim().max(40).optional(),
  severity: z.enum(ErrorSeverityValues).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
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
  errorSeverity: ErrorSeverity | null;
  errorFingerprint: string | null;
  requestId: string | null;
  routeContext: string | null;
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
  if (params.severity) searchParams.append("severity", params.severity);
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
