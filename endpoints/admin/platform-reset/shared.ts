import { db } from "../../../helpers/db";
import { BusinessRuleError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { ADMIN_PLATFORM_RESET_HEADER } from "./dry-run_POST.schema";

type PlatformResetAuditPhase = "started" | "completed" | "failed";

export type PlatformResetAdminUser = {
  id: number;
  role: string;
  email?: string | null;
};

export async function requirePlatformResetAdmin(request: Request): Promise<PlatformResetAdminUser> {
  const { user } = await getServerUserSession(request);
  const role = String(user.role ?? "").toLowerCase();
  if (!["admin", "super_admin"].includes(role)) {
    throw new BusinessRuleError("Unauthorized: admin or super_admin access required", 403);
  }
  return {
    id: Number(user.id),
    role,
    email: "email" in user ? String(user.email ?? "") : null,
  };
}

export function requirePlatformResetRequest(request: Request): void {
  if (request.headers.get(ADMIN_PLATFORM_RESET_HEADER) !== "1") {
    throw new BusinessRuleError("Platform reset request header is required.", 403);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new BusinessRuleError("Platform reset requires a JSON request body.", 400);
  }
}

function extractRequestMetadata(request: Request): { ipAddress: string | null; userAgent: string | null } {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return {
    ipAddress: forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null,
    userAgent: request.headers.get("user-agent") || null,
  };
}

export async function insertPlatformResetAudit(params: {
  request: Request;
  userId: number;
  phase: PlatformResetAuditPhase;
  status: "SUCCESS" | "FAILURE";
  mode?: string;
  details?: Record<string, unknown>;
  errorMessage?: string | null;
}): Promise<number> {
  const { ipAddress, userAgent } = extractRequestMetadata(params.request);
  const row = await db
    .insertInto("auditLog")
    .values({
      actionType: "DELETE",
      entityType: "SYSTEM",
      entityId: null,
      userId: params.userId,
      details: {
        operation: "ADMIN_PLATFORM_RESET",
        phase: params.phase,
        mode: params.mode,
        ...(params.details ?? {}),
      },
      status: params.status,
      errorMessage: params.errorMessage ?? null,
      ipAddress,
      userAgent,
      region: "CA",
      timestamp: new Date(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return Number(row.id);
}

export function toPlatformResetEndpointError(error: unknown): unknown {
  if (error instanceof BusinessRuleError) return error;
  if (!(error instanceof Error)) return error;

  const message = error.message;
  if (/production/i.test(message)) {
    return new BusinessRuleError(message, 403);
  }
  if (/database target changed|storage .*failed|no preserved admin|requires|refusing|unknown|mismatch/i.test(message)) {
    return new BusinessRuleError(message, 400);
  }

  return error;
}
