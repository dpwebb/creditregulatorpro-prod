import { db } from "../../../helpers/db";
import {
  PLATFORM_RESET_PRODUCTION_DISABLED_MESSAGE,
  buildResetRuntimeDiagnostics,
  parseEmailAllowlist,
} from "../../../scripts/reset-platform.mjs";
import { BusinessRuleError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { ADMIN_PLATFORM_RESET_HEADER } from "./dry-run_POST.schema";

type PlatformResetAuditPhase = "started" | "completed" | "failed";

type PlatformResetRuntimeContext = {
  environment: { kind: string; reason: string };
  database: { host: string; database: string };
  storage?: { provider?: string; configuredPath?: string; root?: string };
};

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

export function resolveAdminResetPreserveEmails(adminUser: PlatformResetAdminUser, env = process.env): string[] {
  const configured = parseEmailAllowlist(env.RESET_PRESERVE_ADMIN_EMAILS || "");
  if (configured.length > 0) return configured;

  const email = String(adminUser.email ?? "").trim().toLowerCase();
  if (!email) {
    throw new BusinessRuleError("Platform reset requires RESET_PRESERVE_ADMIN_EMAILS or an authenticated admin email.", 400);
  }
  return [email];
}

export function platformResetSafetyRefusalResponse(
  runtime: PlatformResetRuntimeContext,
  message = runtime.environment.kind === "production"
    ? `${PLATFORM_RESET_PRODUCTION_DISABLED_MESSAGE} ${runtime.environment.reason}`
    : `Refusing platform reset because the environment is unknown: ${runtime.environment.reason}`,
  status = runtime.environment.kind === "production" ? 403 : 400,
): Response {
  return new Response(JSON.stringify({
    error: message,
    diagnostics: buildResetRuntimeDiagnostics(runtime, message),
  }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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
  if (/database target changed|storage .*failed|no preserved admin|zero admins|more than one admin|exactly one|requires|refusing|unknown|mismatch/i.test(message)) {
    return new BusinessRuleError(message, 400);
  }

  return error;
}
