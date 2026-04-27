import { db } from "./db";
import {
  AuditActionType,
  AuditEntityType,
  AuditStatus,
} from "./schema";

export type AuditLogResult = { success: boolean; error?: string };

/**
 * Core function to log an audit entry to the database.
 * This function should be called for all security-sensitive operations.
 *
 * @param params Configuration object for the audit log
 */
export const logAudit = async (params: {
  action: AuditActionType;
  entityType: AuditEntityType;
  entityId?: number | null;
  userId?: number | null;
  details?: Record<string, any> | null;
  status: AuditStatus;
  errorMessage?: string | null;
  request?: Request; // Optional request object to extract IP and User Agent
}): Promise<AuditLogResult> => {
  const {
    action,
    entityType,
    entityId = null,
    userId = null,
    details = null,
    status,
    errorMessage = null,
    request,
  } = params;

  let ipAddress: string | null = null;
  let userAgent: string | null = null;

  if (request) {
    // Extract IP address
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
      ipAddress = forwardedFor.split(",")[0].trim();
    } else {
      ipAddress = request.headers.get("x-real-ip") || null;
    }

    // Extract User Agent
    userAgent = request.headers.get("user-agent") || null;
  }

  try {
    await db
      .insertInto("auditLog")
      .values({
        actionType: action,
        entityType: entityType,
        entityId: entityId,
        userId: userId,
        details: details ?? null,
        status: status,
        errorMessage: errorMessage,
        ipAddress: ipAddress,
        userAgent: userAgent,
        region: "CA", // Strictly enforce CA region policy
        timestamp: new Date(), // Explicitly set timestamp if needed, though DB default handles it
      })
      .execute();

    return { success: true };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    
    // Fallback logging to console if DB write fails - critical for audit trails
    console.warn(JSON.stringify({
      level: "WARN",
      component: "auditLogger",
      message: "Failed to write audit log entry",
      action,
      entityType,
      entityId,
      userId,
      status,
      error: errMsg,
      timestamp: new Date().toISOString()
    }));

    return { success: false, error: errMsg };
  }
};

// --- Convenience Wrappers ---

export const logLogin = async (userId: number, request: Request): Promise<AuditLogResult> => {
  return logAudit({
    action: "LOGIN",
    entityType: "USER_ACCOUNT",
    entityId: userId,
    userId,
    status: "SUCCESS",
    request,
  });
};

export const logLoginFailed = async (email: string, request: Request, reason: string): Promise<AuditLogResult> => {
  return logAudit({
    action: "LOGIN_FAILED",
    entityType: "USER_ACCOUNT",
    details: { email, reason },
    status: "FAILURE",
    errorMessage: reason,
    request,
  });
};

export const logLogout = async (userId: number, request: Request): Promise<AuditLogResult> => {
  return logAudit({
    action: "LOGOUT",
    entityType: "USER_ACCOUNT",
    entityId: userId,
    userId,
    status: "SUCCESS",
    request,
  });
};

export const logCreate = async (
  userId: number,
  entityType: AuditEntityType,
  entityId: number,
  details: Record<string, any>,
  request?: Request
): Promise<AuditLogResult> => {
  return logAudit({
    action: "CREATE",
    entityType,
    entityId,
    userId,
    details,
    status: "SUCCESS",
    request,
  });
};

export const logUpdate = async (
  userId: number,
  entityType: AuditEntityType,
  entityId: number,
  changes: { before: any; after: any },
  request?: Request
): Promise<AuditLogResult> => {
  return logAudit({
    action: "UPDATE",
    entityType,
    entityId,
    userId,
    details: changes,
    status: "SUCCESS",
    request,
  });
};

export const logDelete = async (
  userId: number,
  entityType: AuditEntityType,
  entityId: number,
  request?: Request
): Promise<AuditLogResult> => {
  return logAudit({
    action: "DELETE",
    entityType,
    entityId,
    userId,
    status: "SUCCESS",
    request,
  });
};

export const logRead = async (
  userId: number,
  entityType: AuditEntityType,
  entityId: number,
  request?: Request
): Promise<AuditLogResult> => {
  return logAudit({
    action: "READ",
    entityType,
    entityId,
    userId,
    status: "SUCCESS",
    request,
  });
};

export const logUpload = async (
  userId: number,
  artifactId: number,
  filename: string,
  request?: Request
): Promise<AuditLogResult> => {
  return logAudit({
    action: "UPLOAD",
    entityType: "REPORT_ARTIFACT",
    entityId: artifactId,
    userId,
    details: { filename },
    status: "SUCCESS",
    request,
  });
};

export const logChallengeInitiated = async (
  userId: number,
  obligationInstanceId: number,
  details: any,
  request?: Request
): Promise<AuditLogResult> => {
  return logAudit({
    action: "CHALLENGE_INITIATED",
    entityType: "OBLIGATION_INSTANCE",
    entityId: obligationInstanceId,
    userId,
    details,
    status: "SUCCESS",
    request,
  });
};

export const logPacketGenerated = async (
  userId: number,
  packetId: number,
  tradelineId: number,
  request?: Request
): Promise<AuditLogResult> => {
  return logAudit({
    action: "PACKET_GENERATED",
    entityType: "PACKET",
    entityId: packetId,
    userId,
    details: { tradelineId },
    status: "SUCCESS",
    request,
  });
};

export const logExhaustion = async (
  userId: number,
  tradelineId: number,
  request?: Request
): Promise<AuditLogResult> => {
  return logAudit({
    action: "EXHAUSTION_REACHED",
    entityType: "TRADELINE",
    entityId: tradelineId,
    userId,
    status: "SUCCESS",
    request,
  });
};

export const logSystemChange = async (
  userId: number,
  actionType: "BUG_FIX" | "SYSTEM_CHANGE" | "CONFIG_UPDATE" | "SCHEMA_CHANGE" | "FEATURE_ADDED" | "FEATURE_REMOVED",
  description: string,
  affectedArea?: string,
  request?: Request
): Promise<AuditLogResult> => {
  return logAudit({
    action: actionType,
    entityType: "SYSTEM",
    userId,
    details: { description, affectedArea },
    status: "SUCCESS",
    request,
  });
};