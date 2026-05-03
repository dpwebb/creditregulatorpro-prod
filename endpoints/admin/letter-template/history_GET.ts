import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { db } from "../../../helpers/db";
import { BusinessRuleError, handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./history_GET.schema";
import superjson from "superjson";

type AuditDetailsShape = {
  component?: string;
  mode?: string;
  changedFields?: unknown;
  warnings?: unknown;
  before?: unknown;
  after?: unknown;
};

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      throw new BusinessRuleError("Admin privileges required", 403);
    }

    const url = new URL(request.url);
    const input = schema.parse({
      templateId: url.searchParams.get("templateId"),
    });

    const logs = await db
      .selectFrom("auditLog")
      .leftJoin("users", "auditLog.userId", "users.id")
      .select([
        "auditLog.id",
        "auditLog.entityId",
        "auditLog.actionType",
        "auditLog.details",
        "auditLog.timestamp",
        "auditLog.userId",
        "users.displayName as userDisplayName",
        "users.email as userEmail",
      ])
      .where("auditLog.entityType", "=", "SYSTEM")
      .where("auditLog.entityId", "=", input.templateId)
      .where("auditLog.status", "=", "SUCCESS")
      .where("auditLog.actionType", "in", ["CREATE", "UPDATE", "DELETE"])
      .orderBy("auditLog.timestamp", "desc")
      .limit(200)
      .execute();

    const history = logs
      .map((log) => {
        const details = (log.details || {}) as AuditDetailsShape;
        if (details.component !== "letter_template") return null;
        const changedFields = Array.isArray(details.changedFields)
          ? details.changedFields.filter((v): v is string => typeof v === "string")
          : [];
        const warnings = Array.isArray(details.warnings)
          ? details.warnings.filter((v): v is string => typeof v === "string")
          : [];
        return {
          auditLogId: log.id,
          templateId: Number(log.entityId),
          actionType: log.actionType,
          mode: typeof details.mode === "string" ? details.mode : null,
          changedFields,
          warnings,
          timestamp: log.timestamp instanceof Date ? log.timestamp : new Date(log.timestamp),
          userId: log.userId ?? null,
          userDisplayName: log.userDisplayName ?? null,
          userEmail: log.userEmail ?? null,
          before:
            details.before && typeof details.before === "object"
              ? (details.before as Record<string, unknown>)
              : null,
          after:
            details.after && typeof details.after === "object"
              ? (details.after as Record<string, unknown>)
              : null,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    return new Response(superjson.stringify({ history } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
