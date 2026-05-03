import { schema, OutputType } from "./history_GET.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";

type StatuteAuditDetails = {
  component?: string;
  mode?: string;
  versionId?: unknown;
  createdVersionId?: unknown;
  citation?: unknown;
  changedFields?: unknown;
};

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    console.log(`statute/history_GET called by user ${user.id}`);

    const url = new URL(request.url);
    const input = schema.parse({
      versionId: url.searchParams.get("versionId"),
    });

    const logs = await db
      .selectFrom("auditLog")
      .leftJoin("users", "auditLog.userId", "users.id")
      .select([
        "auditLog.id",
        "auditLog.actionType",
        "auditLog.entityId",
        "auditLog.details",
        "auditLog.timestamp",
        "auditLog.userId",
        "users.displayName as userDisplayName",
        "users.email as userEmail",
      ])
      .where("auditLog.entityType", "=", "STATUTE")
      .where("auditLog.status", "=", "SUCCESS")
      .orderBy("auditLog.timestamp", "desc")
      .limit(500)
      .execute();

    const history = logs
      .map((log) => {
        const details = (log.details ?? {}) as StatuteAuditDetails;
        if (details.component !== "statute") {
          return null;
        }

        const rawVersionId = details.versionId ?? details.createdVersionId;
        const detailVersionId = typeof rawVersionId === "number" ? rawVersionId : null;
        const matchesVersion =
          detailVersionId === input.versionId || log.entityId === input.versionId;
        if (!matchesVersion) {
          return null;
        }

        const changedFields = Array.isArray(details.changedFields)
          ? details.changedFields.filter((field): field is string => typeof field === "string")
          : [];

        return {
          auditLogId: log.id,
          actionType: log.actionType,
          mode: typeof details.mode === "string" ? details.mode : null,
          timestamp: log.timestamp instanceof Date ? log.timestamp : new Date(log.timestamp),
          userId: log.userId ?? null,
          userDisplayName: log.userDisplayName ?? null,
          userEmail: log.userEmail ?? null,
          changedFields,
          citation: typeof details.citation === "string" ? details.citation : null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    return new Response(JSON.stringify({ history } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}
